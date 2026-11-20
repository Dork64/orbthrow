local ____lualib = require("lualib_bundle")
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArraySetLength = ____lualib.__TS__ArraySetLength
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____state = require("game.state")
local State = ____state.State
local gameNow = ____state.gameNow
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local randomPointInCircle = ____util.randomPointInCircle
local N = "npc_dota_neutral_"
--- Составы лагерей (стандартные нейтралы Доты).
local PACKS = {small = {{N .. "kobold", N .. "kobold", N .. "kobold_tunneler", N .. "kobold_taskmaster"}, {N .. "gnoll_assassin", N .. "gnoll_assassin", N .. "gnoll_assassin"}, {N .. "forest_troll_berserker", N .. "forest_troll_berserker", N .. "forest_troll_high_priest"}, {N .. "fel_beast", N .. "fel_beast", N .. "ghost"}}, medium = {{N .. "harpy_scout", N .. "harpy_scout", N .. "harpy_storm"}, {N .. "giant_wolf", N .. "giant_wolf", N .. "alpha_wolf"}, {N .. "ogre_mauler", N .. "ogre_mauler", N .. "ogre_magi"}, {N .. "satyr_trickster", N .. "satyr_trickster", N .. "satyr_soulstealer"}}, large = {
    {N .. "centaur_khan", N .. "centaur_outrunner", N .. "centaur_outrunner"},
    {N .. "dark_troll_warlord", N .. "dark_troll", N .. "dark_troll"},
    {N .. "polar_furbolg_ursa_warrior", N .. "polar_furbolg_champion"},
    {N .. "enraged_wildkin", N .. "wildkin", N .. "wildkin"},
    {N .. "satyr_hellcaller", N .. "satyr_soulstealer", N .. "satyr_trickster"}
}, ancient = {{N .. "black_dragon", N .. "black_drake", N .. "black_drake"}, {N .. "granite_golem", N .. "rock_golem", N .. "rock_golem"}, {N .. "big_thunder_lizard", N .. "small_thunder_lizard", N .. "small_thunder_lizard"}, {N .. "prowler_shaman", N .. "prowler_acolyte", N .. "prowler_acolyte"}}}
____exports.ALL_NEUTRAL_NAMES = {}
for ____, t in ipairs({"small", "medium", "large", "ancient"}) do
    for ____, pack in ipairs(PACKS[t]) do
        for ____, n in ipairs(pack) do
            if not __TS__ArrayIncludes(____exports.ALL_NEUTRAL_NAMES, n) then
                local ____exports_ALL_NEUTRAL_NAMES_0 = ____exports.ALL_NEUTRAL_NAMES
                ____exports_ALL_NEUTRAL_NAMES_0[#____exports_ALL_NEUTRAL_NAMES_0 + 1] = n
            end
        end
    end
end
____exports.camps = {}
--- Крип → лагерь (для очков синей шкалы и Гоблина).
____exports.campOfUnit = __TS__New(Map)
local LEASH = 1100
local BLOCK_RADIUS = 260
local SPREAD = 170
local lastMinute = -1
local started = false
local function statGrowth()
    local m = math.max(
        0,
        math.min(
            CONFIG.neutralGrowthCapMin,
            gameNow() / 60
        )
    )
    return 1 + CONFIG.neutralStatGrowthPerMin * m
end
local function aliveUnits(c)
    c.units = __TS__ArrayFilter(
        c.units,
        function(____, u) return isValid(u) and u:IsAlive() end
    )
    return c.units
end
local function heroBlocks(c)
    local heroes = FindUnitsInRadius(
        DOTA_TEAM_NEUTRALS,
        c.home,
        nil,
        BLOCK_RADIUS,
        DOTA_UNIT_TARGET_TEAM_BOTH,
        DOTA_UNIT_TARGET_HERO,
        bit.bor(DOTA_UNIT_TARGET_FLAG_INVULNERABLE, DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES),
        FIND_ANY_ORDER,
        false
    )
    return #heroes > 0
end
local function spawnCamp(c)
    local packs = PACKS[c.type]
    local pack = packs[RandomInt(0, #packs - 1) + 1]
    local mul = statGrowth()
    for ____, id in ipairs(c.ids) do
        if ____exports.campOfUnit:get(id) == c then
            ____exports.campOfUnit:delete(id)
        end
    end
    c.ids = {}
    for ____, name in ipairs(pack) do
        do
            local pos = randomPointInCircle(c.home, SPREAD)
            local u = CreateUnitByName(
                name,
                pos,
                true,
                nil,
                nil,
                DOTA_TEAM_NEUTRALS
            )
            if not isValid(u) then
                goto __continue17
            end
            if mul > 1.001 then
                local hp = math.floor(u:GetMaxHealth() * mul)
                u:SetBaseMaxHealth(hp)
                u:SetMaxHealth(hp)
                u:SetHealth(hp)
                u:SetBaseDamageMin(math.floor(u:GetBaseDamageMin() * mul))
                u:SetBaseDamageMax(math.floor(u:GetBaseDamageMax() * mul))
            end
            u:SetForwardVector((c.home - pos):Normalized())
            local ____c_units_1 = c.units
            ____c_units_1[#____c_units_1 + 1] = u
            local ____c_ids_2 = c.ids
            ____c_ids_2[#____c_ids_2 + 1] = u:entindex()
            ____exports.campOfUnit:set(
                u:entindex(),
                c
            )
        end
        ::__continue17::
    end
    c.spawnedAt = gameNow()
end
--- Возродить пустые лагеря (в начале каждой минуты).
local function respawnEmpty(force)
    local n = 0
    for ____, c in ipairs(____exports.camps) do
        do
            if #aliveUnits(c) > 0 then
                goto __continue22
            end
            if not force and heroBlocks(c) then
                goto __continue22
            end
            spawnCamp(c)
            n = n + 1
        end
        ::__continue22::
    end
    if n > 0 then
        log("лагеря: возрождено", n)
    end
end
--- Поводок: далеко ушедшие крипы возвращаются к лагерю.
local function leash()
    for ____, c in ipairs(____exports.camps) do
        for ____, u in ipairs(aliveUnits(c)) do
            local d = (u:GetAbsOrigin() - c.home):Length2D()
            if d > LEASH then
                u:MoveToPosition(randomPointInCircle(c.home, SPREAD))
            end
        end
    end
end
function ____exports.initCamps()
    __TS__ArraySetLength(____exports.camps, 0)
    __TS__ArrayForEach(
        MAP.camps,
        function(____, p, i)
            local z = GetGroundHeight(
                Vector(p.x, p.y, 0),
                nil
            )
            local ____exports_camps_3 = ____exports.camps
            ____exports_camps_3[#____exports_camps_3 + 1] = {
                index = i,
                type = p.type,
                home = Vector(p.x, p.y, z),
                units = {},
                ids = {},
                spawnedAt = -1
            }
        end
    )
    local ____Hooks_onGameStart_4 = Hooks.onGameStart
    ____Hooks_onGameStart_4[#____Hooks_onGameStart_4 + 1] = function()
        started = true
        lastMinute = 0
        respawnEmpty(true)
    end
end
--- Каждые 0.5 с.
function ____exports.campsTick()
    if not started then
        return
    end
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    local minute = math.floor(gameNow() / 60)
    if minute > lastMinute then
        lastMinute = minute
        respawnEmpty(false)
    end
    leash()
end
--- Для чита -camps: сразу возродить все пустые лагеря.
function ____exports.forceRespawnCamps()
    respawnEmpty(true)
end
function ____exports.campUnitsAlive()
    local n = 0
    for ____, c in ipairs(____exports.camps) do
        n = n + #aliveUnits(c)
    end
    return n
end
return ____exports
