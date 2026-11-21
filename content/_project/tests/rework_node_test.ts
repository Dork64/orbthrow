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
        expect(UPGRADE_DEFS.filter(o => o.rarity === "blue").length).toBe(381);
        expect(UPGRADE_DEFS.filter(o => o.rarity === "purple").length).toBe(398);
        expect(UPGRADE_DEFS.filter(o => o.rarity === "legend").length).toBe(132);
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
        expect(campaign).toMatchObject({ t: "mark", by: "ab", consume: ["attack"], max: 4 });
    });
});

describe("штатные заряды от сфер", () => {
    function fixture(native = 2, base = 0, initialCooldown = 0, sphere = "cm_l_avalanche", name = "crystal_maiden_crystal_nova") {
        let remaining = initialCooldown;
        let count = base;
        const ability = {
            GetAbilityName: () => name, GetAbilityType: () => 0, GetLevel: () => 4, IsPassive: () => false,
            GetMaxAbilityCharges: () => native, GetLevelSpecialValueNoOverride: () => base,
            GetCurrentAbilityCharges: () => count, SetCurrentAbilityCharges: vi.fn((n: number) => { count = n; }),
            GetCooldownTimeRemaining: () => remaining,
            EndCooldown: vi.fn(() => { remaining = 0; }), MarkAbilityButtonDirty: vi.fn(),
        };
        const hero = { GetAbilityCount: () => 1, GetAbilityByIndex: () => ability };
        const engine = new FxEngine(hero as never);
        engine.refresh(computeBonuses({ [sphere]: 1 }, 2));
        return { engine, ability, count: () => count, spend: () => { count--; }, setMax: (n: number) => { native = n; } };
    }

    it("выдаёт два заряда из готового к применению умения и не возвращает потраченные", () => {
        const f = fixture();
        f.engine.syncCharges();
        expect(f.count()).toBe(2);
        f.spend();
        f.spend();
        f.engine.syncCharges();
        expect(f.count()).toBe(0);
        expect(f.ability.SetCurrentAbilityCharges).toHaveBeenCalledTimes(1);
        expect(f.ability.MarkAbilityButtonDirty).toHaveBeenCalledTimes(1);
    });
    it("при получении на КД выдаётся только новый заряд", () => {
        const f = fixture(2, 0, 7);
        f.engine.syncCharges();
        expect(f.count()).toBe(1);
        expect(f.ability.EndCooldown).toHaveBeenCalledTimes(1);
    });
    it("пробуждение выдаёт только дополнительный заряд, даже если запас пуст", () => {
        const f = fixture(2, 0, 0, "lina_l_rain", "lina_light_strike_array");
        f.engine.syncCharges();
        f.spend(); f.spend();
        f.setMax(3);
        f.engine.refresh(computeBonuses({ lina_l_rain: 1, awake: 1 }, 2));
        f.engine.syncCharges();
        expect(f.count()).toBe(1);
    });
    it("Shrapnel сохраняет штатный счётчик, сама Дота тратит заряды", () => {
        const f = fixture(5, 3, 0, "sniper_l_barrage", "sniper_shrapnel");
        f.engine.syncCharges();
        expect(f.count()).toBe(5);
        expect(f.ability.EndCooldown).not.toHaveBeenCalled();
        f.setMax(6);
        f.engine.syncCharges();
        expect(f.count()).toBe(5);
    });
    it("легендарный разлом не даёт Earthshock дополнительных зарядов", () => {
        const f = fixture(2, 0, 0, "ursa_l_shock", "ursa_earthshock");
        f.engine.syncCharges();
        expect(f.count()).toBe(0);
        expect(nativeChargeCount(0, 1)).toBe(2);
    });
});

it("итоговый KV содержит штатные настройки зарядов Bolt и Nova прямо в файле overrides", () => {
    const { DOTAAbilities: kv } = require("../tools/kv.js").loadHeroFile("build/game/scripts/npc/npc_abilities_override.txt");
    expect(kv.zuus_lightning_bolt.AbilityValues).toEqual({
        AbilityCharges: { value: "0" },
        AbilityChargeRestoreTime: { value: "6.0 6.0 6.0 6.0" },
    });
    expect(kv.crystal_maiden_crystal_nova.AbilityValues.AbilityChargeRestoreTime.special_bonus_unique_crystal_maiden_5).toBe("-4.5");
    expect(kv.sniper_shrapnel).toBeUndefined();
    expect(kv.item_black_king_bar.AbilityCooldown).toBe("50");
});
