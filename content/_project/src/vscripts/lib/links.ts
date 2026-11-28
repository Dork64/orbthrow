// Привязка Lua-модификаторов к файлам. Вызывается на сервере и на клиенте (addon_init,
// addon_game_mode, addon_game_mode_client) до того, как модификаторы понадобятся.
// Файлы модификаторов здесь НЕ подключаются: движок загрузит их сам (см. lib/registry.ts).
// Список сверяет tools/checklua.js: каждый registerModifier должен быть здесь с верным файлом.

import { FX_LIST } from "../core/fxdata";
import { fxHasModifier, fxModifierName } from "../core/fxtypes";

const BUFFS = "modifiers/modifier_orb_hero_buffs";
const FX_FILE = "modifiers/modifier_orb_fx";

/** [имя модификатора, файл относительно scripts/vscripts без .lua] */
export const MODIFIER_LINKS: [string, string][] = [
    ["modifier_orb_battle_shield", "modifiers/modifier_orb_battle_shield"],
    ["modifier_orb_tusk", "modifiers/modifier_orb_tusk"],
    ["modifier_orb_tusk_stance", "modifiers/modifier_orb_tusk"],
    ["modifier_orb_controller", "modifiers/modifier_orb_controller"],
    ["modifier_orb_ferocity", "modifiers/modifier_orb_ferocity"],
    ["modifier_orb_goblin", "modifiers/modifier_orb_goblin"],
    ["modifier_orb_left", "modifiers/modifier_orb_left"],
    ["modifier_orb_pregame", "modifiers/modifier_orb_pregame"],
    ["modifier_orb_ring", "modifiers/modifier_orb_ring"],
    ["modifier_orb_second_wind", "modifiers/modifier_orb_second_wind"],
    ["modifier_orb_spawn_protection", "modifiers/modifier_orb_spawn_protection"],
    ["modifier_orb_sphere_unit", "modifiers/modifier_orb_sphere_unit"],
    ["modifier_orb_pudge_chew_mark", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_clutch", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_locked_jaws", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_legend", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_rot_ready", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_rot_mark", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_rot_fuse", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_rot_recovery", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_counter_store", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_counter_hit", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_dragging", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_pudge_drag_victim", "modifiers/modifier_orb_pudge_legend"],
    ["modifier_orb_mirana_legend", "modifiers/modifier_orb_mirana_legend"],
    ["modifier_orb_mirana_star", "modifiers/modifier_orb_mirana_legend"],
    ["modifier_orb_mirana_arrow", "modifiers/modifier_orb_mirana_legend"],
    ["modifier_orb_mirana_turn", "modifiers/modifier_orb_mirana_legend"],
    ["modifier_orb_mirana_moons", "modifiers/modifier_orb_mirana_legend"],
    ["modifier_orb_mirana_decoy", "modifiers/modifier_orb_mirana_legend"],
    ["modifier_orb_mirana_shot", "modifiers/modifier_orb_mirana_legend"],
    ["modifier_orb_mirana_reach", "modifiers/modifier_orb_mirana_legend"],
    ["modifier_orb_earthshaker_legend", "modifiers/modifier_orb_earthshaker_legend"],
    ["modifier_orb_es_pivot", "modifiers/modifier_orb_earthshaker_legend"],
    ["modifier_orb_es_charged", "modifiers/modifier_orb_earthshaker_legend"],
    ["modifier_orb_es_crack", "modifiers/modifier_orb_earthshaker_legend"],
    ["modifier_orb_es_tracked", "modifiers/modifier_orb_earthshaker_legend"],
    ["modifier_orb_es_path", "modifiers/modifier_orb_earthshaker_legend"],
    ["modifier_orb_ogre_magi_legend", "modifiers/modifier_orb_ogre_magi_legend"],
    ["modifier_orb_ogre_club_ready", "modifiers/modifier_orb_ogre_magi_legend"],
    ["modifier_orb_ogre_potato", "modifiers/modifier_orb_ogre_magi_legend"],
    ["modifier_orb_ogre_duel", "modifiers/modifier_orb_ogre_magi_legend"],
    ["modifier_orb_ogre_duel_ready", "modifiers/modifier_orb_ogre_magi_legend"],
    ["modifier_orb_ogre_die_ready", "modifiers/modifier_orb_ogre_magi_legend"],
    ["modifier_orb_ogre_die_bet", "modifiers/modifier_orb_ogre_magi_legend"],
    ["modifier_orb_necro_legend", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_necro_pulse_ready", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_necro_pulse_windup", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_necro_anchor", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_necro_beacon", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_necro_exposed", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_necro_plague", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_necro_sentence", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_necro_verdict", "modifiers/modifier_orb_necro_legend"],
    ["modifier_orb_sven_armor_cut", "modifiers/modifier_orb_sven_legend"],
    ["modifier_orb_sven_legend", "modifiers/modifier_orb_sven_legend"],
    ["modifier_orb_sven_blade_ready", "modifiers/modifier_orb_sven_legend"],
    ["modifier_orb_sven_ram_build", "modifiers/modifier_orb_sven_legend"],
    ["modifier_orb_sven_ram_ready", "modifiers/modifier_orb_sven_legend"],
    ["modifier_orb_sven_weight_ready", "modifiers/modifier_orb_sven_legend"],
    ["modifier_orb_sven_weight_windup", "modifiers/modifier_orb_sven_legend"],
    ["modifier_orb_jugg_guardcut", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_open_wound", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_intermission", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_legend", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_ward_charge", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_ward_bind", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_cuts", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_ward_fuse", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_encore_pause", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_encore_ready", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_jugg_encore_slash", "modifiers/modifier_orb_jugg_legend"],
    ["modifier_orb_hero", "modifiers/modifier_orb_hero"],
    ["modifier_orb_fountain", "modifiers/modifier_orb_fountain"],
    ["modifier_orb_fountain_haste", "modifiers/modifier_orb_fountain"],
    ["modifier_orb_ward", "modifiers/modifier_orb_consumables"],
    ["modifier_orb_smoke", "modifiers/modifier_orb_consumables"],
    ["modifier_orb_dust", "modifiers/modifier_orb_consumables"],
    ["modifier_orb_travel", "modifiers/modifier_orb_travel"],
    ["modifier_orb_event_haste", "modifiers/modifier_orb_event"],
    ["modifier_orb_event_bloodmoon", "modifiers/modifier_orb_event"],
    ["modifier_orb_vanish_speed", "modifiers/modifier_orb_event"],
    ["modifier_orb_axe_iron_will", BUFFS],
    ["modifier_orb_axe_lacerate", BUFFS],
    ["modifier_orb_axe_spin", BUFFS],
    ["modifier_orb_axe_hunt", BUFFS],
    ["modifier_orb_axe_arena", BUFFS],
    ["modifier_orb_axe_arena_buff", BUFFS],
    ["modifier_orb_axe_free_cull", BUFFS],
    ["modifier_orb_jugg_ward_armor", BUFFS],
];

// Эффекты сфер-кода из данных: у каждого свой модификатор в одном файле
for (const f of FX_LIST) if (fxHasModifier(f)) MODIFIER_LINKS.push([fxModifierName(f.key), FX_FILE]);

export const MODIFIER_NAMES: string[] = MODIFIER_LINKS.map(l => l[0]);

/** Файл модификатора по имени (для самопроверки). */
export function modifierFile(name: string): string {
    for (const [n, f] of MODIFIER_LINKS) if (n === name) return f;
    return "modifiers/" + name;
}

export function linkModifiers() {
    for (const [name, file] of MODIFIER_LINKS) LinkLuaModifier(name, file, LuaModifierMotionType.NONE);
}
