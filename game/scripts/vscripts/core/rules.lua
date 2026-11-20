local ____lualib = require("lualib_bundle")
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArraySort = ____lualib.__TS__ArraySort
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
--- Лимит убийств: 16 + 1.5 × игроков, в пределах 20…30, с множителем длины партии.
function ____exports.killGoal(players, lengthMul)
    if lengthMul == nil then
        lengthMul = 1
    end
    local raw = CONFIG.goalBase + CONFIG.goalPerPlayer * players
    local clamped = math.max(
        CONFIG.goalMin,
        math.min(
            CONFIG.goalMax,
            math.floor(raw + 0.5)
        )
    )
    return math.max(
        1,
        math.floor(clamped * lengthMul + 0.5)
    )
end
--- Длина партии из настроек лобби: множитель лимита убийств и времени.
____exports.LENGTHS = {short = 0.8, normal = 1, long = 1.25}
function ____exports.timeLimitFor(lengthMul)
    return math.floor(CONFIG.timeLimit * lengthMul / 60 + 0.5) * 60
end
--- Лимит после ухода игрока: −2, но не ниже «счет лидера + 1».
function ____exports.goalAfterAbandon(goal, leaderKills)
    return math.max(goal - CONFIG.abandonGoalReduction, leaderKills + 1)
end
--- Средние места по убийствам: равные по убийствам делят среднее место.
-- Используется для времени возрождения и скорости серой шкалы.
function ____exports.averagePlaces(rows)
    local sorted = __TS__ArraySort(
        __TS__ArraySlice(rows),
        function(____, a, b) return b.kills - a.kills end
    )
    local result = __TS__New(Map)
    local i = 0
    while i < #sorted do
        local j = i
        while j + 1 < #sorted and sorted[j + 1 + 1].kills == sorted[i + 1].kills do
            j = j + 1
        end
        local avg = (i + 1 + (j + 1)) / 2
        do
            local k = i
            while k <= j do
                result:set(sorted[k + 1].id, avg)
                k = k + 1
            end
        end
        i = j + 1
    end
    return result
end
--- Итоговые места: убийства, потом меньше смертей, потом больше нетворс, потом номер игрока.
function ____exports.finalPlaces(rows)
    return __TS__ArrayMap(
        __TS__ArraySort(
            __TS__ArraySlice(rows),
            function(____, a, b)
                if b.kills ~= a.kills then
                    return b.kills - a.kills
                end
                if a.deaths ~= b.deaths then
                    return a.deaths - b.deaths
                end
                if b.networth ~= a.networth then
                    return b.networth - a.networth
                end
                return a.id - b.id
            end
        ),
        function(____, r) return r.id end
    )
end
--- Линейная интерполяция по месту: 1-е место → first, последнее → last.
function ____exports.byPlace(place, players, first, last)
    if players <= 1 then
        return first
    end
    local t = math.max(
        0,
        math.min(1, (place - 1) / (players - 1))
    )
    return first + (last - first) * t
end
function ____exports.respawnTime(place, players)
    return ____exports.byPlace(place, players, CONFIG.respawnFirst, CONFIG.respawnLast)
end
--- Единоличный лидер или undefined, если лидеров несколько.
function ____exports.uniqueLeader(rows)
    local best
    local tie = false
    for ____, r in ipairs(rows) do
        if best == nil or r.kills > best.kills then
            best = r
            tie = false
        elseif r.kills == best.kills then
            tie = true
        end
    end
    local ____tie_0
    if tie then
        ____tie_0 = nil
    else
        ____tie_0 = best
    end
    return ____tie_0
end
--- Отрыв лидера от второго места (0, если игроков меньше двух).
function ____exports.leaderGap(rows)
    if #rows < 2 then
        return 0
    end
    local k = __TS__ArraySort(
        __TS__ArrayMap(
            rows,
            function(____, r) return r.kills end
        ),
        function(____, a, b) return b - a end
    )
    return k[1] - k[2]
end
--- Проверка конца партии.
-- - кто-то набрал лимит → победа;
-- - время вышло → единоличный лидер побеждает, иначе овертайм;
-- - в овертайме первый единоличный лидер побеждает.
function ____exports.checkVictory(rows, goal, time, inOvertime, timeLimit)
    if timeLimit == nil then
        timeLimit = CONFIG.timeLimit
    end
    local active = __TS__ArrayFilter(
        rows,
        function(____, r) return not r.left end
    )
    local reached = __TS__ArraySort(
        __TS__ArrayFilter(
            active,
            function(____, r) return r.kills >= goal end
        ),
        function(____, a, b) return b.kills - a.kills end
    )
    if #reached > 0 then
        return {kind = "winner", id = reached[1].id, reason = "goal"}
    end
    if time >= timeLimit or inOvertime then
        local leader = ____exports.uniqueLeader(active)
        if leader then
            return {kind = "winner", id = leader.id, reason = inOvertime and "overtime" or "time"}
        end
        return {kind = "overtime"}
    end
    return {kind = "none"}
end
function ____exports.killGold(c)
    local gold = CONFIG.killGoldBase + CONFIG.killGoldPerLevel * c.victimLevel
    local diff = c.victimNetworth - c.killerNetworth
    if diff > 0 then
        gold = gold + math.min(CONFIG.killGoldNetworthCap, diff * CONFIG.killGoldNetworthShare)
    end
    if c.victimStreak >= 3 then
        gold = gold + math.min(CONFIG.killGoldStreakCap, CONFIG.killGoldStreakStep * (c.victimStreak - 2))
    end
    if c.victimHunted then
        gold = gold + CONFIG.huntGold
    end
    return math.floor(gold)
end
--- Золото каждому помогавшему: 35% золота убийцы, поровну.
function ____exports.assistGoldEach(killerGold, assisters)
    if assisters <= 0 then
        return 0
    end
    return math.floor(killerGold * CONFIG.assistGoldShare / assisters)
end
--- Опыт каждому участнику убийства.
function ____exports.killXpEach(victimTotalXp, assisters)
    return math.floor((CONFIG.killXpBase + CONFIG.killXpShare * victimTotalXp) / (1 + assisters))
end
--- Последний вражеский игрок, нанесший урон за окно (для добивания нейтралом и т.п.).
function ____exports.lastDamager(records, now, victimId)
    local best
    for ____, r in ipairs(records) do
        do
            if r.attacker == victimId then
                goto __continue43
            end
            if now - r.time > CONFIG.creditWindow then
                goto __continue43
            end
            if best == nil or r.time > best.time then
                best = r
            end
        end
        ::__continue43::
    end
    return best and best.attacker
end
--- Помогавшие: суммарный урон за окно не меньше доли макс. здоровья жертвы.
function ____exports.assistersOf(records, now, victimId, killerId, victimMaxHp)
    local sum = __TS__New(Map)
    for ____, r in ipairs(records) do
        do
            if r.attacker == victimId or r.attacker == killerId then
                goto __continue49
            end
            if now - r.time > CONFIG.assistWindow then
                goto __continue49
            end
            sum:set(
                r.attacker,
                (sum:get(r.attacker) or 0) + r.amount
            )
        end
        ::__continue49::
    end
    local need = victimMaxHp * CONFIG.assistMinHpShare
    local result = {}
    for ____, ____value in __TS__Iterator(sum) do
        local id = ____value[1]
        local total = ____value[2]
        if total >= need then
            result[#result + 1] = id
        end
    end
    __TS__ArraySort(
        result,
        function(____, a, b) return a - b end
    )
    return result
end
--- Оставить только записи свежее окна (чтобы список не рос бесконечно).
function ____exports.pruneDamage(records, now)
    local keep = math.max(CONFIG.assistWindow, CONFIG.creditWindow)
    return __TS__ArrayFilter(
        records,
        function(____, r) return now - r.time <= keep end
    )
end
--- Какие базы занять, чтобы игроки стояли равномерно по кругу.
-- bases — число баз на карте (10), players — сколько игроков. Возвращает индексы баз по кругу.
function ____exports.spreadBases(bases, players)
    local n = math.max(
        0,
        math.min(bases, players)
    )
    local used = {}
    do
        local i = 0
        while i < n do
            local idx = math.floor(i * bases / n + 0.5) % bases
            while __TS__ArrayIncludes(used, idx) do
                idx = (idx + 1) % bases
            end
            used[#used + 1] = idx
            i = i + 1
        end
    end
    return used
end
return ____exports
