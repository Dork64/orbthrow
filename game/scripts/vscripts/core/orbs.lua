local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local __TS__ArraySome = ____lualib.__TS__ArraySome
local ____exports = {}
local takeRandom, pickCards
local ____rules = require("core.rules")
local byPlace = ____rules.byPlace
local ____orbdata = require("core.orbdata")
local GREY_DEFS = ____orbdata.GREY_DEFS
local UPGRADE_DEFS = ____orbdata.UPGRADE_DEFS
function takeRandom(list, rng)
    local i = rng(#list)
    local x = unpack(__TS__ArraySplice(list, i, 1))
    return x
end
function pickCards(pool, all, rng, mainBranch)
    local result = {}
    local left = __TS__ArraySlice(pool)
    local usedBranches = {}
    if mainBranch ~= nil then
        local main = __TS__ArrayFilter(
            left,
            function(____, c) return c.branch == mainBranch end
        )
        if #main > 0 then
            local c = takeRandom(main, rng)
            __TS__ArraySplice(
                left,
                __TS__ArrayIndexOf(left, c),
                1
            )
            result[#result + 1] = c
            usedBranches[#usedBranches + 1] = c.branch
        end
    end
    while #result < ____exports.ORB.cards and #left > 0 do
        local other = __TS__ArrayFilter(
            left,
            function(____, c) return c.branch == "G" or not __TS__ArrayIncludes(usedBranches, c.branch) end
        )
        local from = #other > 0 and other or left
        local c = takeRandom(from, rng)
        __TS__ArraySplice(
            left,
            __TS__ArrayIndexOf(left, c),
            1
        )
        result[#result + 1] = c
        usedBranches[#usedBranches + 1] = c.branch
    end
    if #result < ____exports.ORB.cards then
        for ____, c in ipairs(all) do
            if #result >= ____exports.ORB.cards then
                break
            end
            if not __TS__ArraySome(
                result,
                function(____, r) return r.id == c.id end
            ) then
                result[#result + 1] = c
            end
        end
    end
    return result
end
____exports.ORB = {
    greyNeed = 1000,
    greyRateFirst = 4.5,
    greyRateLast = 8.5,
    blueFirst = 25,
    blueStep = 8,
    purpleFirst = 5,
    purpleStep = 1,
    campPoints = {small = 4, medium = 6, large = 9, ancient = 14},
    runePoints = 4,
    killPoints = 2,
    killEqualBonus = 1,
    killHuntedBonus = 2,
    assistPoints = 1,
    assistHuntedBonus = 1,
    autoPickSeconds = 60,
    freeRerolls = 2,
    rerollCosts = {150, 300, 450, 600},
    fallbackGold = {grey = 250, blue = 400, purple = 700, legend = 700},
    blueCdCap = 60,
    stackLimit = 99,
    softCapFactor = 0.5,
    cards = 3,
    mechInBluePct = 50,
    legendCards = 4,
    legendLevel = 10,
    secondLegendTime = 1800,
    awakeningLevel = 20
}
function ____exports.greyRate(place, players)
    return byPlace(place, players, ____exports.ORB.greyRateFirst, ____exports.ORB.greyRateLast)
end
function ____exports.blueNeed(count)
    return ____exports.ORB.blueFirst + ____exports.ORB.blueStep * count
end
function ____exports.purpleNeed(count)
    return ____exports.ORB.purpleFirst + ____exports.ORB.purpleStep * count
end
--- Убывающее сложение: каждый стак забирает per% от оставшегося пути до предела cap.
-- cap <= 0 — обычное сложение.
function ____exports.diminishing(stacks, per, cap)
    if stacks <= 0 then
        return 0
    end
    if cap <= 0 then
        return per * stacks
    end
    return cap * (1 - (1 - per / cap) ^ stacks)
end
--- Действующие стаки: до порога soft — полностью, после — по половине.
function ____exports.effectiveStacks(stacks, soft)
    if stacks <= 0 then
        return 0
    end
    if soft <= 0 or stacks <= soft then
        return stacks
    end
    return soft + (stacks - soft) * ____exports.ORB.softCapFactor
end
function ____exports.rerollCost(paidUsed)
    local c = ____exports.ORB.rerollCosts
    return c[math.min(paidUsed, #c - 1) + 1]
end
--- Добавить очки; вернуть, сколько сфер набралось (может быть несколько сразу).
function ____exports.addBarPoints(bar, pts, need)
    if pts <= 0 then
        return 0
    end
    bar.points = bar.points + pts
    local gained = 0
    local guard = 0
    while true do
        local ____temp_1 = bar.points >= need(bar.count)
        if ____temp_1 then
            local ____guard_0 = guard
            guard = ____guard_0 + 1
            ____temp_1 = ____guard_0 < 50
        end
        if not ____temp_1 then
            break
        end
        bar.points = bar.points - need(bar.count)
        bar.count = bar.count + 1
        gained = gained + 1
    end
    return gained
end
--- Очки фиолетовой шкалы за убийство.
function ____exports.killPurplePoints(victimKillsBefore, killerKillsBefore, victimHunted)
    local p = ____exports.ORB.killPoints
    if victimKillsBefore >= killerKillsBefore then
        p = p + ____exports.ORB.killEqualBonus
    end
    if victimHunted then
        p = p + ____exports.ORB.killHuntedBonus
    end
    return p
end
function ____exports.assistPurplePoints(victimHunted)
    return ____exports.ORB.assistPoints + (victimHunted and ____exports.ORB.assistHuntedBonus or 0)
end
local greyById = __TS__New(Map)
for ____, g in ipairs(GREY_DEFS) do
    greyById:set(g.id, g)
end
local upById = __TS__New(Map)
for ____, u in ipairs(UPGRADE_DEFS) do
    upById:set(u.id, u)
end
function ____exports.greyDef(id)
    return greyById:get(id)
end
--- Синее, фиолетовое или легендарное улучшение по id.
function ____exports.upDef(id)
    return upById:get(id)
end
--- Совместимость со старым именем.
____exports.blueDef = ____exports.upDef
--- Улучшения героя заданной редкости, включая общие («*»).
function ____exports.upgradesOf(hero, rarity)
    return __TS__ArrayFilter(
        UPGRADE_DEFS,
        function(____, u) return u.rarity == rarity and (u.hero == hero or u.hero == "*") end
    )
end
function ____exports.bluesOfHero(hero)
    return __TS__ArrayFilter(
        UPGRADE_DEFS,
        function(____, u) return u.rarity == "blue" and u.hero == hero end
    )
end
--- Все улучшения героя со способностями (для проверки данных при появлении героя).
function ____exports.heroUpgrades(hero)
    return __TS__ArrayFilter(
        UPGRADE_DEFS,
        function(____, u) return u.hero == hero end
    )
end
--- Сколько раз можно взять: серые, синие и общие фиолетовые — без предела; свои фиолетовые и легендарки — по данным.
function ____exports.maxStacks(id)
    if greyById:has(id) then
        return ____exports.ORB.stackLimit
    end
    local u = upById:get(id)
    if u == nil then
        return 1
    end
    if u.rarity == "blue" or u.rarity == "purple" and u.hero == "*" then
        return ____exports.ORB.stackLimit
    end
    return u.max
end
function ____exports.rarityOf(id)
    if greyById:has(id) then
        return "grey"
    end
    local ____opt_2 = upById:get(id)
    return ____opt_2 and ____opt_2.rarity
end
--- Все доступные варианты редкости (не набравшие максимум). disabled — выключенные проверкой данных.
function ____exports.candidates(rarity, hero, stacks, disabled, legendSlots)
    if disabled == nil then
        disabled = {}
    end
    if legendSlots == nil then
        legendSlots = 1
    end
    local out = {}
    if rarity == "grey" then
        for ____, g in ipairs(GREY_DEFS) do
            if (stacks[g.id] or 0) < ____exports.maxStacks(g.id) and not disabled[g.id] then
                out[#out + 1] = {id = g.id, rarity = rarity, branch = "G"}
            end
        end
        return out
    end
    if rarity == "legend" and #__TS__ArrayFilter(
        ____exports.upgradesOf(hero, "legend"),
        function(____, u) return (stacks[u.id] or 0) > 0 end
    ) >= legendSlots then
        return out
    end
    local pool = ____exports.upgradesOf(hero, rarity)
    if rarity == "legend" then
        local own = __TS__ArrayFilter(
            pool,
            function(____, u) return u.hero == hero end
        )
        if #own > 0 then
            pool = own
        end
    end
    for ____, u in ipairs(pool) do
        if (stacks[u.id] or 0) < ____exports.maxStacks(u.id) and not disabled[u.id] then
            out[#out + 1] = {id = u.id, rarity = rarity, branch = u.branch, mech = u.mech == true}
        end
    end
    return out
end
local LOWER = {legend = "purple", purple = "blue", blue = "grey", grey = nil}
--- Предложение из 3 карточек.
-- - серые: 3 разных общих улучшения;
-- - синие: из разных веток, если возможно; главная ветка (после легендарки) — первой;
-- - пустой пул — редкость ниже, если нет и там — золото;
-- - exclude — карточки прошлого предложения (при перебросе стараемся показать новые).
-- rng(n) возвращает целое 0..n-1.
function ____exports.makeOffer(asked, hero, stacks, rng, mainBranch, exclude, disabled, legendSlots)
    if exclude == nil then
        exclude = {}
    end
    if disabled == nil then
        disabled = {}
    end
    if legendSlots == nil then
        legendSlots = 1
    end
    local rarity = asked
    while rarity ~= nil do
        local all = ____exports.candidates(
            rarity,
            hero,
            stacks,
            disabled,
            legendSlots
        )
        if #all > 0 then
            if rarity == "legend" then
                return {
                    kind = "cards",
                    rarity = rarity,
                    asked = asked,
                    cards = __TS__ArraySlice(all, 0, ____exports.ORB.legendCards)
                }
            end
            local fresh = __TS__ArrayFilter(
                all,
                function(____, c) return not __TS__ArrayIncludes(exclude, c.id) end
            )
            local pool = #fresh >= math.min(____exports.ORB.cards, #all) and fresh or all
            local cards = pickCards(pool, all, rng, mainBranch)
            if rarity == "blue" and #cards >= 2 and rng(100) < ____exports.ORB.mechInBluePct then
                local mech = __TS__ArrayFilter(
                    ____exports.upgradesOf(hero, "purple"),
                    function(____, u) return u.mech == true and u.hero == hero and (stacks[u.id] or 0) < ____exports.maxStacks(u.id) and not disabled[u.id] and not __TS__ArrayIncludes(exclude, u.id) end
                )
                if #mech > 0 then
                    local u = mech[rng(#mech) + 1]
                    cards[#cards] = {id = u.id, rarity = "purple", branch = u.branch, mech = true}
                end
            end
            return {kind = "cards", rarity = rarity, asked = asked, cards = cards}
        end
        rarity = LOWER[rarity]
    end
    return {kind = "gold", asked = asked, gold = ____exports.ORB.fallbackGold[asked]}
end
--- Общий предел только бонусов сфер; предметы и способности Доты складываются отдельно.
function ____exports.orbStatusResistance(grey, unstoppable, sources)
    local keep = (1 - math.min(
        50,
        math.max(0, grey)
    ) / 100) * (1 - ____exports.diminishing(unstoppable, 15, 50) / 100)
    for ____, value in ipairs(sources) do
        keep = keep * (1 - math.min(
            50,
            math.max(0, value)
        ) / 100)
    end
    return math.min(50, 100 - keep * 100)
end
return ____exports
