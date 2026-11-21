-- Симулятор партии ORBTHROW: заглушки API Доты + простая «физика» (движение, атаки, смерти,
-- подбор предметов). Запускает собранные скрипты как настоящая игра: Precache → Activate →
-- смены состояний → партия с ботами до победы или конца времени.
-- Цель — поймать ошибки выполнения (nil, опечатки, неверные вызовы API) до запуска Доты.
--
-- Запуск: luajit tools/sim/sim.lua <build/game/scripts/vscripts> <build/sim> [минут] [seed] [игроков]
-- Код выхода 0 — ошибок нет.

local ROOT, SIMDIR = arg[1], arg[2]
local MAX_MINUTES = tonumber(arg[3] or "32")
local SEED = tonumber(arg[4] or "1")
local PLAYERS = tonumber(arg[5] or "6")
local VERBOSE = os.getenv("SIM_VERBOSE") == "1"
local LEGEND_BRANCH = os.getenv("SIM_LEGEND_BRANCH")
math.randomseed(SEED)
package.path = ROOT .. "/?.lua;" .. package.path

local K = dofile(SIMDIR .. "/consts.lua")
local HEROES = dofile(SIMDIR .. "/heroes.lua")
for k, v in pairs(K.consts) do rawset(_G, k, v) end
-- Неизвестная КОНСТАНТА (опечатка или ее нет в Доте) — ошибка, а не тихий nil
setmetatable(_G, { __index = function(_, k)
  if type(k) == "string" and k:match("^[A-Z][A-Z0-9_]+$") and #k > 3 and not k:match("^ORBTHROW") then error("MOCK: неизвестная константа " .. k, 2) end
  return nil
end })

------------------------------------------------------------------------------------------------
-- Учет ошибок
------------------------------------------------------------------------------------------------
local failures, warnings = {}, {}
local function fail(msg)
  failures[#failures + 1] = msg
  if #failures <= 40 then io.stderr:write("ОШИБКА: " .. msg .. "\n") end
end
local function warn(msg)
  if not warnings[msg] then warnings[msg] = 0 end
  warnings[msg] = warnings[msg] + 1
end
local realPrint = print
local logLines = 0
print = function(...)
  local parts = {}
  for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
  local s = table.concat(parts, " ")
  logLines = logLines + 1
  if s:find("ошибка в «", 1, true) then fail("игра сообщила: " .. s) end
  if VERBOSE then realPrint(s) end
end

local function strict(name)
  -- Таблица, в которой обращение к отсутствующему методу — ошибка (неизвестная функция API)
  return setmetatable({}, { __index = function(_, k)
    error("MOCK: нет " .. name .. "." .. tostring(k), 2)
  end })
end

------------------------------------------------------------------------------------------------
-- Векторы
------------------------------------------------------------------------------------------------
local Vec = {}
Vec.__index = Vec
local function Vector(x, y, z) return setmetatable({ x = x or 0, y = y or 0, z = z or 0 }, Vec) end
local function isVec(v) return getmetatable(v) == Vec end
Vec.__add = function(a, b) return Vector(a.x + b.x, a.y + b.y, a.z + b.z) end
Vec.__sub = function(a, b) return Vector(a.x - b.x, a.y - b.y, a.z - b.z) end
Vec.__mul = function(a, b)
  if type(a) == "number" then return Vector(b.x * a, b.y * a, b.z * a) end
  if type(b) == "number" then return Vector(a.x * b, a.y * b, a.z * b) end
  return Vector(a.x * b.x, a.y * b.y, a.z * b.z)
end
Vec.__div = function(a, b) return Vector(a.x / b, a.y / b, a.z / b) end
Vec.__unm = function(a) return Vector(-a.x, -a.y, -a.z) end
Vec.__eq = function(a, b) return a.x == b.x and a.y == b.y and a.z == b.z end
Vec.__tostring = function(a) return string.format("Vector(%.0f, %.0f, %.0f)", a.x, a.y, a.z) end
function Vec:Length2D() return math.sqrt(self.x * self.x + self.y * self.y) end
function Vec:Length() return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z) end
function Vec:Normalized()
  local l = self:Length()
  if l == 0 then return Vector(0, 0, 0) end
  return Vector(self.x / l, self.y / l, self.z / l)
end
function Vec:Dot(b) return self.x * b.x + self.y * b.y + self.z * b.z end
_G.Vector = Vector
_G.QAngle = function(p, y, r) return { x = p or 0, y = y or 0, z = r or 0, __qangle = true } end
_G.RotatePosition = function(origin, angle, pos)
  local a = math.rad(angle.y or 0)
  local dx, dy = pos.x - origin.x, pos.y - origin.y
  return Vector(origin.x + dx * math.cos(a) - dy * math.sin(a), origin.y + dx * math.sin(a) + dy * math.cos(a), pos.z)
end
local function dist2d(a, b) local dx, dy = a.x - b.x, a.y - b.y return math.sqrt(dx * dx + dy * dy) end

------------------------------------------------------------------------------------------------
-- Время и случайности
------------------------------------------------------------------------------------------------
local applyDamageRef, applyDamageImpl -- урон (задаются ниже)
local now = 0           -- время сервера
local hornAt = nil      -- когда прозвучал горн
local paused = false
_G.RandomInt = function(a, b)
  assert(type(a) == "number" and type(b) == "number", "RandomInt: нужны числа")
  if b < a then error("RandomInt: b < a (" .. a .. ", " .. b .. ")", 2) end
  return math.random(a, b)
end
_G.RandomFloat = function(a, b) return a + (b - a) * math.random() end
_G.RandomVector = function(len) local a = math.random() * math.pi * 2 return Vector(math.cos(a) * len, math.sin(a) * len, 0) end
_G.Time = function() return now end
_G.RollPseudoRandomPercentage = function(chance) return math.random() * 100 < chance end
_G.IsServer = function() return true end
_G.GetItemCost = function(name) assert(type(name) == "string", "GetItemCost: имя") return 1500 end
_G.IsClient = function() return false end
local ONLINE = os.getenv("SIM_ONLINE") == "1"
_G.IsInToolsMode = function() return not ONLINE end
_G.GetSystemTime = function() return "12:00:00" end

------------------------------------------------------------------------------------------------
-- Сущности
------------------------------------------------------------------------------------------------
local entities, nextIndex = {}, 100
local allUnits = {}
local function register(e)
  nextIndex = nextIndex + 1
  e.__index_id = nextIndex
  entities[nextIndex] = e
  return e
end
_G.IsValidEntity = function(e)
  return e ~= nil and type(e) == "table" and e.__index_id ~= nil and not e.__removed
end
_G.EntIndexToHScript = function(i)
  if i == nil then return nil end
  local e = entities[i]
  if e and not e.__removed then return e end
  return nil
end
local events = {}
local function fire(name, data)
  for _, h in ipairs(events[name] or {}) do
    local ok, err = pcall(h.fn, h.ctx and h.ctx or data, data)
    if not ok then fail("событие " .. name .. ": " .. tostring(err)) end
  end
end
_G.ListenToGameEvent = function(name, fn, ctx)
  events[name] = events[name] or {}
  -- В Доте обработчик вызывается как fn(ctx, event), если ctx задан, иначе fn(event)
  events[name][#events[name] + 1] = { fn = function(_, data) if ctx ~= nil then return fn(ctx, data) end return fn(data) end }
  return #events[name]
end

local EntityBase = {}
function EntityBase:entindex() return self.__index_id end
EntityBase.GetEntityIndex = EntityBase.entindex
function EntityBase:IsNull() return self.__removed == true end
function EntityBase:GetAbsOrigin() return Vector(self.pos.x, self.pos.y, self.pos.z) end
function EntityBase:GetOrigin() return self:GetAbsOrigin() end
function EntityBase:SetAbsOrigin(v) assert(isVec(v), "SetAbsOrigin: нужен Vector") self.pos = Vector(v.x, v.y, v.z) end
function EntityBase:SetLocalScale(s) self.scale = s end
function EntityBase:SetAngles(pitch, yaw, roll) self.angles = Vector(pitch, yaw, roll) end
function EntityBase:SetOrigin(v) self:SetAbsOrigin(v) end
function EntityBase:GetName() return self.name or "" end
function EntityBase:GetClassname() return self.classname or "" end
function EntityBase:GetTeamNumber() return self.team or DOTA_TEAM_NOTEAM end
function EntityBase:GetTeam() return self:GetTeamNumber() end
function EntityBase:SetForwardVector(v) assert(isVec(v), "SetForwardVector: нужен Vector") self.forward = v end
function EntityBase:GetForwardVector() return self.forward or Vector(1, 0, 0) end
function EntityBase:SetContextThink(name, fn, delay)
  self.thinks = self.thinks or {}
  if fn == nil then self.thinks[name] = nil return end
  self.thinks[name] = { fn = fn, at = now + (delay or 0) }
end

local function newEntity(proto, fields)
  local e = fields or {}
  setmetatable(e, { __index = function(t, k)
    local v = proto[k]
    if v ~= nil then return v end
    v = EntityBase[k]
    if v ~= nil then return v end
    if type(k) == "string" and k:match("^%u") then error("MOCK: нет метода " .. (proto.__name or "?") .. ":" .. k, 2) end
    return nil
  end })
  register(e)
  return e
end

_G.SpawnEntityFromTableSynchronous = function(class, kv)
  assert(class == "prop_dynamic" and type(kv.model) == "string", "SpawnEntityFromTableSynchronous: модель")
  return newEntity({ __name = class }, { classname = class, pos = Vector(0, 0, 0) })
end

_G.UTIL_Remove = function(e)
  if e == nil then return end
  e.__removed = true
  if e.modifiers then for _, m in ipairs(e.modifiers) do m.__dead = true end end
end
_G.UTIL_RemoveImmediate = _G.UTIL_Remove

------------------------------------------------------------------------------------------------
-- Модификаторы (как в движке: файл грузится в своем окружении по LinkLuaModifier)
------------------------------------------------------------------------------------------------
local links = {}
local classCache = {}
_G.LinkLuaModifier = function(name, path, motion)
  if type(name) ~= "string" or type(path) ~= "string" then fail("LinkLuaModifier: неверные аргументы " .. tostring(name)) return end
  links[name] = path
end
local BUILTIN_MODS = {
  modifier_knockback = true, modifier_invulnerable = true, modifier_invisible = true, modifier_item_ultimate_scepter_consumed = true,
  modifier_sven_warcry = true, modifier_sven_gods_strength = true,
  modifier_pudge_flesh_heap_block = true, modifier_pudge_dismember = true,
  modifier_item_aghanims_shard = true, modifier_stunned = true, modifier_kill = true, modifier_truesight = true,
}
local function loadModifierClass(name)
  if classCache[name] then return classCache[name] end
  local path = links[name]
  if not path then return nil end
  local chunk, err = loadfile(ROOT .. "/" .. path .. ".lua")
  if not chunk then fail("модификатор " .. name .. ": файл не найден " .. path .. " (" .. tostring(err) .. ")") return nil end
  local env = setmetatable({}, { __index = _G })
  setfenv(chunk, env)
  local ok, e2 = pcall(chunk)
  if not ok then fail("модификатор " .. name .. ": ошибка загрузки файла: " .. tostring(e2)) return nil end
  local cls = rawget(env, name)
  if type(cls) ~= "table" then fail("модификатор " .. name .. ": класс не найден в окружении файла") return nil end
  classCache[name] = cls
  return cls
end

local ModAPI = {}
function ModAPI:GetParent() return self.__parent end
function ModAPI:GetCaster() return self.__caster end
function ModAPI:GetAbility() return self.__ability end
function ModAPI:GetName() return self.__name end
function ModAPI:GetStackCount() return self.__stacks end
function ModAPI:SetStackCount(n) assert(type(n) == "number", "SetStackCount: число") self.__stacks = math.floor(n) end
function ModAPI:IncrementStackCount() self.__stacks = self.__stacks + 1 end
function ModAPI:DecrementStackCount() self.__stacks = self.__stacks - 1 end
function ModAPI:Destroy()
  if self.__dead then return end
  self.__dead = true
  if self.OnDestroy then local ok, err = pcall(self.OnDestroy, self) if not ok then fail("модификатор " .. self.__name .. ":OnDestroy: " .. tostring(err)) end end
end
function ModAPI:IsNull() return self.__dead == true end
function ModAPI:GetElapsedTime() return now - self.__created end
function ModAPI:GetDuration() return self.__duration or -1 end
function ModAPI:GetRemainingTime() if self.__expires then return self.__expires - now end return -1 end
function ModAPI:SetDuration(d, inform) assert(type(d) == "number", "SetDuration: число") self.__duration = d self.__expires = d > 0 and now + d or nil end
function ModAPI:StartIntervalThink(t)
  if t < 0 then self.__think = nil else self.__think = { every = t, at = now + t } end
end
function ModAPI:GetAuraOwner() return self.__parent end

local function callMod(m, method, ...)
  local f = m[method]
  if type(f) ~= "function" then return nil end
  local ok, r = pcall(f, m, ...)
  if not ok then fail("модификатор " .. m.__name .. ":" .. method .. ": " .. tostring(r)) return nil end
  return r
end

-- Имена методов свойств, которые модификатор объявил
local function declared(m)
  if m.__declared then return m.__declared end
  local list = {}
  local d = callMod(m, "DeclareFunctions")
  if type(d) == "table" then
    for _, id in ipairs(d) do
      local method = K.methods[id]
      if method == nil then fail(m.__name .. ": неизвестное свойство " .. tostring(id)) else list[method] = true end
      if method and type(m[method]) ~= "function" then fail(m.__name .. ": объявлено свойство, но нет метода " .. method) end
    end
  end
  m.__declared = list
  return list
end

------------------------------------------------------------------------------------------------
-- Юниты, герои, способности, предметы
------------------------------------------------------------------------------------------------
local Ability = { __name = "CDOTABaseAbility" }
local abilityIds = 100000
function Ability:GetEntityIndex()
  if not self.simId then abilityIds = abilityIds + 1; self.simId = abilityIds end
  return self.simId
end
function Ability:GetAbilityName() return self.name end
function Ability:GetName() return self.name end
function Ability:GetLevel() return self.level end
function Ability:SetLevel(l) self.level = l end
function Ability:GetMaxLevel() return self.maxLevel or (self.ult and 3 or 4) end
function Ability:IsHidden() return self.hidden == true end
function Ability:SetHidden(b) assert(type(b) == "boolean", "SetHidden: boolean") self.hidden = b end
function Ability:IsActivated() return self.deactivated ~= true end
function Ability:SetActivated(b) assert(type(b) == "boolean", "SetActivated: boolean") self.deactivated = not b end
function Ability:IsPassive() return self.passive == true end
function Ability:IsItem() return false end
function Ability:GetAbilityType() return self.ult and 1 or 0 end
function Ability:GetBehavior()
  local b = 0
  if self.behavior:find("NO_TARGET") then b = b + 4 end
  if self.behavior:find("UNIT_TARGET") then b = b + 8 end
  if self.behavior:find("POINT") then b = b + 16 end
  if self.behavior:find("PASSIVE") or self.behavior == "" then b = b + 2 end
  return b
end
function Ability:GetAbilityTargetTeam() return DOTA_UNIT_TARGET_TEAM_ENEMY end
function Ability:IsFullyCastable() return self.level > 0 end
function Ability:IsCooldownReady() return (self.cdUntil or 0) <= now end
function Ability:IsInAbilityPhase() return false end
function Ability:GetHeroLevelRequiredToUpgrade() return self.ult and (6 + self.level * 6) or (1 + self.level * 2) end
function Ability:GetCaster() return self.owner end
function Ability:GetToggleState() return self.toggled == true end
function Ability:GetChannelTime() return self:GetSpecialValueFor("AbilityChannelTime") end
function Ability:GetChannelStartTime() return self.channelStart or 0 end
function Ability:IsChanneling() return self.channelEnd ~= nil and now < self.channelEnd end
local function levelValue(values, key, level)
  local arr = values[key]
  if arr == nil then return 0 end
  local i = math.max(1, math.min(#arr, level + 1))
  return arr[i]
end
function Ability:GetLevelSpecialValueNoOverride(key, level)
  assert(type(key) == "string", "GetLevelSpecialValueNoOverride: ключ строка")
  assert(type(level) == "number", "GetLevelSpecialValueNoOverride: уровень число")
  return levelValue(self.values, key, level)
end
-- Значение с учетом модификаторов OVERRIDE_ABILITY_SPECIAL (так подсказки и логика видят сферы)
function Ability:GetSpecialValueFor(key, level)
  level = level or math.max(0, self.level - 1)
  local base = levelValue(self.values, key, level)
  local owner = self.owner
  if owner and owner.modifiers then
    for _, m in ipairs(owner.modifiers) do
      if not m.__dead then
        local d = declared(m)
        if d.GetModifierOverrideAbilitySpecial then
          local ev = { ability = self, ability_special_value = key, ability_special_level = level }
          if callMod(m, "GetModifierOverrideAbilitySpecial", ev) == 1 then
            local v = callMod(m, "GetModifierOverrideAbilitySpecialValue", ev)
            if type(v) ~= "number" then fail(m.__name .. ": OverrideAbilitySpecialValue вернул не число") else return v end
          end
        end
      end
    end
  end
  return base
end
function Ability:GetMaxAbilityCharges(level)
  return self:GetSpecialValueFor("AbilityCharges")
end
function Ability:GetCurrentAbilityCharges()
  if self.charges == nil then self.charges = self:GetLevelSpecialValueNoOverride("AbilityCharges", math.max(0, self.level - 1)) end
  return self.charges
end
function Ability:SetCurrentAbilityCharges(charges) self.charges = charges end
function Ability:MarkAbilityButtonDirty() end
function Ability:RefreshCharges() self.charges = self:GetMaxAbilityCharges(self.level - 1) end
function Ability:GetAbilityChargeRestoreTime(level)
  local duration = self:GetSpecialValueFor("AbilityChargeRestoreTime", level)
  if duration > 0 then return duration end
  return self:GetLevelSpecialValueNoOverride("AbilityCooldown", level)
end
function Ability:GetCooldown(level) return self:GetSpecialValueFor("AbilityCooldown", level) end
function Ability:GetEffectiveCooldown(level)
  local cd = self:GetCooldown(level)
  local owner = self.owner
  local keep = 1
  if owner and owner.modifiers then
    for _, m in ipairs(owner.modifiers) do
      local method = declared(m).GetModifierPercentageCooldownStacking and "GetModifierPercentageCooldownStacking"
        or (declared(m).GetModifierPercentageCooldown and "GetModifierPercentageCooldown")
      if not m.__dead and method then
        local p = callMod(m, method, { ability = self, unit = owner })
        if type(p) ~= "number" then fail(m.__name .. ": PercentageCooldown вернул не число")
        elseif p < 0 or p >= 100 then fail(m.__name .. ": перезарядка вне 0..99: " .. p)
        else keep = keep * (1 - p / 100) end
      end
    end
  end
  return cd * keep
end
function Ability:EndCooldown() self.cdUntil = 0 end
function Ability:StartCooldown(t) self.cdUntil = now + t end
function Ability:GetCooldownTimeRemaining() return math.max(0, (self.cdUntil or 0) - now) end
function Ability:GetEffectiveCastRange() return levelValue(self.values, "AbilityCastRange", math.max(0, self.level - 1)) end
function Ability:GetManaCost() return 0 end
function Ability:GetCursorTarget() return self.owner and self.owner.cursorTarget end
function Ability:GetCursorPosition() return (self.owner and self.owner.cursorPos) or (self.owner and self.owner.pos) or Vector(0, 0, 0) end
function Ability:OnSpellStart()
  local o = self.owner
  _G.__spellStarts = (_G.__spellStarts or 0) + 1
  if o and o.cursorTarget ~= nil and not IsValidEntity(o.cursorTarget) then fail("OnSpellStart: цель курсора недействительна") end
end

local Item = { __name = "CDOTA_Item" }
function Item:GetAbilityName() return self.name end
function Item:GetName() return self.name end
function Item:IsItem() return true end
function Item:GetCost() return self.cost or 1000 end
function Item:GetAbilityType() return 0 end
function Item:LaunchLootInitialHeight(...)
  local args = { ... }
  local target = args[5]
  if not isVec(target) then fail("LaunchLootInitialHeight: последний аргумент — Vector") return end
  if self.physical then self.physical.pos = Vector(target.x, target.y, target.z) end
end
function Item:GetContainer() return self.physical end
function Item:GetPurchaser() return self.owner end
function Item:GetCurrentCharges() return self.charges or 1 end
function Item:GetSecondaryCharges() return self.charges2 or 0 end
function Item:SetLevel(l) assert(type(l) == "number", "Item:SetLevel: число") self.level = l end
function Item:GetLevel() return self.level or 1 end
function Item:GetItemSlot()
  local h = self.holder
  if not h or not h.items then return -1 end
  for i = 0, 17 do if h.items[i] == self then return i end end
  return -1
end

local Physical = { __name = "CDOTA_Item_Physical" }
function Physical:GetContainedItem() return self.item end

local physicalItems = {}
_G.CreateItem = function(name, owner, purchaser)
  assert(type(name) == "string", "CreateItem: имя")
  return newEntity(Item, { name = name, pos = Vector(0, 0, 0) })
end
local function makePhysical(pos, item)
  assert(isVec(pos), "CreateItemOnPosition: нужен Vector")
  local p = newEntity(Physical, { item = item, pos = Vector(pos.x, pos.y, pos.z), classname = "dota_item_drop" })
  item.physical = p
  physicalItems[#physicalItems + 1] = p
  return p
end
_G.CreateItemOnPositionForLaunch = function(pos, item) return makePhysical(pos, item) end
_G.CreateItemOnPositionSync = function(pos, item) return makePhysical(pos, item) end

local runes = {}
_G.CreateRune = function(pos, kind)
  local r = newEntity({ __name = "CDOTA_Item_Rune" }, { pos = Vector(pos.x, pos.y, pos.z), kind = kind, classname = "dota_item_rune" })
  runes[#runes + 1] = r
  return r
end

local NPC = { __name = "CDOTA_BaseNPC" }
local players = {} -- [pid] = { hero=, gold=, team=, bot=, name=, randomed= }
local XP_TABLE = { 0, 240, 640, 1160, 1760, 2440, 3200, 4000, 4900, 5900, 7000, 8200, 9500, 10900, 12400, 14000, 15700, 17500, 19400, 21400, 23600, 26000, 28600, 31400, 34400, 38400, 43400, 49400, 56400, 63900 }

local function modStates(u)
  local st = {}
  for _, m in ipairs(u.modifiers or {}) do
    if not m.__dead then
      local s = m.CheckState and callMod(m, "CheckState")
      if type(s) == "table" then for k, v in pairs(s) do if v then st[k] = true end end end
    end
  end
  return st
end
local function sumProp(u, method, ev)
  local total = 0
  for _, m in ipairs(u.modifiers or {}) do
    if not m.__dead and declared(m)[method] then
      local v = callMod(m, method, ev or {})
      if v ~= nil and type(v) ~= "number" then fail(m.__name .. ":" .. method .. " вернул " .. type(v))
      elseif v then total = total + v end
    end
  end
  return total
end

function NPC:IsAlive() return self.alive end
function NPC:GetHealth() return self.hp end
function NPC:GetMaxHealth() return math.max(1, self.maxhp + (self.isHero and sumProp(self, "GetModifierHealthBonus") or 0)) end
function NPC:SetHealth(h) self.hp = math.max(1, math.min(h, self:GetMaxHealth())) end
function NPC:SetMaxHealth(h) self.maxhp = h end
function NPC:SetBaseMaxHealth(h) self.maxhp = h end
function NPC:GetHealthPercent() return math.floor(self.hp / self:GetMaxHealth() * 100) end
function NPC:Heal(amount, src)
  assert(type(amount) == "number", "Heal: число")
  if amount ~= amount then fail("Heal: NaN") return end
  self.hp = math.min(self:GetMaxHealth(), self.hp + amount)
end
function NPC:HealWithParams(amount, inflictor, lifesteal, amplify, source, spellLifesteal)
  assert(lifesteal and amplify and source == self, "HealWithParams: ожидается вампиризм героя")
  if spellLifesteal then assert(inflictor ~= nil, "HealWithParams: нет источника урона") end
  self:Heal(amount, inflictor)
end
function NPC:GetMana() return self.mana end
function NPC:GetMaxMana() return self.maxmana end
function NPC:SetMana(m) self.mana = m end
function NPC:GetPlayerOwnerID() return self.pid or -1 end
function NPC:GetPlayerID() return self.pid or -1 end
function NPC:GetPlayerOwner() if self.pid and self.pid >= 0 then return players[self.pid].controller end return nil end
function NPC:GetOwner() return nil end
function NPC:GetUnitName() return self.unitName end
function NPC:GetLevel() return self.level or 1 end
function NPC:IsHero() return self.isHero == true end
function NPC:IsRealHero() return self.isHero == true and not self.illusion end
function NPC:IsIllusion() return self.illusion == true end
function NPC:IsTempestDouble() return false end
function NPC:IsClone() return false end
function NPC:IsBuilding() return self.building == true end
function NPC:IsWard() return self.unitName == "npc_dota_observer_wards" or self.unitName == "npc_dota_sentry_wards" end
function NPC:IsCreep() return not self.isHero end
function NPC:IsNeutralUnitType() return self.team == DOTA_TEAM_NEUTRALS end
function NPC:IsInvulnerable() return modStates(self)[MODIFIER_STATE_INVULNERABLE] == true end
function NPC:IsMagicImmune() return modStates(self)[MODIFIER_STATE_MAGIC_IMMUNE] == true end
function NPC:IsDebuffImmune() return self:IsMagicImmune() or modStates(self)[MODIFIER_STATE_DEBUFF_IMMUNE] == true end
function NPC:IsReincarnating() return false end
function NPC:IsChanneling() return false end
function NPC:IsMuted() return modStates(self)[MODIFIER_STATE_MUTED] == true end
function NPC:IsHexed() return modStates(self)[MODIFIER_STATE_HEXED] == true end
function NPC:IsAttackImmune() return modStates(self)[MODIFIER_STATE_ATTACK_IMMUNE] == true end
function NPC:IsOutOfGame() return modStates(self)[MODIFIER_STATE_OUT_OF_GAME] == true end
function NPC:IsStunned() return modStates(self)[MODIFIER_STATE_STUNNED] == true end
function NPC:IsInvisible() return modStates(self)[MODIFIER_STATE_INVISIBLE] == true end
function NPC:SetOwner(o) assert(o == nil or IsValidEntity(o), "SetOwner: сущность") self.owner = o end
function NPC:SetControllableByPlayer(pid, b) assert(type(pid) == "number" and type(b) == "boolean", "SetControllableByPlayer: аргументы") self.pid = pid _G.__summons = (_G.__summons or 0) + 1 end
function NPC:IsRangedAttacker() return self.ranged == true end
function NPC:GetRangedProjectileName() return "particles/base_attacks/ranged_hero.vpcf" end
function NPC:GetPrimaryAttribute() return self.primary or 0 end
function NPC:SetModel(m) assert(type(m) == "string") self.model = m end
function NPC:SetOriginalModel(m) self.model = m end
function NPC:SetModelScale(s) end
function NPC:SetBaseMoveSpeed(s) assert(type(s) == "number") self.speed = s end
function NPC:GetBaseMoveSpeed() return self.speed end
function NPC:SetBaseDamageMin(d) self.dmgMin = d end
function NPC:SetBaseDamageMax(d) self.dmgMax = d end
function NPC:GetBaseDamageMin() return self.dmgMin end
function NPC:GetBaseDamageMax() return self.dmgMax end
function NPC:GetAttackDamage() return (self.dmgMin + self.dmgMax) / 2 end
function NPC:GetAverageTrueAttackDamage(t) return self:GetAttackDamage() + (self.isHero and sumProp(self, "GetModifierPreAttack_BonusDamage") or 0) end
function NPC:GetPhysicalArmorValue(ignoreBase) return 3 + sumProp(self, "GetModifierPhysicalArmorBonus") end
function NPC:Purge(buffs, debuffs, frame, stuns, exc) assert(type(buffs) == "boolean" and type(debuffs) == "boolean", "Purge: аргументы") end
function NPC:GetStrength() return 20 + (self.level or 1) * 3 end
function NPC:GetAgility() return 20 + (self.level or 1) * 2 end
function NPC:IsSilenced() return modStates(self)[MODIFIER_STATE_SILENCED] == true end
function NPC:IsCurrentlyHorizontalMotionControlled() return false end
function NPC:IsDisarmed() return modStates(self)[MODIFIER_STATE_DISARMED] == true end
function NPC:PassivesDisabled() return modStates(self)[MODIFIER_STATE_PASSIVES_DISABLED] == true end
function NPC:IsRooted() return modStates(self)[MODIFIER_STATE_ROOTED] == true end
function NPC:GiveMana(m) assert(type(m) == "number", "GiveMana: число") self.mana = math.min(self.maxmana or 0, (self.mana or 0) + m) end
function NPC:SetCursorCastTarget(t) if t ~= nil then assert(IsValidEntity(t), "SetCursorCastTarget: цель") end self.cursorTarget = t end
function NPC:SetCursorPosition(v) assert(isVec(v), "SetCursorPosition: Vector") self.cursorPos = v end
function NPC:MoveToNPC(t) assert(IsValidEntity(t), "MoveToNPC: цель") self.order = { kind = "move", pos = t.pos } end
function NPC:AddNoDraw() self.nodraw = true end
function NPC:RemoveNoDraw() self.nodraw = false end
function NPC:CalculateStatBonus(b) end
function NPC:SetTimeUntilRespawn(t) assert(type(t) == "number", "SetTimeUntilRespawn: число") self.respawnAt = now + t end
function NPC:GetTimeUntilRespawn() return math.max(0, (self.respawnAt or now) - now) end
function NPC:GetCurrentXP() return self.xp or 0 end
function NPC:GetAbilityPoints() return self.abilityPoints or 0 end
function NPC:SetAbilityPoints(n) self.abilityPoints = n end
function NPC:GetAbilityCount() return #(self.abilities or {}) end
function NPC:GetAbilityByIndex(i) return (self.abilities or {})[i + 1] end
function NPC:FindAbilityByName(n)
  for _, a in ipairs(self.abilities or {}) do if a.name == n then return a end end
  return nil
end
function NPC:SwapAbilities(a, b, ena, enb)
  local i, j
  for k, ab in ipairs(self.abilities) do
    if ab.name == a then i = k end
    if ab.name == b then j = k end
  end
  assert(i and j, "SwapAbilities: обе способности должны существовать")
  self.abilities[i]:SetActivated(ena)
  self.abilities[j]:SetActivated(enb)
  self.abilities[i], self.abilities[j] = self.abilities[j], self.abilities[i]
end
function NPC:UpgradeAbility(a)
  if (self.abilityPoints or 0) <= 0 then fail("UpgradeAbility без очков") return end
  a.level = a.level + 1
  self.abilityPoints = self.abilityPoints - 1
end
local function levelFromXp(xp)
  local l = 1
  for i = 1, #XP_TABLE do if xp >= XP_TABLE[i] then l = i end end
  return math.min(30, l)
end
function NPC:AddExperience(xp, reason, applyBot, applyLevel)
  assert(type(xp) == "number", "AddExperience: число")
  if xp ~= xp then fail("AddExperience: NaN") return end
  local mode = _G.__GAMEMODE
  if mode and mode.xpFilter and reason ~= nil then
    local ev = { experience = xp, reason_const = reason, player_id_const = self.pid }
    local ok, keep = pcall(mode.xpFilter.fn, mode.xpFilter.ctx, ev)
    if not ok then fail("фильтр опыта: " .. tostring(keep)) return end
    if keep == false then return end
    xp = ev.experience
  end
  self.xp = (self.xp or 0) + xp
  local nl = levelFromXp(self.xp)
  while (self.level or 1) < nl do
    self.level = self.level + 1
    self.abilityPoints = (self.abilityPoints or 0) + 1
  end
end
function NPC:HeroLevelUp(effects)
  if (self.level or 1) >= 30 then return end
  self.xp = XP_TABLE[self.level + 1]
  self.level = self.level + 1
  self.abilityPoints = (self.abilityPoints or 0) + 1
end
function NPC:GetItemInSlot(i)
  assert(type(i) == "number", "GetItemInSlot: число")
  return (self.items or {})[i]
end
function NPC:AddItemByName(name)
  local it = CreateItem(name, nil, nil)
  return self:AddItem(it)
end
-- Нейтральные предметы (как в Доте 7.38+): артефакт — в ячейку 16, улучшение — в 17
local NEUTRAL_SRC = io.open("src/vscripts/core/neutraldata.ts") and io.open("src/vscripts/core/neutraldata.ts"):read("*a") or ""
local function neutralSlotOf(name)
  if name:find("^item_enhancement_") then return 17 end
  if NEUTRAL_SRC:find('"' .. name .. '"', 1, true) then return 16 end
  return nil
end
function NPC:AddItem(it)
  self.items = self.items or {}
  local mode = _G.__GAMEMODE
  if mode and mode.itemFilter then
    local ev = { inventory_parent_entindex_const = self:entindex(), item_parent_entindex_const = self:entindex(), item_entindex_const = it:entindex(), suggested_slot = -1 }
    local ok, keep = pcall(mode.itemFilter.fn, mode.itemFilter.ctx, ev)
    if not ok then fail("фильтр предметов: " .. tostring(keep)) end
    if keep == false then return it end
  end
  local ns = neutralSlotOf(it.name)
  if ns and self.items[ns] == nil then self.items[ns] = it it.holder = self return it end
  for i = 0, 8 do
    if self.items[i] == nil then self.items[i] = it it.holder = self return it end
  end
  fail("AddItem: инвентарь полон (код должен проверять): " .. tostring(it.name) .. " " .. debug.traceback("", 2):gsub("\n", " | "):sub(1, 400))
  return it
end
function NPC:SwapItems(a, b)
  assert(type(a) == "number" and type(b) == "number", "SwapItems: номера ячеек")
  self.items = self.items or {}
  self.items[a], self.items[b] = self.items[b], self.items[a]
end
function NPC:MakeVisibleToTeam(team, dur) assert(type(team) == "number" and type(dur) == "number", "MakeVisibleToTeam: аргументы") end
-- Способности ability_lua (как в движке: файл ScriptFile грузится в своем окружении, класс — глобальная с именем способности)
local ABILITY_FILES = {}
do
  local f = io.open("game/scripts/npc/npc_abilities_custom.txt")
  local kv = f and f:read("*a") or ""
  for name, body in kv:gmatch('\n\t"([%w_]+)"%s*\n\t{(.-)\n\t}') do
    local file = body:match('"ScriptFile"%s+"([^"]+)"')
    if file and body:find('"ability_lua"', 1, true) then ABILITY_FILES[name] = { file = file, behavior = body:match('"AbilityBehavior"%s+"([^"]+)"') or "" } end
  end
end
local abilityClassCache = {}
function NPC:AddAbility(name)
  assert(type(name) == "string", "AddAbility: имя")
  local def = ABILITY_FILES[name]
  if not def then fail("AddAbility: нет способности ability_lua " .. name .. " в npc_abilities_custom.txt") return nil end
  local cls = abilityClassCache[name]
  if not cls then
    local chunk, err = loadfile(ROOT .. "/" .. def.file .. ".lua")
    if not chunk then fail("способность " .. name .. ": файл не найден " .. def.file .. " (" .. tostring(err) .. ")") return nil end
    local env = setmetatable({}, { __index = _G })
    setfenv(chunk, env)
    local ok, e2 = pcall(chunk)
    if not ok then fail("способность " .. name .. ": ошибка загрузки: " .. tostring(e2)) return nil end
    cls = rawget(env, name)
    if type(cls) ~= "table" then fail("способность " .. name .. ": класс не найден в окружении файла") return nil end
    abilityClassCache[name] = cls
  end
  self.abilities = self.abilities or {}
  local a = setmetatable({ name = name, level = 0, values = {}, behavior = def.behavior, owner = self, lua = true, maxLevel = 1 },
    { __index = function(t, k) local v = cls[k] if v ~= nil then return v end return Ability[k] end })
  if a.Spawn then local ok, err = pcall(a.Spawn, a) if not ok then fail(name .. ":Spawn: " .. tostring(err)) end end
  self.abilities[#self.abilities + 1] = a
  return a
end
function NPC:RemoveItem(it)
  assert(type(it) == "table", "RemoveItem: предмет")
  for i = 0, 17 do if self.items and self.items[i] == it then self.items[i] = nil end end
  it.__removed = true
end
function NPC:HasModifier(n) return self:FindModifierByName(n) ~= nil end
function NPC:FindModifierByName(n)
  for _, m in ipairs(self.modifiers or {}) do if not m.__dead and m.__name == n then return m end end
  return nil
end
function NPC:FindAllModifiers() local r = {} for _, m in ipairs(self.modifiers or {}) do if not m.__dead then r[#r + 1] = m end end return r end
function NPC:RemoveModifierByName(n)
  for _, m in ipairs(self.modifiers or {}) do if not m.__dead and m.__name == n then callMod(m, "OnDestroy") m.__dead = true end end
end
local modifierCount = 0
function NPC:AddNewModifier(caster, ability, name, params)
  assert(type(name) == "string", "AddNewModifier: имя строка")
  if params ~= nil and type(params) ~= "table" then fail("AddNewModifier " .. name .. ": параметры не таблица") end
  params = params or {}
  if not self.alive and not self.isHero then return nil end
  if BUILTIN_MODS[name] then
    local m = setmetatable({ __name = name, __parent = self, __caster = caster, __stacks = 0, __created = now }, { __index = ModAPI })
    if params.duration then m:SetDuration(params.duration) end
    self.modifiers[#self.modifiers + 1] = m
    return m
  end
  local cls = loadModifierClass(name)
  if not cls then fail("Attempted to create unknown modifier type " .. name) return nil end
  -- Повторное наложение: OnRefresh
  local existing = self:FindModifierByName(name)
  if existing and not (cls.GetAttributes and (callMod(existing, "GetAttributes") or 0) % 4 >= 2) then
    if params.duration then existing:SetDuration(params.duration) end
    callMod(existing, "OnRefresh", params)
    return existing
  end
  local m = setmetatable({ __name = name, __parent = self, __caster = caster, __ability = ability, __stacks = 0, __created = now },
    { __index = function(t, k) local v = cls[k] if v ~= nil then return v end return ModAPI[k] end })
  if params.duration and params.duration > 0 then m:SetDuration(params.duration) end
  self.modifiers[#self.modifiers + 1] = m
  modifierCount = modifierCount + 1
  _G.__modCreated = _G.__modCreated or {}
  _G.__modCreated[name] = (_G.__modCreated[name] or 0) + 1
  callMod(m, "OnCreated", params)
  declared(m)
  -- Прогон всех объявленных свойств с пустым событием — ловит ошибки в геттерах
  for method in pairs(declared(m)) do
    if method:match("^Get") and method ~= "GetModifierOverrideAbilitySpecial" and method ~= "GetModifierOverrideAbilitySpecialValue"
      and method ~= "GetModifierPercentageCooldown" and method ~= "GetModifierPercentageCooldownStacking"
      and method ~= "GetModifierPreAttack_CriticalStrike"
      and method ~= "GetModifierTotalDamageOutgoing_Percentage" and method ~= "GetModifierIncomingDamageConstant" then
      local v = callMod(m, method, {})
      local expected = method == "GetModifierModelChange" and "string" or "number"
      if v ~= nil and type(v) ~= expected then fail(name .. ":" .. method .. " вернул " .. type(v)) end
    end
  end
  for _, s in ipairs({ "IsHidden", "IsPurgable", "IsDebuff", "GetTexture", "CheckState", "GetEffectName", "GetEffectAttachType" }) do
    if m[s] then callMod(m, s) end
  end
  return m
end
function NPC:MoveToPosition(v) assert(isVec(v), "MoveToPosition: нужен Vector") self.order = { kind = "move", pos = v } end
function NPC:MoveToPositionAggressive(v) assert(isVec(v), "MoveToPositionAggressive: нужен Vector") self.order = { kind = "move", pos = v, aggressive = true } end
function NPC:MoveToTargetToAttack(t) assert(IsValidEntity(t), "MoveToTargetToAttack: неверная цель") self.order = { kind = "attack", target = t } end
function NPC:Stop() self.order = nil end
local function castEvent(method, u, a, t)
  local ev = { unit = u, ability = a, target = t }
  for _, x in ipairs(allUnits) do
    if not x.__removed then
      for _, m in ipairs(x.modifiers) do
        if not m.__dead and declared(m)[method] then callMod(m, method, ev) end
      end
    end
  end
end
function NPC:CastAbilityNoTarget(a, pid, t)
  self.casts = (self.casts or 0) + 1
  if a.lua then
    -- Своя способность (ability_lua): фильтр применения и OnSpellStart, как в движке
    local filter = a.CastFilterResult
    if a.behavior:find("POINT") then filter = a.CastFilterResultLocation end
    if filter then
      local ok, res = pcall(filter, a, self.cursorPos or self.pos)
      if not ok then fail(a.name .. ": фильтр применения: " .. tostring(res)) return end
      if res ~= UF_SUCCESS then return end
    end
    if a.OnSpellStart then local ok, err = pcall(a.OnSpellStart, a) if not ok then fail(a.name .. ":OnSpellStart: " .. tostring(err)) end end
    a.cdUntil = now + 1
    return
  end
  if a.StartCooldown then a:StartCooldown(math.max(1, a:GetEffectiveCooldown(math.max(0, a.level - 1)))) end
  if a.owner == self and not (a.IsItem and a:IsItem()) then
    if a.name == "sven_warcry" then
      self:AddNewModifier(self, a, "modifier_sven_warcry", { duration = a:GetSpecialValueFor("duration") })
    elseif a.name == "sven_gods_strength" then
      self:AddNewModifier(self, a, "modifier_sven_gods_strength", { duration = a:GetSpecialValueFor("AbilityDuration") })
    end
    if a.name == "pudge_rot" then
      a.toggled = not a.toggled
    elseif a.name == "pudge_flesh_heap" then
      self:AddNewModifier(self, a, "modifier_pudge_flesh_heap_block", { duration = a:GetSpecialValueFor("duration") })
    elseif a.name == "pudge_dismember" and t and t.team ~= self.team then
      a.channelStart = now
      local duration = a:GetChannelTime()
      a.channelEnd = now + duration
      t:AddNewModifier(self, a, "modifier_pudge_dismember", { duration = duration })
      self:SetContextThink("sim_pudge_dismember", function()
        castEvent("OnAbilityEndChannel", self, a, t)
      end, duration)
    end
    castEvent("OnAbilityExecuted", self, a, t)
    castEvent("OnAbilityFullyCast", self, a, t)
  end
end
function NPC:CastAbilityOnTarget(t, a, pid)
  assert(IsValidEntity(t), "CastAbilityOnTarget: цель")
  self.cursorTarget = t
  self.cursorPos = t.pos
  self:CastAbilityNoTarget(a, pid, t)
  -- Способность «наносит урон» цели (как встроенная): проверяем эффекты по попаданию
  if a.owner == self and not a.lua and t.alive and t.team ~= self.team then
    applyDamageRef({ victim = t, attacker = self, damage = 60 + 20 * (a.level or 1), damage_type = DAMAGE_TYPE_MAGICAL, ability = a })
  end
end
function NPC:CastAbilityOnPosition(p, a, pid) assert(isVec(p), "CastAbilityOnPosition: Vector") self.cursorPos = p self:CastAbilityNoTarget(a, pid) end
function NPC:GetAttackRange() return self.ranged and 600 or 150 end
function NPC:IsAttacking() return false end
function NPC:IsMoving()
  return self.order ~= nil and (self.order.kind == "move" or self.order.kind == "attack")
end
function NPC:GetIdealSpeed() return self.speed end
function NPC:Interrupt() end
function NPC:IsFakeClient() return false end

local function newUnit(fields)
  fields.modifiers = fields.modifiers or {}
  fields.alive = true
  fields.items = fields.items or {}
  local u = newEntity(NPC, fields)
  allUnits[#allUnits + 1] = u
  return u
end

_G.CreateModifierThinker = function(caster, ability, name, params, origin, team, blocker)
  assert(type(name) == "string" and isVec(origin) and type(team) == "number", "CreateModifierThinker: аргументы")
  local u = newUnit({ unitName = "npc_dota_thinker", pos = origin, team = team, hp = 1, maxhp = 1, dummy = true, speed = 0, dmgMin = 0, dmgMax = 0 })
  u:AddNewModifier(caster, ability, name, params or {})
  return u
end
local NEUTRAL_STATS = { hp = 600, dmg = 30 }
_G.CreateUnitByName = function(name, pos, findClear, npcOwner, unitOwner, team)
  assert(type(name) == "string", "CreateUnitByName: имя")
  assert(isVec(pos), "CreateUnitByName: позиция Vector")
  assert(type(team) == "number", "CreateUnitByName: команда число")
  local hp = NEUTRAL_STATS.hp
  if name:find("ancient") or name:find("dragon") or name:find("granite") or name:find("big_thunder") or name:find("prowler_shaman") then hp = 1500 end
  if name == "npc_orb_goblin" then hp = 1200 end
  _G.__unitNames = _G.__unitNames or {}
  _G.__unitNames[name] = (_G.__unitNames[name] or 0) + 1
  local u = newUnit({ unitName = name, pos = Vector(pos.x, pos.y, pos.z), team = team, hp = hp, maxhp = hp, mana = 0, maxmana = 0,
    dmgMin = NEUTRAL_STATS.dmg, dmgMax = NEUTRAL_STATS.dmg + 4, speed = 300, level = 1, pid = -1 })
  fire("npc_spawned", { entindex = u:entindex(), is_respawn = 0 })
  return u
end
_G.CreateIllusions = function(owner, hero, keys, n, padding, scramble, findClear)
  assert(IsValidEntity(owner) and IsValidEntity(hero) and type(keys) == "table" and type(n) == "number", "CreateIllusions: аргументы")
  assert(type(keys.outgoing_damage) == "number" and type(keys.incoming_damage) == "number", "CreateIllusions: проценты урона")
  _G.__illusions = (_G.__illusions or 0) + n
  local out = {}
  for i = 1, n do
    local u = newUnit({ unitName = hero.unitName, pos = Vector(hero.pos.x + 50 * i, hero.pos.y, hero.pos.z), team = hero.team, hp = hero:GetMaxHealth(), maxhp = hero:GetMaxHealth(),
      mana = 0, maxmana = 0, dmgMin = hero.dmgMin * (1 + keys.outgoing_damage / 100), dmgMax = hero.dmgMax * (1 + keys.outgoing_damage / 100), speed = hero.speed,
      level = hero.level, pid = hero.pid, isHero = true, illusion = true })
    out[#out + 1] = u
  end
  return out
end
_G.CreateUnitByNameAsync = function(name, pos, findClear, a, b, team, cb) local u = CreateUnitByName(name, pos, findClear, a, b, team) cb(u) end
_G.FindClearSpaceForUnit = function(u, pos, b) assert(isVec(pos)) u.pos = Vector(pos.x, pos.y, pos.z) return true end

------------------------------------------------------------------------------------------------
-- Мир
------------------------------------------------------------------------------------------------
local MAP = require("core.mapinfo").MAP
_G.GetGroundPosition = function(v, u) assert(isVec(v), "GetGroundPosition: Vector") return Vector(v.x, v.y, 128) end
_G.GetGroundHeight = function(v, u) assert(isVec(v), "GetGroundHeight: Vector") return 128 end
_G.GridNav = strict("GridNav")
rawset(GridNav, "IsTraversable", function(_, v) assert(isVec(v)) return math.abs(v.x) < MAP.bounds and math.abs(v.y) < MAP.bounds end)
rawset(GridNav, "IsBlocked", function(_, v) assert(isVec(v)) return dist2d(v, Vector(0, 0, 0)) < 250 end)
rawset(GridNav, "DestroyTreesAroundPoint", function(_, v, r, full) assert(isVec(v) and type(r) == "number", "DestroyTreesAroundPoint: аргументы") end)
rawset(GridNav, "CanFindPath", function(_, a, b) assert(isVec(a) and isVec(b), "CanFindPath: Vector") return true end)
_G.AddFOWViewer = function(team, pos, radius, duration, obstructed) assert(type(team) == "number" and isVec(pos) and type(radius) == "number", "AddFOWViewer: аргументы") end
_G.MinimapEvent = function(team, ent, x, y, kind, dur) assert(type(team) == "number" and IsValidEntity(ent) and type(x) == "number", "MinimapEvent: аргументы") end
_G.EmitSoundOn = function(s, e) assert(type(s) == "string" and IsValidEntity(e), "EmitSoundOn: аргументы") end
_G.EmitGlobalSound = function(s) assert(type(s) == "string") end
local uniq = 0
_G.DoUniqueString = function(s) assert(type(s) == "string", "DoUniqueString: строка") uniq = uniq + 1 return s .. "_" .. uniq end
_G.StartSoundEventFromPosition = function(s, p) assert(type(s) == "string" and isVec(p), "StartSoundEventFromPosition: аргументы") end
_G.EmitSoundOnLocationWithCaster = function(p, s, c) end
_G.EmitSoundOnClient = function(s, player) assert(type(s) == "string" and type(player) == "table", "EmitSoundOnClient: аргументы") end
_G.SendOverheadEventMessage = function(player, kind, unit, value, src) assert(IsValidEntity(unit) and type(value) == "number", "SendOverheadEventMessage: аргументы") end
_G.PrecacheResource = function(kind, path, ctx) assert(type(kind) == "string" and type(path) == "string") end
_G.PrecacheUnitByNameSync = function(name, ctx) assert(type(name) == "string") end
_G.PrecacheUnitByNameAsync = function(name, cb) assert(type(name) == "string" and type(cb) == "function") cb() end
_G.SetTeamCustomHealthbarColor = function(team, r, g, b) end
local particleId = 0
_G.ParticleManager = {
  CreateParticle = function(_, name, attach, owner)
    assert(type(name) == "string")
    particleId = particleId + 1
    _G.__particles = _G.__particles or {}
    _G.__particles[name] = (_G.__particles[name] or 0) + 1
    return particleId
  end,
  SetParticleControl = function(_, id, cp, v) assert(type(id) == "number" and isVec(v), "SetParticleControl: аргументы") end,
  DestroyParticle = function(_, id, imm) end,
  ReleaseParticleIndex = function(_, id) end,
  SetParticleControlEnt = function() end,
  SetParticleControlForward = function(_, id, cp, v) assert(type(id) == "number" and isVec(v), "SetParticleControlForward: аргументы") end,
  CreateParticleForTeam = function(self, name, attach, owner, team)
    assert(type(team) == "number", "CreateParticleForTeam: команда")
    return self:CreateParticle(name, attach, owner)
  end,
}

local function teamRelationOk(selfTeam, other, filter)
  if filter == DOTA_UNIT_TARGET_TEAM_BOTH then return true end
  if filter == DOTA_UNIT_TARGET_TEAM_ENEMY then return other.team ~= selfTeam end
  if filter == DOTA_UNIT_TARGET_TEAM_FRIENDLY then return other.team == selfTeam end
  return true
end
_G.FindUnitsInLine = function(team, a, b, cache, width, teamFilter, typeFilter, flags)
  assert(type(team) == "number" and isVec(a) and isVec(b) and type(width) == "number", "FindUnitsInLine: аргументы")
  local out = {}
  local dx, dy = b.x - a.x, b.y - a.y
  local len2 = dx * dx + dy * dy
  for _, u in ipairs(allUnits) do
    if not u.__removed and u.alive and not u.dummy and teamRelationOk(team, u, teamFilter) then
      local t = len2 > 0 and math.max(0, math.min(1, ((u.pos.x - a.x) * dx + (u.pos.y - a.y) * dy) / len2)) or 0
      local px, py = a.x + dx * t, a.y + dy * t
      local d = math.sqrt((u.pos.x - px) ^ 2 + (u.pos.y - py) ^ 2)
      if d <= width then out[#out + 1] = u end
    end
  end
  return out
end
_G.FindUnitsInRadius = function(team, pos, cache, radius, teamFilter, typeFilter, flags, order, grow)
  assert(type(team) == "number" and isVec(pos) and type(radius) == "number", "FindUnitsInRadius: аргументы")
  local res = {}
  for _, u in ipairs(allUnits) do
    if not u.__removed and u.alive and not u.dummy then
      local typeOk = (u.isHero and bit.band(typeFilter, DOTA_UNIT_TARGET_HERO) ~= 0) or (not u.isHero and bit.band(typeFilter, DOTA_UNIT_TARGET_BASIC) ~= 0)
      local invOk = not u:IsInvulnerable() or bit.band(flags, DOTA_UNIT_TARGET_FLAG_INVULNERABLE) ~= 0
      local illOk = not u.illusion or bit.band(flags, DOTA_UNIT_TARGET_FLAG_NOT_ILLUSIONS) == 0
      if typeOk and invOk and illOk and teamRelationOk(team, u, teamFilter) and dist2d(u.pos, pos) <= radius then res[#res + 1] = u end
    end
  end
  if order == FIND_CLOSEST then table.sort(res, function(a, b) return dist2d(a.pos, pos) < dist2d(b.pos, pos) end) end
  return res
end

local namedEntities = {}
_G.Entities = {
  FindByName = function(_, start, name) return namedEntities[name] end,
  FindAllByClassname = function(_, cls)
    local r = {}
    for _, e in pairs(entities) do if not e.__removed and e.classname == cls then r[#r + 1] = e end end
    return r
  end,
  FindByClassname = function(_, start, cls) return nil end,
}

------------------------------------------------------------------------------------------------
-- Урон
------------------------------------------------------------------------------------------------
local killUnit
local function applyDamage(t)
  return applyDamageImpl(t)
end
applyDamageRef = applyDamage
applyDamageImpl = function(t)
  local victim, attacker, dmg = t.victim, t.attacker, t.damage
  if not IsValidEntity(victim) or not victim.alive then return 0 end
  if type(dmg) ~= "number" or dmg ~= dmg then fail("ApplyDamage: урон не число") return 0 end
  if victim:IsInvulnerable() then return 0 end
  local mode = _G.__GAMEMODE
  if mode and mode.damageFilter then
    local ev = { entindex_attacker_const = attacker and attacker:entindex(), entindex_victim_const = victim:entindex(), damage = dmg, damagetype_const = t.damage_type }
    local ok, keep = pcall(mode.damageFilter.fn, mode.damageFilter.ctx, ev)
    if not ok then fail("фильтр урона: " .. tostring(keep)) end
    if keep == false then return 0 end
    dmg = ev.damage
    if type(dmg) ~= "number" or dmg ~= dmg then fail("фильтр урона вернул не число") return 0 end
  end
  local inc = sumProp(victim, "GetModifierIncomingDamage_Percentage", { attacker = attacker, target = victim, damage = dmg })
  dmg = dmg * math.max(0, 1 + inc / 100)
  for _, m in ipairs(victim.modifiers) do
    if not m.__dead and declared(m).GetModifierIncomingDamageConstant then
      local v = callMod(m, "GetModifierIncomingDamageConstant", { attacker = attacker, target = victim, damage = dmg })
      if type(v) == "number" and v < 0 then dmg = math.max(0, dmg + v) end
    end
  end
  if attacker and attacker.modifiers then
    local out = sumProp(attacker, "GetModifierTotalDamageOutgoing_Percentage", { attacker = attacker, target = victim, damage = dmg,
      damage_category = t.__attack and DOTA_DAMAGE_CATEGORY_ATTACK or DOTA_DAMAGE_CATEGORY_SPELL,
      inflictor = t.ability, record = t.__record })
    dmg = dmg * (1 + out / 100)
  end
  victim.hp = victim.hp - dmg
  -- MIN_HEALTH (Неупокоенный и т.п.)
  local minHp = 0
  for _, m in ipairs(victim.modifiers) do
    if not m.__dead and declared(m).GetMinHealth then
      local v = callMod(m, "GetMinHealth", {})
      if type(v) == "number" and v > minHp then minHp = v end
    end
  end
  if minHp > 0 and victim.hp < minHp then victim.hp = minHp _G.__minHealthSaves = (_G.__minHealthSaves or 0) + 1 end
  local ev = { attacker = attacker, unit = victim, damage = dmg, damage_type = t.damage_type or DAMAGE_TYPE_PHYSICAL, damage_flags = t.damage_flags or 0, inflictor = t.ability,
    damage_category = t.__attack and DOTA_DAMAGE_CATEGORY_ATTACK or DOTA_DAMAGE_CATEGORY_SPELL, original_damage = dmg }
  for _, u in ipairs(allUnits) do
    if not u.__removed then
      for _, m in ipairs(u.modifiers) do
        if not m.__dead and declared(m).OnTakeDamage then callMod(m, "OnTakeDamage", ev) end
      end
    end
  end
  if victim.hp <= 0 and victim.alive then killUnit(victim, attacker, t.ability) end
  return dmg
end
_G.ApplyDamage = function(t)
  assert(type(t) == "table" and IsValidEntity(t.victim) and IsValidEntity(t.attacker) and type(t.damage) == "number", "ApplyDamage: аргументы")
  return applyDamage(t)
end
_G.DoCleaveAttack = function(attacker, target, ability, damage, r1, r2, dist, effect)
  assert(IsValidEntity(attacker) and IsValidEntity(target) and type(damage) == "number", "DoCleaveAttack: аргументы")
  for _, u in ipairs(FindUnitsInRadius(attacker.team, target.pos, nil, r2, DOTA_UNIT_TARGET_TEAM_ENEMY, DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC, 0, 0, false)) do
    if u ~= target then applyDamage({ victim = u, attacker = attacker, damage = damage, damage_type = DAMAGE_TYPE_PHYSICAL }) end
  end
  return 1
end

killUnit = function(victim, attacker, inflictor)
  victim.alive = false
  -- Событие смерти для модификаторов (до снятия модификаторов умершего — как в Доте)
  local dev = { unit = victim, attacker = attacker, inflictor = inflictor }
  for _, x in ipairs(allUnits) do
    if not x.__removed then
      for _, m in ipairs(x.modifiers) do
        if not m.__dead and declared(m).OnDeath then callMod(m, "OnDeath", dev) end
      end
    end
  end
  victim.hp = 0
  victim.order = nil
  for _, m in ipairs(victim.modifiers) do
    if not m.__dead then
      local permanent = m.RemoveOnDeath and callMod(m, "RemoveOnDeath") == false
      if not permanent then callMod(m, "OnDestroy") m.__dead = true end
    end
  end
  if victim.isHero then victim.respawnAt = now + 5 + (victim.level or 1) * 0.2 end
  fire("entity_killed", { entindex_killed = victim:entindex(), entindex_attacker = attacker and attacker:entindex() or nil })
  -- Награда за нейтрала (как в Доте: через фильтр золота)
  if not victim.isHero and attacker and attacker.pid and attacker.pid >= 0 and victim.team == DOTA_TEAM_NEUTRALS then
    _G.PlayerResource:ModifyGold(attacker.pid, 40, false, DOTA_ModifyGold_NeutralKill)
    local h = players[attacker.pid].hero
    if h then h:AddExperience(60, DOTA_ModifyXP_CreepKill, false, true) end
  end
  -- Труп нейтрала исчезает не сразу (как в Доте)
  if not victim.isHero then victim.corpseUntil = now + 2 end
end

------------------------------------------------------------------------------------------------
-- Игроки, правила, режим
------------------------------------------------------------------------------------------------
local controllers = {}
_G.PlayerResource = {}
local PR = _G.PlayerResource
local function P(pid)
  local p = players[pid]
  if not p then error("MOCK: неизвестный игрок " .. tostring(pid), 3) end
  return p
end
function PR:IsValidPlayerID(pid) return players[pid] ~= nil end
function PR:IsValidPlayer(pid) return players[pid] ~= nil end
function PR:IsFakeClient(pid) return players[pid] ~= nil and players[pid].bot == true end
function PR:GetSelectedHeroEntity(pid) local p = players[pid] if p then return p.hero end return nil end
function PR:GetSelectedHeroName(pid) local p = players[pid] if p and p.heroName then return p.heroName end return "" end
function PR:GetPlayerName(pid) return P(pid).name end
function PR:GetTeam(pid) return P(pid).team end
function PR:GetGold(pid) return P(pid).gold end
function PR:HasRandomed(pid) return P(pid).randomed == true end
function PR:HasSelectedHero(pid) local p = players[pid] return p ~= nil and p.heroName ~= nil end
function PR:GetConnectionState(pid) return P(pid).connection or DOTA_CONNECTION_STATE_CONNECTED end
function PR:GetPlayer(pid) local p = players[pid] return p and p.controller or nil end
function PR:SetCustomPlayerColor(pid, r, g, b) assert(type(r) == "number") end
function PR:SetCustomTeamAssignment(pid, team) assert(type(team) == "number") P(pid).team = team end
function PR:SpendGold(pid, cost, reason)
  assert(type(cost) == "number")
  local p = P(pid)
  if p.gold < cost then fail("SpendGold больше, чем есть") end
  p.gold = p.gold - cost
end
function PR:ModifyGold(pid, gold, reliable, reason)
  assert(type(gold) == "number", "ModifyGold: число")
  if gold ~= gold then fail("ModifyGold: NaN") return 0 end
  local mode = _G.__GAMEMODE
  if mode and mode.goldFilter then
    local ev = { gold = gold, reason_const = reason, player_id_const = pid, reliable = reliable and 1 or 0 }
    local ok, keep = pcall(mode.goldFilter.fn, mode.goldFilter.ctx, ev)
    if not ok then fail("фильтр золота: " .. tostring(keep)) return 0 end
    if keep == false then return 0 end
    gold = ev.gold
  end
  P(pid).gold = math.max(0, P(pid).gold + gold)
  P(pid).earned = (P(pid).earned or 0) + math.max(0, gold)
  return gold
end
setmetatable(PR, { __index = function(_, k) error("MOCK: нет PlayerResource:" .. tostring(k), 2) end })

local state = DOTA_GAMERULES_STATE_INIT
local mode = newEntity({ __name = "CDOTABaseGameMode" }, { pos = Vector(0, 0, 0) })
_G.__GAMEMODE = mode
local ModeMT = getmetatable(mode)
local modeProto = {}
setmetatable(mode, { __index = function(t, k)
  if modeProto[k] then return modeProto[k] end
  if EntityBase[k] then return EntityBase[k] end
  if type(k) ~= "string" or not k:match("^%u") then return nil end
  if k:match("^Set") then return function(self, ...) local s = rawget(self, "settings") or {} rawset(self, "settings", s) s[k] = { ... } end end
  error("MOCK: нет GameMode:" .. tostring(k), 2)
end })
function modeProto:SetModifyGoldFilter(fn, ctx) self.goldFilter = { fn = fn, ctx = ctx } end
function modeProto:SetModifyExperienceFilter(fn, ctx) self.xpFilter = { fn = fn, ctx = ctx } end
function modeProto:SetDamageFilter(fn, ctx) self.damageFilter = { fn = fn, ctx = ctx } end
function modeProto:SetExecuteOrderFilter(fn, ctx) self.orderFilter = { fn = fn, ctx = ctx } end
function modeProto:SetBountyRunePickupFilter(fn, ctx) self.runeFilter = { fn = fn, ctx = ctx } end
function modeProto:SetRuneEnabled(kind, on) assert(type(kind) == "number") end
function modeProto:SetItemAddedToInventoryFilter(fn, ctx) self.itemFilter = { fn = fn, ctx = ctx } end

local winner = nil
_G.GameRules = {}
local GR = _G.GameRules
function GR:GetGameModeEntity() return mode end
function GR:GetGameTime() return now end
function GR:GetDOTATime(includePre, includeNeg) if not hornAt then return 0 end return now - hornAt end
function GR:State_Get() return state end
function GR:IsGamePaused() return paused end
function GR:IsDaytime() return true end
function GR:FinishCustomGameSetup() _G.__finishSetup = true end
function GR:PlayerHasCustomGameHostPrivileges(player)
  assert(type(player) == "table", "PlayerHasCustomGameHostPrivileges: нужен игрок")
  return player == players[0].controller
end
function GR:SetGameWinner(team) assert(type(team) == "number") winner = team end
function GR:AddBotPlayerWithEntityScript(heroName, name, team, script, b)
  assert(type(heroName) == "string" and type(team) == "number", "AddBotPlayerWithEntityScript: аргументы")
  local pid = #players + 1
  while players[pid] do pid = pid + 1 end
  players[pid] = { name = name, team = team, gold = 600, bot = true, controller = newEntity({ __name = "CDOTAPlayerController" }, { pos = Vector(0, 0, 0) }) }
  local h = _G.__spawnHero(pid, heroName)
  return h
end
setmetatable(GR, { __index = function(_, k)
  if type(k) == "string" and (k:match("^Set") or k:match("^Lock") or k:match("^Enable")) then return function() end end
  error("MOCK: нет GameRules:" .. tostring(k), 2)
end })

------------------------------------------------------------------------------------------------
-- Сетевые таблицы и события клиента
------------------------------------------------------------------------------------------------
local netTables = {}
local netWrites = 0
local function checkNet(v, path, depth)
  local t = type(v)
  if t == "function" or t == "userdata" or t == "thread" then fail("сетевая таблица " .. path .. ": нельзя передать " .. t) return 0 end
  if t == "number" and (v ~= v or v == math.huge or v == -math.huge) then fail("сетевая таблица " .. path .. ": число NaN/inf") end
  if t ~= "table" then return #tostring(v) end
  if depth > 6 then fail("сетевая таблица " .. path .. ": слишком глубоко") return 0 end
  if getmetatable(v) ~= nil and getmetatable(v) ~= Vec then fail("сетевая таблица " .. path .. ": объект с метатаблицей (Map/класс?)") end
  local size = 0
  for k, x in pairs(v) do
    if type(k) ~= "string" and type(k) ~= "number" then fail("сетевая таблица " .. path .. ": ключ " .. type(k)) end
    size = size + #tostring(k) + checkNet(x, path .. "." .. tostring(k), depth + 1)
  end
  return size
end
local function deepcopy(v)
  if type(v) ~= "table" then return v end
  local r = {}
  for k, x in pairs(v) do r[k] = deepcopy(x) end
  return r
end
local maxNetSize = {}
_G.CustomNetTables = {
  SetTableValue = function(_, name, key, value)
    assert(type(name) == "string" and type(key) == "string", "SetTableValue: имя и ключ — строки")
    netWrites = netWrites + 1
    local size = checkNet(value, name .. "/" .. key, 0)
    local id = name .. "/" .. key
    if size > (maxNetSize[id] or 0) then maxNetSize[id] = size end
    if size > 16000 then fail("сетевая таблица " .. id .. " слишком большая: " .. size) end
    netTables[name] = netTables[name] or {}
    netTables[name][key] = deepcopy(value)
  end,
  GetTableValue = function(_, name, key)
    local t = netTables[name]
    return t and deepcopy(t[key]) or nil
  end,
}
local clientListeners = {}
local sentToClients = {}
_G.CustomGameEventManager = {
  Send_ServerToAllClients = function(_, name, data) assert(type(name) == "string") checkNet(data, "event " .. name, 0) sentToClients[#sentToClients + 1] = { name = name, data = data } end,
  Send_ServerToPlayer = function(_, player, name, data) assert(IsValidEntity(player), "Send_ServerToPlayer: игрок") checkNet(data, "event " .. name, 0) end,
  Send_ServerToTeam = function(_, team, name, data) end,
  RegisterListener = function(_, name, fn) clientListeners[name] = fn return 1 end,
}
local function clientSend(pid, name, data)
  local fn = clientListeners[name]
  if not fn then fail("нет обработчика события клиента " .. name) return end
  data.PlayerID = pid
  local ok, err = pcall(fn, nil, data)
  if not ok then fail("обработчик " .. name .. ": " .. tostring(err)) end
end

_G.ExecuteOrderFromTable = function(t)
  assert(type(t) == "table" and t.UnitIndex and t.OrderType, "ExecuteOrderFromTable: аргументы")
  local u = EntIndexToHScript(t.UnitIndex)
  if not u then return end
  if t.OrderType == DOTA_UNIT_ORDER_PICKUP_ITEM then
    local p = EntIndexToHScript(t.TargetIndex)
    if p then u.order = { kind = "pickup", target = p } end
  end
end

------------------------------------------------------------------------------------------------
-- Карта: фонтаны, Повелитель, вышки
------------------------------------------------------------------------------------------------
local ALL_TEAMS = { DOTA_TEAM_GOODGUYS, DOTA_TEAM_BADGUYS, DOTA_TEAM_CUSTOM_1, DOTA_TEAM_CUSTOM_2, DOTA_TEAM_CUSTOM_3,
  DOTA_TEAM_CUSTOM_4, DOTA_TEAM_CUSTOM_5, DOTA_TEAM_CUSTOM_6, DOTA_TEAM_CUSTOM_7, DOTA_TEAM_CUSTOM_8 }
for i, b in ipairs(MAP.bases) do
  local f = newUnit({ unitName = "dota_fountain", classname = "ent_dota_fountain", pos = Vector(b.fountain.x, b.fountain.y, 128), team = ALL_TEAMS[i], hp = 1e9, maxhp = 1e9, building = true, dummy = true })
  local t = newUnit({ unitName = "npc_dota_tower", classname = "npc_dota_tower", pos = Vector(b.tower.x, b.tower.y, 128), team = ALL_TEAMS[i], hp = 1e9, maxhp = 1e9, building = true, dummy = true })
end
local boss = newUnit({ unitName = "npc_dota_kobold_overboss", pos = Vector(0, 0, 300), team = DOTA_TEAM_NEUTRALS, hp = 1e9, maxhp = 1e9, dummy = true,
  abilities = {} })
namedEntities["@overboss"] = boss
for _, n in ipairs({ "dota_ability_throw_coin", "dota_ability_throw_coin_long", "dota_ability_celebrate" }) do
  boss.abilities[#boss.abilities + 1] = setmetatable({ name = n, level = 1, values = {}, behavior = "NO_TARGET", owner = boss }, { __index = Ability })
end
for i, r in ipairs(MAP.runeSpots) do newEntity({ __name = "rune_spawner" }, { classname = "dota_item_rune_spawner", pos = Vector(r.x, r.y, 128) }) end

------------------------------------------------------------------------------------------------
-- Герои
------------------------------------------------------------------------------------------------
local function fountainPos(team)
  for i, t in ipairs(ALL_TEAMS) do if t == team then local b = MAP.bases[i] return Vector(b.fountain.x, b.fountain.y, 128) end end
  return Vector(0, 0, 128)
end
_G.__spawnHero = function(pid, heroName)
  local data = HEROES[heroName]
  if not data then fail("симулятор: нет данных героя " .. heroName) data = { primary = 0, ranged = false, abilities = {} } end
  local h = newUnit({ unitName = heroName, isHero = true, pid = pid, team = players[pid].team, pos = fountainPos(players[pid].team),
    hp = 700, maxhp = 700, mana = 400, maxmana = 400, dmgMin = 50, dmgMax = 56, speed = 310, level = 1, xp = 0, abilityPoints = 1,
    primary = data.primary, ranged = data.ranged, abilities = {} })
  for _, a in ipairs(data.abilities) do
    h.abilities[#h.abilities + 1] = setmetatable({ name = a.name, level = a.innate and 1 or 0, ult = a.ult, values = a.values,
      behavior = a.behavior, passive = a.behavior:find("PASSIVE") ~= nil, owner = h, innate = a.innate }, { __index = Ability })
  end
  players[pid].hero = h
  players[pid].heroName = heroName
  fire("npc_spawned", { entindex = h:entindex(), is_respawn = 0 })
  return h
end

------------------------------------------------------------------------------------------------
-- Запуск скриптов
------------------------------------------------------------------------------------------------
local okLoad, errLoad = pcall(require, "addon_game_mode")
if not okLoad then fail("загрузка addon_game_mode: " .. tostring(errLoad)) end
if type(rawget(_G, "Activate")) ~= "function" then fail("нет глобальной Activate") end
if type(rawget(_G, "Precache")) ~= "function" then fail("нет глобальной Precache") end
local ctx = setmetatable({}, { __index = function() return nil end })
local okP, eP = pcall(Precache, ctx)
if not okP then fail("Precache: " .. tostring(eP)) end
local okA, eA = pcall(Activate)
if not okA then fail("Activate: " .. tostring(eA)) end
-- Каждый привязанный модификатор должен загружаться так, как это делает движок
local linked = 0
for name in pairs(links) do linked = linked + 1 loadModifierClass(name) end
if linked == 0 then fail("ни одного LinkLuaModifier при загрузке") end

-- Клиентская точка входа
do
  local savedIsClient, savedIsServer = _G.IsClient, _G.IsServer
  local chunk = loadfile(ROOT .. "/addon_game_mode_client.lua")
  if not chunk then fail("нет addon_game_mode_client.lua") else
    _G.IsClient = function() return true end
    _G.IsServer = function() return false end
    local before = 0 for _ in pairs(links) do before = before + 1 end
    links = {}
    local ok, err = pcall(chunk)
    if not ok then fail("addon_game_mode_client: " .. tostring(err)) end
    local after = 0 for _ in pairs(links) do after = after + 1 end
    if after ~= before then fail("клиент привязал " .. after .. " модификаторов, сервер " .. before) end
    _G.IsClient, _G.IsServer = savedIsClient, savedIsServer
  end
end

local function setState(s)
  state = s
  fire("game_rules_state_change", {})
end

-- Игрок-человек 0
players[0] = { name = "Тестер", team = DOTA_TEAM_NOTEAM, gold = 600, bot = false, controller = newEntity({ __name = "CDOTAPlayerController" }, { pos = Vector(0, 0, 0) }) }
players[0].controller.MakeRandomHeroSelection = function(self)
  if players[0].heroName then fail("MakeRandomHeroSelection: герой уже выбран") return end
  players[0].randomed = true
  __spawnHero(0, "npc_dota_hero_lina")
end
for i = 1, PLAYERS - 1 do end -- остальные — боты (их добавляет сама игра в редакторе)

local function runThinks()
  for _, e in pairs(entities) do
    if e.thinks and not e.__removed then
      for name, th in pairs(e.thinks) do
        if th.at <= now then
          local ok, nextDelay = pcall(th.fn)
          if not ok then fail("думалка " .. name .. ": " .. tostring(nextDelay)) e.thinks[name] = nil
          elseif type(nextDelay) == "number" then th.at = now + nextDelay
          else e.thinks[name] = nil end
        end
      end
    end
  end
end

local function modifierTicks(dt)
  for _, u in ipairs(allUnits) do
    if not u.__removed then
      local keep = {}
      for _, m in ipairs(u.modifiers) do
        if not m.__dead and m.__expires and now >= m.__expires then callMod(m, "OnDestroy") m.__dead = true end
        if not m.__dead and m.__think and now >= m.__think.at then
          m.__think.at = now + m.__think.every
          callMod(m, "OnIntervalThink")
        end
        if not m.__dead then keep[#keep + 1] = m end
      end
      u.modifiers = keep
    end
  end
end

------------------------------------------------------------------------------------------------
-- Простая физика: движение, атаки, подбор, руны, возрождение
------------------------------------------------------------------------------------------------
local lastAttack = {}
local attackRecord = 0
local function stepUnits(dt)
  for _, u in ipairs(allUnits) do
    if not u.__removed and u.alive and not u.dummy then
      local o = u.order
      local stunned = u:IsStunned()
      if o and not stunned then
        if o.kind == "move" then
          local d = dist2d(u.pos, o.pos)
          local step = (u.speed + (u.isHero and sumProp(u, "GetModifierMoveSpeedBonus_Constant") or 0)) * dt
          if d <= step then u.pos = Vector(o.pos.x, o.pos.y, 128) u.order = nil
          else local dir = (o.pos - u.pos):Normalized() u.pos = u.pos + dir * step end
        elseif o.kind == "attack" or o.kind == "pickup" then
          local t = o.target
          if not IsValidEntity(t) or (t.alive == false) then u.order = nil
          else
            local range = o.kind == "pickup" and 80 or (u:GetAttackRange() + 30)
            local d = dist2d(u.pos, t.pos)
            if d > range then
              local dir = (t.pos - u.pos):Normalized()
              u.pos = u.pos + dir * math.min(d, u.speed * dt)
            elseif o.kind == "attack" then
              local id = u:entindex()
              if (lastAttack[id] or -10) + 1.3 <= now then
                lastAttack[id] = now
                if t.team ~= u.team and not t:IsInvulnerable() and not modStates(u)[MODIFIER_STATE_DISARMED] then
                  attackRecord = attackRecord + 1
                  local ev = { attacker = u, target = t, record = attackRecord, ranged_attack = u.ranged,
                    damage_category = DOTA_DAMAGE_CATEGORY_ATTACK }
                  for _, m in ipairs(u.modifiers) do
                    if not m.__dead and declared(m).OnAttackRecord then callMod(m, "OnAttackRecord", ev) end
                  end
                  local dmg = u:GetAttackDamage() + (u.isHero and sumProp(u, "GetModifierPreAttack_BonusDamage") or 0)
                  local crit = 0
                  for _, m in ipairs(u.modifiers) do
                    if not m.__dead and declared(m).GetModifierPreAttack_CriticalStrike then
                      local c = callMod(m, "GetModifierPreAttack_CriticalStrike", ev)
                      if type(c) == "number" and c > crit then crit = c end
                    end
                  end
                  if crit > 0 then dmg = dmg * crit / 100 end
                  if u.isHero then dmg = dmg * 2.2 end -- герои в симуляции чуть быстрее убивают
                  ev.damage = applyDamage({ victim = t, attacker = u, damage = dmg, damage_type = DAMAGE_TYPE_PHYSICAL,
                    __attack = true, __record = ev.record })
                  for _, m in ipairs(u.modifiers) do
                    if not m.__dead and declared(m).OnAttackLanded then callMod(m, "OnAttackLanded", ev) end
                    if not m.__dead and declared(m).OnAttackRecordDestroy then callMod(m, "OnAttackRecordDestroy", ev) end
                  end
                  -- Нейтралы отвечают
                  if t.alive and t.team == DOTA_TEAM_NEUTRALS and not t.order and t.unitName ~= "npc_orb_goblin" then t.order = { kind = "attack", target = u } end
                end
              end
            end
          end
        end
      end
      -- Подбор предметов героем рядом (через фильтр приказов, как в игре)
      if u.isHero then
        for i = #physicalItems, 1, -1 do
          local p = physicalItems[i]
          if p.__removed or p.item.__removed then table.remove(physicalItems, i)
          elseif dist2d(p.pos, u.pos) < 90 then
            local allowed = true
            if mode.orderFilter then
              local ok, r = pcall(mode.orderFilter.fn, mode.orderFilter.ctx, { units = { ["0"] = u:entindex() }, entindex_target = p:entindex(), order_type = DOTA_UNIT_ORDER_PICKUP_ITEM, issuer_player_id_const = u.pid })
              if not ok then fail("фильтр приказов: " .. tostring(r)) end
              allowed = r ~= false
            end
            if allowed then
              table.remove(physicalItems, i)
              local item = p.item
              p.__removed = true
              fire("dota_item_picked_up", { itemname = item.name, PlayerID = u.pid, ItemEntityIndex = item:entindex(), HeroEntityIndex = u:entindex() })
              if not item.__removed and item.holder == nil then
                local free = false
                for slot = 0, 8 do if u.items[slot] == nil then free = true end end
                if free then u:AddItem(item) else p.__removed = false physicalItems[#physicalItems + 1] = p end
              end
            end
          end
        end
        for i = #runes, 1, -1 do
          local r = runes[i]
          if r.__removed then table.remove(runes, i)
          elseif dist2d(r.pos, u.pos) < 100 then
            table.remove(runes, i)
            r.__removed = true
            if mode.runeFilter then
              local ev = { player_id_const = u.pid, gold_bounty = 40, xp_bounty = 0 }
              local ok, keep = pcall(mode.runeFilter.fn, mode.runeFilter.ctx, ev)
              if not ok then fail("фильтр руны: " .. tostring(keep)) end
              if keep ~= false then PR:ModifyGold(u.pid, ev.gold_bounty, true, DOTA_ModifyGold_BountyRune) u:AddExperience(ev.xp_bounty, DOTA_ModifyXP_Unspecified, false, true) end
            end
          end
        end
      end
    end
  end
  -- Уборка трупов
  for _, u in ipairs(allUnits) do
    if u.corpseUntil and now >= u.corpseUntil and not u.__removed then u.__removed = true end
  end
  -- Возрождение героев
  for pid, p in pairs(players) do
    local h = p.hero
    if h and not h.alive and h.respawnAt and now >= h.respawnAt then
      h.alive = true
      h.hp = h:GetMaxHealth()
      h.pos = fountainPos(h.team)
      h.respawnAt = nil
      fire("npc_spawned", { entindex = h:entindex(), is_respawn = 1 })
    end
  end
  -- Реген героев
  for _, p in pairs(players) do
    local h = p.hero
    if h and h.alive then h.hp = math.min(h:GetMaxHealth(), h.hp + (4 + sumProp(h, "GetModifierConstantHealthRegen")) * dt) end
  end
end

-- «Мозг» игрока-человека: ходит в кольцо, к сферам, дерется, выбирает сферы через события клиента
local humanNextPick = 0
local selectedLegend = nil
local function pickTestLegend()
  if not LEGEND_BRANCH or selectedLegend then return end
  local state = CustomNetTables:GetTableValue("orb_spheres", "0")
  local offer = state and state.o
  if not offer or offer.r ~= "legend" then return end
  for _, card in pairs(offer.c) do
    if card.br == LEGEND_BRANCH then
      clientSend(0, "orb_pick", { seq = offer.seq, id = card.id })
      selectedLegend = card.id
      return
    end
  end
end
local function humanThink()
  local p = players[0]
  local h = p.hero
  if not h or not h.alive then return end
  -- прокачка
  while (h.abilityPoints or 0) > 0 do
    local best
    for _, a in ipairs(h.abilities) do if not a.innate and a.level < a:GetMaxLevel() and (best == nil or a.level < best.level) then best = a end end
    if not best then break end
    h:UpgradeAbility(best)
  end
  -- применение способностей по ближайшему врагу (чтобы работали эффекты сфер-кода)
  local foes = FindUnitsInRadius(h.team, h.pos, nil, 700, DOTA_UNIT_TARGET_TEAM_ENEMY, DOTA_UNIT_TARGET_HERO, 0, FIND_CLOSEST, false)
  if #foes > 0 then
    for _, a in ipairs(h.abilities) do
      if a.level > 0 and not a.innate and not a.passive and not a.lua and a:IsCooldownReady() and math.random() < 0.3 then
        h:CastAbilityOnTarget(foes[1], a, 0)
        break
      end
    end
  end
  -- Варды идут через point-cast; дым и пыль через клиентское событие.
  if now >= (_G.__nextSlotUse or 0) and hornAt and not h:IsStunned() and not h:IsMuted() and not h:IsHexed() and not h:IsOutOfGame() then
    _G.__nextSlotUse = now + 50
    local key = ({ "ob", "se", "sm", "du" })[(_G.__slotUses or 0) % 4 + 1]
    local before = CustomNetTables:GetTableValue("orb_items", "0")
    if key == "ob" or key == "se" then
      local name = key == "ob" and "orb_slot_observer" or "orb_slot_sentry"
      local ward = h:FindAbilityByName(name)
      if ward then h:CastAbilityOnPosition(h:GetAbsOrigin(), ward, 0)
      else fail("слот " .. key .. ": нет штатной способности") end
    else
      clientSend(0, "orb_slot_use", { kind = key })
    end
    _G.__slotUses = (_G.__slotUses or 0) + 1
    local after = CustomNetTables:GetTableValue("orb_items", "0")
    if before and after and after[key] ~= math.max(0, before[key] - 1) then fail("слот " .. key .. ": неверное списание") end
  end
  -- выбор сфер «руками»
  local t = CustomNetTables:GetTableValue("orb_spheres", "0")
  if t and t.o and now >= humanNextPick then
    humanNextPick = now + 1 + math.random() * 3
    local cards = {}
    for _, c in pairs(t.o.c) do cards[#cards + 1] = c end
    if #cards == 0 then fail("предложение сфер без карточек") end
    for _, c in ipairs(cards) do
      if type(c.id) ~= "string" or type(c.st) ~= "number" or type(c.mx) ~= "number" then fail("карточка с неполными данными") end
    end
    if math.random() < 0.15 and t.o.r ~= "legend" then
      clientSend(0, "orb_reroll", { seq = t.o.seq })
    else
      clientSend(0, "orb_pick", { seq = t.o.seq, id = cards[math.random(1, #cards)].id })
      -- двойной клик старым номером не должен дать вторую сферу
      clientSend(0, "orb_pick", { seq = t.o.seq, id = cards[1].id })
    end
  end
  -- Нейтральные предметы: выбрать артефакт и улучшение (иногда — старым номером)
  local it = CustomNetTables:GetTableValue("orb_items", "0")
  if it then
    if type(it.ob) ~= "number" or type(it.sm) ~= "number" or type(it.nk) ~= "number" then fail("orb_items: неполные данные") end
    if it.no and math.random() < 0.2 then
      local tr, en
      for _, v in pairs(it.no.tr) do tr = v end
      for _, v in pairs(it.no.en) do en = v end
      clientSend(0, "orb_neutral_pick", { seq = it.no.seq, kind = "trinket", name = tr })
      clientSend(0, "orb_neutral_pick", { seq = it.no.seq - 1, kind = "enh", name = en })
      clientSend(0, "orb_neutral_pick", { seq = it.no.seq, kind = "enh", name = en })
      local trinket, enhancement = h:GetItemInSlot(16), h:GetItemInSlot(17)
      if not trinket or trinket:GetAbilityName() ~= tr then fail("нейтральный артефакт не экипирован") end
      if not enhancement or enhancement:GetAbilityName() ~= en or enhancement:GetLevel() ~= it.no.levels[en] then
        fail("зачарование не экипировано или имеет неверный уровень")
      end
      _G.__neutralPicks = (_G.__neutralPicks or 0) + 1
    end
    -- Съесть Boots of Travel: в середине партии даем сапоги и едим
    if now - (hornAt or now) > 400 and not _G.__ateTravel then
      _G.__ateTravel = true
      local hasFree = false
      for i = 0, 8 do if not h.items[i] then hasFree = true end end
      if hasFree then
        h:AddItemByName("item_travel_boots")
        clientSend(0, "orb_eat_travel", {})
        if not h:HasModifier("modifier_orb_travel") then fail("Boots of Travel не съелись") end
        clientSend(0, "orb_eat_travel", {}) -- сапог больше нет — ничего не должно произойти
      end
    end
    -- Покупка расходников: варды и дым уходят в слоты
    if now - (hornAt or now) > 200 and not _G.__boughtWards then
      _G.__boughtWards = true
      local before = it.ob
      local hasFree = false
      for i = 0, 8 do if not h.items[i] then hasFree = true end end
      if hasFree then
        if VERBOSE then realPrint("SIM: покупаю варды t=" .. now) end
        local w = h:AddItemByName("item_ward_observer")
        w.charges = 2
        _G.__wardCheck = { at = now + 0.5, want = before + 2, item = w }
        _G.__nextSlotUse = math.max(_G.__nextSlotUse or 0, now + 2) -- не тратить варды до проверки
      end
    end
    if _G.__wardCheck and now >= _G.__wardCheck.at then
      local c = _G.__wardCheck
      _G.__wardCheck = nil
      local t2 = CustomNetTables:GetTableValue("orb_items", "0")
      if not t2 or t2.ob < c.want then fail("купленные варды не попали в слот: " .. tostring(t2 and t2.ob) .. " < " .. c.want .. " слотов применено " .. tostring(_G.__slotUses) .. " t=" .. now .. " next=" .. tostring(_G.__nextSlotUse) .. " alive=" .. tostring(h.alive)) end
      for i = 0, 17 do if h.items[i] == c.item then fail("купленный вард остался в инвентаре") end end
    end
  end
  local help = CustomNetTables:GetTableValue("orb_game", "help")
  if help and help["0"] then
    local choices = { "gold", "orb", "rage" }
    clientSend(0, "orb_help", { choice = choices[math.random(1, 3)] })
  end
  -- движение
  if not h.order then
    local boss = CustomNetTables:GetTableValue("orb_game", "boss")
    if boss and boss.orbs then
      for _, o in pairs(boss.orbs) do if o.l == 1 then h:MoveToPosition(Vector(o.x, o.y, 128)) return end end
    end
    local enemies = FindUnitsInRadius(h.team, h.pos, nil, 900, DOTA_UNIT_TARGET_TEAM_ENEMY, DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC, 0, FIND_CLOSEST, false)
    if #enemies > 0 then h:MoveToTargetToAttack(enemies[1]) return end
    local a = math.random() * math.pi * 2
    h:MoveToPosition(Vector(math.cos(a) * 600, math.sin(a) * 600, 128))
  end
end

local chatCommands = { "-mech", "-event storm", "-lvl 6", "-orb grey 2", "-orb blue", "-orb purple", "-orb legend", "-boss purple", "-courier", "-goblin", "-hunt", "-help",
  "-camps", "-pts blue 30", "-pts purple 8", "-lvl 12", "-gold 3000", "-dump", "-refresh", "-hunt", "-bot 1", "-tokens 12", "-wards 3" }

------------------------------------------------------------------------------------------------
-- Главный цикл
------------------------------------------------------------------------------------------------
local DT = 0.05
local hero0 = (function()
  local pool = { "npc_dota_hero_juggernaut", "npc_dota_hero_axe", "npc_dota_hero_lina", "npc_dota_hero_sniper", "npc_dota_hero_sven", "npc_dota_hero_pudge",
    "npc_dota_hero_bristleback", "npc_dota_hero_crystal_maiden", "npc_dota_hero_dragon_knight", "npc_dota_hero_drow_ranger", "npc_dota_hero_earthshaker",
    "npc_dota_hero_legion_commander", "npc_dota_hero_lich", "npc_dota_hero_luna", "npc_dota_hero_mirana", "npc_dota_hero_phantom_assassin",
    "npc_dota_hero_queenofpain", "npc_dota_hero_tidehunter", "npc_dota_hero_ursa", "npc_dota_hero_viper",
    "npc_dota_hero_zuus", "npc_dota_hero_faceless_void", "npc_dota_hero_bloodseeker", "npc_dota_hero_windrunner",
    "npc_dota_hero_ogre_magi", "npc_dota_hero_snapfire", "npc_dota_hero_puck", "npc_dota_hero_slark",
    "npc_dota_hero_razor", "npc_dota_hero_necrolyte", "npc_dota_hero_sand_king" }
  return pool[(SEED % #pool) + 1]
end)()

setState(DOTA_GAMERULES_STATE_CUSTOM_GAME_SETUP)
local phaseAt = {}
local limit = MAX_MINUTES * 60 + 60
local chatAt = 0
local chatIdx = 0
while now < limit + (hornAt or 0) and winner == nil do
  now = now + DT
  runThinks()
  -- Онлайн-лобби: хост меняет настройки и (не всегда) жмет «Начать»; иначе — автостарт
  if ONLINE and state == DOTA_GAMERULES_STATE_CUSTOM_GAME_SETUP and not _G.__lobbyDone then
    if now > 1 and not _G.__lobbySet then
      _G.__lobbySet = true
      clientSend(0, "orb_settings", { bots = 3 })
      clientSend(1, "orb_settings", { bots = 9 }) -- не хост: должно игнорироваться
      -- Голосование: игрок голосует за лимит и время, мусорные значения игнорируются
      clientSend(0, "orb_vote", { kills = (SEED % 2 == 0) and 20 or 40 })
      clientSend(0, "orb_vote", { minutes = 20 })
      clientSend(0, "orb_vote", { kills = 999, minutes = 7 })
      local t = CustomNetTables:GetTableValue("orb_game", "settings")
      if not t or t.bots ~= 3 then fail("лобби: настройки хоста не применились") end
      if not t or t.goal ~= ((SEED % 2 == 0) and 20 or 40) or t.minutes ~= 20 then fail("лобби: голосование не применилось") end
      if not t or not t.my or not t.my["0"] or t.my["0"].k == 0 then fail("лобби: нет моего голоса в таблице") end
    end
    if now > 3 and SEED % 3 ~= 0 then _G.__lobbyDone = true clientSend(0, "orb_start", {}) end
  end
  if state == DOTA_GAMERULES_STATE_CUSTOM_GAME_SETUP and _G.__finishSetup then
    setState(DOTA_GAMERULES_STATE_HERO_SELECTION)
    -- игрок выбирает героя (в каждой пятой партии не успевает — герой должен выдаться случайно)
    players[0].randomed = (SEED % 2 == 0)
    if SEED % 5 ~= 0 then __spawnHero(0, hero0) end
    phaseAt.pick = now
  elseif state == DOTA_GAMERULES_STATE_HERO_SELECTION and now - phaseAt.pick > 1 then
    setState(DOTA_GAMERULES_STATE_STRATEGY_TIME)
    setState(DOTA_GAMERULES_STATE_PRE_GAME)
    phaseAt.pre = now
  elseif state == DOTA_GAMERULES_STATE_PRE_GAME and now - phaseAt.pre > 3 then
    hornAt = now
    _G.__modCreated = {} -- самопроверка не считается покрытием
    setState(DOTA_GAMERULES_STATE_GAME_IN_PROGRESS)
  end
  if state == DOTA_GAMERULES_STATE_GAME_IN_PROGRESS then
    pickTestLegend()
    stepUnits(DT)
    modifierTicks(DT)
    if math.floor(now / 0.25) ~= math.floor((now - DT) / 0.25) then humanThink() end
    -- читы из чата по очереди (проверяем, что они не роняют игру)
    if hornAt and now - hornAt > 30 and now >= chatAt and chatIdx < #chatCommands then
      chatIdx = chatIdx + 1
      chatAt = now + 20
      fire("player_chat", { playerid = 0, text = chatCommands[chatIdx], teamonly = 0, userid = 1 })
    end
    -- пауза на 10 секунд в 7:00 (время партии стоит)
  end
  if state == DOTA_GAMERULES_STATE_POST_GAME then break end
end

------------------------------------------------------------------------------------------------
-- Проверки итогов
------------------------------------------------------------------------------------------------
local gameMin = hornAt and (now - hornAt) / 60 or 0
local st = CustomNetTables:GetTableValue("orb_game", "state")
local final = CustomNetTables:GetTableValue("orb_game", "final")
local spheres = CustomNetTables:GetTableValue("orb_spheres", "0")
if not hornAt then fail("партия не началась") end
if winner == nil then fail("партия не закончилась победой за " .. MAX_MINUTES .. " мин") end
if winner ~= nil and not final then fail("нет итогов партии (orb_game/final)") end
if not st then fail("нет orb_game/state") end
if not spheres then fail("нет orb_spheres/0") end
if LEGEND_BRANCH then
  if not selectedLegend or not spheres or not spheres.st or not spheres.st[selectedLegend] then
    fail("легендарка ветки " .. LEGEND_BRANCH .. " не получена")
  else
    realPrint("легендарка: " .. selectedLegend)
  end
end
-- Сферы игрока 0 должны реально менять героя
local h0 = players[0].hero
local taken = 0
if spheres and spheres.st then for _, n in pairs(spheres.st) do taken = taken + n end end
if taken < 5 then fail("игрок взял слишком мало сфер: " .. taken) end
if spheres and spheres.st and (spheres.st.g_health or 0) > 0 and h0:GetMaxHealth() <= h0.maxhp then fail("серая «Здоровье» не увеличила здоровье") end
-- Синяя сфера меняет значение способности
if spheres and spheres.st then
  local blueDefs = require("core.orbdata").UPGRADE_DEFS
  for _, d in ipairs(blueDefs) do
    if d.hero == hero0 and (spheres.st[d.id] or 0) > 0 and #d.mods > 0 then
      local ab = h0:FindAbilityByName(d.ability)
      local m = d.mods[1]
      if ab and ab.level > 0 then
        local base = ab:GetLevelSpecialValueNoOverride(m.key, ab.level - 1)
        local cur = ab:GetSpecialValueFor(m.key)
        -- ожидаемое значение: синие + сферы-код (Буря клинков и т.п.) по той же формуле, что у клиента
        local OS = require("core.orbstore")
        local bon = OS.computeBonuses(spheres.st, h0:GetPrimaryAttribute())
        local want = OS.overrideValue(bon, d.ability, m.key, base) or base
        if OS.replacesWrathDamage(bon, d.ability, m.key) then
          want = 0 -- Родной глобальный удар заменён шаром; синие работают на урон шара.
        elseif m.key == "AbilityCharges" then
          want = OS.nativeChargeCount(base, bon.specials[d.ability].AbilityCharges)
        end
        if math.abs(cur - want) > 0.001 then
          fail("синяя " .. d.id .. ": " .. m.key .. " = " .. cur .. ", ожидалось " .. want)
          if os.getenv("SIM_DEBUG") == "1" then
            local ctl = h0:FindModifierByName("modifier_orb_controller")
            local names = {} for k in pairs(declared(ctl)) do names[#names + 1] = k end
            realPrint("   declared: " .. table.concat(names, ","))
            local df = ctl:DeclareFunctions() realPrint("   DeclareFunctions n=" .. #df .. " first=" .. tostring(df[1]) .. " 18th=" .. tostring(df[18]))
            for _, mm in ipairs(h0.modifiers) do
              local dd = declared(mm)
              local ev = { ability = ab, ability_special_value = m.key, ability_special_level = ab.level - 1 }
              realPrint("   " .. mm.__name .. " override?=" .. tostring(dd.GetModifierOverrideAbilitySpecial) .. " ->" ..
                tostring(dd.GetModifierOverrideAbilitySpecial and mm:GetModifierOverrideAbilitySpecial(ev)) .. " ab.owner==h0 " .. tostring(ab.owner == h0))
            end
          end
        end
      end
    end
  end
end
local function count(t) local n = 0 for _ in pairs(t or {}) do n = n + 1 end return n end
if os.getenv("SIM_COVER") == "1" then
  local parts = {}
  for n, c in pairs(_G.__modCreated or {}) do if n:match("axe_") or n:match("jugg_") or n:match("_fx_") or n == "modifier_orb_hero" then parts[#parts + 1] = n:gsub("modifier_orb_", "") .. "=" .. c end end
  table.sort(parts)
  realPrint("эффекты героев: " .. table.concat(parts, " ") .. " | OnSpellStart: " .. tostring(_G.__spellStarts or 0))
  local st = CustomNetTables:GetTableValue("orb_spheres", "0")
  local taken = {}
  for id, n in pairs(st and st.st or {}) do if id:match("_p_") or id:match("_l_") or id:match("^p_") or id:match("^l_") then taken[#taken + 1] = id end end
  table.sort(taken)
  realPrint("фиолетовые/легендарки игрока: " .. table.concat(taken, ", "))
end
-- Утечки: таймеры не должны копиться, эффекты не должны создаваться тысячами
do
  local okT, T = pcall(require, "game.timers")
  if okT and T.Timers and T.Timers.count then
    local nt = T.Timers.count()
    if nt > 120 then fail("таймеров к концу партии: " .. nt .. " (утечка?)") end
  end
  for name, n in pairs(_G.__particles or {}) do
    if n > 4000 then fail("эффект " .. name .. " создан " .. n .. " раз (утечка?)") end
  end
end
if os.getenv("SIM_DEBUG") == "1" then
  local names = {}
  for _, m in ipairs(h0.modifiers) do names[#names + 1] = m.__name .. (m.__dead and "(dead)" or "") end
  realPrint("модификаторы героя 0: " .. table.concat(names, ", "))
  local ctl = h0:FindModifierByName("modifier_orb_controller")
  if ctl then
    local ab = h0:FindAbilityByName("axe_berserkers_call")
    local b = ctl:b()
    realPrint("specials: " .. tostring(b.specials) .. " axe call: " .. tostring(b.specials["axe_berserkers_call"]))
    for k, v in pairs(b.specials) do local parts = {} for kk, vv in pairs(v) do parts[#parts+1] = kk .. "=" .. vv end realPrint("  " .. k .. ": " .. table.concat(parts, ", ")) end
    local st = CustomNetTables:GetTableValue("orb_spheres", "0").st
    local parts = {} for kk, vv in pairs(st) do parts[#parts+1] = kk .. "=" .. vv end realPrint("стаки: " .. table.concat(parts, ", "))
    local ab2 = h0:FindAbilityByName("axe_one_man_army")
    realPrint("oma level " .. ab2.level .. " override=" .. tostring(ctl:GetModifierOverrideAbilitySpecial({ ability = ab2, ability_special_value = "armor_pct_as_strength", ability_special_level = 0 })) ..
      " value=" .. tostring(ctl:GetModifierOverrideAbilitySpecialValue({ ability = ab2, ability_special_value = "armor_pct_as_strength", ability_special_level = 0 })) .. " special=" .. ab2:GetSpecialValueFor("armor_pct_as_strength"))
    local store = rawget(_G, "ORBTHROW_ORB_STORE")
    realPrint("store: " .. tostring(store))
  end
end
do
  local un = _G.__unitNames or {}
  realPrint(string.format("механики: иллюзий %d, спасений MIN_HEALTH %d, частиц ловушек %d, молний %d, метеоров %d, призывов %d",
    _G.__illusions or 0, _G.__minHealthSaves or 0, (_G.__particles or {})["particles/units/heroes/hero_techies/techies_land_mine_explode.vpcf"] or 0,
    (_G.__particles or {})["particles/units/heroes/hero_zuus/zuus_lightning_bolt.vpcf"] or 0,
    (_G.__particles or {})["particles/units/heroes/hero_lina/lina_spell_light_strike_array.vpcf"] or 0, _G.__summons or 0))
  realPrint(string.format("новое: слотов применено %d, обсерверов %d, сентри %d, сундуков %d, выборов нейтралок %d, съедено тревел: %s",
    _G.__slotUses or 0, un["npc_dota_observer_wards"] or 0, un["npc_dota_sentry_wards"] or 0, un["npc_orb_chest"] or 0, _G.__neutralPicks or 0, tostring(_G.__ateTravel)))
end
realPrint(string.format("симуляция seed=%d героем %s: %.1f мин игры, победа: %s, модификаторов создано: %d, записей в таблицы: %d, сфер у игрока: %d, строк лога: %d",
  SEED, hero0, gameMin, tostring(winner ~= nil), modifierCount, netWrites, taken, logLines))
local warnList = {}
for k, v in pairs(warnings) do warnList[#warnList + 1] = k .. " ×" .. v end
if #warnList > 0 then realPrint("предупреждения: " .. table.concat(warnList, "; ")) end
if VERBOSE then for id, size in pairs(maxNetSize) do realPrint("  таблица " .. id .. ": до " .. size .. " байт") end end
if #failures > 0 then
  realPrint("ОШИБОК: " .. #failures)
  os.exit(1)
end
realPrint("ошибок нет")
