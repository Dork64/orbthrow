local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local ____exports = {}
local humanIds, humanCount, autoGoal, killVotes, minuteVotes, voteResult, applyVotes, pushSettings, autoTimer, lastLeft, votes
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____rules = require("core.rules")
local killGoal = ____rules.killGoal
local ____vote = require("core.vote")
local DEFAULT_MINUTES = ____vote.DEFAULT_MINUTES
local KILL_OPTIONS = ____vote.KILL_OPTIONS
local MINUTE_OPTIONS = ____vote.MINUTE_OPTIONS
local tally = ____vote.tally
local voteCounts = ____vote.voteCounts
local ____state = require("game.state")
local State = ____state.State
local pushNet = ____state.pushNet
local ____teams = require("game.teams")
local assignTeams = ____teams.assignTeams
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____util = require("game.util")
local log = ____util.log
local safe = ____util.safe
function humanIds()
    local ids = {}
    do
        local i = 0
        while i < 24 do
            local id = i
            if PlayerResource:IsValidPlayerID(id) and not PlayerResource:IsFakeClient(id) then
                ids[#ids + 1] = id
            end
            i = i + 1
        end
    end
    return ids
end
function humanCount()
    return #humanIds()
end
function autoGoal()
    return killGoal(math.min(
        10,
        humanCount() + State.botsWanted
    ))
end
function killVotes()
    local out = {}
    for ____, ____value in __TS__Iterator(votes) do
        local v = ____value[2]
        if v.k > 0 then
            out[#out + 1] = v.k
        end
    end
    return out
end
function minuteVotes()
    local out = {}
    for ____, ____value in __TS__Iterator(votes) do
        local v = ____value[2]
        if v.m > 0 then
            out[#out + 1] = v.m
        end
    end
    return out
end
function voteResult()
    local kv = killVotes()
    return {
        goal = #kv > 0 and tally(
            kv,
            KILL_OPTIONS,
            autoGoal()
        ) or 0,
        minutes = tally(
            minuteVotes(),
            MINUTE_OPTIONS,
            DEFAULT_MINUTES
        )
    }
end
function applyVotes()
    local r = voteResult()
    State.voteGoal = r.goal
    State.timeLimit = r.minutes * 60
end
function pushSettings(left)
    lastLeft = left
    applyVotes()
    local r = voteResult()
    local my = {}
    for ____, ____value in __TS__Iterator(votes) do
        local id = ____value[1]
        local v = ____value[2]
        my[tostring(id)] = {k = v.k, m = v.m}
    end
    local ko = {}
    __TS__ArrayForEach(
        KILL_OPTIONS,
        function(____, o, i)
            ko[tostring(i + 1)] = o
        end
    )
    local mo = {}
    __TS__ArrayForEach(
        MINUTE_OPTIONS,
        function(____, o, i)
            mo[tostring(i + 1)] = o
        end
    )
    CustomNetTables:SetTableValue(
        "orb_game",
        "settings",
        {
            bots = State.botsWanted,
            humans = humanCount(),
            goal = r.goal > 0 and r.goal or autoGoal(),
            minutes = r.minutes,
            left = left,
            done = State.setupDone and 1 or 0,
            ko = ko,
            mo = mo,
            kv = voteCounts(
                killVotes(),
                KILL_OPTIONS
            ),
            mv = voteCounts(
                minuteVotes(),
                MINUTE_OPTIONS
            ),
            my = my,
            auto = autoGoal()
        }
    )
end
function ____exports.finishSetup()
    if State.setupDone then
        return
    end
    State.setupDone = true
    if autoTimer >= 0 then
        Timers:cancel(autoTimer)
    end
    applyVotes()
    assignTeams(State.botsWanted)
    pushSettings(0)
    pushNet()
    log(
        "настройки: ботов",
        State.botsWanted,
        "лимит",
        State.goal,
        "время",
        State.timeLimit,
        "голосов",
        votes.size
    )
    GameRules:FinishCustomGameSetup()
end
local AUTO_START = CONFIG.lobbyAutoStart
--- Когда проголосовали все — до старта не больше стольких секунд.
local ALL_VOTED_LEFT = 5
autoTimer = -1
local startAt = 0
lastLeft = AUTO_START
votes = __TS__New(Map)
local function allVoted()
    local ids = humanIds()
    if #ids == 0 then
        return false
    end
    for ____, id in ipairs(ids) do
        local v = votes:get(id)
        if v == nil or v.k <= 0 or v.m <= 0 then
            return false
        end
    end
    return true
end
function ____exports.beginSetup()
    State.botsWanted = IsInToolsMode() and CONFIG.toolsDefaultBots or math.max(
        0,
        4 - humanCount()
    )
    applyVotes()
    if IsInToolsMode() then
        ____exports.finishSetup()
        return
    end
    assignTeams(State.botsWanted)
    startAt = GameRules:GetGameTime() + AUTO_START
    pushSettings(AUTO_START)
    autoTimer = Timers:every(
        1,
        "лобби",
        function()
            if State.setupDone then
                return
            end
            local left = math.max(
                0,
                math.ceil(startAt - GameRules:GetGameTime())
            )
            pushSettings(left)
            if left <= 0 then
                ____exports.finishSetup()
            end
        end
    )
end
local function isHost(pid)
    local player = PlayerResource:GetPlayer(pid)
    if player == nil then
        return false
    end
    return GameRules:PlayerHasCustomGameHostPrivileges(player)
end
function ____exports.initLobby()
    CustomGameEventManager:RegisterListener(
        "orb_settings",
        function(_, e) return safe(
            "настройки лобби",
            function()
                if State.setupDone or not isHost(e.PlayerID) then
                    return
                end
                if e.bots ~= nil then
                    State.botsWanted = math.max(
                        0,
                        math.min(
                            10 - humanCount(),
                            tonumber(e.bots) or 0
                        )
                    )
                end
                assignTeams(State.botsWanted)
                pushSettings(lastLeft)
            end
        ) end
    )
    CustomGameEventManager:RegisterListener(
        "orb_vote",
        function(_, e) return safe(
            "голосование",
            function()
                if State.setupDone then
                    return
                end
                local v = votes:get(e.PlayerID) or ({k = 0, m = 0})
                local k = tonumber(e.kills)
                local m = tonumber(e.minutes)
                if k ~= nil and __TS__ArrayIncludes(KILL_OPTIONS, k) then
                    v.k = k
                end
                if m ~= nil and __TS__ArrayIncludes(MINUTE_OPTIONS, m) then
                    v.m = m
                end
                votes:set(e.PlayerID, v)
                if allVoted() then
                    startAt = math.min(
                        startAt,
                        GameRules:GetGameTime() + ALL_VOTED_LEFT
                    )
                end
                pushSettings(math.max(
                    0,
                    math.ceil(startAt - GameRules:GetGameTime())
                ))
            end
        ) end
    )
    CustomGameEventManager:RegisterListener(
        "orb_start",
        function(_, e) return safe(
            "старт",
            function()
                if not isHost(e.PlayerID) then
                    return
                end
                ____exports.finishSetup()
            end
        ) end
    )
end
return ____exports
