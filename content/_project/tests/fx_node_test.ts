import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { FX_LIST } from "../src/vscripts/core/fxdata";
import { UPGRADE_DEFS } from "../src/vscripts/core/orbdata";
import { HERO_POOL } from "../src/vscripts/core/heroes";
import { fxHasModifier, fxModifierName } from "../src/vscripts/core/fxtypes";
import { fxNum, fxOfOrb, fxView, parseFxExpr } from "../src/vscripts/core/fxutil";
import { computeBonuses, overrideValue } from "../src/vscripts/core/orbstore";

describe("числа эффектов", () => {
    it("число и «ключ*множитель»", () => {
        expect(parseFxExpr("duration")).toEqual({ key: "duration", mult: 1 });
        expect(parseFxExpr("nova_damage*0.5")).toEqual({ key: "nova_damage", mult: 0.5 });
        const special = (k: string) => (k === "nova_damage" ? 260 : 0);
        expect(fxNum(12, special)).toBe(12);
        expect(fxNum("nova_damage*0.5", special)).toBe(130);
        expect(fxNum(undefined, special)).toBe(0);
    });
});

describe("Пробуждение меняет параметры эффекта", () => {
    it("свойства сливаются, остальное заменяется", () => {
        const f = fxOfOrb("bb_l_flood")[0];
        const a = fxView(f, true) as typeof f & { radius: number; debuff: { props: Record<string, number>; dur: number } };
        expect(a.radius).toBe(900);
        expect(a.debuff.props.armor).toBe(-5);
        expect(a.debuff.props.ms).toBe(-15);
        expect(a.debuff.dur).toBe(5);
        expect(fxView(f, false)).toBe(f);
    });
    it("вложенные объекты (цепь) сливаются по полям", () => {
        const f = fxOfOrb("lina_l_chain")[0];
        const a = fxView(f, true) as unknown as { chain: { jumps: number; radius: number; pct: number } };
        expect(a.chain).toEqual({ jumps: 2, radius: 500, pct: 75 });
    });
});

describe("данные сфер героев", () => {
    it("у каждого героя 8 своих фиолетовых, 4 механики и 4 легендарки", () => {
        for (const hero of HERO_POOL) {
            const purple = UPGRADE_DEFS.filter(u => u.hero === hero && u.rarity === "purple" && u.mech !== true);
            const mech = UPGRADE_DEFS.filter(u => u.hero === hero && u.rarity === "purple" && u.mech === true);
            expect([hero, mech.length]).toEqual([hero, 4]);
            const legend = UPGRADE_DEFS.filter(u => u.hero === hero && u.rarity === "legend");
            expect([hero, purple.length]).toEqual([hero, 8]);
            expect([hero, legend.length]).toEqual([hero, 4]);
            // легендарки — по одной на ветку Q, W, E, R
            expect(legend.map(l => l.branch).sort()).toEqual(["E", "Q", "R", "W"]);
        }
    });
    it("у каждой сферы-кода есть эффект или изменение значений", () => {
        for (const u of UPGRADE_DEFS) {
            if (u.hero === "*" || u.rarity === "blue") continue;
            const ok = fxOfOrb(u.id).length > 0 || u.mods.length > 0 || (u.awmods ?? []).length > 0 ||
                ["axe_", "jugg_"].some(p => u.id.startsWith(p));
            expect([u.id, ok]).toEqual([u.id, true]);
        }
    });
    it("ключи эффектов уникальны, модификаторы перечислены в файле модификаторов", () => {
        const keys = new Set(FX_LIST.map(f => f.key));
        expect(keys.size).toBe(FX_LIST.length);
        const file = readFileSync("src/vscripts/modifiers/modifier_orb_fx.ts", "utf8");
        for (const f of FX_LIST) {
            const listed = file.includes(fxModifierName(f.key) + " = makeFx(\"" + f.key + "\")");
            expect([f.key, listed]).toEqual([f.key, fxHasModifier(f)]);
        }
    });
    it("операции с данными: множитель и замена складываются с прибавкой", () => {
        const b = computeBonuses({ sniper_l_barrage: 1, sniper_p_charge: 1 }, 1);
        expect(overrideValue(b, "sniper_shrapnel", "AbilityCharges", 3)).toBe(6);
        expect(overrideValue(b, "sniper_shrapnel", "shrapnel_damage", 75)).toBeCloseTo(105, 5);
        const s = computeBonuses({ sven_l_cleave: 1 }, 0);
        expect(overrideValue(s, "sven_great_cleave", "great_cleave_damage", 90)).toBe(120);
        const sa = computeBonuses({ sven_l_cleave: 1, awake: 1 }, 0);
        expect(overrideValue(sa, "sven_great_cleave", "great_cleave_damage", 90)).toBe(150);
    });
});
