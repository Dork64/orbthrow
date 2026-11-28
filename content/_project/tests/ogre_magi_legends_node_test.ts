import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/vscripts/lib/registry", () => ({ registerModifier: (_: string, cls: unknown) => cls }));
const Q = "ogre_magi_fireblast", W = "ogre_magi_ignite", E = "ogre_magi_bloodlust", R = "ogre_magi_multicast";
const POTATO = "modifier_orb_ogre_potato", DUEL = "modifier_orb_ogre_duel", BET = "modifier_orb_ogre_die_bet";
const v = (x = 0) => ({ x, y: 0, z: 0 });
let Ogre: any, at = 0;

function fixture(awake = false) {
    const skills = new Map([Q, W, E, R, "orb_ogre_club", "orb_ogre_loaded_die", "item_dagon"].map(name => [name, {
        GetAbilityName: () => name, GetLevel: () => 4, IsInAbilityPhase: () => true,
        SetLevel: vi.fn(), SetHidden: vi.fn(), MarkAbilityButtonDirty: vi.fn(),
    }]));
    const unit = (id: number, team: number, x: number) => {
        const mods = new Map<string, any>();
        return {
            mods, pos: v(x), immune: false, broken: false, real: true, alive: true, stunned: false,
            GetAbsOrigin() { return this.pos; }, GetForwardVector: () => v(1),
            IsAlive() { return this.alive; }, IsRealHero() { return this.real; },
            IsIllusion: () => false, IsOutOfGame: () => false, IsInvulnerable: () => false,
            IsDebuffImmune() { return this.immune; }, IsStunned() { return this.stunned; },
            PassivesDisabled() { return this.broken; }, GetTeamNumber: () => team, entindex: () => id,
            FindModifierByNameAndCaster(name: string, caster: unknown) {
                const m = mods.get(name);
                if (m !== undefined && !m.IsNull() && m.GetCaster() === caster) return m;
                return undefined;
            },
            AddNewModifier(caster: unknown, ability: unknown, name: string, options: { duration?: number }) {
                const starts = at, ends = at + (options.duration ?? 300);
                let removed = false;
                const mod = {
                    GetName: () => name, GetCaster: () => caster, GetAbility: () => ability,
                    GetElapsedTime: () => at - starts, GetDieTime: () => ends,
                    IsNull: () => removed, Destroy: () => { removed = true; }, SetStackCount: vi.fn(),
                };
                mods.set(name, mod);
                return mod;
            },
        };
    };
    const caster = { ...unit(1, 2, 0), FindAbilityByName: (name: string) => skills.get(name),
        SwapAbilities: vi.fn(), GetCastRangeBonus: () => 0, Heal: vi.fn() };
    const foe = unit(2, 3, 430), other = unit(3, 4, 780), creep = unit(4, 3, 420);
    creep.real = false;
    vi.stubGlobal("FindUnitsInRadius", (team: number, p: ReturnType<typeof v>, _: unknown, r: number) =>
        [caster, foe, other, creep].filter(u => u.GetTeamNumber() !== team && Math.abs(u.pos.x - p.x) <= r));
    const mod = new Ogre();
    mod.GetParent = () => caster;
    const code = { ogre_l_fireblast: 1, ogre_l_ignite: 1, ogre_l_bloodlust: 1, ogre_l_multicast: 1 };
    mod.bonuses = () => ({ code, awake });
    const tick = (t: number) => { at = t; mod.OnIntervalThink(); };
    const cast = (key: string, target = foe) => ({ unit: caster, ability: skills.get(key), target });
    const start = (key: string, target = foe) => { const e = cast(key, target); mod.OnAbilityStart(e); return e; };
    const end = (event: ReturnType<typeof cast>) => { mod.OnAbilityExecuted(event); mod.OnAbilityFullyCast(event); };
    const projectile = (target = foe) => mod.ObserveIgniteProjectile(skills.get(W), target);
    const fireHit = (target = foe) => mod.OnTakeDamage({ attacker: caster, unit: target, inflictor: skills.get(Q), damage: 200 });
    const burn = (target = foe) => mod.OnModifierAdded({ unit: target,
        added_buff: target.AddNewModifier(caster, skills.get(W), "modifier_ogre_magi_ignite", { duration: 7 }) });
    const lust = () => caster.AddNewModifier(caster, skills.get(E), "modifier_ogre_magi_bloodlust", { duration: 30 });
    const attack = (attacker = caster, target = foe, record = 1) => ({ attacker, target, record, no_attack_cooldown: false });
    return { mod, caster, foe, other, creep, skills, tick, start, end, projectile, fireHit, burn, lust, attack };
}

beforeAll(async () => {
    for (const n of ["magi_legend", "club_ready", "potato", "duel", "die_ready", "die_bet"])
        vi.stubGlobal("modifier_orb_ogre_" + n, null);
    Ogre = (await import("../src/vscripts/modifiers/modifier_orb_ogre_magi_legend")).OgreMagiLegends;
});
beforeEach(() => {
    at = 0;
    for (const [key, value] of Object.entries({
        IsServer: () => true, IsValidEntity: () => true, GameRules: { GetGameTime: () => at },
        Vector: (x: number, y: number, z: number) => ({ x, y, z }), GetGroundPosition: (p: unknown) => p,
        ParticleAttachment: { WORLDORIGIN: 0, ABSORIGIN_FOLLOW: 1, OVERHEAD_FOLLOW: 2 },
        ParticleManager: { CreateParticle: vi.fn(() => 5), SetParticleControl: vi.fn(), DestroyParticle: vi.fn(),
            ReleaseParticleIndex: vi.fn() },
        EmitSoundOn: vi.fn(), EmitSoundOnLocationWithCaster: vi.fn(), ApplyDamage: vi.fn(() => 100),
        DamageTypes: { MAGICAL: 2 }, UnitTargetTeam: {}, UnitTargetType: {}, UnitTargetFlags: {}, FindOrder: {},
    })) vi.stubGlobal(key, value);
});
afterAll(() => vi.unstubAllGlobals());

describe("легендарки Огра", () => {
    it("Q ждёт падения дубины, усиливает удар по выходу из стана и отскакивает только один раз", () => {
        const f = fixture(true);
        f.end(f.start(Q));
        f.foe.stunned = false;
        expect(f.mod.CanThrowClub(v(425))).toBe(true);
        f.mod.ThrowClub(v(425), f.skills.get("orb_ogre_club"));
        expect(f.mod.CanThrowClub(v(425))).toBe(false);
        f.tick(0.40);
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.tick(0.43);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({ victim: f.foe, damage: 500 }));
        f.tick(0.88);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({ victim: f.other, damage: 500 }));
        f.tick(1.40);
        expect(ApplyDamage).toHaveBeenCalledTimes(2);
    });

    it("W помечает только первого реально подожжённого героя и передаёт прежний таймер самому Огру", () => {
        const f = fixture(true);
        f.end(f.start(W, f.creep));
        f.projectile(f.creep);
        f.burn(f.creep);
        expect(f.creep.mods.has(POTATO)).toBe(false);
        f.projectile(f.foe);
        f.burn(f.foe);
        f.burn(f.other);
        expect(f.other.mods.has(POTATO)).toBe(false);
        f.tick(1.5);
        f.mod.OnAttackLanded(f.attack(f.foe as any, f.caster));
        expect(f.foe.mods.get(POTATO).IsNull()).toBe(true);
        expect(f.caster.mods.get(POTATO).GetDieTime()).toBeCloseTo(3);
        f.tick(3.01);
        expect(ApplyDamage).toHaveBeenCalledTimes(1);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({ victim: f.caster, damage: 480 }));
    });

    it("E считает обычные удары, лечит по фактическому урону и даёт пробуждённому Огру второго соперника", () => {
        const f = fixture(true);
        f.lust();
        f.mod.OnAttackLanded(f.attack());
        f.mod.OnAttackLanded(f.attack(f.caster, f.foe, 2));
        expect(f.caster.mods.get(DUEL).SetStackCount).toHaveBeenLastCalledWith(20);
        expect(f.mod.GetModifierPreAttack_CriticalStrike(f.attack(f.caster, f.foe, 3))).toBe(250);
        f.mod.OnTakeDamage({ attacker: f.caster, unit: f.foe, record: 3, damage: 196 });
        expect(f.caster.Heal).toHaveBeenCalledWith(98, f.skills.get(E));
        f.mod.OnAttackLanded(f.attack());
        expect(f.foe.mods.get(DUEL).IsNull()).toBe(true);
        f.mod.OnAttackLanded(f.attack(f.caster, f.other, 4));
        expect(f.other.mods.get(DUEL).IsNull()).toBe(false);
        f.mod.OnAttackLanded(f.attack(f.other as any, f.caster, 5));
        f.mod.OnAttackLanded(f.attack(f.other as any, f.caster, 6));
        expect(f.other.mods.get(DUEL).IsNull()).toBe(true);
    });

    it("R улавливает штатный повтор и игнорирует сферный; кость расходует только следующий ручной Q/W по герою", () => {
        const f = fixture(true);
        f.end(f.start(Q));
        f.fireHit();
        f.tick(0.61); f.fireHit();
        f.tick(0.8);
        expect(f.mod.CanLoadDie()).toBe(false);

        f.tick(1);
        f.end(f.start(W)); f.projectile();
        f.tick(1.61);
        f.mod.SetOrbFreeCast(true); f.projectile(); f.mod.SetOrbFreeCast(false);
        f.tick(1.8);
        expect(f.mod.CanLoadDie()).toBe(false);

        f.tick(2);
        f.end(f.start(Q)); f.fireHit();
        f.tick(2.8);
        expect(f.mod.CanLoadDie()).toBe(true);
        f.mod.LoadDie();
        expect(f.mod.GetMulticastChanceFloor("multicast_3_times")).toBeUndefined();
        f.end(f.start(Q, f.creep)); f.fireHit(f.creep);
        f.end(f.start("item_dagon"));
        expect(f.mod.GetMulticastChanceFloor("multicast_2_times")).toBeUndefined();
        const next = f.start(W);
        expect(f.mod.GetMulticastChanceFloor("multicast_4_times")).toBe(100);
        expect(f.foe.mods.get(BET).SetStackCount).toHaveBeenCalledWith(4);
        f.end(next); f.projectile();
        f.tick(3);
        expect(f.mod.GetMulticastChanceFloor("multicast_4_times")).toBeUndefined();
        expect(f.mod.CanLoadDie()).toBe(false);
    });
});
