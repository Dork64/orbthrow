import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UPGRADE_DEFS } from "../src/vscripts/core/orbdata";

vi.mock("../src/vscripts/lib/registry", () => ({ registerModifier: (_: string, cls: unknown) => cls }));
const ROT = "pudge_rot", HEAP = "pudge_flesh_heap", ULT = "pudge_dismember", COUNTER = "orb_pudge_counter";
let Pudge: any, at = 0;
const v = (x = 0, y = 0, z = 0) => ({ x, y, z });

function fixture(awake = false) {
    const skill = (name: string) => ({
        on: false, channel: false, start: 0, radius: 250, SetLevel: vi.fn(), duration: 2.75,
        GetAbilityName: () => name, GetLevel: () => 4, GetToggleState() { return this.on; },
        GetChannelTime() { return this.duration; }, GetChannelStartTime() { return this.start; },
        IsChanneling() { return this.channel; }, GetSpecialValueFor() { return this.radius; },
        SetHidden: vi.fn(), MarkAbilityButtonDirty: vi.fn(),
    });
    const skills = new Map([ROT, HEAP, ULT, COUNTER].map(name => [name, skill(name)]));
    const modifier = (caster?: unknown, ability?: unknown, duration = 0) => ({
        GetRemainingTime: () => duration,
        GetCaster: () => caster, GetAbility: () => ability,
        IsNull: () => false, Destroy: vi.fn(), SetStackCount: vi.fn(),
    });
    function unit(id: number, team: number, x: number) {
        const mods = new Map<string, ReturnType<typeof modifier>>();
        return {
            pos: v(x), immune: false, ghost: false, alive: true, hero: true, root: false, stunned: false,
            GetAbsOrigin() { return this.pos; }, SetAbsOrigin(p: ReturnType<typeof v>) { this.pos = p; },
            GetTeamNumber: () => team, entindex: () => id, GetHealth: () => 500, GetMaxHealth: () => 2000,
            IsRealHero() { return this.hero; }, IsAlive() { return this.alive; }, IsDebuffImmune() { return this.immune; },
            IsAttackImmune() { return this.ghost; }, IsRooted() { return this.root; }, IsStunned() { return this.stunned; },
            IsInvulnerable: () => false, IsOutOfGame: () => false, IsIllusion: () => false,
            IsCurrentlyHorizontalMotionControlled: () => false, GetIdealSpeed: () => 400,
            mods, FindModifierByName: (key: string) => mods.get(key), HasModifier: (key: string) => mods.has(key),
            AddNewModifier: vi.fn((caster, ab, key, kv) => {
                const m = modifier(caster, ab, kv.duration);
                mods.set(key, m);
                return m;
            }),
        };
    }
    const h = { ...unit(1, 2, 0), FindAbilityByName: (n: string) => skills.get(n),
        SwapAbilities: vi.fn(), Heal: vi.fn(), GetStrength: () => 100 };
    const foe = unit(2, 3, 175), extra = unit(3, 4, 500), creep = unit(4, 3, 160);
    creep.hero = false;
    vi.stubGlobal("FindUnitsInRadius", (team: number, p: ReturnType<typeof v>, _cache: unknown, range: number) =>
        [h, foe, extra, creep].filter(u => u.GetTeamNumber() !== team && Math.hypot(p.x - u.pos.x, p.y - u.pos.y) <= range)
            .sort((a, b) => Math.abs(p.x - a.pos.x) - Math.abs(p.x - b.pos.x)));
    const m = new Pudge();
    m.GetParent = () => h;
    const code: Record<string, number> = { pudge_l_mire: 1, pudge_l_heap: 1, pudge_l_dismember: 1 };
    m.bonuses = () => ({ awake, code });
    const rot = skills.get(ROT)!;
    const heap = skills.get(HEAP)!;
    const ult = skills.get(ULT)!;
    const counter = skills.get(COUNTER)!;
    const tick = (t: number) => { at = t; m.OnIntervalThink(); };
    const startHeap = () => {
        h.mods.set("modifier_pudge_flesh_heap_block", modifier(h, heap, 7));
        m.OnAbilityFullyCast({ unit: h, ability: heap });
    };
    const startDrag = (block = false, victim = foe) => {
        ult.channel = true;
        ult.start = at;
        if (!block) victim.mods.set("modifier_pudge_dismember", modifier(h, ult, 2.75));
        m.OnAbilityExecuted({ unit: h, ability: ult, target: victim });
    };
    return { h, foe, extra, creep, m, tick, rot, heap, ult, counter, startHeap, startDrag, code };
}

beforeAll(async () => {
    for (const n of ["legend", "chew_mark", "clutch", "locked_jaws", "rot_ready", "rot_mark", "rot_fuse", "rot_recovery", "counter_store", "counter_hit", "dragging", "drag_victim"])
        vi.stubGlobal("modifier_orb_pudge_" + n, null);
    Pudge = (await import("../src/vscripts/modifiers/modifier_orb_pudge_legend")).PudgeLegends;
});
beforeEach(() => {
    at = 0;
    const model = { SetAbsOrigin: vi.fn(), SetLocalScale: vi.fn() };
    for (const [key, value] of Object.entries({
        IsServer: () => true, IsValidEntity: () => true, Vector: v, GameRules: { GetGameTime: () => at },
        ParticleAttachment: { WORLDORIGIN: 1 }, ParticleManager: {
            CreateParticle: vi.fn(() => 4), SetParticleControl: vi.fn(), DestroyParticle: vi.fn(), ReleaseParticleIndex: vi.fn(),
        },
        GridNav: { IsTraversable: vi.fn(() => true), IsBlocked: () => false, CanFindPath: () => true },
        GetGroundPosition: (p: unknown) => p, ApplyDamage: vi.fn(() => 200), StartSoundEventFromPosition: vi.fn(), UTIL_Remove: vi.fn(),
        SpawnEntityFromTableSynchronous: vi.fn(() => model),
        DamageTypes: { PHYSICAL: 1, MAGICAL: 2 },
        DamageFlag: { HPLOSS: 32, REFLECTION: 16, NO_SPELL_AMPLIFICATION: 1024, NO_SPELL_LIFESTEAL: 4096 },
        UnitOrder: { MOVE_TO_POSITION: 1, STOP: 21 }, UnitTargetTeam: {}, UnitTargetType: {}, UnitTargetFlags: {}, FindOrder: {},
    })) vi.stubGlobal(key, value);
});
afterAll(() => vi.unstubAllGlobals());

describe("легендарки Пуджа", () => {
    it("у Пуджа остались четыре ветки, а Q использует прежний крюк", () => {
        const legends = UPGRADE_DEFS.filter(o => o.hero === "npc_dota_hero_pudge" && o.rarity === "legend");
        expect(legends.map(x => [x.branch, x.id])).toEqual([
            ["Q", "pudge_l_hook"], ["W", "pudge_l_mire"], ["E", "pudge_l_heap"], ["R", "pudge_l_dismember"],
        ]);
    });

    it("W требует непрерывного контакта, затем взрывается на земле и уважает BKB", () => {
        const f = fixture();
        f.rot.on = true;
        f.tick(0);
        f.foe.pos = v(380); f.tick(0.8);
        f.foe.pos = v(170); f.tick(0.9); f.tick(1.6);
        f.rot.on = false; f.tick(1.65);
        expect(SpawnEntityFromTableSynchronous).not.toHaveBeenCalled();
        f.rot.on = true; f.tick(1.8); f.tick(3.35);
        f.rot.on = false; f.tick(3.4);
        expect(SpawnEntityFromTableSynchronous).toHaveBeenCalledTimes(1);
        f.foe.pos = v(480);
        f.extra.pos = v(250);
        f.extra.immune = true;
        f.tick(4);
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.tick(4.1);
        expect(ApplyDamage).not.toHaveBeenCalled();
        expect(UTIL_Remove).toHaveBeenCalledTimes(1);
        f.rot.on = true; f.tick(4.15); f.tick(6);
        f.rot.on = false; f.tick(6.05);
        expect(SpawnEntityFromTableSynchronous).toHaveBeenCalledTimes(1);
    });

    it("W с большим радиусом Rot заряжает на дистанции и повреждает нескольких героев", () => {
        const f = fixture(true);
        f.foe.pos = v(400); f.extra.pos = v(505);
        f.rot.radius = 450;
        f.rot.on = true; f.tick(1); f.tick(2.15);
        f.rot.on = false; f.tick(2.16); f.tick(2.82);
        expect(vi.mocked(ApplyDamage).mock.calls.map(([d]) => [d.victim, d.damage])).toEqual([[f.foe, 380], [f.extra, 380]]);
    });

    it("E учитывает только урон врагов и тратит заряд на одну обычную атаку по герою", () => {
        const f = fixture();
        f.startHeap();
        for (const [attacker, damage, damage_flags] of [[f.h, 2000, 0], [f.creep, 2000, 0], [f.foe, 2000, 16], [f.foe, 2000, 0]])
            f.m.OnTakeDamage({ unit: f.h, attacker, damage, damage_flags });
        f.tick(0.1);
        expect(f.h.mods.get("modifier_orb_pudge_counter_store")!.SetStackCount).toHaveBeenLastCalledWith(600);
        expect(f.h.SwapAbilities).toHaveBeenCalledWith(HEAP, COUNTER, false, true);
        f.m.ArmCounter(f.counter);
        f.m.OnAttackLanded({ attacker: f.h, target: f.creep, damage: 200 });
        f.m.OnAttackLanded({ attacker: f.h, target: f.foe, damage: 200, no_attack_cooldown: true });
        f.foe.ghost = true;
        f.m.OnAttackLanded({ attacker: f.h, target: f.foe, damage: 200 });
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.foe.ghost = false;
        f.m.OnAttackLanded({ attacker: f.h, target: f.foe, damage: 200 });
        f.m.OnAttackLanded({ attacker: f.h, target: f.foe, damage: 200 });
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.foe, damage: 600 }));
        expect(f.h.Heal).toHaveBeenCalledExactlyOnceWith(90, f.counter);
        expect(f.h.SwapAbilities).toHaveBeenLastCalledWith(COUNTER, HEAP, false, true);
    });

    it("R перемещает обоих, останавливается под рутом и наносит укус один раз в конце", () => {
        const f = fixture();
        f.startDrag();
        f.tick(0.05);
        expect(f.m.order({ order_type: 1, position_x: 650, position_y: 0, position_z: 0, queue: 0 })).toBe(false);
        f.tick(0.1);
        expect(f.h.pos.x).toBeCloseTo(11);
        expect(f.foe.pos.x).toBeCloseTo(186);
        f.h.root = true; f.tick(0.15);
        expect(f.h.pos.x).toBeCloseTo(11);
        expect(f.m.order({ order_type: 21 })).toBe(true);
        at = 2.75;
        f.m.OnAbilityEndChannel({ unit: f.h, ability: f.ult, interrupted: false });
        f.m.OnAbilityEndChannel({ unit: f.h, ability: f.ult, interrupted: false });
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.foe, damage: 180 }));
    });

    it("R не захватывает жертву через Linken и не кусает после прерывания", () => {
        const f = fixture();
        f.startDrag(true);
        f.tick(0.26);
        expect(f.m.order({ order_type: 1, queue: 0 })).toBe(true);
        f.startDrag();
        f.tick(0.31);
        vi.mocked(GridNav.IsTraversable).mockReturnValue(false);
        f.m.order({ order_type: 1, position_x: 650, position_y: 0, position_z: 0, queue: 0 });
        f.tick(0.36);
        expect(f.h.pos.x).toBe(0);
        at = 3.01;
        f.m.OnAbilityEndChannel({ unit: f.h, ability: f.ult, interrupted: 1 });
        expect(ApplyDamage).not.toHaveBeenCalled();
    });
});

it("фиолетовые R работают со штатным захватом и с легендарным последним укусом", () => {
    for (const legendary of [false, true]) {
        const f = fixture();
        Object.assign(f.code, { pudge_l_dismember: Number(legendary), pudge_p_bulk: 1, pudge_p_chew: 1 });
        at = 0;
        f.startDrag();
        f.tick(0.05);
        expect(f.m.GetModifierIncomingDamage_Percentage({ attacker: f.extra })).toBe(-25);
        expect(f.m.GetModifierIncomingDamage_Percentage({ attacker: f.creep })).toBe(0);
        expect(f.m.order({ order_type: 1, position_x: 650, position_y: 0, position_z: 0, queue: 0 })).toBe(!legendary);
        if (legendary) {
            f.tick(0.1);
            expect(f.h.pos.x).toBeCloseTo(12);
        }
        at = 2.75;
        f.ult.channel = false;
        f.m.OnAbilityEndChannel({ unit: f.h, ability: f.ult, interrupted: false });
        expect(f.m.GetModifierIncomingDamage_Percentage({ attacker: f.extra })).toBe(0);
        if (!legendary) {
            expect(ApplyDamage).not.toHaveBeenCalled();
            f.m.OnAttackLanded({ attacker: f.h, target: f.extra, damage: 100 });
            expect(ApplyDamage).not.toHaveBeenCalled();
        }
        f.m.OnAttackLanded({ attacker: f.h, target: f.foe, damage: 100 });
        f.m.OnAttackLanded({ attacker: f.h, target: f.foe, damage: 100 });
        expect(vi.mocked(ApplyDamage).mock.calls.map(([d]) => d.damage)).toEqual(legendary ? [180, 160] : [160]);
        expect(f.h.Heal).toHaveBeenCalledExactlyOnceWith(100, f.ult);
        vi.mocked(ApplyDamage).mockClear();
    }
});

it("замедление Flesh Heap работает до легендарки без появления кнопки ответа", () => {
    const f = fixture();
    Object.assign(f.code, { pudge_l_heap: 0, pudge_p_glutton: 1 });
    f.startHeap();
    f.m.OnTakeDamage({ unit: f.h, attacker: f.foe, damage: 300, damage_flags: 0 });
    f.tick(0.1);
    f.m.OnAttackLanded({ attacker: f.h, target: f.foe, damage: 100 });
    f.m.OnAttackLanded({ attacker: f.h, target: f.foe, damage: 100 });
    expect(f.h.SwapAbilities).not.toHaveBeenCalled();
    expect(f.foe.AddNewModifier).toHaveBeenCalledExactlyOnceWith(f.h, f.heap, "modifier_orb_pudge_clutch", { duration: 1.4 });
});
