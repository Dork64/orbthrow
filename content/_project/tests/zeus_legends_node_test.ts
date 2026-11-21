import { afterEach, describe, expect, it, vi } from "vitest";
import { ZeusLegends } from "../src/vscripts/lib/zeuslegends";
import type { FxSpring, FxThunderball } from "../src/vscripts/core/fxtypes";
import { fxOfOrb, fxView } from "../src/vscripts/core/fxutil";
import { computeBonuses, overrideValue, replacesWrathDamage } from "../src/vscripts/core/orbstore";

const spring = fxOfOrb("zeus_l_jump")[0] as FxSpring;
const ball = fxOfOrb("zeus_l_wrath")[0] as FxThunderball;
const ability = { GetLevel: () => 3, GetLevelSpecialValueNoOverride: () => 500, GetSpecialValueFor: () => 100 };
const bonuses = computeBonuses({ zeus_l_wrath: 1 }, 2);

function fixture() {
    const vector = (x: number, y = 0, z = 0) => ({ x, y, z });
    function hero(team: number, x: number) {
        return {
            team, x, real: true, alive: true, immune: false, invulnerable: false, moving: false,
            GetTeamNumber: () => team, GetMaxHealth: () => 2000,
            GetAbsOrigin() { return vector(this.x); },
            IsAlive() { return this.alive; }, IsRealHero() { return this.real; },
            IsDebuffImmune() { return this.immune; }, IsInvulnerable() { return this.invulnerable; },
            IsCurrentlyHorizontalMotionControlled() { return this.moving; },
            IsRooted: () => false, IsStunned: () => false, IsOutOfGame: () => false,
            GetForwardVector: () => vector(1), FindAbilityByName: () => ability,
            AddNewModifier: vi.fn(() => ({ Destroy: vi.fn(), IsNull: () => false })),
        };
    }
    const zeus = hero(2, 0), enemy = hero(3, 300), rival = hero(4, 450);
    const units = [zeus, enemy, rival];
    const strike = vi.fn();
    const effects = new ZeusLegends(zeus as never, strike);
    const particles = { CreateParticle: vi.fn(() => 1), SetParticleControl: vi.fn(), DestroyParticle: vi.fn(), ReleaseParticleIndex: vi.fn() };
    vi.stubGlobal("ParticleManager", particles);
    vi.stubGlobal("ParticleAttachment", { WORLDORIGIN: 0 });
    vi.stubGlobal("UnitTargetTeam", { ENEMY: 2, BOTH: 3 });
    vi.stubGlobal("UnitTargetType", { HERO: 1 });
    vi.stubGlobal("UnitTargetFlags", { NO_INVIS: 1, FOW_VISIBLE: 2 });
    vi.stubGlobal("FindOrder", { CLOSEST: 1 });
    vi.stubGlobal("DamageFlag", { NON_LETHAL: 128 });
    vi.stubGlobal("EmitSoundOn", vi.fn());
    vi.stubGlobal("Vector", vector);
    vi.stubGlobal("IsValidEntity", () => true);
    vi.stubGlobal("FindUnitsInRadius", (team: number, pos: ReturnType<typeof vector>, _: unknown, range: number, filter: number) =>
        units.filter(u => (filter === 3 || u.team !== team) && Math.abs(pos.x - u.x) <= range)
            .sort((a, b) => Math.abs(pos.x - a.x) - Math.abs(pos.x - b.x)));
    return { zeus, enemy, rival, strike, particles, effects,
        attack: (attacker: typeof zeus, target: typeof zeus, at: number) => effects.attack({ attacker, target } as never, at) };
}

afterEach(() => vi.unstubAllGlobals());

describe("Чужой прыжок", () => {
    it("Зевсу нужно выйти; враг может забрать трамплин, иллюзия и иммунный герой не расходуют его", () => {
        const f = fixture();
        f.effects.castSpring(spring, 0);
        f.effects.tick(0.7);
        expect(f.zeus.AddNewModifier).not.toHaveBeenCalled();
        f.zeus.x = 300;
        f.enemy.x = 50;
        f.enemy.real = false; f.effects.tick(1);
        f.enemy.real = true; f.enemy.immune = true; f.effects.tick(1.2);
        f.enemy.immune = false; f.enemy.moving = true; f.effects.tick(1.4);
        expect(f.enemy.AddNewModifier).not.toHaveBeenCalled();
        f.enemy.moving = false; f.effects.tick(1.6);
        expect(f.enemy.AddNewModifier).toHaveBeenCalledExactlyOnceWith(f.zeus, undefined, "modifier_knockback",
            expect.objectContaining({ center_x: 0, knockback_distance: 525 }));
        f.zeus.x = 0; f.effects.tick(2);
        expect(f.zeus.AddNewModifier).not.toHaveBeenCalled();
        expect(f.strike).not.toHaveBeenCalled();
    });

    it("пробуждённая площадка после врага остаётся для Зевса и электризует его приземление", () => {
        const f = fixture();
        const awake = fxView(spring, true) as FxSpring;
        f.effects.castSpring(awake, 0);
        f.zeus.x = 300; f.enemy.x = 0; f.effects.tick(1);
        f.rival.x = 30; f.effects.tick(1.8);
        expect(f.rival.AddNewModifier).not.toHaveBeenCalled();
        f.zeus.x = 25; f.effects.tick(2);
        expect(f.zeus.AddNewModifier).toHaveBeenCalledTimes(1);
        f.zeus.x = 570; f.rival.x = 600;
        f.effects.tick(2.5);
        expect(f.strike).toHaveBeenCalledExactlyOnceWith(f.rival, 100, awake);
    });
});

describe("Гром с рук", () => {
    it("гасит штатный урон только для взятой ветки R", () => {
        expect(replacesWrathDamage(bonuses, "zuus_thundergods_wrath", "damage")).toBe(true);
        expect(replacesWrathDamage(computeBonuses({ zeus_l_bolt: 1 }, 2), "zuus_thundergods_wrath", "damage")).toBe(false);
        expect(replacesWrathDamage(bonuses, "zuus_lightning_bolt", "damage")).toBe(false);
    });

    it("синяя сфера усиливает шар, даже когда движок наносит ноль глобального урона", () => {
        const f = fixture();
        const withBlue = computeBonuses({ zeus_l_wrath: 1, zeus_r_dmg: 1 }, 2);
        const scaled = overrideValue(withBlue, ball.ab, "damage", 500);
        expect(scaled).toBeGreaterThan(500);
        f.effects.castBall(ball, ability as never, withBlue, 0);
        f.effects.tick(5);
        expect(f.strike.mock.calls[0][1]).toBeCloseTo(scaled! * 1.4);
    });

    it("в дуэли удар можно вернуть Зевсу, но нельзя сбросить таймер или убить себя", () => {
        const f = fixture();
        f.effects.castBall(ball, ability as never, bonuses, 0);
        expect(f.enemy.AddNewModifier.mock.results).toHaveLength(1);
        f.attack(f.enemy, f.zeus, 0.5);
        expect(f.zeus.AddNewModifier).not.toHaveBeenCalled();
        f.attack(f.enemy, f.zeus, 1);
        expect(f.zeus.AddNewModifier.mock.calls[0][3]).toEqual({ duration: 4 });
        f.attack(f.zeus, f.enemy, 1.3);
        f.effects.castBall(ball, ability as never, bonuses, 3); // Refresher не запускает второй шар.
        f.effects.tick(5);
        expect(f.strike).toHaveBeenCalledExactlyOnceWith(f.zeus, 500, ball, 128);
    });

    it("в стычке третий герой получает шар с оставшимся временем; по смерти носителя он гаснет", () => {
        const f = fixture();
        f.effects.castBall(ball, ability as never, bonuses, 0);
        f.attack(f.enemy, f.rival, 1.5);
        expect(f.rival.AddNewModifier.mock.calls[0][3]).toEqual({ duration: 3.5 });
        f.rival.alive = false; f.effects.tick(2); f.effects.tick(6);
        expect(f.strike).not.toHaveBeenCalled();
        expect(f.particles.DestroyParticle).toHaveBeenCalledTimes(1);
    });

    it("после пробуждения попадание Bolt отдаёт шар с Зевса за пределами дистанции атаки", () => {
        const f = fixture();
        const awake = fxView(ball, true) as FxThunderball;
        f.effects.castBall(awake, ability as never, bonuses, 0);
        f.attack(f.enemy, f.zeus, 1);
        f.enemy.x = 700;
        f.effects.bolt(f.enemy as never, 2);
        f.effects.tick(5);
        expect(f.strike).toHaveBeenCalledTimes(1);
        expect(f.strike.mock.calls[0][0]).toBe(f.enemy);
        expect(f.strike.mock.calls[0][1]).toBeCloseTo(700);
    });
});
