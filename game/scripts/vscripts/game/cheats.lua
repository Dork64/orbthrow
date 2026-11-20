local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__StringTrim = ____lualib.__TS__StringTrim
local __TS__StringStartsWith = ____lualib.__TS__StringStartsWith
local __TS__StringSubstring = ____lualib.__TS__StringSubstring
local __TS__StringSplit = ____lualib.__TS__StringSplit
local ____exports = {}
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local gameNow = ____state.gameNow
local pushNet = ____state.pushNet
local toast = ____state.toast
local ____teams = require("game.teams")
local ALL_TEAMS = ____teams.ALL_TEAMS
local baseTeams = ____teams.baseTeams
local ____bots = require("game.bots")
local spawnBot = ____bots.spawnBot
local ____camps = require("game.camps")
local campUnitsAlive = ____camps.campUnitsAlive
local forceRespawnCamps = ____camps.forceRespawnCamps
local ____orbs = require("game.orbs")
local addBlue = ____orbs.addBlue
local addPurple = ____orbs.addPurple
local enqueue = ____orbs.enqueue
local grantMechanics = ____orbs.grantMechanics
local orbsDump = ____orbs.orbsDump
local ____bossorbs = require("game.bossorbs")
local bossOrbCheat = ____bossorbs.bossOrbCheat
local ____courier = require("game.courier")
local courierCheat = ____courier.courierCheat
local ____goblin = require("game.goblin")
local goblinCheat = ____goblin.goblinCheat
local ____catchup = require("game.catchup")
local helpCheat = ____catchup.helpCheat
local huntCheat = ____catchup.huntCheat
local ____neutrals = require("game.neutrals")
local neutralTokensCheat = ____neutrals.neutralTokensCheat
local ____slots = require("game.slots")
local slotsCheat = ____slots.slotsCheat
local ____arenaevents = require("game.arenaevents")
local arenaEventCheat = ____arenaevents.arenaEventCheat
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
____exports.cheatHandlers = __TS__New(Map)
local function hero(id)
    local h = PlayerResource:GetSelectedHeroEntity(id)
    return isValid(h) and h or nil
end
____exports.cheatHandlers:set(
    "gold",
    function(id, a) return PlayerResource:ModifyGold(
        id,
        tonumber(a[1]) or 5000,
        true,
        DOTA_ModifyGold_CheatCommand
    ) end
)
____exports.cheatHandlers:set(
    "lvl",
    function(id, a)
        local h = hero(id)
        if h == nil then
            return
        end
        local target = math.min(
            30,
            tonumber(a[1]) or 10
        )
        local guard = 0
        while true do
            local ____temp_1 = h:GetLevel() < target
            if ____temp_1 then
                local ____guard_0 = guard
                guard = ____guard_0 + 1
                ____temp_1 = ____guard_0 < 30
            end
            if not ____temp_1 then
                break
            end
            h:HeroLevelUp(false)
        end
    end
)
____exports.cheatHandlers:set(
    "kills",
    function(id, a)
        local p = State.players:get(id)
        if p ~= nil then
            p.kills = tonumber(a[1]) or p.kills + 5
        end
        pushNet()
    end
)
____exports.cheatHandlers:set(
    "time",
    function(_id, a)
        State.timeOffset = State.timeOffset + (tonumber(a[1]) or 5) * 60
        toast(
            "info",
            "#orb_toast_cheat",
            "time " .. tostring(math.floor(gameNow() / 60))
        )
    end
)
____exports.cheatHandlers:set(
    "bot",
    function(_id, a)
        local n = tonumber(a[1]) or 1
        local used = __TS__ArrayMap(
            allPlayers(),
            function(____, p) return p.team end
        )
        local free = __TS__ArrayFilter(
            baseTeams,
            function(____, t) return not __TS__ArrayIncludes(used, t) end
        )
        do
            local i = 0
            while i < math.min(n, #free) do
                spawnBot(free[i + 1])
                i = i + 1
            end
        end
    end
)
____exports.cheatHandlers:set(
    "tokens",
    function(id, a) return neutralTokensCheat(
        id,
        tonumber(a[1]) or 10
    ) end
)
____exports.cheatHandlers:set(
    "wards",
    function(id, a) return slotsCheat(
        id,
        tonumber(a[1]) or 5
    ) end
)
____exports.cheatHandlers:set(
    "travel",
    function(id)
        local h = hero(id)
        if h ~= nil then
            h:AddItemByName("item_travel_boots")
        end
    end
)
____exports.cheatHandlers:set(
    "pos",
    function(id)
        local h = hero(id)
        if h == nil then
            return
        end
        local o = h:GetAbsOrigin()
        local text = (((("pos " .. tostring(math.floor(o.x))) .. " ") .. tostring(math.floor(o.y))) .. " ") .. tostring(math.floor(o.z))
        log(text)
        toast("info", "#orb_toast_cheat", text)
    end
)
____exports.cheatHandlers:set(
    "refresh",
    function(id)
        local h = hero(id)
        if h == nil then
            return
        end
        h:SetHealth(h:GetMaxHealth())
        h:SetMana(h:GetMaxMana())
        do
            local i = 0
            while i < h:GetAbilityCount() do
                local ____opt_2 = h:GetAbilityByIndex(i)
                if ____opt_2 ~= nil then
                    ____opt_2:EndCooldown()
                end
                i = i + 1
            end
        end
    end
)
____exports.cheatHandlers:set(
    "win",
    function(id)
        local p = State.players:get(id)
        if p ~= nil then
            p.kills = State.goal - 1
        end
        pushNet()
    end
)
____exports.cheatHandlers:set(
    "camps",
    function()
        forceRespawnCamps()
        toast(
            "info",
            "#orb_toast_cheat",
            "camps " .. tostring(campUnitsAlive())
        )
    end
)
local RARITIES = {"grey", "blue", "purple", "legend"}
____exports.cheatHandlers:set(
    "orb",
    function(id, a)
        local r = __TS__ArrayIncludes(RARITIES, a[1] or "") and a[1] or "grey"
        enqueue(
            id,
            r,
            math.min(
                20,
                tonumber(a[2]) or 1
            )
        )
    end
)
____exports.cheatHandlers:set(
    "orbs",
    function(id, a)
        local n = math.min(
            30,
            tonumber(a[1]) or 5
        )
        do
            local i = 0
            while i < n do
                enqueue(
                    id,
                    RARITIES[RandomInt(0, 2) + 1]
                )
                i = i + 1
            end
        end
    end
)
____exports.cheatHandlers:set(
    "event",
    function(_id, a) return arenaEventCheat(a[1] or "") end
)
____exports.cheatHandlers:set(
    "mech",
    function(id) return toast(
        "info",
        "#orb_toast_cheat",
        "mech " .. tostring(grantMechanics(id))
    ) end
)
____exports.cheatHandlers:set(
    "pts",
    function(id, a)
        local n = tonumber(a[2]) or 10
        if a[1] == "purple" then
            addPurple(id, n)
        else
            addBlue(id, n)
        end
    end
)
____exports.cheatHandlers:set(
    "boss",
    function(_id, a) return bossOrbCheat(a[1] or "blue") end
)
____exports.cheatHandlers:set(
    "courier",
    function() return courierCheat() end
)
____exports.cheatHandlers:set(
    "goblin",
    function() return goblinCheat() end
)
____exports.cheatHandlers:set(
    "hunt",
    function(id) return huntCheat(id) end
)
____exports.cheatHandlers:set(
    "help",
    function(id) return helpCheat(id) end
)
____exports.cheatHandlers:set(
    "dump",
    function()
        for ____, p in ipairs(allPlayers()) do
            log(
                "игрок",
                p.id,
                "команда",
                p.team,
                "база",
                p.baseIndex,
                "бот",
                p.isBot,
                "у/с/п",
                p.kills,
                p.deaths,
                p.assists,
                "ушел",
                p.left
            )
            log(
                "   сферы:",
                orbsDump(p.id)
            )
        end
        log(
            "лимит",
            State.goal,
            "фаза",
            State.phase,
            "время",
            gameNow(),
            "нейтралов",
            campUnitsAlive()
        )
    end
)
function ____exports.onPlayerChat(e)
    if not IsInToolsMode() then
        return
    end
    local text = __TS__StringTrim(e.text)
    if not __TS__StringStartsWith(text, "-") then
        return
    end
    local parts = __TS__ArrayFilter(
        __TS__StringSplit(
            __TS__StringSubstring(text, 1),
            " "
        ),
        function(____, s) return s ~= "" end
    )
    local first = table.remove(parts, 1)
    local cmd = first ~= nil and string.lower(first) or ""
    local handler = ____exports.cheatHandlers:get(cmd)
    if handler == nil then
        return
    end
    log(
        "чит",
        cmd,
        table.concat(parts, " ")
    )
    handler(e.playerid, parts)
end
____exports.Hooks = Hooks
____exports.ALL_TEAMS = ALL_TEAMS
return ____exports
