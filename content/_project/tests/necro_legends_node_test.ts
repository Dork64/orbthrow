import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UPGRADE_DEFS } from "../src/vscripts/core/orbdata";

vi.mock("../src/vscripts/lib/registry", () => ({ registerModifier: (_: string, cls: unknown) => cls }));

const PULSE = "necrolyte_death_pulse", SHROUD = "necrolyte_ghost_shroud";
const AURA = "necrolyte_heartstopper_aura", SCYTHE = "necrolyte_reapers_scythe";
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
let at = 1;
let Necro: any;

function modifier(name: string, ability: unknown, duration = -1) {
    let removed = false;
    let ending = at + duration;
    return {
        GetAbility: () => ability, GetName: () => name, IsDebuff: () => false,
        GetRemainingTime: () => ending - at, IsNull: () => removed,
        SetStackCount: vi.fn(), SetDuration: (value: number) => { ending = at + value; },
        Destroy: vi.fn(() => { removed = true; }),
    };
}

function fixture(awake = false) {
    function unit(team: number, x: number) {
        return {
            pos: vec(x), hp: 2000, immune: false, broken: false,
            GetHealth() { return this.hp; }, GetMaxHealth: () => 2000, IsAlive() { return this.hp > 0; },
            GetAbsOrigin() { return this.pos; }, GetForwardVector: () => vec(1), GetTeamNumber: () => team,
            IsRealHero: () => true, IsOutOfGame: () => false, IsInvulnerable: () => false, IsIllusion: () => false,
            IsDebuffImmune() { return this.immune; }, IsMagicImmune() { return this.immune; },
            IsRooted: () => false, IsCurrentlyHorizontalMotionControlled: () => false,
            PassivesDisabled() { return this.broken; },
            AddNewModifier: vi.fn((_caster, ability, name, kv) => modifier(name, ability, kv.duration)),
        };
    }
    const enemy = unit(3, 125);
    const specials: Record<string, number> = {
        AbilityDamage: 280, duration: 4.5, aura_radius: 700, aura_damage: 2.3,
        heal_reduction_pct: 20, heal_regen_to_damage: 45,
    };
    const skills = new Map([PULSE, SHROUD, AURA, SCYTHE, "orb_necro_pulse", "orb_necro_return",
        "orb_necro_beacon", "orb_necro_move_beacon", "orb_necro_verdict"].map(name => [name, {
        active: true, GetAbilityName: () => name, GetLevel: () => 4,
        SetLevel: vi.fn(), SetHidden: vi.fn(), MarkAbilityButtonDirty: vi.fn(), GetCursorTarget: () => enemy,
        IsActivated() { return this.active; }, SetActivated(active: boolean) { this.active = active; },
        GetSpecialValueFor: (key: string) => specials[key] ?? 0, GetIntrinsicModifierName: () => "",
    }]));
    let ghost: ReturnType<typeof modifier> | undefined;
    const hero = { ...unit(2, 0), Heal: vi.fn(), SwapAbilities: vi.fn(), HasModifier: () => false,
        HasScepter: () => false, FindModifierByName: () => undefined,
        FindAllModifiers: () => ghost && !ghost.IsNull() ? [ghost] : [],
        FindAbilityByName: (name: string) => skills.get(name) };
    vi.stubGlobal("FindUnitsInRadius", (_: number, pos: ReturnType<typeof vec>, _cache: unknown, radius: number) =>
        Math.abs(pos.x - enemy.pos.x) <= radius ? [enemy] : []);
    const mod = new Necro();
    mod.GetParent = () => hero;
    mod.bonuses = () => ({ awake, code: Object.fromEntries(
        UPGRADE_DEFS.filter(o => o.hero === "npc_dota_hero_necrolyte" && o.rarity === "legend").map(o => [o.id, 1])) });
    return { mod, hero, enemy, skills, tick(time: number) { at = time; mod.OnIntervalThink(); },
        cast(name: string) {
            const skill = skills.get(name);
            if (name === SHROUD) ghost = modifier("modifier_necrolyte_ghost_shroud_active", skill, 4.5);
            mod.OnAbilityFullyCast({ unit: hero, ability: skill });
            return ghost;
        },
        hit(name: string) { mod.OnTakeDamage({ attacker: hero, unit: enemy, inflictor: skills.get(name), damage: 10 }); },
    };
}

beforeAll(async () => {
    for (const name of ["legend","pulse_ready","pulse_windup","anchor","beacon","exposed","plague","sentence","verdict"])
        vi.stubGlobal("modifier_orb_necro_" + name, null);
    Necro = (await import("../src/vscripts/modifiers/modifier_orb_necro_legend")).NecroLegends;
});
beforeEach(() => {
    at = 1;
    for (const [key, value] of Object.entries({
        IsServer: () => true, IsValidEntity: () => true, Vector: vec, GameRules: { GetGameTime: () => at },
        ParticleAttachment: { WORLDORIGIN: 1 }, ParticleManager: {
            CreateParticle: vi.fn(() => 1), SetParticleControl: vi.fn(), DestroyParticle: vi.fn(), ReleaseParticleIndex: vi.fn(),
        },
        GridNav: { IsTraversable: () => true, IsBlocked: () => false },
        GetGroundPosition: (pos: unknown) => pos, ApplyDamage: vi.fn(() => 300), EmitSoundOn: vi.fn(), UTIL_Remove: vi.fn(),
        FindClearSpaceForUnit: vi.fn(), SpawnEntityFromTableSynchronous: vi.fn(() => ({
            SetAbsOrigin: vi.fn(), SetForwardVector: vi.fn(),
        })),
        DamageTypes: { MAGICAL: 2 }, DamageFlag: { NO_SPELL_AMPLIFICATION: 1, NO_SPELL_LIFESTEAL: 2 },
        UnitTargetTeam: { ENEMY: 2 }, UnitTargetType: { HERO: 1 }, UnitTargetFlags: {}, FindOrder: {},
    })) vi.stubGlobal(key, value);
});
afterAll(() => vi.unstubAllGlobals());

describe("легендарки Некрофоса", () => {
    it("Q требует попадания Pulse, поддерживает сбитый замах и не обходится новым кастом", () => {
        const f = fixture();
        f.hit(PULSE);
        expect(f.mod.BeginPulse()).toBe(false);
        f.cast(PULSE); f.hit(PULSE);
        expect(f.mod.BeginPulse()).toBe(true);
        f.mod.InterruptPulse();
        expect(f.mod.BeginPulse()).toBe(true);
        f.mod.FinishPulse(f.skills.get("orb_necro_pulse"));
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 448 }));
        expect(f.hero.Heal).toHaveBeenCalledWith(105, f.skills.get("orb_necro_pulse"));
        f.cast(PULSE); f.hit(PULSE);
        expect(f.mod.BeginPulse()).toBe(false);
    });

    it("W завершает форму перед лечением, а снятие формы убирает силуэт", () => {
        const f = fixture();
        const ghost = f.cast(SHROUD);
        f.hero.hp = 800;
        f.hero.pos = vec(400);
        f.mod.ReturnToAnchor(f.skills.get("orb_necro_return"));
        expect(ghost?.IsNull()).toBe(true);
        expect(f.hero.Heal).toHaveBeenCalledExactlyOnceWith(700, f.skills.get("orb_necro_return"));
        expect(FindClearSpaceForUnit).toHaveBeenCalledWith(f.hero, vec(0), true);
        f.cast(SHROUD)?.Destroy();
        f.tick(2);
        expect(f.mod.CanReturn()).toBe(false);
        expect(UTIL_Remove).toHaveBeenCalledTimes(2);
    });

    it("E сбрасывает разгон после выхода, даёт один сдвиг и гаснет при Break", () => {
        const f = fixture(true);
        f.tick(1);
        f.mod.PlaceBeacon(vec(150));
        f.tick(1.05);
        f.enemy.pos = vec(700);
        f.tick(1.5);
        f.enemy.pos = vec(100);
        f.tick(1.6);
        f.tick(2.5);
        expect(f.enemy.AddNewModifier.mock.calls.some(call => call[2] === "modifier_orb_necro_plague")).toBe(false);
        f.tick(2.9);
        const plague = f.enemy.AddNewModifier.mock.results.find((_, i) =>
            f.enemy.AddNewModifier.mock.calls[i][2] === "modifier_orb_necro_plague")?.value;
        expect(plague?.SetStackCount).toHaveBeenCalledWith(60);
        expect(f.mod.CanPlace(vec(225), true)).toBe(true);
        f.mod.ShiftBeacon(vec(225));
        expect(f.mod.CanPlace(vec(250), true)).toBe(false);
        f.hero.broken = true;
        f.tick(3);
        expect(plague?.IsNull()).toBe(true);
    });

    it("R перепроверяет порог после замаха и не повторяет добивание", () => {
        const f = fixture();
        f.cast(SCYTHE);
        f.enemy.hp = 520;
        f.hit(SCYTHE);
        expect(f.mod.CanVerdict()).toBe(false);
        f.enemy.hp = 490;
        expect(f.mod.CanVerdict()).toBe(true);
        f.enemy.hp = 510;
        f.mod.FinishVerdict(f.skills.get("orb_necro_verdict"));
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.cast(SCYTHE);
        f.enemy.hp = 470;
        f.hit(SCYTHE);
        f.mod.FinishVerdict(f.skills.get("orb_necro_verdict"));
        f.mod.FinishVerdict(f.skills.get("orb_necro_verdict"));
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 700 }));
    });
});
