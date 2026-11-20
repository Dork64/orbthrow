local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local ____exports = {}
local ____economy = require("game.economy")
local grantArenaExperience = ____economy.grantArenaExperience
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____rules = require("core.rules")
local assistGoldEach = ____rules.assistGoldEach
local assistersOf = ____rules.assistersOf
local killGold = ____rules.killGold
local killXpEach = ____rules.killXpEach
local lastDamager = ____rules.lastDamager
local pruneDamage = ____rules.pruneDamage
local respawnTime = ____rules.respawnTime
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____state = require("game.state")
local State = ____state.State
local activePlayers = ____state.activePlayers
local currentLeaderId = ____state.currentLeaderId
local networthOf = ____state.networthOf
local placesNow = ____state.placesNow
local pushNet = ____state.pushNet
local toast = ____state.toast
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local safe = ____util.safe
--- Фильтр урона: записываем, кто кому наносил урон (для помощи и добиваний нейтралами).
function ____exports.recordDamage(e)
    if e.entindex_attacker_const == nil or e.entindex_victim_const == nil then
        return
    end
    local victim = EntIndexToHScript(e.entindex_victim_const)
    local attacker = EntIndexToHScript(e.entindex_attacker_const)
    if not isValid(victim) or not isValid(attacker) then
        return
    end
    if not victim:IsRealHero() then
        return
    end
    local vp = State.players:get(victim:GetPlayerOwnerID())
    if vp == nil then
        return
    end
    local aid = attacker:GetPlayerOwnerID()
    if aid < 0 or aid == vp.id or not State.players:has(aid) then
        return
    end
    local now = GameRules:GetGameTime()
    local ____vp_damageTaken_0 = vp.damageTaken
    ____vp_damageTaken_0[#____vp_damageTaken_0 + 1] = {attacker = aid, time = now, amount = e.damage}
    vp.fightAt = now
    local ap = State.players:get(aid)
    if ap ~= nil then
        ap.fightAt = now
    end
    if #vp.damageTaken > 64 then
        vp.damageTaken = pruneDamage(vp.damageTaken, now)
    end
end
local function heroName(id)
    return PlayerResource:GetSelectedHeroName(id)
end
function ____exports.onEntityKilled(e)
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    local victim = EntIndexToHScript(e.entindex_killed)
    if not isValid(victim) or not victim:IsRealHero() then
        return
    end
    if victim:IsReincarnating() then
        return
    end
    local asNpc = victim
    local isCopy = asNpc:IsTempestDouble() or asNpc:IsClone()
    if isCopy then
        return
    end
    local vp = State.players:get(victim:GetPlayerOwnerID())
    if vp == nil then
        return
    end
    local now = GameRules:GetGameTime()
    local victimStreak = vp.streak
    local victimKillsBefore = vp.kills
    local victimWasHunted = Hooks.isHunted(vp.id)
    local victimWasLeader = currentLeaderId() == vp.id
    vp.deaths = vp.deaths + 1
    vp.streak = 0
    local killerId
    local ____temp_1
    if e.entindex_attacker ~= nil then
        ____temp_1 = EntIndexToHScript(e.entindex_attacker)
    else
        ____temp_1 = nil
    end
    local attacker = ____temp_1
    if isValid(attacker) then
        local aid = attacker:GetPlayerOwnerID()
        if aid >= 0 and aid ~= vp.id and State.players:has(aid) then
            killerId = aid
        end
    end
    if killerId == nil then
        killerId = lastDamager(vp.damageTaken, now, vp.id)
    end
    local function finishRespawn()
        Timers:after(
            0.1,
            "время возрождения",
            function()
                if not isValid(victim) or victim:IsAlive() then
                    return
                end
                local places = placesNow()
                local n = #activePlayers()
                local t = respawnTime(
                    places:get(vp.id) or n,
                    n
                )
                victim:SetTimeUntilRespawn(t)
            end
        )
    end
    for ____, f in ipairs(Hooks.onHeroDeath) do
        safe(
            "смерть героя",
            function() return f(vp) end
        )
    end
    local ____temp_2
    if killerId == nil then
        ____temp_2 = nil
    else
        ____temp_2 = State.players:get(killerId)
    end
    local kp = ____temp_2
    if kp == nil or kp.team == vp.team then
        vp.damageTaken = {}
        finishRespawn()
        toast(
            "death",
            "#orb_toast_death",
            heroName(vp.id),
            nil,
            nil,
            vp.id
        )
        pushNet()
        return
    end
    local assisterIds = assistersOf(
        vp.damageTaken,
        now,
        vp.id,
        kp.id,
        victim:GetMaxHealth()
    )
    local assisters = __TS__ArrayFilter(
        __TS__ArrayMap(
            assisterIds,
            function(____, id) return State.players:get(id) end
        ),
        function(____, p) return p ~= nil and not p.left end
    )
    local killerKillsBefore = kp.kills
    kp.kills = kp.kills + 1
    kp.streak = kp.streak + 1
    for ____, a in ipairs(assisters) do
        a.assists = a.assists + 1
    end
    local gold = killGold({
        victimLevel = victim:GetLevel(),
        victimNetworth = networthOf(vp.id),
        killerNetworth = networthOf(kp.id),
        victimStreak = victimStreak,
        victimHunted = victimWasHunted
    })
    PlayerResource:ModifyGold(kp.id, gold, true, DOTA_ModifyGold_Unspecified)
    local ag = assistGoldEach(gold, #assisters)
    for ____, a in ipairs(assisters) do
        if ag > 0 then
            PlayerResource:ModifyGold(a.id, ag, true, DOTA_ModifyGold_Unspecified)
        end
    end
    local xp = killXpEach(
        victim:GetCurrentXP(),
        #assisters
    )
    for ____, p in ipairs({
        kp,
        unpack(assisters)
    }) do
        local h = PlayerResource:GetSelectedHeroEntity(p.id)
        if isValid(h) then
            grantArenaExperience(h, xp)
        end
    end
    local killerHero = PlayerResource:GetSelectedHeroEntity(kp.id)
    if isValid(killerHero) then
        SendOverheadEventMessage(
            nil,
            OVERHEAD_ALERT_GOLD,
            killerHero,
            gold,
            nil
        )
    end
    vp.damageTaken = {}
    finishRespawn()
    log(
        "убийство:",
        heroName(kp.id),
        "→",
        heroName(vp.id),
        "золото",
        gold,
        "опыт",
        xp,
        "помощь",
        #assisters
    )
    for ____, f in ipairs(Hooks.onHeroKill) do
        safe(
            "награда за убийство",
            function() return f({
                killer = kp,
                victim = vp,
                assisters = assisters,
                victimKillsBefore = victimKillsBefore,
                killerKillsBefore = killerKillsBefore,
                victimWasHunted = victimWasHunted,
                victimWasLeader = victimWasLeader
            }) end
        )
    end
    toast(
        "kill",
        "#orb_toast_kill",
        heroName(kp.id),
        heroName(vp.id),
        tostring(gold),
        kp.id
    )
    pushNet()
end
____exports.CONFIG = CONFIG
return ____exports
