local ____lualib = require("lualib_bundle")
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local ____exports = {}
local ____arenaevents = require("core.arenaevents")
local ARENA = ____arenaevents.ARENA
local eventAllowed = ____arenaevents.eventAllowed
local eventStart = ____arenaevents.eventStart
local pickEvent = ____arenaevents.pickEvent
local ____orbs = require("game.orbs")
local addPurple = ____orbs.addPurple
local ____coins = require("game.coins")
local throwCoin = ____coins.throwCoin
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____state = require("game.state")
local State = ____state.State
local gameNow = ____state.gameNow
local toast = ____state.toast
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local MOD = {haste = "modifier_orb_event_haste", bloodmoon = "modifier_orb_event_bloodmoon"}
local STRIKE_PFX = "particles/units/heroes/hero_zuus/zuus_lightning_bolt.vpcf"
local MARK_PFX = "particles/ui_mouseactions/range_display.vpcf"
local index = 0
local warned = -1
local current
local nextId
local prevId
local nextStrike = 0
local pushedKey = ""
local function heroes()
    local out = {}
    for ____, ____value in __TS__Iterator(State.players) do
        local id = ____value[1]
        local h = PlayerResource:GetSelectedHeroEntity(id)
        if isValid(h) then
            out[#out + 1] = h
        end
    end
    return out
end
local function pushEvent(now)
    local start = eventStart(index)
    local soon = current == nil and nextId ~= nil and now >= start - ARENA.warn
    local net = current ~= nil and ({
        id = current.id,
        on = 1,
        left = math.max(
            0,
            math.ceil(current["end"] - now)
        ),
        next = 0
    }) or ({
        id = soon and nextId or "",
        on = 0,
        left = soon and math.max(
            0,
            math.ceil(start - now)
        ) or 0,
        next = math.max(
            0,
            math.floor(start - now)
        )
    })
    local key = (((((net.id .. ":") .. tostring(net.on)) .. ":") .. tostring(net.left)) .. ":") .. tostring(net.next)
    if key == pushedKey then
        return
    end
    pushedKey = key
    CustomNetTables:SetTableValue("orb_game", "event", net)
end
local function applyModifier(h)
    if current == nil then
        return
    end
    local name = MOD[current.id]
    if name == nil or h:HasModifier(name) then
        return
    end
    h:AddNewModifier(
        h,
        nil,
        name,
        {duration = math.max(
            0.1,
            current["end"] - gameNow()
        )}
    )
end
local function begin(id, now, cheat)
    if cheat == nil then
        cheat = false
    end
    current = {id = id, start = now, ["end"] = now + ARENA.duration[id], cheat = cheat}
    prevId = id
    nextStrike = now + 1
    for ____, h in ipairs(heroes()) do
        applyModifier(h)
    end
    if id == "bloodmoon" then
        GameRules:SetTimeOfDay(0)
    end
    toast("event", "#orb_event_start_" .. id)
    EmitGlobalSound(id == "storm" and "Hero_Zuus.GodsWrath" or "General.Combine")
    log("событие арены:", id)
end
local function finish()
    if current == nil then
        return
    end
    local name = MOD[current.id]
    if name ~= nil then
        for ____, h in ipairs(heroes()) do
            h:RemoveModifierByName(name)
        end
    end
    if current.id == "bloodmoon" then
        GameRules:SetTimeOfDay(0.3)
    end
    toast("event", "#orb_event_end_" .. current.id)
    local wasCheat = current.cheat
    current = nil
    if not wasCheat then
        index = index + 1
        nextId = nil
    end
end
--- Гроза: метка под случайным героем, через 1.2 с — молния (урон и мини-оглушение всем героям рядом).
local function stormStrike()
    local list = __TS__ArrayFilter(
        heroes(),
        function(____, h) return h:IsAlive() end
    )
    if #list == 0 then
        return
    end
    local target = list[RandomInt(0, #list - 1) + 1]
    local off = RandomVector(RandomFloat(0, 150))
    local pos = target:GetAbsOrigin() + off
    local mark = ParticleManager:CreateParticle(MARK_PFX, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(mark, 0, pos)
    ParticleManager:SetParticleControl(
        mark,
        1,
        Vector(ARENA.stormRadius, 0, 0)
    )
    local boss = Entities:FindByName(nil, "@overboss")
    target:SetContextThink(
        "orb_event_storm_" .. DoUniqueString("s"),
        function()
            ParticleManager:DestroyParticle(mark, false)
            ParticleManager:ReleaseParticleIndex(mark)
            if current == nil or current.id ~= "storm" then
                return nil
            end
            local fx = ParticleManager:CreateParticle(STRIKE_PFX, PATTACH_WORLDORIGIN, nil)
            ParticleManager:SetParticleControl(
                fx,
                0,
                pos + Vector(0, 0, 1200)
            )
            ParticleManager:SetParticleControl(fx, 1, pos)
            ParticleManager:ReleaseParticleIndex(fx)
            StartSoundEventFromPosition("Hero_Zuus.LightningBolt", pos)
            for ____, h in ipairs(heroes()) do
                do
                    if not h:IsAlive() or (h:GetAbsOrigin() - pos):Length2D() > ARENA.stormRadius then
                        goto __continue27
                    end
                    local attacker = isValid(boss) and boss or h
                    ApplyDamage({
                        victim = h,
                        attacker = attacker,
                        damage = ARENA.stormDmgBase + h:GetMaxHealth() * ARENA.stormDmgMaxHpPct / 100,
                        damage_type = DAMAGE_TYPE_MAGICAL
                    })
                    h:AddNewModifier(attacker, nil, "modifier_stunned", {duration = ARENA.stormStun})
                end
                ::__continue27::
            end
            return nil
        end,
        ARENA.stormDelay
    )
end
function ____exports.arenaEventsTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        if current ~= nil then
            finish()
        end
        return
    end
    local now = gameNow()
    if current ~= nil then
        if now >= current["end"] then
            finish()
        elseif current.id == "goldrain" then
            if RandomFloat(0, 1) < ARENA.rainCoinChance then
                throwCoin()
            end
        elseif current.id == "storm" and now >= nextStrike then
            nextStrike = now + ARENA.stormEvery
            stormStrike()
        end
    else
        local start = eventStart(index)
        if not eventAllowed(start, State.timeLimit, State.phase == "overtime") then
            pushEvent(now)
            return
        end
        if nextId == nil then
            nextId = pickEvent(
                prevId,
                function(n) return RandomInt(0, n - 1) end
            )
        end
        if now >= start - ARENA.warn and warned ~= index then
            warned = index
            toast(
                "event",
                "#orb_event_soon_" .. nextId,
                tostring(ARENA.warn)
            )
        end
        if now >= start then
            begin(nextId, now)
        end
    end
    pushEvent(now)
end
--- Чит -event <имя>: начать событие сейчас.
function ____exports.arenaEventCheat(id)
    local all = {"bloodmoon", "goldrain", "storm", "haste"}
    local ev = __TS__ArrayFind(
        all,
        function(____, e) return e == id end
    ) or pickEvent(
        prevId,
        function(n) return RandomInt(0, n - 1) end
    )
    if current ~= nil then
        finish()
    end
    begin(
        ev,
        gameNow(),
        true
    )
end
function ____exports.initArenaEvents()
    local ____Hooks_onHeroSpawned_0 = Hooks.onHeroSpawned
    ____Hooks_onHeroSpawned_0[#____Hooks_onHeroSpawned_0 + 1] = function(_p, hero) return applyModifier(hero) end
    local ____Hooks_onHeroKill_1 = Hooks.onHeroKill
    ____Hooks_onHeroKill_1[#____Hooks_onHeroKill_1 + 1] = function(k)
        if current == nil or current.id ~= "bloodmoon" then
            return
        end
        addPurple(k.killer.id, ARENA.moonKillPurple * (k.victimWasLeader and 2 or 1))
        local minute = math.max(
            0,
            gameNow() / 60
        )
        local gold = math.floor(ARENA.moonKillGoldBase + ARENA.moonKillGoldPerMin * minute)
        PlayerResource:ModifyGold(k.killer.id, gold, true, DOTA_ModifyGold_Unspecified)
    end
end
return ____exports
