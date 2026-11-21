import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UPGRADE_DEFS } from "../src/vscripts/core/orbdata";
vi.mock("../src/vscripts/lib/registry", () => ({ registerModifier: (_: string, cls: unknown) => cls }));

let Sven: any;
let at = 0;
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const CLEAVE = "sven_great_cleave", WARCRY = "sven_warcry", GOD = "sven_gods_strength";

function fixture(awake = false) {
    const effects = new Map<string, any>();
    const skills = new Map([CLEAVE, WARCRY, GOD, "orb_sven_redirect", "orb_sven_weight"].map(name => [name, {
        GetAbilityName: () => name, GetLevel: () => 4, SetLevel: vi.fn(), SetHidden: vi.fn(), MarkAbilityButtonDirty: vi.fn(),
    }]));
    function unit(id: number, team: number, x: number, y = 0) {
        return {
            pos: vec(x, y), immune: false, ghost: false, root: false, disarm: false,
            GetAbsOrigin() { return this.pos; }, GetForwardVector: () => vec(1),
            GetTeamNumber: () => team, entindex: () => id, IsRealHero: () => true, IsAlive: () => true,
            IsOutOfGame: () => false, IsInvulnerable: () => false, IsIllusion: () => false,
            IsDebuffImmune() { return this.immune; }, IsAttackImmune() { return this.ghost; },
            IsRooted() { return this.root; }, IsDisarmed() { return this.disarm; },
            IsMoving: () => true, IsStunned: () => false, IsCurrentlyHorizontalMotionControlled: () => false,
            AddNewModifier: vi.fn((_u, _a, _name, kv) => modifier(kv.duration)),
        };
    }
    const modifier = (duration: number) => {
        let ends = at + duration;
        return { GetRemainingTime: () => ends - at, SetDuration: vi.fn((d: number) => { ends = at + d; }),
            IsNull: () => false, Destroy: vi.fn(), SetStackCount: vi.fn() };
    };
    const hero = { ...unit(1, 2, 0), SwapAbilities: vi.fn(), PassivesDisabled: () => false,
        FindAbilityByName: (name: string) => skills.get(name), FindModifierByName: (name: string) => effects.get(name),
        HasModifier: (name: string) => effects.has(name), GetAverageTrueAttackDamage: () => 200 };
    const enemy = unit(2, 3, 125), third = unit(3, 4, 400), outside = unit(4, 5, 180, 280);
    const foes = [enemy, third, outside];
    vi.stubGlobal("FindUnitsInRadius", (_: number, p: ReturnType<typeof vec>, _c: unknown, range: number) =>
        foes.filter(f => distance(f.pos, p) <= range).sort((a, b) => distance(a.pos, p) - distance(b.pos, p)));
    vi.stubGlobal("FindUnitsInLine", (_: number, a: ReturnType<typeof vec>, b: ReturnType<typeof vec>, _c: unknown, width: number) =>
        foes.filter(f => f.pos.x >= Math.min(a.x, b.x) && f.pos.x <= Math.max(a.x, b.x) && Math.abs(f.pos.y) <= width));
    const m = new Sven();
    m.GetParent = () => hero;
    const code: Record<string, number> = { sven_l_cleave: 1, sven_l_steeltempo: 1, sven_l_avatar: 1 };
    m.bonuses = () => ({ awake, code });
    const tick = (time: number) => { at = time; m.OnIntervalThink(); };
    const cast = (name: string, duration: number) => {
        const buff = modifier(duration);
        effects.set("modifier_" + name, buff);
        m.OnAbilityFullyCast({ unit: hero, ability: skills.get(name) });
        return buff;
    };
    return { m, hero, enemy, third, outside, skills, effects, tick, cast, code };
}
function distance(a: ReturnType<typeof vec>, b: ReturnType<typeof vec>) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
beforeAll(async () => {
    for (const n of ["legend", "armor_cut", "blade_ready", "ram_build", "ram_ready", "weight_ready", "weight_windup"])
        vi.stubGlobal("modifier_orb_sven_" + n, null);
    Sven = (await import("../src/vscripts/modifiers/modifier_orb_sven_legend")).SvenLegends;
});
beforeEach(() => {
    at = 0;
    for (const [key, value] of Object.entries({
        IsServer: () => true, IsValidEntity: () => true, Vector: vec, GameRules: { GetGameTime: () => at },
        ParticleAttachment: { WORLDORIGIN: 1 }, ParticleManager: {
            CreateParticle: vi.fn(() => 42), SetParticleControl: vi.fn(), SetParticleControlForward: vi.fn(),
            DestroyParticle: vi.fn(), ReleaseParticleIndex: vi.fn(),
        },
        GridNav: { IsTraversable: vi.fn(() => true), IsBlocked: () => false, CanFindPath: () => true },
        GetGroundPosition: (p: unknown) => p, ApplyDamage: vi.fn(), EmitSoundOn: vi.fn(), UTIL_Remove: vi.fn(),
        SpawnEntityFromTableSynchronous: vi.fn(() => ({ SetAngles: vi.fn(), SetAbsOrigin: vi.fn() })),
        DamageTypes: { PHYSICAL: 1 }, DamageFlag: { NO_SPELL_AMPLIFICATION: 1 },
        UnitTargetTeam: { ENEMY: 2 }, UnitTargetType: { HERO: 1 }, UnitTargetFlags: {}, FindOrder: {},
    })) vi.stubGlobal(key, value);
});
afterAll(() => vi.unstubAllGlobals());

describe("легендарки Свена", () => {
    it("Q сохраняет заряд, W/E/R подключаются по прежним ID сфер", () => {
        expect(UPGRADE_DEFS.filter(o => o.hero === "npc_dota_hero_sven" && o.rarity === "legend").map(o => o.id))
            .toEqual(["sven_l_hammer", "sven_l_cleave", "sven_l_steeltempo", "sven_l_avatar"]);
        const f = fixture();
        f.tick(0);
        expect(f.hero.SwapAbilities).toHaveBeenCalledExactlyOnceWith(CLEAVE, "orb_sven_redirect", true, true);
    });

    it("W запускает меч после обычного удара и позволяет один раз вернуть его в ту же цель", () => {
        const f = fixture();
        f.tick(0);
        const hit = { attacker: f.hero, target: f.enemy, damage: 140 };
        f.m.OnAttackLanded({ ...hit, no_attack_cooldown: true });
        expect(SpawnEntityFromTableSynchronous).not.toHaveBeenCalled();
        f.m.OnAttackLanded(hit);
        expect(SpawnEntityFromTableSynchronous).toHaveBeenCalledTimes(1);
        expect(f.m.CanRedirect(f.enemy.pos)).toBe(true);
        f.m.Redirect(f.enemy.pos);
        expect(f.m.CanRedirect(f.enemy.pos)).toBe(false);
        f.tick(0.2); f.tick(0.25); f.tick(2);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 420 }));
        expect(UTIL_Remove).toHaveBeenCalledTimes(1);
    });

    it("E сбрасывает разбег под рутом, пропускает BKB и усиливает удар в препятствие", () => {
        const f = fixture();
        f.third.pos = vec(1000);
        f.enemy.pos = vec(430);
        f.enemy.immune = true;
        f.cast(WARCRY, 8);
        for (let i = 1; i <= 6; i++) { f.hero.pos = vec(45 * i); f.tick(i / 20); }
        expect(ApplyDamage).not.toHaveBeenCalled();
        expect(f.hero.AddNewModifier.mock.calls.some(c => c[2] === "modifier_orb_sven_ram_ready")).toBe(true);

        f.enemy.immune = false;
        f.hero.root = true;
        f.tick(0.35);
        f.hero.root = false;
        f.hero.pos = vec(300); f.tick(0.4);
        expect(ApplyDamage).not.toHaveBeenCalled();

        vi.mocked(GridNav.IsTraversable).mockImplementation(p => p.x < 730);
        f.enemy.pos = vec(620);
        for (let i = 1; i <= 5; i++) { f.hero.pos = vec(300 + i * 45); f.tick(0.4 + i / 20); }
        expect(f.enemy.AddNewModifier.mock.calls.map(c => c[2])).toEqual(["modifier_knockback", "modifier_stunned"]);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 600 }));
    });

    it("R меняет кнопку, отмена замаха сохраняет время, удар поражает только сектор и один раз", () => {
        const f = fixture();
        const god = f.cast(GOD, 30);
        f.tick(0);
        expect(f.hero.SwapAbilities).toHaveBeenCalledWith(GOD, "orb_sven_weight", false, true);
        const ability = f.skills.get("orb_sven_weight");
        expect(f.m.BeginSwing(vec(600), ability)).toBe(true);
        f.m.CancelSwing();
        expect(god.SetDuration).not.toHaveBeenCalled();
        expect(f.m.BeginSwing(vec(600), ability)).toBe(true);
        f.tick(0.6);
        f.m.Swing();
        expect(god.SetDuration).toHaveBeenCalledExactlyOnceWith(22.4, true);
        expect(vi.mocked(ApplyDamage).mock.calls.map(([data]) => data.victim)).toEqual([f.enemy, f.third]);
        expect(f.hero.SwapAbilities).toHaveBeenLastCalledWith("orb_sven_weight", GOD, false, true);
        f.tick(0.7);
        expect(f.m.CanSwing()).toBe(false);
    });

    it("после пробуждения R тратит 5 секунд, а Ghost переживает сектор", () => {
        const f = fixture(true);
        const god = f.cast(GOD, 30);
        f.enemy.ghost = true;
        f.third.pos = vec(700);
        f.tick(1);
        expect(f.m.BeginSwing(vec(800), f.skills.get("orb_sven_weight"))).toBe(true);
        f.tick(1.6); f.m.Swing();
        expect(god.SetDuration).toHaveBeenCalledExactlyOnceWith(23.4, true);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.third, damage: 620 }));
    });
});

it("первые два удара режут броню, а продление ульта ограничено тремя секундами даже после «Веса меча»", () => {
    const f = fixture();
    Object.assign(f.code, { sven_l_cleave: 0, sven_l_avatar: 0, sven_p_untamed: 1, sven_p_eternal: 1 });
    const god = f.cast(GOD, 30);
    f.tick(0);
    const hit = { attacker: f.hero, target: f.enemy, damage: 100 };
    for (let i = 0; i < 3; i++) f.m.OnAttackLanded(hit);
    expect(f.enemy.AddNewModifier.mock.calls.map(c => c[2])).toEqual(["modifier_orb_sven_armor_cut", "modifier_orb_sven_armor_cut"]);
    expect(god.GetRemainingTime()).toBe(31.5);
    expect(f.hero.SwapAbilities).not.toHaveBeenCalled();
    f.code.sven_l_avatar = 1;
    f.tick(0);
    expect(f.m.BeginSwing(vec(600), f.skills.get("orb_sven_weight"))).toBe(true);
    f.tick(0.6);
    f.m.Swing();
    for (let i = 0; i < 5; i++) f.m.OnAttackLanded(hit);
    expect(god.GetRemainingTime()).toBeCloseTo(25.4);
    expect(god.SetDuration).toHaveBeenCalledTimes(7);
});
