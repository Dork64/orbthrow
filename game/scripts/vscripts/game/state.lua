local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArraySort = ____lualib.__TS__ArraySort
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local ____exports = {}
local huntedNow
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____rules = require("core.rules")
local averagePlaces = ____rules.averagePlaces
local finalPlaces = ____rules.finalPlaces
local uniqueLeader = ____rules.uniqueLeader
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
function ____exports.allPlayers()
    local list = {}
    for ____, ____value in __TS__Iterator(____exports.State.players) do
        local p = ____value[2]
        list[#list + 1] = p
    end
    __TS__ArraySort(
        list,
        function(____, a, b) return a.id - b.id end
    )
    return list
end
function huntedNow()
    for ____, p in ipairs(____exports.allPlayers()) do
        if Hooks.isHunted(p.id) then
            return p.id
        end
    end
    return -1
end
____exports.State = {
    phase = "setup",
    players = __TS__New(Map),
    teamToPlayer = __TS__New(Map),
    reservedBotTeams = {},
    goal = 28,
    plannedPlayers = 0,
    voteGoal = 0,
    timeLimit = CONFIG.timeLimit,
    botsWanted = 0,
    setupDone = false,
    timeOffset = 0,
    winner = -1,
    started = false
}
--- Время партии в секундах (0 — горн), с учетом читерского сдвига. На паузе стоит.
function ____exports.gameNow()
    return GameRules:GetDOTATime(false, false) + ____exports.State.timeOffset
end
function ____exports.newPlayer(id, team, baseIndex, isBot)
    local p = {
        id = id,
        team = team,
        baseIndex = baseIndex,
        isBot = isBot,
        kills = 0,
        deaths = 0,
        assists = 0,
        streak = 0,
        left = false,
        disconnectedFor = 0,
        goldFrac = 0,
        xpFrac = 0,
        damageTaken = {},
        inRing = false,
        huntKillsOfLeader = 0,
        fightAt = -100
    }
    ____exports.State.players:set(id, p)
    ____exports.State.teamToPlayer:set(team, id)
    return p
end
function ____exports.playerByTeam(team)
    local id = ____exports.State.teamToPlayer:get(team)
    local ____temp_0
    if id == nil then
        ____temp_0 = nil
    else
        ____temp_0 = ____exports.State.players:get(id)
    end
    return ____temp_0
end
function ____exports.activePlayers()
    return __TS__ArrayFilter(
        ____exports.allPlayers(),
        function(____, p) return not p.left end
    )
end
local nwCache = __TS__New(Map)
function ____exports.networthOf(id)
    local now = GameRules:GetGameTime()
    local c = nwCache:get(id)
    if c ~= nil and now - c.at < 1 and now >= c.at then
        return c.value
    end
    local h = PlayerResource:GetSelectedHeroEntity(id)
    local nw = 0
    if h ~= nil and IsValidEntity(h) then
        nw = PlayerResource:GetGold(id)
        do
            local slot = 0
            while slot <= 16 do
                local item = h:GetItemInSlot(slot)
                if item ~= nil and IsValidEntity(item) then
                    nw = nw + item:GetCost()
                end
                slot = slot + 1
            end
        end
    end
    nwCache:set(id, {at = now, value = nw})
    return nw
end
function ____exports.scoreRows()
    return __TS__ArrayMap(
        ____exports.allPlayers(),
        function(____, p) return {
            id = p.id,
            kills = p.kills,
            deaths = p.deaths,
            networth = ____exports.networthOf(p.id),
            left = p.left
        } end
    )
end
function ____exports.placesNow()
    return averagePlaces(__TS__ArrayFilter(
        ____exports.scoreRows(),
        function(____, r) return not r.left end
    ))
end
function ____exports.currentLeaderId()
    local l = uniqueLeader(__TS__ArrayFilter(
        ____exports.scoreRows(),
        function(____, r) return not r.left end
    ))
    return l == nil and -1 or l.id
end
--- Отправить таблицы счета и состояния в интерфейс.
function ____exports.pushNet()
    local rows = ____exports.scoreRows()
    local order = finalPlaces(__TS__ArrayFilter(
        rows,
        function(____, r) return not r.left end
    ))
    local scores = {}
    for ____, p in ipairs(____exports.allPlayers()) do
        local h = PlayerResource:GetSelectedHeroEntity(p.id)
        local place = __TS__ArrayIndexOf(order, p.id) + 1
        scores[tostring(p.id)] = {
            id = p.id,
            team = p.team,
            hero = h ~= nil and IsValidEntity(h) and h:GetUnitName() or PlayerResource:GetSelectedHeroName(p.id),
            k = p.kills,
            d = p.deaths,
            a = p.assists,
            streak = p.streak,
            left = p.left and 1 or 0,
            bot = p.isBot and 1 or 0,
            place = place > 0 and place or 0,
            nw = ____exports.networthOf(p.id)
        }
    end
    CustomNetTables:SetTableValue("orb_game", "scores", scores)
    CustomNetTables:SetTableValue(
        "orb_game",
        "state",
        {
            phase = ____exports.State.phase,
            goal = ____exports.State.goal,
            now = math.floor(____exports.gameNow()),
            limit = ____exports.State.timeLimit,
            leader = ____exports.currentLeaderId(),
            winner = ____exports.State.winner,
            players = #____exports.activePlayers(),
            hunted = huntedNow()
        }
    )
end
function ____exports.toast(kind, text, p1, p2, p3, player)
    CustomGameEventManager:Send_ServerToAllClients("orb_toast", {
        kind = kind,
        text = text,
        p1 = p1,
        p2 = p2,
        p3 = p3,
        player = player
    })
end
--- Игрок в бою: бил героя или получал урон от героя за последние 5 секунд.
function ____exports.inFight(id)
    local p = ____exports.State.players:get(id)
    return p ~= nil and GameRules:GetGameTime() - p.fightAt < 5
end
return ____exports
