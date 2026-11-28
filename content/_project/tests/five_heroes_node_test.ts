import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { FxEngine } from "../src/vscripts/lib/fxengine";
import { computeBonuses } from "../src/vscripts/core/orbstore";
import { fxOfOrb } from "../src/vscripts/core/fxutil";
import { UPGRADE_DEFS } from "../src/vscripts/core/orbdata";
import { HERO_POOL } from "../src/vscripts/core/heroes";

const heroes = ["puck", "slark", "razor", "necrolyte", "sand_king"];
afterEach(() => vi.unstubAllGlobals());

describe("новая пятёрка", () => {
    it("все герои доступны, у каждого 12 синих, 8 обычных фиолетовых, 4 механики, 4 легендарки", () => {
        expect(HERO_POOL.length).toBe(32);
        const list = readFileSync("game/scripts/npc/herolist.txt", "utf8");
        for (const name of heroes) {
            const hero = "npc_dota_hero_" + name;
            expect(HERO_POOL.includes(hero)).toBe(true);
            expect(list.includes('"' + hero + '"')).toBe(true);
            const defs = UPGRADE_DEFS.filter(o => o.hero === hero);
            expect(defs.filter(o => o.rarity === "blue").length).toBe(12);
            expect(defs.filter(o => o.rarity === "purple" && !o.mech).length).toBe(8);
            expect(defs.filter(o => o.rarity === "purple" && o.mech).length).toBe(4);
            expect(defs.filter(o => o.rarity === "legend").length).toBe(4);
        }
    });
    it("зоны не накапливаются, комбо имеют КД, постоянные бонусы ограничены", () => {
        for (const hero of heroes) {
            for (const orb of UPGRADE_DEFS.filter(o => o.hero === "npc_dota_hero_" + hero)) {
                for (const f of fxOfOrb(orb.id)) {
                    if (f.t === "combo") { expect(f.icd).toBeGreaterThanOrEqual(8); expect(f.need).toBeGreaterThanOrEqual(2); }
                    if (f.t === "zone") { expect(f.every).toBeGreaterThanOrEqual(1); expect(Number(f.dur)).toBeLessThanOrEqual(6); }
                    if (f.t === "tether") expect(f.breakRange).toBeLessThanOrEqual(800);
                    if (f.t === "kill" && f.stack) expect(f.stack.max).toBeLessThanOrEqual(5);
                }
            }
        }
    });
});

function harness(...orbs: string[]) {
    let now = 0;
    let hasLink = true;
    let shivCaster: unknown;
    let parent: Record<string, unknown>;
    const activeMarks: { IsNull: () => boolean; Destroy: () => void }[] = [];
    const target = {
        position: 400, valid: true, real: true, GetMaxHealth: () => 1000, GetHealth: () => 1000,
        entindex: () => 21,
        IsAlive: () => true, IsRealHero() { return this.real; }, IsBuilding: () => false,
        GetTeamNumber: () => 3, GetAbsOrigin() { return this.position; },
        IsInvulnerable: () => false, IsMagicImmune: () => false, IsDebuffImmune: () => false,
        FindModifierByName: () => undefined, AddNewModifier: vi.fn(() => {
            let killed = false;
            const mod = { IsNull: () => killed, Destroy: () => { killed = true; } };
            activeMarks.push(mod);
            return mod;
        }),
        FindAllModifiers: () => [
            { GetName: () => "modifier_slark_pounce_leash", GetCaster: () => parent },
            { GetName: () => "modifier_slark_saltwater_shiv_impact_slow", GetCaster: () => shivCaster },
        ],
    };
    const ability = { GetAbilityName: () => "", GetCursorPosition: () => 0, GetLevel: () => 4, IsItem: () => false,
        IsPassive: () => false, GetLevelSpecialValueNoOverride: () => 0, GetMaxAbilityCharges: () => 0, GetCooldown: () => 0 };
    const owner = {
        GetTeamNumber: () => 2, GetAbsOrigin: () => 0, IsAlive: () => true,
        IsHero: () => true, GetStrength: () => 35, GetAverageTrueAttackDamage: () => 100,
        FindAbilityByName: () => ability, AddNewModifier: vi.fn(), Heal: vi.fn(), GetMaxHealth: () => 1000,
        FindAllModifiers: () => hasLink ? [{ GetName: () => "modifier_razor_static_link", GetCaster: () => parent }] : [],
    };
    parent = owner;
    const particles = { CreateParticle: vi.fn(() => 1), SetParticleControl: vi.fn(), DestroyParticle: vi.fn(), ReleaseParticleIndex: vi.fn() };
    const damage = vi.fn(() => 25);
    vi.stubGlobal("GameRules", { GetGameTime: () => now });
    vi.stubGlobal("IsValidEntity", (entity: { valid?: boolean }) => entity.valid !== false);
    vi.stubGlobal("ParticleManager", particles);
    for (const name of ["ParticleAttachment", "UnitTargetTeam", "UnitTargetType", "UnitTargetFlags", "FindOrder", "DamageTypes", "DamageFlag"])
        vi.stubGlobal(name, new Proxy({}, { get: () => 1 }));
    vi.stubGlobal("Vector", () => 0);
    vi.stubGlobal("ApplyDamage", damage);
    vi.stubGlobal("FindUnitsInRadius", () => [target]);
    const engine = new FxEngine(parent as never);
    engine.refresh(computeBonuses(Object.fromEntries(orbs.map(id => [id, 1])), 2));
    return { engine, raw: engine as any, parent: owner, target, damage, particles, activeMarks,
        cast: (name: string, withTarget = false) => engine.onCast({ ...ability, GetAbilityName: () => name } as never, withTarget ? target as never : undefined),
        dealt: (name: string) => engine.onDealt({ unit: target, inflictor: { ...ability, GetAbilityName: () => name }, damage: 45, damage_flags: 0 } as never),
        attack: () => engine.onAttack({ target, damage: 100 } as never),
        shiv: (own: boolean) => { shivCaster = own ? owner : {}; },
        taken: (amount: number) => engine.onTaken({ attacker: target, damage: amount, damage_flags: 0 } as never),
        time: (value: number) => { now = value; }, link: (value: boolean) => { hasLink = value; } };
}

// JS не поддерживает операторы векторов Доты; для этих одномерных проверок длина числа — его модуль.
function withScalarVectors(run: () => void) {
    Object.defineProperty(Number.prototype, "Length2D", { configurable: true, value: function () { return Math.abs(Number(this)); } });
    try { run(); } finally { delete (Number.prototype as any).Length2D; }
}

describe("исполнение новых механик", () => {
    it("метка от Orb переживает его повторный тик, сгорает от второго каста и не срабатывает ещё раз", () => {
        const f = harness("puck_l_binary");
        const orb = "puck_illusory_orb";
        f.cast(orb); f.dealt(orb);
        f.time(0.7); f.dealt(orb);
        expect(f.damage).not.toHaveBeenCalled();
        f.time(1); f.cast(orb); f.dealt(orb); f.dealt(orb);
        expect(f.damage).toHaveBeenCalledTimes(1);
        expect(f.damage.mock.calls[0][0]).toMatchObject({ damage: 150, damage_flags: 0 });
        expect(f.activeMarks[0].IsNull()).toBe(true);
    });
    it("снятую метку нельзя взорвать даже правильным вторым заклинанием", () => {
        const f = harness("puck_l_dreamgarden");
        f.dealt("puck_dream_coil");
        f.activeMarks[0].Destroy();
        f.time(1); f.dealt("puck_waning_rift");
        expect(f.damage).not.toHaveBeenCalled();
    });
    it("обычная и легендарная версии Sand Storm дают одно кольцо, первый удар не повторяется после выхода", () => withScalarVectors(() => {
        const f = harness("sand_m_quicksand", "sand_l_glass");
        f.cast("sandking_sand_storm");
        expect(f.raw.zones.length).toBe(1);
        f.raw.combatTick(1);
        f.target.position = 150; f.raw.combatTick(2);
        f.target.position = 400; f.raw.combatTick(3);
        expect(f.damage.mock.calls.map(call => call[0].damage)).toEqual([165, 40]);
    }));
    it("выход из диапазона сбрасывает серию Link, разряд появляется только после двух новых тиков", () => withScalarVectors(() => {
        const f = harness("razor_l_tension");
        f.cast("razor_static_link", true);
        f.raw.combatTick(1);
        f.target.position = 120; f.raw.combatTick(2);
        f.target.position = 400; f.raw.combatTick(3); f.raw.combatTick(4); f.raw.combatTick(5);
        expect(f.damage.mock.calls.map(call => call[0].damage)).toEqual([55, 55, 235, 55]);
    }));
    it("повторное применение заменяет зону, смерть убирает её частицы", () => {
        const f = harness("sand_l_glass");
        f.cast("sandking_sand_storm");
        f.cast("sandking_sand_storm");
        expect(f.raw.zones.length).toBe(1);
        expect(f.particles.DestroyParticle).toHaveBeenCalledTimes(2);
        f.engine.clearCombat();
        expect(f.raw.zones.length).toBe(0);
        expect(f.particles.DestroyParticle).toHaveBeenCalledTimes(4);
    });
    it("зона не бьёт по безопасному центру и крипам; после истечения не выдаёт пропущенные тики", () => withScalarVectors(() => {
        const f = harness("sand_l_glass");
        f.cast("sandking_sand_storm");
        f.raw.combatTick(1);
        expect(f.damage).toHaveBeenCalledTimes(1);
        f.target.position = 100;
        f.raw.combatTick(2);
        f.target.position = 400;
        f.target.real = false;
        f.raw.combatTick(3);
        f.target.real = true;
        f.raw.combatTick(10);
        expect(f.damage).toHaveBeenCalledTimes(1);
        expect(f.raw.zones.length).toBe(0);
    }));
    it("связь окончательно обрывается при уходе за 800 или потере штатного Link", () => withScalarVectors(() => {
        const f = harness("razor_l_tension");
        f.cast("razor_static_link", true);
        f.raw.combatTick(1);
        expect(f.damage).toHaveBeenCalledTimes(1);
        f.target.position = 850;
        f.raw.combatTick(2);
        f.target.position = 400;
        f.raw.combatTick(3);
        expect(f.damage).toHaveBeenCalledTimes(1);
        f.time(4); f.cast("razor_static_link", true); f.link(false);
        f.raw.combatTick(5);
        expect(f.raw.tethers.size).toBe(0);
    }));
    it("после смерти отложенный Pounce не создаёт новую связь", () => {
        const f = harness("slark_l_silentduel");
        f.cast("slark_pounce");
        expect(f.raw.pending.length).toBe(1);
        f.engine.clearCombat();
        f.raw.pending[0].run();
        expect(f.raw.tethers.size).toBe(0);
    });
    it("смерть сбрасывает незавершённое комбо, но не его внутренний КД", () => {
        const f = harness("puck_l_parallax");
        f.cast("puck_phase_shift"); f.time(1); f.cast("puck_ethereal_jaunt");
        expect(f.parent.AddNewModifier).toHaveBeenCalledTimes(3);
        f.engine.clearCombat();
        f.time(2); f.cast("puck_phase_shift"); f.cast("puck_ethereal_jaunt");
        expect(f.parent.AddNewModifier).toHaveBeenCalledTimes(5);
    });
});

describe("дуэльные легендарки", () => {
    it("легендарная атака Сларка требует свой Shiv, повтор не проходит внутренний КД", () => {
        const f = harness("slark_l_rhythm");
        f.shiv(false); f.attack();
        expect(f.parent.Heal).not.toHaveBeenCalled();
        f.shiv(true); f.attack(); f.attack();
        expect(f.parent.Heal).toHaveBeenCalledExactlyOnceWith(30, expect.anything());
    });

    it("Razor получает часть бонуса Q даже без обратной волны", () => {
        const f = harness("razor_l_horizon");
        f.cast("razor_plasma_field"); f.dealt("razor_plasma_field");
        expect(f.damage.mock.calls.map(call => call[0].damage)).toEqual([65]);
        f.time(0.6); f.dealt("razor_plasma_field");
        expect(f.damage.mock.calls.map(call => call[0].damage)).toEqual([65, 160]);
    });
});

function wireHarness(awake = false) {
    const f = harness(...(awake ? ["zeus_l_chain", "awake"] : ["zeus_l_chain"]));
    const vector = (x: number, y: number, z = 0) => ({ x, y, z });
    let owner = vector(0, 0);
    let enemy = vector(200, 50);
    let immune = false;
    let rooted = false;
    const shove = vi.fn();
    const move = vi.fn();
    Object.assign(f.parent, { GetAbsOrigin: () => owner, IsRooted: () => rooted, HasModifier: () => false });
    Object.assign(f.target, { GetAbsOrigin: () => enemy, IsDebuffImmune: () => immune });
    f.raw.shove = shove;
    vi.stubGlobal("Vector", vector);
    vi.stubGlobal("FindClearSpaceForUnit", move);
    vi.stubGlobal("EmitSoundOn", vi.fn());
    return {
        ...f, shove, move,
        position: (x: number, y: number) => { owner = vector(x, y); },
        enemy: (x: number, y: number, z = 0) => { enemy = vector(x, y, z); },
        immune: (yes: boolean) => { immune = yes; },
        rooted: (yes: boolean) => { rooted = yes; },
        q: (now: number) => { f.time(now); f.cast("zuus_arc_lightning"); },
        tick: (now: number) => { f.time(now); f.raw.tickWire(now); },
    };
}

describe("Грозовая рамка", () => {
    it("нужны два разных места; до замыкания, во время подготовки, вне линии и под BKB толчка нет", () => {
        const f = wireHarness();
        f.q(0); f.q(1);
        expect(f.raw.wire).toBeUndefined();
        f.position(400, 0); f.q(2);
        f.tick(2.4);
        f.enemy(200, 190); f.tick(2.6);
        f.enemy(200, 50, 200); f.tick(2.7);
        f.immune(true); f.enemy(200, 50); f.tick(2.8);
        expect(f.shove).not.toHaveBeenCalled();
        f.immune(false); f.tick(3);
        expect(f.shove).toHaveBeenCalledExactlyOnceWith(f.target, { x: 0, y: 1, z: 0 }, 225, 0.25);
        expect(f.raw.wire).toBeUndefined();
        f.q(4);
        expect(f.raw.wireAnchor).toBeUndefined(); // Отдельный КД не сбрасывается кастом Q.
    });

    it("выход и возвращение в кольцо дают намеренный отход; корень блокирует его", () => {
        const f = wireHarness();
        f.enemy(200, 500);
        f.q(0); f.position(400, 0); f.q(2);
        f.q(3);
        expect(f.move).not.toHaveBeenCalled();
        f.position(400, 150); f.tick(3.1);
        f.position(400, 0); f.rooted(true); f.q(4);
        expect(f.move).not.toHaveBeenCalled();
        f.rooted(false); f.q(5);
        expect(f.move).toHaveBeenCalledExactlyOnceWith(f.parent, { x: 0, y: 0, z: 0 }, true);
        expect(f.raw.wire).toBeUndefined();
    });

    it("пробуждённая линия держит два контакта; одна цель не расходует оба, смерть очищает частицы", () => {
        const f = wireHarness(true);
        f.q(0); f.position(225, 0); f.q(1);
        f.tick(2); f.tick(2.1);
        expect(f.shove).toHaveBeenCalledTimes(1);
        expect(f.raw.wire.charges).toBe(1);
        const second = { ...f.target, entindex: () => 23 };
        vi.stubGlobal("FindUnitsInRadius", () => [f.target, second]);
        f.tick(2.2);
        expect(f.shove).toHaveBeenCalledTimes(2);
        expect(f.particles.DestroyParticle).toHaveBeenCalledTimes(3);

        f.q(12); f.engine.clearCombat(); f.q(13);
        expect(f.raw.wire).toBeUndefined();
        expect(f.particles.DestroyParticle).toHaveBeenCalledTimes(4);
    });
});
