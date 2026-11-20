// Иконки карточек сфер: способность героя («a:имя») или предмет Доты («i:имя») для общих сфер.

import { upDef } from "./orbs";

const ITEM_ICONS: Record<string, string> = {
    g_health: "item_vitality_booster",
    g_damage: "item_broadsword",
    g_armor: "item_chainmail",
    g_attack_speed: "item_gloves",
    g_spell_amp: "item_kaya",
    g_magic_resist: "item_cloak",
    g_move_speed: "item_boots",
    g_hp_regen: "item_ring_of_regen",
    g_mana: "item_energy_booster",
    g_primary: "item_ultimate_orb",
    g_cdr: "item_octarine_core",
    g_status: "item_sange",
    g_lifesteal: "item_lifesteal",
    p_bloodsucker: "item_satanic",
    p_crit: "item_greater_crit",
    p_burn_aura: "item_radiance",
    p_cleave: "item_bfury",
    p_unstoppable: "item_black_king_bar",
    p_battle_shield: "item_aeon_disk",
    p_executioner: "item_abyssal_blade",
    p_ferocity: "item_armlet",
    p_grave: "item_aegis",
    p_feast: "item_satanic",
    p_meteor: "item_meteor_hammer",
    p_hunter: "item_gem",
    p_martyr: "item_blade_mail",
    p_vanish: "item_invis_sword",
    l_double_ult: "item_refresher",
    l_master: "item_octarine_core",
    l_second_wind: "item_heart",
    l_defiance: "item_armlet",
};

/** Иконка сферы для интерфейса. */
export function orbIcon(id: string): string {
    const item = ITEM_ICONS[id];
    if (item !== undefined) return "i:" + item;
    const d = upDef(id);
    if (d !== undefined && d.ability !== "") return "a:" + d.ability;
    return "i:item_ultimate_orb";
}
