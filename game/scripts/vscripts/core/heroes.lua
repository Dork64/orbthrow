local ____lualib = require("lualib_bundle")
local __TS__SparseArrayNew = ____lualib.__TS__SparseArrayNew
local __TS__SparseArrayPush = ____lualib.__TS__SparseArrayPush
local __TS__SparseArraySpread = ____lualib.__TS__SparseArraySpread
local ____exports = {}
____exports.HEROES_A = {
    "npc_dota_hero_axe",
    "npc_dota_hero_juggernaut",
    "npc_dota_hero_sniper",
    "npc_dota_hero_lina",
    "npc_dota_hero_sven"
}
____exports.HEROES_B = {
    "npc_dota_hero_bristleback",
    "npc_dota_hero_pudge",
    "npc_dota_hero_drow_ranger",
    "npc_dota_hero_phantom_assassin",
    "npc_dota_hero_crystal_maiden",
    "npc_dota_hero_earthshaker",
    "npc_dota_hero_tidehunter",
    "npc_dota_hero_dragon_knight",
    "npc_dota_hero_ursa",
    "npc_dota_hero_viper",
    "npc_dota_hero_queenofpain",
    "npc_dota_hero_lich",
    "npc_dota_hero_luna",
    "npc_dota_hero_mirana",
    "npc_dota_hero_legion_commander",
    "npc_dota_hero_zuus",
    "npc_dota_hero_faceless_void",
    "npc_dota_hero_bloodseeker",
    "npc_dota_hero_windrunner",
    "npc_dota_hero_ogre_magi",
    "npc_dota_hero_snapfire",
    "npc_dota_hero_puck",
    "npc_dota_hero_slark",
    "npc_dota_hero_razor",
    "npc_dota_hero_necrolyte",
    "npc_dota_hero_sand_king"
}
local ____array_0 = __TS__SparseArrayNew(unpack(____exports.HEROES_A))
__TS__SparseArrayPush(
    ____array_0,
    unpack(____exports.HEROES_B)
)
____exports.HERO_POOL = {__TS__SparseArraySpread(____array_0)}
return ____exports
