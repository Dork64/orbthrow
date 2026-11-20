local ____lualib = require("lualib_bundle")
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArraySome = ____lualib.__TS__ArraySome
local __TS__ArrayConcat = ____lualib.__TS__ArrayConcat
local ____exports = {}
local ____neutraldata = require("core.neutraldata")
local NEUTRAL_TIERS = ____neutraldata.NEUTRAL_TIERS
--- Новый тир каждые 4 минуты: 1-й — с начала партии, 5-й — с 16:00.
____exports.NEUTRAL_TIER_EVERY = 240
function ____exports.tierStart(tier)
    return math.max(0, (tier - 1) * ____exports.NEUTRAL_TIER_EVERY)
end
--- Старший открытый тир на момент времени партии.
function ____exports.unlockedTier(now)
    local t = 0
    for ____, d in ipairs(NEUTRAL_TIERS) do
        if now >= ____exports.tierStart(d.tier) then
            t = d.tier
        end
    end
    return t
end
function ____exports.tierDef(tier)
    for ____, d in ipairs(NEUTRAL_TIERS) do
        if d.tier == tier then
            return d
        end
    end
    return nil
end
--- Следующее создание: старший открытый тир, если он выше имеющегося (младшие пропускаются,
-- как в Доте); иначе — следующий тир с временем открытия; после пятого — ничего (один на партию).
function ____exports.nextCraft(owned, now)
    local open = ____exports.unlockedTier(now)
    if open > owned then
        local d = ____exports.tierDef(open)
        return {tier = open, cost = d.craftCost, at = 0}
    end
    if owned >= 5 then
        return {tier = 0, cost = 0, at = 0}
    end
    local d = ____exports.tierDef(owned + 1)
    return {
        tier = owned + 1,
        cost = d.craftCost,
        at = ____exports.tierStart(owned + 1)
    }
end
--- Группа улучшений по основному атрибуту (0 сила, 1 ловкость, 2 интеллект, 3 универсальный).
function ____exports.attrGroup(primaryAttr)
    if primaryAttr == 0 then
        return "strength"
    end
    if primaryAttr == 1 then
        return "agility"
    end
    if primaryAttr == 2 then
        return "intelligence"
    end
    return "universal"
end
local function shuffleTake(list, n, rng)
    local left = __TS__ArraySlice(list)
    local out = {}
    while #out < n and #left > 0 do
        local i = rng(#left)
        out[#out + 1] = left[i + 1]
        __TS__ArraySplice(left, i, 1)
    end
    return out
end
--- Варианты на выбор: артефакты тира и улучшения (общие + группа атрибута), без повторов.
function ____exports.makeNeutralOffer(tier, primaryAttr, rng, exclude)
    if exclude == nil then
        exclude = {}
    end
    local t = math.min(
        5,
        math.max(1, tier)
    )
    local d = ____exports.tierDef(t)
    local pool = __TS__ArrayFilter(
        d.items,
        function(____, i) return not __TS__ArrayIncludes(exclude, i) end
    )
    local trinkets = shuffleTake(#pool >= d.trinketOptions and pool or d.items, d.trinketOptions, rng)
    local enh = {}
    for ____, e in ipairs(__TS__ArrayConcat(
        d.enh.global or ({}),
        d.enh[____exports.attrGroup(primaryAttr)] or ({})
    )) do
        if not __TS__ArraySome(
            enh,
            function(____, x) return x[1] == e[1] end
        ) then
            enh[#enh + 1] = e
        end
    end
    return {
        tier = t,
        trinkets = trinkets,
        enhancements = shuffleTake(enh, d.enhancementOptions, rng)
    }
end
return ____exports
