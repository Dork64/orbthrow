import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroManeuvers } from "../src/vscripts/lib/heromaneuvers";
import { FX_LIST } from "../src/vscripts/core/fxdata";
import type { FxManeuver } from "../src/vscripts/core/fxtypes";
import { UPGRADE_DEFS } from "../src/vscripts/core/orbdata";

const vec = (x: number, y = 0, z = 0) => ({ x, y, z });
const vars = (...modes: FxManeuver["mode"][]) => FX_LIST.filter((f): f is FxManeuver => f.t === "maneuver" && modes.includes(f.mode));

function setup(modes: FxManeuver["mode"][], awake = false) {
    const effects = vars(...modes);
    const ability = {
        GetAbilityName: () => effects[0].ab, GetLevel: () => 4,
        GetSpecialValueFor: (k: string) => k === "duration" ? 3.5 : 6,
        GetCursorPosition: () => vec(1000),
    };
    function unit(team: number, x: number, y = 0) {
        const statuses = new Map<string, any>();
        return {
            team, x, y, statuses, alive: true, immune: false, root: false, moving: true, attacking: false,
            GetTeamNumber: () => team, IsRealHero: () => true, IsOutOfGame: () => false, IsInvulnerable: () => false,
            IsAlive() { return this.alive; }, GetAbsOrigin() { return vec(this.x, this.y); },
            GetForwardVector: () => vec(1), IsChanneling: () => false, IsStunned: () => false,
            IsRooted() { return this.root; }, IsMoving() { return this.moving; }, IsAttacking() { return this.attacking; },
            IsCurrentlyHorizontalMotionControlled: () => false, IsDebuffImmune() { return this.immune; },
            HasModifier: (key: string) => statuses.has(key), FindModifierByName: (key: string) => statuses.get(key),
            FindAllModifiers: () => Array.from(statuses.values()),
            RemoveModifierByName: vi.fn((key: string) => { statuses.delete(key); }),
            FindAbilityByName: () => ability, GetAverageTrueAttackDamage: () => 200,
            AddNewModifier: vi.fn(() => ({ IsNull: () => false, Destroy: vi.fn() })),
        };
    }
    const owner = unit(2, 0), enemy = unit(3, 450), third = unit(4, 700);
    const units = [owner, enemy, third];
    const strike = vi.fn(), push = vi.fn();
    const move = vi.fn((u: typeof owner, to: ReturnType<typeof vec>) => { u.x = to.x; u.y = to.y; });
    const particles = {
        CreateParticle: vi.fn(() => 42), SetParticleControl: vi.fn(),
        DestroyParticle: vi.fn(), ReleaseParticleIndex: vi.fn(),
    };
    for (const [k, v] of Object.entries({
        Vector: vec, IsValidEntity: () => true, ParticleManager: particles, ParticleAttachment: { WORLDORIGIN: 0 },
        DamageCategory: { ATTACK: 1 }, UnitOrder: { MOVE_TO_POSITION: 1, MOVE_TO_TARGET: 2, ATTACK_MOVE: 4 },
        UnitTargetTeam: { ENEMY: 2, BOTH: 3 }, UnitTargetType: { HERO: 1 },
        UnitTargetFlags: { NO_INVIS: 1, FOW_VISIBLE: 2 }, FindOrder: { CLOSEST: 1 },
        FindClearSpaceForUnit: move, GetGroundPosition: (p: ReturnType<typeof vec>) => p,
        FindUnitsInLine: () => units.filter(u => u !== owner),
        FindUnitsInRadius: (_team: number, p: ReturnType<typeof vec>, _cache: unknown, range: number, filter: number) =>
            units.filter(u => (filter === 3 || u !== owner) && Math.hypot(u.x - p.x, u.y - p.y) <= range)
                .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)),
    })) vi.stubGlobal(k, v);
    const engine = new HeroManeuvers(owner as never, strike, push);
    engine.configure(effects, awake);
    return {
        engine, owner, enemy, third, strike, push, move, ability, particles,
        cast: (at: number, target?: typeof owner, name = effects[0].ab) =>
            engine.cast({ ...ability, GetAbilityName: () => name } as never, target as never, at),
        attack: (at: number, target = enemy) => engine.attack({ target, attacker: owner } as never, at),
        order: (kind: number, at: number, point = vec(0), target?: typeof owner) =>
            engine.order(kind, target as never, point as never, at),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe("пять наборов легендарок", () => {
    it("у каждого героя три новые механики и сохранена выбранная ветка", () => {
        for (const [hero, keep] of Object.entries({
            juggernaut: "jugg_l_storm", sven: "sven_l_hammer", phantom_assassin: "pa_l_shadow",
            ursa: "ursa_l_enrage", windrunner: "wr_l_focus",
        })) {
            const legends = UPGRADE_DEFS.filter(o => o.hero === "npc_dota_hero_" + hero && o.rarity === "legend");
            expect(legends).toHaveLength(4);
            expect(legends.some(o => o.id === keep)).toBe(true);
            const newIds = FX_LIST.filter(f => f.t === "maneuver" && f.hero === "npc_dota_hero_" + hero).map(f => f.orb);
            expect(newIds).toHaveLength(3);
            expect(newIds).not.toContain(keep);
        }
    });

    it("меняет местами ровно свой живой тотем и героя, один раз", () => {
        const f = setup(["ward"]);
        f.cast(0);
        f.engine.rememberWard(f.enemy as never);
        expect(f.order(2, 0.5, vec(0), f.third)).toBe(false);
        expect(f.order(2, 1, vec(0), f.enemy)).toBe(true);
        expect(f.owner.x).toBe(450);
        expect(f.enemy.x).toBe(0);
        expect(f.order(2, 2, vec(0), f.enemy)).toBe(false);
    });

    it("возврат Omnislash снимает invulnerability и заканчивает саму серию", () => {
        const f = setup(["omni"]);
        f.engine.start(f.ability as never, 0);
        f.owner.x = 500; f.cast(0.3);
        const destroy = vi.fn();
        f.owner.statuses.set("modifier_juggernaut_omnislash", { Destroy: destroy });
        expect(f.order(1, 1, vec(300))).toBe(false);
        expect(f.order(1, 1.5, vec(25))).toBe(true);
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(f.owner.RemoveModifierByName).toHaveBeenCalledWith("modifier_juggernaut_omnislash_invulnerability");
        expect(f.owner.x).toBe(0);
    });

    it("стойка отвечает на лицевую ближнюю атаку, а заклинание её не расходует", () => {
        const f = setup(["parry"]);
        f.enemy.x = 200;
        f.engine.tick(0.6);
        f.engine.taken({ attacker: f.enemy, damage_category: 0 } as never, 0.7);
        expect(f.strike).not.toHaveBeenCalled();
        f.engine.taken({ attacker: f.enemy, damage_category: 1 } as never, 0.8);
        expect(f.strike.mock.calls[0][0]).toBe(f.enemy);
        expect(f.move).toHaveBeenCalledTimes(1);
    });

    it("таран после Warcry требует непрерывного разбега; BKB его не расходует", () => {
        const f = setup(["ram"]);
        f.enemy.x = 460; f.third.x = 1000;
        f.cast(0); f.engine.tick(0);
        f.enemy.immune = true;
        for (let i = 1; i <= 8; i++) { f.owner.x += 40; f.engine.tick(i / 10); }
        expect(f.push).not.toHaveBeenCalled();
        f.enemy.immune = false;
        f.owner.x += 40; f.engine.tick(0.9);
        expect(f.push.mock.calls.map(call => call[0])).toEqual([f.enemy, f.owner]);
    });

    it("меч под Божьей силой требует явного приказа и может быть погашен соперником", () => {
        const f = setup(["sword"]);
        f.cast(0);
        f.owner.statuses.set("modifier_sven_gods_strength", {});
        expect(f.order(4, 0.1)).toBe(true);
        f.owner.x = 450;
        expect(f.order(1, 0.4)).toBe(false);
        f.enemy.x = 20; f.engine.tick(1.5);
        expect(f.order(1, 1.6)).toBe(false);
        expect(f.move).not.toHaveBeenCalled();
        expect(f.owner.AddNewModifier.mock.results[0].value.Destroy).toHaveBeenCalledTimes(1);
    });

    it("кинжал работает только после успешной посадки W и расходуется при переносе", () => {
        const f = setup(["dagger"]);
        f.engine.spellHit(f.enemy as never, f.ability as never, 0);
        f.enemy.x = 730;
        f.cast(1, f.enemy, "phantom_assassin_phantom_strike");
        expect(f.move).not.toHaveBeenCalled();
        f.owner.x = 710;
        f.cast(1.5, f.enemy, "phantom_assassin_phantom_strike");
        expect(f.owner.x).toBe(450);
        f.owner.x = 710;
        f.cast(2, f.enemy, "phantom_assassin_phantom_strike");
        expect(f.move).toHaveBeenCalledTimes(1);
    });

    it("Фантомка подрывает теневой клинок только с другого угла", () => {
        const f = setup(["blade"]);
        f.enemy.x = 100;
        f.cast(0, f.enemy, "phantom_assassin_phantom_strike");
        f.attack(0.5);
        expect(f.strike).not.toHaveBeenCalled();
        f.owner.x = 280;
        f.attack(1);
        expect(f.strike.mock.calls[0][0]).toBe(f.enemy);
        f.attack(1.5);
        expect(f.strike).toHaveBeenCalledTimes(1);
    });

    it("косой бег расходует один штатный стак и не наносит второй удар", () => {
        const f = setup(["sidestep"]);
        f.enemy.x = 40; f.enemy.y = 145;
        const mod = { GetStackCount: () => 3, DecrementStackCount: vi.fn() };
        f.owner.statuses.set("modifier_ursa_overpower", mod);
        f.cast(0); f.engine.tick(0);
        f.owner.x = 40; f.engine.tick(0.1);
        f.owner.x = 80; f.engine.tick(0.2);
        expect(mod.DecrementStackCount).toHaveBeenCalledTimes(1);
        expect(f.strike).toHaveBeenCalledTimes(1);
    });

    it("попутный ветер может перехватить соперник, развернувшись по направлению стрелы", () => {
        const f = setup(["windlane"]);
        f.owner.moving = false;
        f.cast(0);
        f.engine.tick(0.1);
        f.engine.tick(0.5);
        f.engine.tick(0.6);
        expect(f.push.mock.calls[0][0]).toBe(f.enemy);
        expect(f.push).toHaveBeenCalledTimes(1);
    });

    it("Windrun переносит через препятствие к проходной земле один раз", () => {
        const f = setup(["vault"]);
        const passable = (p: ReturnType<typeof vec>) => p.x < 55 || p.x > 145;
        vi.stubGlobal("GridNav", { IsTraversable: passable, IsBlocked: (p: ReturnType<typeof vec>) => !passable(p) });
        f.owner.statuses.set("modifier_windrunner_windrun", {});
        f.cast(0); f.engine.tick(0);
        f.owner.x = 26; f.engine.tick(0.2);
        expect(f.move).toHaveBeenCalledTimes(1);
        expect(f.owner.x).toBeGreaterThan(145);
    });
});

describe("геометрия и окна контригры", () => {
    it("борозда Свена привязана к первому удару; ушедшего героя не задевает", () => {
        const f = setup(["rift"]);
        f.enemy.x = 250;
        f.third.x = 600;
        vi.stubGlobal("FindUnitsInLine", (team: number, a: ReturnType<typeof vec>, b: ReturnType<typeof vec>, _: unknown, width: number) =>
            [f.enemy, f.third].filter(u => u.team !== team && u.x >= a.x && u.x <= b.x && Math.abs(u.y) <= width));
        f.attack(0);
        f.enemy.y = 160;
        f.attack(1);
        expect(f.push.mock.calls.map(c => c[0])).toEqual([f.third]);
        expect(f.strike.mock.calls.map(c => c[0])).toEqual([f.third]);
    });

    it("Blur вскрывается, когда враг переводит взгляд на Фантомку", () => {
        const f = setup(["blindside"]);
        f.enemy.x = 170;
        f.owner.statuses.set("modifier_phantom_assassin_blur_active", {});
        f.cast(0); f.engine.tick(0.5);
        expect(f.owner.RemoveModifierByName).not.toHaveBeenCalled();
        f.enemy.GetForwardVector = () => vec(-1);
        f.engine.tick(1);
        expect(f.owner.RemoveModifierByName).toHaveBeenCalledWith("modifier_phantom_assassin_blur_active");
    });

    it("разлом Урсы ждёт посадку и предупреждение, а иммунная цель остаётся на месте", () => {
        const f = setup(["burrow"]);
        f.enemy.x = 355; f.enemy.immune = true;
        f.third.x = 340;
        f.engine.start(f.ability as never, 0);
        f.cast(0.05);
        f.owner.x = 305;
        f.engine.tick(0.45);
        f.engine.tick(0.6);
        expect(f.push).not.toHaveBeenCalled();
        f.engine.tick(0.9);
        expect(f.push.mock.calls.map(c => c[0])).toEqual([f.third]);
        expect(f.push.mock.calls[0][1]).toMatchObject({ x: -1 });
    });

    it("Урса следует к записанному следу, даже если враг свернул", () => {
        const f = setup(["trailhunt"]);
        f.owner.x = 395;
        f.attack(0); f.attack(0.3); f.attack(0.6);
        f.enemy.x = 750;
        f.engine.tick(0.8);
        f.enemy.y = 400;
        f.owner.x = 435;
        f.engine.tick(1);
        expect(f.push.mock.calls[0][0]).toBe(f.owner);
        expect(f.push.mock.calls[0][1]).toEqual(vec(1));
        f.engine.tick(1.2);
        expect(f.push).toHaveBeenCalledTimes(1);
    });

    it("лебёдка требует штатный Shackleshot именно от самой Лучницы", () => {
        const f = setup(["reel"]);
        f.cast(0, f.enemy);
        f.enemy.statuses.set("modifier_windrunner_shackle_shot", {
            GetName: () => "modifier_windrunner_shackle_shot", GetCaster: () => f.third,
        });
        f.engine.tick(0.3); f.attack(0.4);
        expect(f.push).not.toHaveBeenCalled();
        f.enemy.statuses.set("modifier_windrunner_shackle_shot", {
            GetName: () => "modifier_windrunner_shackle_shot", GetCaster: () => f.owner,
        });
        f.engine.tick(0.8); f.attack(1);
        expect(f.push.mock.calls[0][0]).toBe(f.owner);
        expect(f.push).toHaveBeenCalledTimes(1);
    });

    it("в открытой дуэли Windrun может перенести за спину героя", () => {
        const f = setup(["vault"]);
        vi.stubGlobal("GridNav", { IsTraversable: () => true, IsBlocked: () => false });
        f.enemy.x = 125;
        f.owner.statuses.set("modifier_windrunner_windrun", {});
        f.cast(0); f.engine.tick(0);
        f.owner.x = 45; f.engine.tick(0.2);
        expect(f.owner.x).toBe(290);
    });
});
