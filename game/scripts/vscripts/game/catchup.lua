local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local ____exports = {}
local ____config = require("core.config")
local TIMINGS = ____config.TIMINGS
local ____catchup = require("core.catchup")
local helpGold = ____catchup.helpGold
local huntStep = ____catchup.huntStep
local lastTwo = ____catchup.lastTwo
local revengeMultiplier = ____catchup.revengeMultiplier
local revengeOnKill = ____catchup.revengeOnKill
local ____rules = require("core.rules")
local leaderGap = ____rules.leaderGap
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____orbs = require("game.orbs")
local addPurpleRage = ____orbs.addPurpleRage
local enqueue = ____orbs.enqueue
local ____state = require("game.state")
local State = ____state.State
local activePlayers = ____state.activePlayers
local currentLeaderId = ____state.currentLeaderId
local gameNow = ____state.gameNow
local scoreRows = ____state.scoreRows
local toast = ____state.toast
local ____util = require("game.util")
local isValid = ____util.isValid
local safe = ____util.safe
--- rev[a][b] — сколько раз b убил a (месть a против b), до 3.
local rev = __TS__New(Map)
--- Из фильтра урона: множитель мести между игроками.
function ____exports.revengeDamage(e)
    if e.entindex_attacker_const == nil or e.entindex_victim_const == nil then
        return
    end
    local victim = EntIndexToHScript(e.entindex_victim_const)
    local attacker = EntIndexToHScript(e.entindex_attacker_const)
    if not isValid(victim) or not isValid(attacker) or not victim:IsHero() then
        return
    end
    local a = attacker:GetPlayerOwnerID()
    local v = victim:GetPlayerOwnerID()
    if a < 0 or v < 0 or a == v then
        return
    end
    local m = revengeMultiplier(rev, a, v)
    if m ~= 1 then
        e.damage = e.damage * m
    end
end
local function pushRevenge()
    local t = {}
    for ____, ____value in __TS__Iterator(rev) do
        local a = ____value[1]
        local m = ____value[2]
        local row = {}
        for ____, ____value in __TS__Iterator(m) do
            local b = ____value[1]
            local n = ____value[2]
            if n > 0 then
                row[tostring(b)] = n
            end
        end
        t[tostring(a)] = row
    end
    CustomNetTables:SetTableValue("orb_game", "revenge", t)
end
local hunted = -1
local huntForced = false
local lastReveal = 0
function ____exports.huntedId()
    return hunted
end
local function huntTick()
    local rows = __TS__ArrayFilter(
        scoreRows(),
        function(____, r) return not r.left end
    )
    local leader = currentLeaderId()
    local lp = State.players:get(leader)
    if lp ~= nil and not lp.isBot and PlayerResource:GetConnectionState(lp.id) ~= DOTA_CONNECTION_STATE_CONNECTED then
        leader = -1
    end
    local gap = leaderGap(rows)
    local next = huntForced and hunted or huntStep(hunted, leader, gap)
    if next ~= hunted then
        if next >= 0 then
            toast(
                "event",
                "#orb_toast_hunt_start",
                PlayerResource:GetSelectedHeroName(next),
                nil,
                nil,
                next
            )
        elseif hunted >= 0 then
            toast(
                "info",
                "#orb_toast_hunt_end",
                PlayerResource:GetSelectedHeroName(hunted)
            )
        end
        hunted = next
        lastReveal = 0
    end
    if hunted < 0 then
        return
    end
    local p = State.players:get(hunted)
    local offline = p ~= nil and not p.isBot and PlayerResource:GetConnectionState(p.id) ~= DOTA_CONNECTION_STATE_CONNECTED
    if p == nil or p.left or offline then
        if p ~= nil then
            toast(
                "info",
                "#orb_toast_hunt_end",
                PlayerResource:GetSelectedHeroName(p.id)
            )
        end
        hunted = -1
        huntForced = false
        return
    end
    local now = gameNow()
    if now - lastReveal >= 10 then
        lastReveal = now
        local h = PlayerResource:GetSelectedHeroEntity(p.id)
        if isValid(h) and h:IsAlive() then
            local o = h:GetAbsOrigin()
            for ____, other in ipairs(activePlayers()) do
                do
                    if other.id == p.id then
                        goto __continue25
                    end
                    AddFOWViewer(
                        other.team,
                        o,
                        400,
                        3,
                        false
                    )
                    MinimapEvent(
                        other.team,
                        h,
                        o.x,
                        o.y,
                        DOTA_MINIMAP_EVENT_ENEMY_TELEPORTING,
                        3
                    )
                end
                ::__continue25::
            end
        end
    end
end
local help = __TS__New(Map)
local helpIndex = 0
local HELP_TIMEOUT = 30
local function pushHelp()
    local t = {}
    for ____, ____value in __TS__Iterator(help) do
        local pid = ____value[1]
        local o = ____value[2]
        t[tostring(pid)] = {
            d = math.floor(o.deadline),
            g = helpGold(o.minute)
        }
    end
    CustomNetTables:SetTableValue("orb_game", "help", t)
end
local function openHelp()
    local rows = __TS__ArrayFilter(
        scoreRows(),
        function(____, r) return not r.left end
    )
    local minute = math.floor(gameNow() / 60)
    for ____, pid in ipairs(lastTwo(rows)) do
        help:set(
            pid,
            {
                deadline = gameNow() + HELP_TIMEOUT,
                minute = minute
            }
        )
        local player = PlayerResource:GetPlayer(pid)
        if player ~= nil then
            CustomGameEventManager:Send_ServerToPlayer(player, "orb_toast", {kind = "event", text = "#orb_toast_help_you"})
        end
    end
    pushHelp()
end
function ____exports.chooseHelp(pid, choice)
    local o = help:get(pid)
    if o == nil then
        return
    end
    help:delete(pid)
    local hero = PlayerResource:GetSelectedHeroEntity(pid)
    if choice == "orb" then
        enqueue(pid, "blue", 1)
    elseif choice == "rage" then
        addPurpleRage(pid)
    else
        local gold = helpGold(o.minute)
        PlayerResource:ModifyGold(pid, gold, true, DOTA_ModifyGold_Unspecified)
        if isValid(hero) then
            SendOverheadEventMessage(
                nil,
                OVERHEAD_ALERT_GOLD,
                hero,
                gold,
                nil
            )
        end
    end
    pushHelp()
end
local function helpTick()
    local times = TIMINGS.lagBonusTimes
    if helpIndex < #times and gameNow() >= times[helpIndex + 1] then
        helpIndex = helpIndex + 1
        openHelp()
    end
    for ____, ____value in __TS__Iterator(help) do
        local pid = ____value[1]
        local o = ____value[2]
        local p = State.players:get(pid)
        if gameNow() >= o.deadline or p ~= nil and (p.left or p.isBot) then
            ____exports.chooseHelp(pid, "gold")
        end
    end
end
--- Каждые 0.5 с.
function ____exports.catchupTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    safe("охота", huntTick)
    safe("подмога", helpTick)
end
function ____exports.initCatchup()
    Hooks.isHunted = function(id) return id == hunted end
    local ____Hooks_onHeroKill_0 = Hooks.onHeroKill
    ____Hooks_onHeroKill_0[#____Hooks_onHeroKill_0 + 1] = function(k)
        revengeOnKill(rev, k.killer.id, k.victim.id)
        pushRevenge()
    end
    CustomGameEventManager:RegisterListener(
        "orb_help",
        function(_, e)
            safe(
                "подмога",
                function() return ____exports.chooseHelp(
                    e.PlayerID,
                    tostring(e.choice)
                ) end
            )
        end
    )
    pushRevenge()
    pushHelp()
end
function ____exports.helpCheat(pid)
    help:set(
        pid,
        {
            deadline = gameNow() + HELP_TIMEOUT,
            minute = math.floor(gameNow() / 60)
        }
    )
    pushHelp()
end
function ____exports.huntCheat(pid)
    huntForced = hunted ~= pid
    hunted = huntForced and pid or -1
    lastReveal = 0
end
return ____exports
