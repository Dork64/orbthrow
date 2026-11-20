import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { setBonuses } from "../src/vscripts/core/orbstore";

let Controller: typeof import("../src/vscripts/modifiers/modifier_orb_controller").ModifierOrbController;

beforeAll(async () => {
    vi.stubGlobal("_G", globalThis);
    vi.stubGlobal("getmetatable", () => undefined);
    ({ ModifierOrbController: Controller } = await import("../src/vscripts/modifiers/modifier_orb_controller"));
});
afterEach(() => vi.unstubAllGlobals());

function heroWithSpheres() {
    vi.stubGlobal("IsServer", () => true);
    vi.stubGlobal("GameRules", { GetGameTime: () => 0 });
    vi.stubGlobal("DamageFlag", { REFLECTION: 16, HPLOSS: 32, NO_SPELL_LIFESTEAL: 4096 });
    vi.stubGlobal("ModifierFunction", { COOLDOWN_PERCENTAGE: 127, COOLDOWN_PERCENTAGE_STACKING: 287 });
    setBonuses(71, { g_cdr: 1, g_lifesteal: 1 }, 0, 1);
    const hero = { GetPlayerOwnerID: () => 71, IsAlive: () => true, IsIllusion: () => false,
        GetTeamNumber: () => 2, HealWithParams: vi.fn() };
    const mod = new Controller();
    mod.GetParent = () => hero as never;
    return { hero, mod };
}

it("CDR сфер регистрируется как стакающийся и не сокращает перезарядку предмета", () => {
    const { mod } = heroWithSpheres();
    const cast = (item: boolean) => ({ ability: { IsItem: () => item, GetAbilityName: () => "example" } }) as never;
    expect(mod.DeclareFunctions()).toContain(287);
    expect(mod.DeclareFunctions()).not.toContain(127);
    expect(mod.GetModifierPercentageCooldownStacking(cast(false))).toBeGreaterThan(0);
    expect(mod.GetModifierPercentageCooldownStacking(cast(true))).toBe(0);
});

it("вампиризм сфер передаёт движку правильный тип лечения и учитывает запрет от заклинания", () => {
    const { hero, mod } = heroWithSpheres();
    const enemy = { IsBuilding: () => false, IsHero: () => true, GetTeamNumber: () => 3 };
    const spell = { GetAbilityName: () => "example" };
    const damage = { attacker: hero, unit: enemy, damage: 100, damage_flags: 0 };
    mod.OnTakeDamage(damage as never);
    mod.OnTakeDamage({ ...damage, inflictor: spell } as never);
    mod.OnTakeDamage({ ...damage, inflictor: spell, damage_flags: 4096 } as never);
    expect(hero.HealWithParams.mock.calls).toEqual([
        [4, undefined, true, true, hero, false],
        [4, spell, true, true, hero, true],
    ]);
});
