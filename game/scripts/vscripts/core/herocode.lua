--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
____exports.CODE_SPECIALS = {
    {
        id = "axe_l_eternal",
        ability = "axe_counter_helix",
        key = "trigger_attacks",
        op = "set",
        value = 2
    },
    {
        id = "axe_l_eternal",
        ability = "axe_counter_helix",
        key = "damage",
        op = "mul",
        value = 0.7,
        when = "notAwake"
    },
    {
        id = "axe_l_hunt",
        ability = "axe_battle_hunger",
        key = "damage_per_second",
        op = "mul",
        value = 1.2,
        when = "notAwake"
    },
    {
        id = "axe_l_hunt",
        ability = "axe_battle_hunger",
        key = "damage_per_second",
        op = "mul",
        value = 1.5,
        when = "awake"
    },
    {
        id = "axe_l_hunt",
        ability = "axe_battle_hunger",
        key = "slow",
        op = "add",
        value = 10,
        when = "awake"
    },
    {
        id = "axe_l_executioner",
        ability = "axe_culling_blade",
        key = "damage",
        op = "add",
        value = 45
    },
    {
        id = "axe_l_executioner",
        ability = "axe_culling_blade",
        key = "damage",
        op = "add",
        value = 30,
        when = "awake"
    },
    {
        id = "jugg_l_storm",
        ability = "juggernaut_blade_fury",
        key = "blade_fury_radius",
        op = "add",
        value = 120
    },
    {
        id = "jugg_l_storm",
        ability = "juggernaut_blade_fury",
        key = "duration",
        op = "add",
        value = 2,
        when = "awake"
    }
}
--- Числа эффектов-кода (в одном месте, чтобы описания и код не расходились).
____exports.HERO_CODE = {
    spikedReturn = 0.25,
    ironWillStatus = 40,
    contagiousRadius = 900,
    feastHeal = 0.6,
    lacerateArmor = 1,
    lacerateMax = 8,
    lacerateDuration = 6,
    spinMs = 4,
    spinAs = 15,
    spinMax = 5,
    spinDuration = 4,
    oneArmyRadius = 700,
    arenaRadius = 550,
    arenaDuration = 2.5,
    arenaDurationAwake = 4,
    arenaArmor = 20,
    arenaDamageAwake = 20,
    huntRadius = 450,
    huntArmor = 4,
    huntMs = 5,
    executionerWindow = 2,
    executionerWindowAwake = 2.5,
    executionerRange = 200,
    wardArmor = 5,
    finisherChance = 12,
    finisherHealthPct = 40,
    stormPullPerSecond = 60
}
return ____exports
