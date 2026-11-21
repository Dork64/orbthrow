import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { setBonuses } from "../src/vscripts/core/orbstore";

let Controller: typeof import("../src/vscripts/modifiers/modifier_orb_controller").ModifierOrbController;

beforeAll(async () => {
    vi.stubGlobal("_G", globalThis);
    vi.stubGlobal("getmetatable", () => undefined);
    ({ ModifierOrbController: Controller } = await import("../src/vscripts/modifiers/modifier_orb_controller"));
});
afterEach(() => vi.unstubAllGlobals());

function heroWithSpheres(stacks: Record<string, number> = {}) {
    vi.stubGlobal("IsServer", () => true);
    vi.stubGlobal("GameRules", { GetGameTime: () => 0 });
    vi.stubGlobal("DamageFlag", { REFLECTION: 16, HPLOSS: 32, NO_SPELL_LIFESTEAL: 4096 });
    vi.stubGlobal("DamageCategory", { SPELL: 0, ATTACK: 1 });
    vi.stubGlobal("PseudoRandom", { CUSTOM_GAME_1: 1 });
    let version = 0;
    const put = (next: Record<string, number>) => setBonuses(71, next, 0, ++version);
    put(stacks);
    const hero = { GetPlayerOwnerID: () => 71, IsAlive: () => true, IsIllusion: () => false,
        GetTeamNumber: () => 2, HealWithParams: vi.fn(), GetAbilityByIndex: vi.fn() };
    const mod = new Controller();
    mod.GetParent = () => hero as never;
    const special = (ability: object, key: string) => {
        const event = { ability, ability_special_value: key, ability_special_level: 0 } as never;
        if (mod.GetModifierOverrideAbilitySpecial(event) === 1) return mod.GetModifierOverrideAbilitySpecialValue(event);
        return (ability as ReturnType<typeof skill>).GetLevelSpecialValueNoOverride(key);
    };
    return { hero, mod, put, special };
}

function skill(name: string, values: Record<string, number>, item = false, ultimate = false) {
    return {
        IsItem: () => item, IsPassive: () => false, GetAbilityType: () => ultimate ? 1 : 0,
        GetAbilityName: () => name, GetLevelSpecialValueNoOverride: (key: string) => values[key] ?? 0,
    };
}

const enemy = { IsBuilding: () => false, IsHero: () => true, IsWard: () => false, GetTeamNumber: () => 3 };

it("сферы сокращают базовый КД способностей перед применением процента Octarine и Feverish", () => {
    const { put, special, hero } = heroWithSpheres();
    const call = skill("axe_berserkers_call", { AbilityCooldown: 20 });
    const bkb = skill("item_black_king_bar", { AbilityCooldown: 50 }, true);
    hero.GetAbilityByIndex.mockReturnValue(call);
    const cooldown = (itemFactor = 1) => special(call, "AbilityCooldown") * itemFactor;
    expect(cooldown()).toBe(20);
    expect(cooldown(0.8)).toBe(16);
    put({ g_cdr: 1 });
    expect(cooldown()).toBeCloseTo(19);
    expect(cooldown(0.8)).toBeCloseTo(15.2);
    expect(cooldown(0.8 * 0.85)).toBeCloseTo(12.92);
    expect(special(bkb, "AbilityCooldown") * 0.8).toBe(40);
    put({ g_cdr: 1, axe_q_cd: 1, l_master: 1 });
    expect(cooldown(0.8)).toBeCloseTo(20 * 0.95 * 0.85 * 0.75 * 0.8);
});

it("штатные и добавленные заряды получают сокращение времени восстановления один раз", () => {
    const { put, special } = heroWithSpheres({ g_cdr: 1, sven_l_hammer: 1 });
    const shrapnel = skill("sniper_shrapnel", { AbilityCharges: 3, AbilityChargeRestoreTime: 35 });
    const hammer = skill("sven_storm_bolt", { AbilityCharges: 0, AbilityCooldown: 12, AbilityChargeRestoreTime: 12 });
    expect(special(shrapnel, "AbilityCharges")).toBe(3);
    expect(special(shrapnel, "AbilityChargeRestoreTime") * 0.8).toBeCloseTo(26.6);
    expect(special(hammer, "AbilityCharges")).toBe(2);
    expect(special(hammer, "AbilityCooldown")).toBe(0);
    expect(special(hammer, "AbilityChargeRestoreTime") * 0.8).toBeCloseTo(9.12);
    put({ g_cdr: 1, l_double_ult: 1, awake: 1 });
    const ultimate = skill("axe_culling_blade", { AbilityChargeRestoreTime: 100 }, false, true);
    expect(special(ultimate, "AbilityCharges")).toBe(2);
    expect(special(ultimate, "AbilityChargeRestoreTime") * 0.8).toBeCloseTo(60.8);
});

it("крит сферы и Daedalus могут усилить одну атаку, а промах и отдельный урон не наследуют бросок", () => {
    const { hero, mod, put } = heroWithSpheres();
    const roll = vi.fn(() => true);
    vi.stubGlobal("RollPseudoRandomPercentage", roll);
    const hit = { attacker: hero, target: enemy, record: 0, damage_category: 1, no_attack_cooldown: false };
    const damage = (native = 1) => 100 * native * (1 + mod.GetModifierTotalDamageOutgoing_Percentage(hit as never) / 100);
    expect(damage()).toBe(100);
    expect(damage(2.25)).toBe(225);
    put({ p_crit: 1 });
    mod.OnAttackRecord(hit as never);
    expect(damage()).toBe(200);
    expect(damage(2.25)).toBe(450);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(mod.GetModifierTotalDamageOutgoing_Percentage({ ...hit, damage_category: 0 } as never)).toBe(0);
    expect(mod.GetModifierTotalDamageOutgoing_Percentage({ ...hit, record: 1 } as never)).toBe(0);
    mod.OnAttackRecordDestroy(hit as never);
    expect(damage(2.25)).toBe(225);
    mod.OnAttackRecord({ ...hit, no_attack_cooldown: true } as never);
    expect(roll).toHaveBeenCalledTimes(1);
});

it("крит сферы сохраняет предел 450% и складывается с Палачом", () => {
    const { hero, mod } = heroWithSpheres({ p_crit: 20, p_executioner: 1 });
    vi.stubGlobal("RollPseudoRandomPercentage", () => true);
    const hit = { attacker: hero, target: { ...enemy, GetHealthPercent: () => 25 }, record: 5, damage_category: 1 };
    mod.OnAttackRecord(hit as never);
    expect(1 + mod.GetModifierTotalDamageOutgoing_Percentage(hit as never) / 100).toBeCloseTo(4.5 * 1.2);
});

it("вампиризм сфер передаёт движку тип урона и уважает запрет вампиризма заклинаний", () => {
    const { hero, mod } = heroWithSpheres({ g_lifesteal: 1, p_bloodsucker: 1 });
    const spell = { GetAbilityName: () => "example" };
    const damage = { attacker: hero, unit: enemy, damage: 100, damage_flags: 0 };
    mod.OnTakeDamage({ ...damage, inflictor: spell, damage_category: 1 } as never);
    mod.OnTakeDamage({ ...damage, inflictor: spell, damage_category: 0 } as never);
    mod.OnTakeDamage({ ...damage, inflictor: spell, damage_category: 0, damage_flags: 4096 } as never);
    mod.OnTakeDamage({ ...damage, damage_category: 1, damage_flags: 16 } as never);
    mod.OnTakeDamage({ ...damage, damage_category: 0 } as never);
    mod.OnTakeDamage({ ...damage, damage_category: 0, damage_flags: 4096 } as never);
    expect(hero.HealWithParams.mock.calls).toEqual([
        [16, spell, true, true, hero, false],
        [16, spell, true, true, hero, true],
        [16, undefined, true, true, hero, false],
    ]);
});

it("серые характеристики добавляются стандартными свойствами, а потолок касается только сопротивления сфер", () => {
    const { mod } = heroWithSpheres({ g_health: 1, g_damage: 1, g_armor: 1, g_attack_speed: 1, g_spell_amp: 1,
        g_magic_resist: 1, g_move_speed: 1, g_hp_regen: 1, g_mana: 1, g_primary: 1, g_status: 10, p_unstoppable: 1 });
    expect([mod.GetModifierHealthBonus(), mod.GetModifierPreAttack_BonusDamage(), mod.GetModifierPhysicalArmorBonus(),
        mod.GetModifierAttackSpeedBonus_Constant(), mod.GetModifierSpellAmplify_Percentage(), mod.GetModifierMagicalResistanceBonus(),
        mod.GetModifierMoveSpeedBonus_Constant(), mod.GetModifierConstantHealthRegen(), mod.GetModifierManaBonus(),
        mod.GetModifierConstantManaRegen(), mod.GetModifierBonusStats_Strength()]).toEqual([120, 12, 2.5, 18, 5, 6, 15, 5, 150, 1.5, 6]);
    expect(mod.GetModifierStatusResistanceStacking()).toBe(50);
    expect(mod.GetModifierSlowResistance_Stacking()).toBeCloseTo(15);
});

it("клиент читает КД, заряды и сопротивление при сокращённом API игровых сущностей", () => {
    const { mod, special } = heroWithSpheres({ g_cdr: 1, sven_l_hammer: 1 });
    vi.stubGlobal("IsServer", () => false);
    vi.stubGlobal("CustomNetTables", { GetTableValue: () => undefined });
    vi.stubGlobal("tostring", String);
    const values: Record<string, number> = { AbilityChargeRestoreTime: 12 };
    const ability = { GetAbilityName: () => "sven_storm_bolt", GetLevelSpecialValueNoOverride: (key: string) => values[key] ?? 0 };
    expect(special(ability, "AbilityCharges")).toBe(2);
    expect(special(ability, "AbilityChargeRestoreTime")).toBeCloseTo(11.4);
    expect(mod.GetModifierStatusResistanceStacking()).toBe(0);
});
