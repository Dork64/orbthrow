
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/vscripts/lib/registry", () => ({ registerModifier: (_name: string, cls: unknown) => cls }));

const point = (x = 0, y = 0, z = 0) => ({ x, y, z });
let time = 1;
let nextIndex = 0;
let nextParticle = 0;
let units: ReturnType<typeof unit>[];
let Lich: any, Snapfire: any, Tide: any;

function unit(team: number, x: number, y = 0) {
    const id = ++nextIndex;
    return {
        alive: true, immune: false, broken: false, rooted: false, buff: true, position: point(x, y),
        GetAbsOrigin() { return this.position; }, GetTeamNumber: () => team, IsRealHero: () => true,
        IsIllusion: () => false, IsAlive() { return this.alive; }, IsOutOfGame: () => false,
        IsInvulnerable: () => false, IsDebuffImmune() { return this.immune; }, IsMagicImmune: () => false,
        HasModifier() { return this.buff; }, PassivesDisabled() { return this.broken; }, IsRooted() { return this.rooted; },
        IsCurrentlyHorizontalMotionControlled: () => false, IsCurrentlyVerticalMotionControlled: () => false,
        IsStunned: () => false, IsHexed: () => false, HasScepter: () => false, GetForwardVector: () => point(1),
        GetAverageTrueAttackDamage: () => 200, GetMaxHealth: () => 2500, entindex: () => id, SwapAbilities: vi.fn(),
        AddNewModifier: vi.fn(() => ({ Destroy: vi.fn(), IsNull: vi.fn(() => false), SetStackCount: vi.fn() })),
    };
}

function fixture(Class: any, names: string[], extra: string[] = [], awake = false) {
    const hero = unit(2, 0), enemy = unit(3, 480), third = unit(4, 730);
    units = [hero, enemy, third];
    const m = new Class();
    m.GetParent = () => hero;
    m.owns = (id: string) => id.includes("_l_") || extra.includes(id);
    m.awake = () => awake;
    const skills = new Map(names.map(n => [n, {
        GetAbilityName: () => n, GetCursorTarget: () => enemy, GetCursorPosition: () => point(900),
        GetSpecialValueFor: (key: string) => ({ active_duration: 4, duration: n === t[3] ? 2.4 : 5, speed: 725, AbilityDuration: 6, jump_duration: 0.48 }[key] ?? 0),
        GetLevel: () => 1, SetHidden: vi.fn(), EndCooldown: vi.fn(), MarkAbilityButtonDirty: vi.fn(), GetCastPoint: () => 0.2, IsChanneling: () => false,
    }]));
    Object.assign(hero, { FindAbilityByName: (name: string) => skills.get(name) });
    const skill = (name: string) => skills.get(name)!;
    const details = (name: string) => ({ unit: hero, ability: skill(name) });
    const hit = (name: string, target = enemy, flags = 0) => m.OnTakeDamage({
        attacker: hero, unit: target, inflictor: skill(name), damage_flags: flags, damage: 150,
    });
    const tick = (at: number) => { time = at; m.OnIntervalThink(); };
    const cast = (name: string) => {
        m.OnAbilityExecuted?.(details(name));
        m.OnAbilityFullyCast(details(name));
    };
    return { m, hero, enemy, third, skill, details, hit, tick, cast };
}

beforeAll(async () => {
    for (const name of ["lich_legend", "lich_satellite", "snapfire_legend", "snapfire_scored", "tidehunter_legend", "tide_pressure"]) {
        vi.stubGlobal("modifier_orb_" + name, undefined);
    }
    Lich = (await import("../src/vscripts/modifiers/modifier_orb_lich_legend")).LichLegends;
    Snapfire = (await import("../src/vscripts/modifiers/modifier_orb_snapfire_legend")).SnapfireLegends;
    Tide = (await import("../src/vscripts/modifiers/modifier_orb_tidehunter_legend")).TidehunterLegends;
});

beforeEach(() => {
    time = 1;
    nextParticle = 0;
    const globals = {
        IsServer: () => true, IsValidEntity: () => true, Vector: point, GameRules: { GetGameTime: () => time },
        ParticleManager: { CreateParticle: vi.fn(() => ++nextParticle), SetParticleControl: vi.fn(),
            DestroyParticle: vi.fn(), ReleaseParticleIndex: vi.fn() },
        GetGroundPosition: (p: ReturnType<typeof point>) => point(p.x, p.y),
        GridNav: { IsTraversable: () => true, IsBlocked: () => false, CanFindPath: () => true },
        ApplyDamage: vi.fn(), SpawnEntityFromTableSynchronous: vi.fn(() => ({ SetAbsOrigin: vi.fn(), SetForwardVector: vi.fn(), SetAbsAngles: vi.fn() })),
        UTIL_Remove: vi.fn(), FindClearSpaceForUnit: (u: typeof units[number], p: ReturnType<typeof point>) => { u.position = p; },
        DamageFlag: { REFLECTION: 16, HPLOSS: 128, NO_SPELL_AMPLIFICATION: 32, NO_SPELL_LIFESTEAL: 64 },
        DamageTypes: { MAGICAL: 2, PHYSICAL: 1 }, UnitTargetTeam: { ENEMY: 2 }, UnitTargetType: { HERO: 1 },
        UnitTargetFlags: { NONE: 0 }, FindOrder: { ANY: 1 }, ParticleAttachment: { WORLDORIGIN: 0 },
        FindUnitsInRadius: (_team: number, p: ReturnType<typeof point>, _cache: unknown, radius: number) =>
            units.filter(u => Math.hypot(u.position.x - p.x, u.position.y - p.y) <= radius),
        FindUnitsInLine: (_team: number, a: ReturnType<typeof point>, b: ReturnType<typeof point>, _cache: unknown, width: number) =>
            units.filter(u => {
                const dx = b.x - a.x, dy = b.y - a.y;
                const t = Math.max(0, Math.min(1, ((u.position.x - a.x) * dx + (u.position.y - a.y) * dy) / (dx * dx + dy * dy)));
                return Math.hypot(u.position.x - a.x - dx * t, u.position.y - a.y - dy * t) <= width;
            }),
    };
    Object.entries(globals).forEach(([key, value]) => vi.stubGlobal(key, value));
});
afterAll(() => vi.unstubAllGlobals());

const l = ["lich_frost_nova", "lich_frost_shield", "lich_sinister_gaze", "lich_chain_frost"];
const s = ["snapfire_scatterblast", "snapfire_firesnap_cookie", "snapfire_lil_shredder", "snapfire_mortimer_kisses",
    "orb_snapfire_bank", "orb_snapfire_spring"];
const t = ["tidehunter_gush", "tidehunter_kraken_shell", "tidehunter_anchor_smash", "tidehunter_ravage", "orb_tide_anchor_return", "orb_tide_shell_release"];

describe("Лич", () => {
    it("трещина создаётся один раз по основной цели, и из неё можно выйти", () => {
        const f = fixture(Lich, l, ["lich_p_cold", "lich_p_blast"]);
        f.m.OnAbilityStart(f.details(l[0]));
        f.hit(l[0], f.third);
        f.hit(l[0]);
        f.hit(l[0]);
        f.enemy.position = point(80);
        f.third.position = point(510);
        expect(SpawnEntityFromTableSynchronous).toHaveBeenCalledWith("prop_dynamic",
            expect.objectContaining({ model: expect.stringContaining("ice_fracture") }));
        f.third.position = point(510, 80);
        f.enemy.position = point(480, -180);
        f.tick(1.54);
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.tick(1.56);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.third, damage: 585 }));
        expect(UTIL_Remove).toHaveBeenCalledTimes(1);
    });

    it("два удара в обмене под щитом запускают веер один раз", () => {
        const f = fixture(Lich, l);
        f.skill(l[1]).GetCursorTarget = () => f.hero;
        f.cast(l[1]);
        f.m.OnAttackLanded({ attacker: f.enemy, target: f.hero });
        f.m.OnAttackLanded({ attacker: f.hero, target: f.enemy });
        f.tick(1.7);
        expect(vi.mocked(ApplyDamage).mock.calls.filter(([d]) => d.victim === f.enemy)).toHaveLength(1);
    });

    it("прерывание Gaze отменяет зеркало, полный канал оставляет телеграф", () => {
        const f = fixture(Lich, l);
        f.cast(l[2]);
        f.tick(1.8);
        f.m.OnAbilityEndChannel({ ...f.details(l[2]), interrupted: 1 });
        f.tick(3);
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.cast(l[2]);
        f.tick(4.1);
        f.m.OnAbilityEndChannel(f.details(l[2]));
        f.tick(5);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({ victim: f.enemy, damage: 390 }));
    });

    it("спутник срабатывает в дуэли, фиксирует точку и бьёт один раз при пробуждении", () => {
        const f = fixture(Lich, l, [], true);
        f.third.position = point(2000);
        f.cast(l[3]);
        f.hit(l[3]);
        f.hit(l[3], f.third);
        expect(f.enemy.AddNewModifier).toHaveBeenCalledTimes(1);
        expect(f.third.AddNewModifier).not.toHaveBeenCalled();
        f.tick(2.7);
        f.tick(3.6);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 650 }));
        expect(UTIL_Remove).toHaveBeenCalledTimes(2);
    });

    it("из точки пикирования можно уйти, а сильное развеивание убирает спутник и предупреждение", () => {
        const f = fixture(Lich, l);
        f.third.position = point(2000);
        f.cast(l[3]);
        f.hit(l[3]);
        f.tick(2.7);
        f.enemy.position = point(900);
        f.tick(3.6);
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.cast(l[3]);
        f.hit(l[3]);
        f.tick(5.3);
        vi.mocked(f.enemy.AddNewModifier).mock.results[1].value.IsNull.mockReturnValue(true);
        f.tick(6.3);
        expect(ApplyDamage).not.toHaveBeenCalled();
        expect(ParticleManager.DestroyParticle).toHaveBeenCalledTimes(2);
    });
});

describe("Снэпфайр", () => {
    it("второй выстрел направляется от старой позиции и срабатывает один раз", () => {
        const f = fixture(Snapfire, s);
        f.cast(s[0]);
        f.hero.position = point(-200, -600);
        f.enemy.position = point(220);
        f.m.Bank(point(1500));
        f.m.Bank(point(1500));
        f.tick(1.65);
        expect(ApplyDamage).toHaveBeenCalledTimes(2);
        expect(f.hero.SwapAbilities).toHaveBeenLastCalledWith(s[4], s[0], false, true);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({ victim: f.enemy, damage: 540 }));
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({ victim: f.third, damage: 385 }));
        expect(UTIL_Remove).toHaveBeenCalled();
    });

    it("пружина открывается после своего прыжка; рут не расходует повторный W", () => {
        const f = fixture(Snapfire, s, ["snap_p_fullbelly"]);
        f.skill(s[1]).GetCursorTarget = () => f.hero;
        f.cast(s[1]);
        f.hero.position = point(425);
        f.tick(1.5);
        f.hero.rooted = true;
        f.m.Spring(point(1500));
        expect(f.hero.AddNewModifier).not.toHaveBeenCalled();
        f.hero.rooted = false;
        f.m.Spring(point(1500));
        expect(f.hero.AddNewModifier).toHaveBeenCalledWith(f.hero, f.skill(s[1]), "modifier_knockback",
            expect.objectContaining({ knockback_distance: 495 }));
        f.hero.position = point(920);
        f.tick(2);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({ victim: f.third, damage: 345 }));
        f.m.OnAttackLanded({ attacker: f.hero, target: f.third });
        f.m.OnAttackLanded({ attacker: f.hero, target: f.third });
        expect(ApplyDamage).toHaveBeenCalledTimes(2);
        expect(ApplyDamage).toHaveBeenLastCalledWith(expect.objectContaining({ victim: f.third, damage: 185, damage_type: 1 }));
    });

    it("турель стреляет на второй настоящий патрон, даже если бафф закончился до попадания", () => {
        const f = fixture(Snapfire, s);
        f.cast(s[2]);
        const event = { attacker: f.hero, target: f.enemy, record: 1 };
        f.m.OnAttackRecord(event);
        f.m.OnAttackLanded(event);
        f.tick(1.2);
        f.m.OnAttackRecord({ ...event, record: 2 });
        f.hero.buff = false;
        f.m.OnAttackLanded({ ...event, record: 2 });
        f.m.OnAttackLanded({ ...event, record: 2 });
        f.tick(1.85);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage_type: 1, damage: 180 }));
    });

    it("батарея взрывается по очереди и не удваивает урон при переходе между точками", () => {
        const f = fixture(Snapfire, s, ["snap_p_napalm"]);
        f.enemy.position = point(540, -230);
        f.cast(s[3]);
        f.tick(2.2);
        f.enemy.position = point(900, 230);
        f.tick(2.8);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 385 }));
    });
});

describe("Тайд", () => {
    it("отлив создаётся только от первого настоящего героя и не повторяет урон вдоль полосы", () => {
        const f = fixture(Tide, t);
        f.third.position = point(320);
        f.cast(t[0]);
        f.hit(t[0], f.third, 16);
        f.hit(t[0]);
        f.hit(t[0], f.third);
        for (const at of [1.75, 1.8, 1.9, 2.2, 3.3]) f.tick(at);
        expect(ApplyDamage).toHaveBeenCalledTimes(2);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({ victim: f.third, damage: 315 }));
        expect(UTIL_Remove).toHaveBeenCalledTimes(vi.mocked(SpawnEntityFromTableSynchronous).mock.calls.length);
        expect(ParticleManager.DestroyParticle).toHaveBeenCalledTimes(vi.mocked(ParticleManager.CreateParticle).mock.calls.length);
        expect(ParticleManager.ReleaseParticleIndex).toHaveBeenCalledTimes(vi.mocked(ParticleManager.CreateParticle).mock.calls.length);
    });

    it("панцирь копит до блока, срабатывает с кнопки и автоматически и учитывает Break", () => {
        const f = fixture(Tide, t, ["tide_p_spikes"]);
        const damage = { attacker: f.enemy, unit: f.hero, damage_flags: 0, original_damage: 1000, damage: 2 };
        f.enemy.position = point(220);
        f.cast(t[1]);
        f.m.OnTakeDamage(damage);
        f.tick(1.5);
        f.m.ReleaseShell();
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.tick(2);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 700 }));
        f.cast(t[1]);
        f.hero.broken = true;
        f.tick(6.1);
        f.tick(6.6);
        expect(ApplyDamage).toHaveBeenCalledTimes(1);
        f.hero.broken = false;
        f.cast(t[1]);
        f.tick(10.7);
        f.tick(11.2);
        expect(ApplyDamage).toHaveBeenCalledTimes(2);
        expect(ApplyDamage).toHaveBeenLastCalledWith(expect.objectContaining({ victim: f.enemy, damage: 225 }));
    });

    it("якорь пропадает при смерти, возврат при валидном пути наносит один удар", () => {
        const f = fixture(Tide, t);
        f.enemy.position = point(100);
        f.cast(t[2]);
        f.hero.position = point(610);
        f.m.ReturnToAnchor();
        f.tick(1.4);
        expect(f.hero.position.x).toBe(0);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 270 }));
        f.cast(t[2]);
        f.m.OnDeath({ unit: f.hero });
        f.m.ReturnToAnchor();
        f.tick(2);
        expect(ApplyDamage).toHaveBeenCalledTimes(1);
    });

    it("водоворот оставляет безопасный глаз и учитывает иммунитет и единственное попадание", () => {
        const f = fixture(Tide, t);
        f.enemy.position = point(200);
        f.third.position = point(770);
        f.third.immune = true;
        f.cast(t[3]);
        f.tick(5.09);
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.third.immune = false;
        f.tick(5.18);
        f.tick(5.25);
        f.tick(6.5);
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.third, damage: 345 }));
    });
});
