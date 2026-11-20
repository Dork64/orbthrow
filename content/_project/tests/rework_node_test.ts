import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { computeBonuses, greyValue, nativeChargeCount } from "../src/vscripts/core/orbstore";
import { orbStatusResistance } from "../src/vscripts/core/orbs";
import { UPGRADE_DEFS } from "../src/vscripts/core/orbdata";
import { FxEngine } from "../src/vscripts/lib/fxengine";
import { fxOfOrb, fxView } from "../src/vscripts/core/fxutil";

describe("сферы 20.11: новые пулы и баланс", () => {
    it("каждый удалённый дубль заменён новой сферой той же редкости", () => {
        const audit = JSON.parse(readFileSync("data/orbs/removed_upgrades.json", "utf8"));
        expect(audit.removed.length).toBe(34);
        for (const row of audit.removed) {
            expect(UPGRADE_DEFS.find(o => o.id === row.id)).toBeUndefined();
            expect(UPGRADE_DEFS.filter(o => o.id === row.replacement).length).toBe(1);
        }
        expect(UPGRADE_DEFS.filter(o => o.rarity === "blue").length).toBe(369);
        expect(UPGRADE_DEFS.filter(o => o.rarity === "purple").length).toBe(386);
        expect(UPGRADE_DEFS.filter(o => o.rarity === "legend").length).toBe(128);
    });

    it("сопротивление доходит до 50%, все геройские баффы входят в общий предел", () => {
        expect(greyValue("g_status", 4)).toBe(20);
        expect(greyValue("g_status", 10)).toBe(50);
        expect(greyValue("g_status", 99)).toBe(50);
        expect(orbStatusResistance(20, 1, [])).toBeCloseTo(32);
        expect(orbStatusResistance(20, 1, [40])).toBe(50);
        expect(orbStatusResistance(50, 99, [40, 40, 40])).toBe(50);
        expect(orbStatusResistance(0, 0, [40])).toBeCloseTo(40);
    });

    it("легендарные удары имеют ограничения частоты и не повторяют сами себя", () => {
        for (const id of ["es_l_faultline", "pudge_l_mire", "viper_l_venomcycle", "sven_l_steeltempo", "mir_l_starhunt"]) {
            for (const f of fxOfOrb(id)) {
                if (f.t !== "hit") continue;
                expect(f.heroOnly).toBe(1);
                expect(f.icd).toBeGreaterThanOrEqual(1);
                const awake = fxView(f, true);
                expect(awake.t).toBe("hit");
            }
        }
        const campaign = fxOfOrb("lc_l_campaign")[0];
        expect(campaign.t === "kill" && campaign.stack?.max).toBe(6);
    });
});

describe("заряды в движке с GetMaxAbilityCharges = 0", () => {
    function fixture(native = 0, base = 0, initialCooldown = 0, sphere = "cm_l_avalanche", name = "crystal_maiden_crystal_nova") {
        let now = 100;
        let deadline = now + initialCooldown;
        let count = base;
        let published: any;
        vi.stubGlobal("GameRules", { GetGameTime: () => now });
        vi.stubGlobal("tostring", String);
        vi.stubGlobal("CustomNetTables", { SetTableValue: (_table: string, _key: string, data: unknown) => { published = data; } });
        const ability = {
            GetAbilityName: () => name, GetAbilityType: () => 0, GetLevel: () => 4, IsPassive: () => false,
            GetMaxAbilityCharges: () => native, GetEntityIndex: () => 5, GetLevelSpecialValueNoOverride: () => base,
            GetCurrentAbilityCharges: () => count, SetCurrentAbilityCharges: vi.fn((n: number) => { count = n; }),
            GetCooldown: () => 8, GetEffectiveCooldown: () => 8, GetCooldownTimeRemaining: () => Math.max(0, deadline - now),
            EndCooldown: vi.fn(() => { deadline = now; }), StartCooldown: vi.fn((time: number) => { deadline = now + time; }),
            GetCursorPosition: () => [0, 0, 0],
        };
        const hero = { GetAbilityCount: () => 1, GetAbilityByIndex: () => ability, GetPlayerOwnerID: () => 0, GetEntityIndex: () => 12 };
        const engine = new FxEngine(hero as never);
        engine.refresh(computeBonuses({ [sphere]: 1 }, 2));
        return { engine, ability, state: () => published?.abilities[name], count: () => count,
            time: (t: number) => { now = t; engine.syncCharges(); },
            cast: () => { deadline = now + 8; engine.onCast(ability as never, undefined); engine.syncCharges(); } };
    }

    it("после двух кастов блокируется, первый и второй заряды возвращаются последовательно", () => {
        const f = fixture();
        f.engine.syncCharges();
        expect(f.state()).toEqual({ count: 2, max: 2, next: 0 });
        f.cast();
        expect(f.ability.GetCooldownTimeRemaining()).toBe(0);
        f.time(102); f.cast();
        expect(f.state()).toEqual({ count: 0, max: 2, next: 108 });
        expect(f.ability.GetCooldownTimeRemaining()).toBe(6);
        f.time(108);
        expect(f.state()).toEqual({ count: 1, max: 2, next: 116 });
        f.time(116);
        expect(f.state()).toEqual({ count: 2, max: 2, next: 0 });
    });
    it("выбор сферы посреди КД сохраняет таймер предыдущего каста", () => {
        const f = fixture(0, 0, 7);
        f.engine.syncCharges();
        expect(f.state()).toEqual({ count: 1, max: 2, next: 107 });
    });
    it("Refresher возвращает весь запас", () => {
        const f = fixture();
        f.cast();
        f.engine.refillOrbCharges();
        expect(f.state()).toEqual({ count: 2, max: 2, next: 0 });
    });
    it("Shrapnel сохраняет штатный счётчик, сама Дота тратит заряды", () => {
        const f = fixture(5, 3, 0, "sniper_l_barrage", "sniper_shrapnel");
        f.engine.syncCharges();
        expect(f.count()).toBe(5);
        expect(f.ability.EndCooldown).not.toHaveBeenCalled();
        expect(f.state()).toBeUndefined();
    });
    it("Earthshock получает два заряда всего, а не три", () => {
        const f = fixture(0, 0, 0, "ursa_l_shock", "ursa_earthshock");
        f.engine.syncCharges();
        expect(f.state()).toEqual({ count: 2, max: 2, next: 0 });
        expect(nativeChargeCount(0, 1)).toBe(2);
    });
});
