local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local ____exports = {}
____exports.KILL_OPTIONS = {20, 30, 40, 50}
____exports.MINUTE_OPTIONS = {20, 30, 40, 50}
____exports.DEFAULT_MINUTES = 30
--- Итог голосования: вариант с наибольшим числом голосов.
-- Ничья — вариант ближе к значению по умолчанию, при равенстве — меньший.
-- Нет голосов — значение по умолчанию.
function ____exports.tally(votes, options, fallback)
    local count = __TS__New(Map)
    for ____, v in ipairs(votes) do
        if __TS__ArrayIncludes(options, v) then
            count:set(
                v,
                (count:get(v) or 0) + 1
            )
        end
    end
    if count.size == 0 then
        return fallback
    end
    local best = -1
    local bestN = -1
    for ____, o in ipairs(options) do
        do
            local n = count:get(o) or 0
            if n == 0 then
                goto __continue7
            end
            if n > bestN then
                best = o
                bestN = n
                goto __continue7
            end
            if n == bestN then
                local dBest = math.abs(best - fallback)
                local dO = math.abs(o - fallback)
                if dO < dBest or dO == dBest and o < best then
                    best = o
                end
            end
        end
        ::__continue7::
    end
    return best
end
--- Сколько голосов у каждого варианта.
function ____exports.voteCounts(votes, options)
    local out = {}
    for ____, o in ipairs(options) do
        out[tostring(o)] = 0
    end
    for ____, v in ipairs(votes) do
        if __TS__ArrayIncludes(options, v) then
            out[tostring(v)] = (out[tostring(v)] or 0) + 1
        end
    end
    return out
end
return ____exports
