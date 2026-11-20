local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArrayConcat = ____lualib.__TS__ArrayConcat
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local __TS__StringReplace = ____lualib.__TS__StringReplace
local ____exports = {}
local logStats
local ____rules = require("core.rules")
local finalPlaces = ____rules.finalPlaces
local ____bossorbs = require("game.bossorbs")
local bossOrbsTaken = ____bossorbs.bossOrbsTaken
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____orbs = require("game.orbs")
local orbSummary = ____orbs.orbSummary
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local networthOf = ____state.networthOf
local scoreRows = ____state.scoreRows
local ____orbicons = require("core.orbicons")
local orbIcon = ____orbicons.orbIcon
local ____orbs = require("core.orbs")
local rarityOf = ____orbs.rarityOf
local ____json = require("core.json")
local toJson = ____json.toJson
local ____version = require("core.version")
local BUILD_VERSION = ____version.BUILD_VERSION
local ____state = require("game.state")
local gameNow = ____state.gameNow
local ____util = require("game.util")
local log = ____util.log
function logStats(order, winner, reason)
    local players = {}
    __TS__ArrayForEach(
        order,
        function(____, id, i)
            local p = State.players:get(id)
            if p == nil then
                return
            end
            local s = orbSummary(id)
            players[#players + 1] = {
                hero = __TS__StringReplace(
                    PlayerResource:GetSelectedHeroName(id),
                    "npc_dota_hero_",
                    ""
                ),
                place = i + 1,
                k = p.kills,
                d = p.deaths,
                a = p.assists,
                nw = networthOf(id),
                bot = p.isBot and 1 or 0,
                left = p.left and 1 or 0,
                legend = s.legend,
                orbs = s.order
            }
        end
    )
    log("ORBTHROW_STATS " .. toJson({
        v = BUILD_VERSION,
        min = math.floor(gameNow() / 6) / 10,
        goal = State.goal,
        reason = reason,
        winner = winner >= 0 and 1 or 0,
        players = players
    }))
end
local leaderKills = __TS__New(Map)
function ____exports.initEndscreen()
    local ____Hooks_onHeroKill_0 = Hooks.onHeroKill
    ____Hooks_onHeroKill_0[#____Hooks_onHeroKill_0 + 1] = function(k)
        if k.victimWasLeader then
            leaderKills:set(
                k.killer.id,
                (leaderKills:get(k.killer.id) or 0) + 1
            )
        end
    end
end
--- Звание получает лучший по показателю (ничья — все лучшие), если показатель больше нуля.
local function award(ids, metric, lowerIsBetter)
    if lowerIsBetter == nil then
        lowerIsBetter = false
    end
    local best
    for ____, id in ipairs(ids) do
        local v = metric(id)
        local ____temp_2 = best == nil
        if not ____temp_2 then
            local ____lowerIsBetter_1
            if lowerIsBetter then
                ____lowerIsBetter_1 = v < best
            else
                ____lowerIsBetter_1 = v > best
            end
            ____temp_2 = ____lowerIsBetter_1
        end
        if ____temp_2 then
            best = v
        end
    end
    if best == nil or not lowerIsBetter and best <= 0 then
        return {}
    end
    return __TS__ArrayFilter(
        ids,
        function(____, id) return metric(id) == best end
    )
end
function ____exports.publishFinal(winner, reason)
    local rows = scoreRows()
    local order = __TS__ArrayConcat(
        finalPlaces(__TS__ArrayFilter(
            rows,
            function(____, r) return not r.left end
        )),
        __TS__ArrayMap(
            __TS__ArrayFilter(
                rows,
                function(____, r) return r.left end
            ),
            function(____, r) return r.id end
        )
    )
    local active = __TS__ArrayMap(
        __TS__ArrayFilter(
            allPlayers(),
            function(____, p) return not p.left end
        ),
        function(____, p) return p.id end
    )
    local titles = __TS__New(Map)
    local function give(name, ids)
        for ____, id in ipairs(ids) do
            titles:set(
                id,
                __TS__ArrayConcat(
                    titles:get(id) or ({}),
                    {name}
                )
            )
        end
    end
    local function pl(id)
        return State.players:get(id)
    end
    give(
        "butcher",
        award(
            active,
            function(id) return pl(id).kills end
        )
    )
    give(
        "overthrower",
        award(
            active,
            function(id) return leaderKills:get(id) or 0 end
        )
    )
    give(
        "forester",
        award(
            active,
            function(id) return orbSummary(id).farm end
        )
    )
    give(
        "keeper",
        award(
            active,
            function(id) return bossOrbsTaken:get(id) or 0 end
        )
    )
    give(
        "immortal",
        award(
            active,
            function(id) return pl(id).deaths end,
            true
        )
    )
    give(
        "partner",
        award(
            active,
            function(id) return pl(id).assists end
        )
    )
    local out = {}
    __TS__ArrayForEach(
        order,
        function(____, id, i)
            local p = State.players:get(id)
            if p == nil then
                return
            end
            local s = orbSummary(id)
            local build = {}
            local ic = {}
            local rr = {}
            __TS__ArrayForEach(
                s.order,
                function(____, u, j)
                    build[tostring(j + 1)] = u
                    ic[u] = orbIcon(u)
                    rr[u] = rarityOf(u) or "blue"
                end
            )
            local t = {}
            __TS__ArrayForEach(
                titles:get(id) or ({}),
                function(____, name, j)
                    t[tostring(j + 1)] = name
                end
            )
            out[tostring(i + 1)] = {
                id = id,
                hero = PlayerResource:GetSelectedHeroName(id),
                place = i + 1,
                k = p.kills,
                d = p.deaths,
                a = p.assists,
                nw = networthOf(id),
                left = p.left and 1 or 0,
                bot = p.isBot and 1 or 0,
                legend = s.legend,
                build = build,
                titles = t,
                ic = ic,
                rr = rr
            }
        end
    )
    CustomNetTables:SetTableValue("orb_game", "final", {winner = winner, reason = reason, rows = out})
    logStats(order, winner, reason)
end
return ____exports
