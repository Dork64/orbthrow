local ____lualib = require("lualib_bundle")
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local ____exports = {}
local ____fxdata = require("core.fxdata")
local FX_LIST = ____fxdata.FX_LIST
local ____fxtypes = require("core.fxtypes")
local fxHasModifier = ____fxtypes.fxHasModifier
local fxModifierName = ____fxtypes.fxModifierName
local BUFFS = "modifiers/modifier_orb_hero_buffs"
local FX_FILE = "modifiers/modifier_orb_fx"
--- [имя модификатора, файл относительно scripts/vscripts без .lua]
____exports.MODIFIER_LINKS = {
    {"modifier_orb_battle_shield", "modifiers/modifier_orb_battle_shield"},
    {"modifier_orb_tusk", "modifiers/modifier_orb_tusk"},
    {"modifier_orb_tusk_stance", "modifiers/modifier_orb_tusk"},
    {"modifier_orb_controller", "modifiers/modifier_orb_controller"},
    {"modifier_orb_ferocity", "modifiers/modifier_orb_ferocity"},
    {"modifier_orb_goblin", "modifiers/modifier_orb_goblin"},
    {"modifier_orb_left", "modifiers/modifier_orb_left"},
    {"modifier_orb_pregame", "modifiers/modifier_orb_pregame"},
    {"modifier_orb_ring", "modifiers/modifier_orb_ring"},
    {"modifier_orb_second_wind", "modifiers/modifier_orb_second_wind"},
    {"modifier_orb_spawn_protection", "modifiers/modifier_orb_spawn_protection"},
    {"modifier_orb_sphere_unit", "modifiers/modifier_orb_sphere_unit"},
    {"modifier_orb_pudge_chew_mark", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_clutch", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_locked_jaws", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_legend", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_rot_ready", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_rot_mark", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_rot_fuse", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_rot_recovery", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_counter_store", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_counter_hit", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_dragging", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_pudge_drag_victim", "modifiers/modifier_orb_pudge_legend"},
    {"modifier_orb_sven_armor_cut", "modifiers/modifier_orb_sven_legend"},
    {"modifier_orb_sven_legend", "modifiers/modifier_orb_sven_legend"},
    {"modifier_orb_sven_blade_ready", "modifiers/modifier_orb_sven_legend"},
    {"modifier_orb_sven_ram_build", "modifiers/modifier_orb_sven_legend"},
    {"modifier_orb_sven_ram_ready", "modifiers/modifier_orb_sven_legend"},
    {"modifier_orb_sven_weight_ready", "modifiers/modifier_orb_sven_legend"},
    {"modifier_orb_sven_weight_windup", "modifiers/modifier_orb_sven_legend"},
    {"modifier_orb_jugg_guardcut", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_open_wound", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_intermission", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_legend", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_ward_charge", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_ward_bind", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_cuts", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_ward_fuse", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_encore_pause", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_encore_ready", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_jugg_encore_slash", "modifiers/modifier_orb_jugg_legend"},
    {"modifier_orb_hero", "modifiers/modifier_orb_hero"},
    {"modifier_orb_fountain", "modifiers/modifier_orb_fountain"},
    {"modifier_orb_fountain_haste", "modifiers/modifier_orb_fountain"},
    {"modifier_orb_ward", "modifiers/modifier_orb_consumables"},
    {"modifier_orb_smoke", "modifiers/modifier_orb_consumables"},
    {"modifier_orb_dust", "modifiers/modifier_orb_consumables"},
    {"modifier_orb_travel", "modifiers/modifier_orb_travel"},
    {"modifier_orb_event_haste", "modifiers/modifier_orb_event"},
    {"modifier_orb_event_bloodmoon", "modifiers/modifier_orb_event"},
    {"modifier_orb_vanish_speed", "modifiers/modifier_orb_event"},
    {"modifier_orb_axe_iron_will", BUFFS},
    {"modifier_orb_axe_lacerate", BUFFS},
    {"modifier_orb_axe_spin", BUFFS},
    {"modifier_orb_axe_hunt", BUFFS},
    {"modifier_orb_axe_arena", BUFFS},
    {"modifier_orb_axe_arena_buff", BUFFS},
    {"modifier_orb_axe_free_cull", BUFFS},
    {"modifier_orb_jugg_ward_armor", BUFFS}
}
for ____, f in ipairs(FX_LIST) do
    if fxHasModifier(f) then
        local ____exports_MODIFIER_LINKS_0 = ____exports.MODIFIER_LINKS
        ____exports_MODIFIER_LINKS_0[#____exports_MODIFIER_LINKS_0 + 1] = {
            fxModifierName(f.key),
            FX_FILE
        }
    end
end
____exports.MODIFIER_NAMES = __TS__ArrayMap(
    ____exports.MODIFIER_LINKS,
    function(____, l) return l[1] end
)
--- Файл модификатора по имени (для самопроверки).
function ____exports.modifierFile(name)
    for ____, ____value in ipairs(____exports.MODIFIER_LINKS) do
        local n = ____value[1]
        local f = ____value[2]
        if n == name then
            return f
        end
    end
    return "modifiers/" .. name
end
function ____exports.linkModifiers()
    for ____, ____value in ipairs(____exports.MODIFIER_LINKS) do
        local name = ____value[1]
        local file = ____value[2]
        LinkLuaModifier(name, file, LUA_MODIFIER_MOTION_NONE)
    end
end
return ____exports
