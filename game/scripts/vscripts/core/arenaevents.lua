local ____lualib = require("lualib_bundle")
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local ____exports = {}
____exports.ARENA_EVENTS = {"bloodmoon", "goldrain", "storm", "haste"}
____exports.ARENA = {
    first = 7 * 60,
    every = 5 * 60,
    warn = 10,
    tailGuard = 60,
    duration = {bloodmoon = 60, goldrain = 45, storm = 40, haste = 45},
    moonLifesteal = 20,
    moonKillPurple = 2,
    moonKillGoldBase = 100,
    moonKillGoldPerMin = 10,
    rainCoinChance = 0.35,
    stormEvery = 1.5,
    stormDelay = 1.2,
    stormRadius = 225,
    stormDmgBase = 40,
    stormDmgMaxHpPct = 8,
    stormStun = 0.4,
    hasteMs = 25,
    hasteCdr = 30,
    hasteMana = 50
}
--- Время начала события номер n (с нуля).
function ____exports.eventStart(n)
    return ____exports.ARENA.first + n * ____exports.ARENA.every
end
--- Можно ли начинать событие в момент t при лимите времени limit (овертайм — limit 0).
function ____exports.eventAllowed(t, limit, overtime)
    if overtime then
        return true
    end
    return limit <= 0 or t + ____exports.ARENA.tailGuard <= limit
end
--- Случайное событие, не повторяющее предыдущее. rnd(n) — целое от 0 до n-1.
function ____exports.pickEvent(prev, rnd)
    local pool = __TS__ArrayFilter(
        ____exports.ARENA_EVENTS,
        function(____, e) return e ~= prev end
    )
    return pool[math.max(
        0,
        math.min(
            #pool - 1,
            rnd(#pool)
        )
    ) + 1]
end
return ____exports
