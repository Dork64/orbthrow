local ____lualib = require("lualib_bundle")
local __TS__ArraySetLength = ____lualib.__TS__ArraySetLength
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local angleOf = ____mapinfo.angleOf
local nearestBase = ____mapinfo.nearestBase
local ____rules = require("core.rules")
local spreadBases = ____rules.spreadBases
local killGoal = ____rules.killGoal
local ____state = require("game.state")
local State = ____state.State
local newPlayer = ____state.newPlayer
local ____util = require("game.util")
local log = ____util.log
function ____exports.baseIndexOfTeam(team)
    local i = __TS__ArrayIndexOf(____exports.baseTeams, team)
    return i < 0 and 0 or i
end
____exports.ALL_TEAMS = {
    DOTA_TEAM_GOODGUYS,
    DOTA_TEAM_BADGUYS,
    DOTA_TEAM_CUSTOM_1,
    DOTA_TEAM_CUSTOM_2,
    DOTA_TEAM_CUSTOM_3,
    DOTA_TEAM_CUSTOM_4,
    DOTA_TEAM_CUSTOM_5,
    DOTA_TEAM_CUSTOM_6,
    DOTA_TEAM_CUSTOM_7,
    DOTA_TEAM_CUSTOM_8
}
--- Цвета игроков (как в Overthrow), по индексу базы.
____exports.BASE_COLORS = {
    {61, 210, 150},
    {243, 201, 9},
    {197, 77, 168},
    {255, 108, 0},
    {52, 85, 255},
    {101, 212, 19},
    {129, 83, 54},
    {27, 192, 216},
    {199, 228, 13},
    {140, 42, 244}
}
--- Команда для каждой базы карты (индекс базы → команда). Узнаем по фонтанам.
____exports.baseTeams = {}
function ____exports.initTeamRules()
    for ____, t in ipairs(____exports.ALL_TEAMS) do
        GameRules:SetCustomGameTeamMaxPlayers(t, 1)
    end
    GameRules:SetCustomGameTeamMaxPlayers(DOTA_TEAM_NOTEAM, 0)
    GameRules:SetIgnoreLobbyTeamsInCustomGame(true)
    GameRules:SetCustomGameSetupAutoLaunchDelay(IsInToolsMode() and 0 or CONFIG.lobbyAutoStart + 20)
    GameRules:LockCustomGameSetupTeamAssignment(true)
end
--- Сопоставить базы карты и команды по фонтанам. Если фонтанов нет — по порядку.
function ____exports.discoverBases()
    __TS__ArraySetLength(____exports.baseTeams, 0)
    do
        local i = 0
        while i < #MAP.bases do
            local ____exports_baseTeams_0 = ____exports.baseTeams
            ____exports_baseTeams_0[#____exports_baseTeams_0 + 1] = ____exports.ALL_TEAMS[i + 1]
            i = i + 1
        end
    end
    local fountains = Entities:FindAllByClassname("ent_dota_fountain")
    local found = 0
    for ____, f in ipairs(fountains) do
        do
            local team = f:GetTeamNumber()
            if not __TS__ArrayIncludes(____exports.ALL_TEAMS, team) then
                goto __continue7
            end
            local o = f:GetAbsOrigin()
            local idx = nearestBase({x = o.x, y = o.y})
            ____exports.baseTeams[idx + 1] = team
            found = found + 1
        end
        ::__continue7::
    end
    log("баз найдено по фонтанам:", found, "из", #MAP.bases)
end
local function humanPlayerIds()
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
--- Раздать команды людям и зарезервировать команды для ботов.
-- Вызывается в начале CUSTOM_GAME_SETUP.
function ____exports.assignTeams(botsWanted)
    ____exports.discoverBases()
    State.players:clear()
    State.teamToPlayer:clear()
    local humans = humanPlayerIds()
    local total = math.min(#MAP.bases, #humans + botsWanted)
    State.plannedPlayers = total
    State.goal = State.voteGoal > 0 and State.voteGoal or killGoal(total)
    local slots = spreadBases(#MAP.bases, total)
    __TS__ArrayForEach(
        humans,
        function(____, id, i)
            local baseIndex = slots[i + 1]
            local team = ____exports.baseTeams[baseIndex + 1]
            PlayerResource:SetCustomTeamAssignment(id, team)
            local p = newPlayer(id, team, baseIndex, false)
            local c = ____exports.BASE_COLORS[baseIndex + 1]
            PlayerResource:SetCustomPlayerColor(id, c[1], c[2], c[3])
            log(
                "игрок",
                id,
                "→ база",
                baseIndex,
                "команда",
                team
            )
            return p
        end
    )
    State.reservedBotTeams = {}
    do
        local i = #humans
        while i < total do
            local ____State_reservedBotTeams_1 = State.reservedBotTeams
            ____State_reservedBotTeams_1[#____State_reservedBotTeams_1 + 1] = ____exports.baseTeams[slots[i + 1] + 1]
            i = i + 1
        end
    end
    do
        local i = 0
        while i < #____exports.baseTeams do
            local c = ____exports.BASE_COLORS[i + 1]
            SetTeamCustomHealthbarColor(____exports.baseTeams[i + 1], c[1], c[2], c[3])
            i = i + 1
        end
    end
    log(
        "игроков:",
        total,
        "людей:",
        #humans,
        "ботов:",
        #State.reservedBotTeams,
        "лимит:",
        State.goal
    )
end
--- Если Дота расставила команды по-своему (поздний старт), принимаем ее расстановку.
function ____exports.syncRealTeams()
    for ____, ____value in __TS__Iterator(State.players) do
        local p = ____value[2]
        do
            if p.isBot then
                goto __continue18
            end
            local real = PlayerResource:GetTeam(p.id)
            if real == p.team or not __TS__ArrayIncludes(____exports.ALL_TEAMS, real) then
                goto __continue18
            end
            log(
                "команда игрока",
                p.id,
                "на деле",
                real,
                "а не",
                p.team
            )
            if State.teamToPlayer:get(p.team) == p.id then
                State.teamToPlayer:delete(p.team)
            end
            p.team = real
            p.baseIndex = ____exports.baseIndexOfTeam(real)
            State.teamToPlayer:set(real, p.id)
        end
        ::__continue18::
    end
end
function ____exports.fountainOf(team)
    local b = MAP.bases[____exports.baseIndexOfTeam(team) + 1]
    return Vector(b.fountain.x, b.fountain.y, 128)
end
function ____exports.baseAngle(baseIndex)
    return angleOf(MAP.bases[baseIndex + 1].fountain)
end
____exports.CONFIG = CONFIG
return ____exports
