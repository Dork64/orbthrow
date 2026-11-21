local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local ____exports = {}
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____itemsnet = require("game.itemsnet")
local addItemsNetPart = ____itemsnet.addItemsNetPart
local markItemsDirty = ____itemsnet.markItemsDirty
local pushItemsNet = ____itemsnet.pushItemsNet
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local toast = ____state.toast
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local safe = ____util.safe
local TRAVEL_MOD = "modifier_orb_travel"
local TRAVEL_ITEMS = {"item_travel_boots", "item_travel_boots_2"}
--- Предмет магазина → слот.
local SHOP_ITEMS = {item_ward_observer = "ob", item_ward_sentry = "se", item_smoke_of_deceit = "sm", item_dust = "du"}
local slots = __TS__New(Map)
local function slotsOf(pid)
    local s = slots:get(pid)
    if s == nil then
        s = {
            ob = CONFIG.startObservers,
            se = CONFIG.startSentries,
            sm = CONFIG.startSmokes,
            du = CONFIG.startDusts,
            tb = 0
        }
        slots:set(pid, s)
        markItemsDirty(pid)
    end
    return s
end
local function heroHasTravel(h)
    do
        local slot = 0
        while slot <= 8 do
            local it = h:GetItemInSlot(slot)
            if it ~= nil and IsValidEntity(it) and __TS__ArrayIncludes(
                TRAVEL_ITEMS,
                it:GetAbilityName()
            ) then
                return it
            end
            slot = slot + 1
        end
    end
    return nil
end
local function netPart(pid)
    local s = slotsOf(pid)
    local h = PlayerResource:GetSelectedHeroEntity(pid)
    local canEat = isValid(h) and s.tb < CONFIG.travelEatMax and heroHasTravel(h) ~= nil and 1 or 0
    return {
        ob = s.ob,
        se = s.se,
        sm = s.sm,
        du = s.du,
        tb = s.tb,
        te = canEat,
        tm = CONFIG.travelEatMax
    }
end
local slotCooldown = __TS__New(Map)
local function slotError(pid, text)
    local player = PlayerResource:GetPlayer(pid)
    if player ~= nil then
        CustomGameEventManager:Send_ServerToPlayer(player, "orb_error", {text = text})
    end
end
function ____exports.slotWardError(hero, kind, point)
    local pid = hero:GetPlayerOwnerID()
    local player = State.players:get(pid)
    if player == nil or player.left or State.phase == "setup" or State.phase == "ended" or PlayerResource:GetSelectedHeroEntity(pid) ~= hero or not hero:IsAlive() or hero:IsMuted() or hero:IsOutOfGame() then
        return "#orb_slot_cannot_cast"
    end
    if slotsOf(pid)[kind] <= 0 then
        return "#orb_slot_empty"
    end
    if not (math.abs(point.x) <= MAP.bounds and math.abs(point.y) <= MAP.bounds) then
        return "#orb_slot_bad_point"
    end
    return nil
end
--- Вызывается после штатного point-cast. Дальность и подход к точке проверяет движок.
function ____exports.castSlotWard(hero, kind, point, ability)
    local pid = hero:GetPlayerOwnerID()
    if ____exports.slotWardError(hero, kind, point) ~= nil then
        return
    end
    local pos = GetGroundPosition(point, hero)
    local sentry = kind == "se"
    local unit = sentry and "npc_dota_sentry_wards" or "npc_dota_observer_wards"
    local ward = CreateUnitByName(
        unit,
        pos,
        true,
        hero,
        hero,
        hero:GetTeamNumber()
    )
    if not isValid(ward) then
        slotError(pid, "#orb_slot_bad_point")
        return
    end
    local range = ability:GetSpecialValueFor("ward_radius")
    ward:AddNewModifier(hero, ability, "modifier_orb_ward", {sentry = sentry and 1 or 0, radius = range})
    ward:AddNewModifier(hero, ability, "modifier_kill", {duration = sentry and 420 or 360})
    if sentry then
        AddFOWViewer(
            hero:GetTeamNumber(),
            pos,
            150,
            12,
            false
        )
    end
    EmitSoundOnLocationWithCaster(pos, sentry and "DOTA_Item.SentryWard.Activate" or "DOTA_Item.ObserverWard.Activate", hero)
    local ____slotsOf_result_0, ____kind_1 = slotsOf(pid), kind
    ____slotsOf_result_0[____kind_1] = ____slotsOf_result_0[____kind_1] - 1
    markItemsDirty(pid)
    pushItemsNet(pid)
end
local function applyConsumable(hero, kind)
    if kind == "sm" then
        local fx = ParticleManager:CreateParticle("particles/items2_fx/smoke_of_deceit.vpcf", PATTACH_WORLDORIGIN, nil)
        ParticleManager:SetParticleControl(
            fx,
            0,
            hero:GetAbsOrigin()
        )
        ParticleManager:SetParticleControl(
            fx,
            1,
            Vector(1200, 1, 1200)
        )
        ParticleManager:ReleaseParticleIndex(fx)
        EmitSoundOn("DOTA_Item.SmokeOfDeceit.Activate", hero)
        hero:AddNewModifier(hero, nil, "modifier_orb_smoke", {duration = 35})
        return
    end
    local radius = 1050
    local fx = ParticleManager:CreateParticle("particles/items_fx/dust_of_appearance.vpcf", PATTACH_ABSORIGIN_FOLLOW, hero)
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(radius, radius, radius)
    )
    ParticleManager:ReleaseParticleIndex(fx)
    EmitSoundOn("DOTA_Item.DustOfAppearance.Activate", hero)
    local enemies = FindUnitsInRadius(
        hero:GetTeamNumber(),
        hero:GetAbsOrigin(),
        nil,
        radius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_INVULNERABLE + DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES,
        FIND_ANY_ORDER,
        false
    )
    for ____, u in ipairs(enemies) do
        u:AddNewModifier(hero, nil, "modifier_orb_dust", {duration = 12})
    end
end
local function useSlot(pid, kind)
    if kind ~= "sm" and kind ~= "du" then
        return
    end
    local player = State.players:get(pid)
    if player == nil or player.left or State.phase == "setup" or State.phase == "ended" then
        return
    end
    local hero = PlayerResource:GetSelectedHeroEntity(pid)
    if not isValid(hero) or not hero:IsAlive() or hero:GetPlayerOwnerID() ~= pid or hero:IsStunned() or hero:IsMuted() or hero:IsHexed() or hero:IsOutOfGame() then
        return
    end
    local stock = slotsOf(pid)
    if stock[kind] <= 0 then
        slotError(pid, "#orb_slot_empty")
        return
    end
    local now = GameRules:GetGameTime()
    local ready = slotCooldown:get(pid) or ({})
    if (ready[kind] or 0) > now then
        return
    end
    applyConsumable(hero, kind)
    ready[kind] = now + 2
    slotCooldown:set(pid, ready)
    stock[kind] = stock[kind] - 1
    markItemsDirty(pid)
    pushItemsNet(pid)
end
--- Купленный расходник → заряды слота (на следующем кадре: внутри фильтра предмет еще не в инвентаре).
local function convertLater(item, hero, kind)
    Timers:after(
        0.03,
        "расходник в слот",
        function()
            if not isValid(item) or not isValid(hero) then
                return
            end
            local pid = hero:GetPlayerOwnerID()
            local s = slotsOf(pid)
            local n = math.max(
                1,
                item:GetCurrentCharges()
            )
            if kind == "pair" then
                s.ob = s.ob + math.max(
                    0,
                    item:GetCurrentCharges()
                )
                s.se = s.se + math.max(
                    0,
                    item:GetSecondaryCharges()
                )
            else
                s[kind] = s[kind] + n
            end
            hero:RemoveItem(item)
            if isValid(item) then
                UTIL_Remove(item)
            end
            markItemsDirty(pid)
            pushItemsNet(pid)
        end
    )
end
--- Фильтр предметов: варды, дым и пыль у героев игроков уходят в слоты.
function ____exports.slotsItemFilter(e)
    local item = EntIndexToHScript(e.item_entindex_const)
    local parent = EntIndexToHScript(e.inventory_parent_entindex_const)
    if not isValid(item) or not isValid(parent) or not parent:IsRealHero() then
        return true
    end
    local pid = parent:GetPlayerOwnerID()
    if not State.players:has(pid) then
        return true
    end
    local name = item:GetAbilityName()
    if name == "item_ward_dispenser" then
        convertLater(item, parent, "pair")
    elseif SHOP_ITEMS[name] ~= nil then
        convertLater(item, parent, SHOP_ITEMS[name])
    elseif __TS__ArrayIncludes(TRAVEL_ITEMS, name) then
        Timers:after(
            0.05,
            "тревела",
            function()
                markItemsDirty(pid)
                pushItemsNet(pid)
            end
        )
    end
    return true
end
--- Съесть Boots of Travel: предмет исчезает, герой навсегда получает скорость.
local function eatTravel(pid)
    local h = PlayerResource:GetSelectedHeroEntity(pid)
    if not isValid(h) or not h:IsAlive() then
        return
    end
    local s = slotsOf(pid)
    if s.tb >= CONFIG.travelEatMax then
        return
    end
    local it = heroHasTravel(h)
    if it == nil then
        return
    end
    h:RemoveItem(it)
    if isValid(it) then
        UTIL_Remove(it)
    end
    s.tb = s.tb + 1
    local mod = h:FindModifierByName(TRAVEL_MOD)
    if mod == nil then
        mod = h:AddNewModifier(h, nil, TRAVEL_MOD, {})
    end
    if mod ~= nil then
        mod:SetStackCount(s.tb)
    end
    EmitSoundOn("Item.MoonShard.Consume", h)
    toast(
        "event",
        "#orb_toast_travel_eaten",
        h:GetUnitName(),
        tostring(s.tb * CONFIG.travelEatSpeed),
        nil,
        pid
    )
    markItemsDirty(pid)
    pushItemsNet(pid)
    log("игрок", pid, "съел Boots of Travel:", s.tb)
end
--- Каждые 0.5 с: способности на героях, бафф съеденных тревел, таблица.
function ____exports.slotsTick()
    for ____, p in ipairs(allPlayers()) do
        local h = PlayerResource:GetSelectedHeroEntity(p.id)
        if isValid(h) then
            local s = slotsOf(p.id)
            if s.tb > 0 and not h:HasModifier(TRAVEL_MOD) then
                local mod = h:AddNewModifier(h, nil, TRAVEL_MOD, {})
                if mod ~= nil then
                    mod:SetStackCount(s.tb)
                end
            end
        end
        markItemsDirty(p.id)
        pushItemsNet(p.id)
    end
end
function ____exports.initSlots()
    addItemsNetPart(netPart)
    slots:clear()
    slotCooldown:clear()
    local ____Hooks_onHeroSpawned_2 = Hooks.onHeroSpawned
    ____Hooks_onHeroSpawned_2[#____Hooks_onHeroSpawned_2 + 1] = function(p, hero)
        if p.isBot then
            return
        end
        for ____, name in ipairs({"orb_slot_observer", "orb_slot_sentry"}) do
            local ability = hero:FindAbilityByName(name) or hero:AddAbility(name)
            if isValid(ability) and ability:GetLevel() == 0 then
                ability:SetLevel(1)
            end
        end
    end
    CustomGameEventManager:RegisterListener(
        "orb_slot_use",
        function(_, e) return safe(
            "расходник",
            function() return useSlot(e.PlayerID, e.kind) end
        ) end
    )
    CustomGameEventManager:RegisterListener(
        "orb_eat_travel",
        function(_, e) return safe(
            "съесть тревела",
            function() return eatTravel(e.PlayerID) end
        ) end
    )
end
--- Чит: по n зарядов каждого расходника.
function ____exports.slotsCheat(pid, n)
    local s = slotsOf(pid)
    s.ob = s.ob + n
    s.se = s.se + n
    s.sm = s.sm + n
    s.du = s.du + n
    markItemsDirty(pid)
    pushItemsNet(pid)
end
function ____exports.resetConsumables(pid)
    slots:delete(pid)
    slotCooldown:delete(pid)
end
return ____exports
