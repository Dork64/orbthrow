local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local ____exports = {}
local ringAt, markAt, land, pushChestNet, ownedItems, hasFreeSlot, giveChestItem, RING_PARTICLE, MARK_PARTICLE, nextAt, announced, target, courier, chests, lastSig
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local TIMINGS = ____config.TIMINGS
local ____center = require("core.center")
local captureStep = ____center.captureStep
local ____catchup = require("core.catchup")
local courierItem = ____catchup.courierItem
local courierTierFor = ____catchup.courierTierFor
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____orbs = require("game.orbs")
local captureSpeed = ____orbs.captureSpeed
local ____state = require("game.state")
local State = ____state.State
local activePlayers = ____state.activePlayers
local gameNow = ____state.gameNow
local scoreRows = ____state.scoreRows
local toast = ____state.toast
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
function ringAt(pos, radius)
    local fx = ParticleManager:CreateParticle(RING_PARTICLE, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(fx, 0, pos)
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(radius, 0, 0)
    )
    return fx
end
function markAt(pos)
    local fx = ParticleManager:CreateParticle(MARK_PARTICLE, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(fx, 0, pos)
    return fx
end
function land(chest)
    chest.landed = true
    if chest.unit ~= nil and isValid(chest.unit) then
        FindClearSpaceForUnit(chest.unit, chest.pos, false)
        chest.pos = chest.unit:GetAbsOrigin()
    end
    chest.ring = ringAt(chest.pos, CONFIG.chestCaptureRadius)
    chest.mark = markAt(chest.pos)
    local heroes = FindUnitsInRadius(
        DOTA_TEAM_NEUTRALS,
        chest.pos,
        nil,
        250,
        DOTA_UNIT_TARGET_TEAM_BOTH,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES,
        FIND_ANY_ORDER,
        false
    )
    for ____, h in ipairs(heroes) do
        h:AddNewModifier(h, nil, "modifier_knockback", {
            center_x = chest.pos.x,
            center_y = chest.pos.y,
            center_z = chest.pos.z,
            duration = 0.3,
            knockback_duration = 0.3,
            knockback_distance = 200,
            knockback_height = 60,
            should_stun = 0
        })
    end
end
function pushChestNet(now)
    local list = {}
    local i = 0
    local function add(pos, st, chest)
        i = i + 1
        list[tostring(i)] = {
            x = math.floor(pos.x),
            y = math.floor(pos.y),
            z = math.floor(pos.z),
            st = st,
            p = chest ~= nil and math.floor(chest.cap.progress / CONFIG.chestCaptureTime * 100) / 100 or 0,
            h = chest ~= nil and chest.cap.holder or -1,
            c = chest ~= nil and chest.cap.contested and 1 or 0,
            t = st == 0 and math.max(
                0,
                math.ceil(nextAt - now)
            ) or 0
        }
    end
    if announced and target ~= nil then
        add(target, 0)
        if isValid(courier) then
            add(
                courier:GetAbsOrigin(),
                3
            )
        end
    end
    for ____, c in ipairs(chests) do
        add(
            c.landed and c.pos or (c.unit ~= nil and isValid(c.unit) and c.unit:GetAbsOrigin() or c.pos),
            c.landed and 2 or 1,
            c
        )
    end
    local sig = ""
    for k in pairs(list) do
        local o = list[k]
        sig = sig .. (((((((((((((("|" .. tostring(o.x)) .. ":") .. tostring(o.y)) .. ":") .. tostring(o.z)) .. ":") .. tostring(o.st)) .. ":") .. tostring(o.p)) .. ":") .. tostring(o.h)) .. ":") .. tostring(o.c)) .. ":") .. tostring(o.t)
    end
    if sig == lastSig then
        return
    end
    lastSig = sig
    CustomNetTables:SetTableValue("orb_game", "chest", {list = list})
end
function ownedItems(h)
    local list = {}
    do
        local slot = 0
        while slot <= 16 do
            local it = h:GetItemInSlot(slot)
            if it ~= nil and IsValidEntity(it) then
                list[#list + 1] = it:GetAbilityName()
            end
            slot = slot + 1
        end
    end
    return list
end
function hasFreeSlot(h)
    do
        local slot = 0
        while slot <= 8 do
            if h:GetItemInSlot(slot) == nil then
                return true
            end
            slot = slot + 1
        end
    end
    return false
end
function giveChestItem(hero)
    local pid = hero:GetPlayerOwnerID()
    local rows = __TS__ArrayFilter(
        scoreRows(),
        function(____, r) return not r.left end
    )
    local tier = courierTierFor(
        gameNow(),
        pid,
        rows
    )
    local name = courierItem(
        tier,
        ownedItems(hero),
        function(n) return RandomInt(0, n - 1) end
    )
    if hasFreeSlot(hero) then
        hero:AddItemByName(name)
    else
        local it = CreateItem(
            name,
            hero:GetPlayerOwner(),
            hero
        )
        if it ~= nil then
            CreateItemOnPositionSync(
                hero:GetAbsOrigin(),
                it
            )
        end
    end
    ____exports.chestsTaken:set(
        pid,
        (____exports.chestsTaken:get(pid) or 0) + 1
    )
    toast(
        "event",
        "#orb_toast_chest",
        hero:GetUnitName(),
        name,
        tostring(tier),
        pid
    )
    EmitSoundOn("General.Buy", hero)
    log(
        "сундук:",
        hero:GetUnitName(),
        name,
        "уровень",
        tier
    )
end
local CHEST = "item_treasure_chest"
local CHEST_UNIT = "npc_orb_chest"
local WARN_SECONDS = 10
RING_PARTICLE = "particles/ui_mouseactions/range_display.vpcf"
MARK_PARTICLE = "particles/econ/wards/f2p/f2p_ward/f2p_ward_true_sight_ambient.vpcf"
nextAt = TIMINGS.courierFirst
announced = false
local targetFx = {}
local recent = {}
chests = {}
local chestCounter = 0
local lastTick = -1
lastSig = ""
--- Лежащий сундук (для ботов): точка или undefined. Не «export let»: в Lua импорт копирует значение.
function ____exports.chestOnGroundNow()
    for ____, c in ipairs(chests) do
        if c.landed then
            return c.pos
        end
    end
    return nil
end
--- Сколько сундуков взял каждый игрок (для итогов).
____exports.chestsTaken = __TS__New(Map)
local function pickSpot()
    local spots = MAP.itemSpawns
    local free = {}
    do
        local i = 0
        while i < #spots do
            if not __TS__ArrayIncludes(recent, i) then
                free[#free + 1] = i
            end
            i = i + 1
        end
    end
    local i = free[RandomInt(0, #free - 1) + 1]
    recent[#recent + 1] = i
    while #recent > 2 do
        table.remove(recent, 1)
    end
    local s = spots[i + 1]
    return GetGroundPosition(
        Vector(s.x, s.y, 0),
        nil
    )
end
local function freeFx(fx)
    if fx == nil then
        return
    end
    ParticleManager:DestroyParticle(fx, false)
    ParticleManager:ReleaseParticleIndex(fx)
end
local function announce()
    announced = true
    target = pickSpot()
    local t = target
    targetFx = {
        ringAt(t, CONFIG.chestCaptureRadius),
        markAt(t)
    }
    for ____, p in ipairs(activePlayers()) do
        AddFOWViewer(
            p.team,
            t,
            450,
            WARN_SECONDS + 8,
            false
        )
        local h = PlayerResource:GetSelectedHeroEntity(p.id)
        if isValid(h) then
            MinimapEvent(
                p.team,
                h,
                t.x,
                t.y,
                DOTA_MINIMAP_EVENT_HINT_LOCATION,
                4
            )
        end
    end
    toast("event", "#orb_toast_courier_incoming")
    EmitGlobalSound("powerup_03")
    local len = math.max(
        1,
        math.sqrt(t.x * t.x + t.y * t.y)
    )
    local start = Vector(t.x / len * (MAP.bounds - 300), t.y / len * (MAP.bounds - 300), t.z + 200)
    local unit = CreateUnitByName(
        "npc_orb_treasure_courier",
        start,
        false,
        nil,
        nil,
        DOTA_TEAM_NEUTRALS
    )
    if isValid(unit) then
        courier = unit
        unit:AddNewModifier(unit, nil, "modifier_orb_sphere_unit", {})
        local dist = (t - start):Length2D()
        unit:SetBaseMoveSpeed(math.min(
            550,
            math.max(200, dist / (WARN_SECONDS - 0.5))
        ))
        unit:MoveToPosition(t)
    end
end
local function dropChest()
    local t = target or pickSpot()
    announced = false
    target = nil
    for ____, fx in ipairs(targetFx) do
        freeFx(fx)
    end
    targetFx = {}
    local from = isValid(courier) and courier:GetAbsOrigin() or Vector(t.x, t.y, t.z + 300)
    chestCounter = chestCounter + 1
    local chest = {id = chestCounter, pos = t, landed = false, cap = {holder = -1, progress = 0, contested = false}}
    local unit = CreateUnitByName(
        CHEST_UNIT,
        from,
        false,
        nil,
        nil,
        DOTA_TEAM_NEUTRALS
    )
    if isValid(unit) then
        chest.unit = unit
        unit:AddNewModifier(unit, nil, "modifier_orb_sphere_unit", {})
    end
    chests[#chests + 1] = chest
    local t0 = GameRules:GetGameTime()
    local fall
    fall = Timers:every(
        0.03,
        "падение сундука",
        function()
            local k = math.min(
                1,
                (GameRules:GetGameTime() - t0) / 0.6
            )
            if chest.unit ~= nil and isValid(chest.unit) then
                local x = from.x + (t.x - from.x) * k
                local y = from.y + (t.y - from.y) * k
                local z = from.z + (t.z - from.z) * k + math.sin(k * math.pi) * 150
                chest.unit:SetAbsOrigin(Vector(x, y, z))
            end
            if k >= 1 then
                Timers:cancel(fall)
                land(chest)
            end
        end
    )
    StartSoundEventFromPosition("Item.DropGemWorld", t)
    local c = courier
    courier = nil
    if isValid(c) then
        c:MoveToPosition(Vector(-t.x * 2, -t.y * 2, t.z))
        Timers:after(
            5,
            "курьер улетел",
            function()
                if isValid(c) then
                    UTIL_Remove(c)
                end
            end
        )
    end
    log(
        "сундук упал:",
        math.floor(t.x),
        math.floor(t.y)
    )
end
local function removeChest(chest)
    freeFx(chest.ring)
    freeFx(chest.mark)
    if chest.unit ~= nil and isValid(chest.unit) then
        UTIL_Remove(chest.unit)
    end
    local i = __TS__ArrayIndexOf(chests, chest)
    if i >= 0 then
        __TS__ArraySplice(chests, i, 1)
    end
end
--- Кто из настоящих героев стоит в круге сундука.
local function heroesInside(chest)
    local units = FindUnitsInRadius(
        DOTA_TEAM_NEUTRALS,
        chest.pos,
        nil,
        CONFIG.chestCaptureRadius,
        DOTA_UNIT_TARGET_TEAM_BOTH,
        DOTA_UNIT_TARGET_HERO,
        bit.bor(
            bit.bor(DOTA_UNIT_TARGET_FLAG_INVULNERABLE, DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES),
            DOTA_UNIT_TARGET_FLAG_NOT_ILLUSIONS
        ),
        FIND_ANY_ORDER,
        false
    )
    local ids = {}
    for ____, unit in ipairs(units) do
        do
            local u = unit
            local real = u:IsRealHero()
            if not real or not u:IsAlive() or u:IsInvulnerable() or u:IsTempestDouble() or u:IsClone() then
                goto __continue37
            end
            local pid = u:GetPlayerOwnerID()
            local p = State.players:get(pid)
            if p == nil or p.left or __TS__ArrayIncludes(ids, pid) then
                goto __continue37
            end
            ids[#ids + 1] = pid
        end
        ::__continue37::
    end
    return ids
end
--- Каждые 0.1 с (вызов из таймера курьера и сфер).
function ____exports.courierTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    local now = gameNow()
    local dt = lastTick < 0 and 0 or math.max(
        0,
        math.min(0.5, now - lastTick)
    )
    lastTick = now
    if not announced and now >= nextAt - WARN_SECONDS then
        announce()
    end
    if announced and now >= nextAt then
        nextAt = nextAt + TIMINGS.courierEvery
        while nextAt <= now do
            nextAt = nextAt + TIMINGS.courierEvery
        end
        dropChest()
    end
    local teams = __TS__ArrayMap(
        activePlayers(),
        function(____, p) return p.team end
    )
    local function reveal(u)
        if u == nil or not isValid(u) then
            return
        end
        for ____, team in ipairs(teams) do
            u:MakeVisibleToTeam(team, 0.5)
        end
    end
    reveal(courier)
    for ____, chest in ipairs(chests) do
        reveal(chest.unit)
    end
    for ____, chest in ipairs(__TS__ArraySlice(chests)) do
        do
            if not chest.landed then
                goto __continue53
            end
            local inside = heroesInside(chest)
            local k = #inside == 1 and captureSpeed(inside[1]) or 1
            if captureStep(chest.cap, inside, dt * k, CONFIG.chestCaptureTime) then
                local h = PlayerResource:GetSelectedHeroEntity(chest.cap.holder)
                removeChest(chest)
                if isValid(h) then
                    giveChestItem(h)
                end
            end
        end
        ::__continue53::
    end
    pushChestNet(now)
end
--- Старый предмет-сундук больше не выпадает; если его как-то подобрали — просто убираем.
function ____exports.onChestPicked(hero, item)
    if isValid(item) then
        hero:RemoveItem(item)
        if isValid(item) then
            UTIL_Remove(item)
        end
    end
    return true
end
____exports.CHEST_ITEM = CHEST
function ____exports.courierCheat()
    nextAt = gameNow() + WARN_SECONDS
    announced = false
end
return ____exports
