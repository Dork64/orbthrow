local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__Iterator = ____lualib.__TS__Iterator
local ____exports = {}
local ____config = require("core.config")
local TIMINGS = ____config.TIMINGS
local ____catchup = require("core.catchup")
local goblinHealth = ____catchup.goblinHealth
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____orbs = require("game.orbs")
local addBlue = ____orbs.addBlue
local ____coins = require("game.coins")
local expireLoot = ____coins.expireLoot
local registerSpecialGold = ____coins.registerSpecialGold
local ____state = require("game.state")
local State = ____state.State
local gameNow = ____state.gameNow
local toast = ____state.toast
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local safe = ____util.safe
local LIFETIME = 60
local BAG_EVERY = 3
local BAG_GOLD = 50
local KILL_GOLD = 400
local KILL_POINTS = 15
local ASSIST_POINTS = 5
local FLEE_RADIUS = 1000
local goblin
--- Ссылка на список ударов: модификатор при смерти снимается, а список нужен в момент убийства.
local goblinHits = {}
local spawnedAt = 0
local lastBag = 0
local nextIndex = 0
--- Кто убил Гоблинов (для итогов).
____exports.goblinKills = __TS__New(Map)
local function spawnGoblin()
    if isValid(goblin) and goblin:IsAlive() then
        return
    end
    local camp = MAP.camps[RandomInt(0, #MAP.camps - 1) + 1]
    local pos = GetGroundPosition(
        Vector(camp.x, camp.y, 0),
        nil
    )
    local g = CreateUnitByName(
        "npc_orb_goblin",
        pos,
        true,
        nil,
        nil,
        DOTA_TEAM_NEUTRALS
    )
    if not isValid(g) then
        return
    end
    local hp = goblinHealth(math.floor(gameNow() / 60))
    g:SetBaseMaxHealth(hp)
    g:SetMaxHealth(hp)
    g:SetHealth(hp)
    local gm = g:AddNewModifier(g, nil, "modifier_orb_goblin", {})
    goblinHits = gm ~= nil and gm.hits or ({})
    goblin = g
    spawnedAt = gameNow()
    lastBag = spawnedAt
    toast("event", "#orb_toast_goblin")
    EmitGlobalSound("ui.npe_objective_given")
    log(
        "Гоблин появился:",
        camp.x,
        camp.y,
        "здоровье",
        hp
    )
end
local function dropBag(g)
    local item = CreateItem("item_bag_of_gold", nil, nil)
    if item == nil then
        return
    end
    local o = g:GetAbsOrigin()
    local drop = CreateItemOnPositionForLaunch(o, item)
    item:LaunchLootInitialHeight(
        false,
        100,
        150,
        0.4,
        o + RandomVector(RandomFloat(80, 180))
    )
    registerSpecialGold(item, BAG_GOLD)
    Timers:after(
        20,
        "мешок Гоблина",
        function() return expireLoot(item, drop) end
    )
end
--- Убегать от ближайшего героя: пробуем направление «от него», потом повороты.
local function flee(g)
    local o = g:GetAbsOrigin()
    local heroes = FindUnitsInRadius(
        DOTA_TEAM_NEUTRALS,
        o,
        nil,
        FLEE_RADIUS,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES + DOTA_UNIT_TARGET_FLAG_INVULNERABLE,
        FIND_CLOSEST,
        false
    )
    if #heroes == 0 then
        return
    end
    local away = (o - heroes[1]:GetAbsOrigin()):Normalized()
    for ____, angle in ipairs({
        0,
        40,
        -40,
        80,
        -80,
        120,
        -120
    }) do
        local dir = RotatePosition(
            Vector(0, 0, 0),
            QAngle(0, angle, 0),
            away
        )
        local p = o + dir * 500
        if math.abs(p.x) < MAP.bounds - 200 and math.abs(p.y) < MAP.bounds - 200 and GridNav:IsTraversable(p) and not GridNav:IsBlocked(p) then
            g:MoveToPosition(p)
            return
        end
    end
end
local function leave(g)
    local fx = ParticleManager:CreateParticle("particles/items_fx/blink_dagger_start.vpcf", PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(
        fx,
        0,
        g:GetAbsOrigin()
    )
    ParticleManager:ReleaseParticleIndex(fx)
    UTIL_Remove(g)
    goblin = nil
    toast("event", "#orb_toast_goblin_escaped")
end
--- Каждые 0.3 с.
function ____exports.goblinTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    local now = gameNow()
    local times = TIMINGS.goblinTimes
    if nextIndex < #times and now >= times[nextIndex + 1] then
        nextIndex = nextIndex + 1
        spawnGoblin()
    end
    local g = goblin
    if not isValid(g) or not g:IsAlive() then
        return
    end
    if now - spawnedAt >= LIFETIME then
        leave(g)
        return
    end
    if now - lastBag >= BAG_EVERY then
        lastBag = now
        dropBag(g)
    end
    flee(g)
end
local function onKilled(e)
    local g = goblin
    if not isValid(g) or e.entindex_killed ~= g:entindex() then
        return
    end
    goblin = nil
    local mod = g:FindModifierByName("modifier_orb_goblin")
    local hits = mod ~= nil and mod.hits or goblinHits
    local killer = -1
    local ____temp_0
    if e.entindex_attacker ~= nil then
        ____temp_0 = EntIndexToHScript(e.entindex_attacker)
    else
        ____temp_0 = nil
    end
    local attacker = ____temp_0
    if isValid(attacker) then
        killer = attacker:GetPlayerOwnerID()
    end
    if killer < 0 and #hits > 0 then
        killer = hits[#hits].pid
    end
    local now = GameRules:GetGameTime()
    local sums = __TS__New(Map)
    for ____, h in ipairs(hits) do
        if now - h.time <= 15 then
            sums:set(
                h.pid,
                (sums:get(h.pid) or 0) + h.amount
            )
        end
    end
    local need = g:GetMaxHealth() * 0.05
    if killer >= 0 and State.players:has(killer) then
        PlayerResource:ModifyGold(killer, KILL_GOLD, true, DOTA_ModifyGold_Unspecified)
        addBlue(killer, KILL_POINTS)
        ____exports.goblinKills:set(
            killer,
            (____exports.goblinKills:get(killer) or 0) + 1
        )
        toast(
            "event",
            "#orb_toast_goblin_killed",
            PlayerResource:GetSelectedHeroName(killer),
            nil,
            nil,
            killer
        )
    end
    for ____, ____value in __TS__Iterator(sums) do
        local pid = ____value[1]
        local dmg = ____value[2]
        if pid ~= killer and dmg >= need and State.players:has(pid) then
            addBlue(pid, ASSIST_POINTS)
        end
    end
end
function ____exports.initGoblin()
    ListenToGameEvent(
        "entity_killed",
        function(e) return safe(
            "Гоблин",
            function() return onKilled(e) end
        ) end,
        nil
    )
end
function ____exports.currentGoblin()
    return isValid(goblin) and goblin:IsAlive() and goblin or nil
end
function ____exports.goblinCheat()
    spawnGoblin()
end
return ____exports
