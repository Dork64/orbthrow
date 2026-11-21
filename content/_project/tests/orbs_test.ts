import { HERO_POOL } from "../src/vscripts/core/heroes";
import { describe, expect, it } from "vitest";
import {
    ORB, addBarPoints, assistPurplePoints, blueNeed, bluesOfHero, candidates, diminishing, effectiveStacks, greyRate,
    killPurplePoints, makeOffer, maxStacks, purpleNeed, rerollCost,
} from "../src/vscripts/core/orbs";
import { GREY_DEFS, UPGRADE_DEFS } from "../src/vscripts/core/orbdata";

/** Предсказуемый генератор: всегда первый элемент. */
const first = (_n: number) => 0;
/** Детерминированный «случайный» генератор. */
function seq(seed: number) {
    let s = seed;
    return (n: number) => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s % n;
    };
}

describe("шкалы", () => {
    it("скорость серой шкалы по месту: 4.5 у первого, 8.5 у последнего", () => {
        expect(greyRate(1, 8)).toBe(4.5);
        expect(greyRate(8, 8)).toBe(8.5);
        expect(greyRate(4.5, 8)).toBeCloseTo(6.5, 5);
    });
    it("пороги синей 25, 33, 41 и фиолетовой 5, 6, 7", () => {
        expect([0, 1, 2].map(n => blueNeed(n))).toEqual([25, 33, 41]);
        expect([0, 1, 2].map(n => purpleNeed(n))).toEqual([5, 6, 7]);
    });
    it("несколько сфер сразу встают в очередь", () => {
        const bar = { points: 20, count: 0 };
        expect(addBarPoints(bar, 30, blueNeed)).toBe(1); // 50 − 25 = 25 < 33
        expect(bar.count).toBe(1);
        expect(bar.points).toBe(25);
        const bar2 = { points: 0, count: 0 };
        expect(addBarPoints(bar2, 100, blueNeed)).toBe(3); // 100 − 25 − 33 − 41 = 1
        expect(bar2.points).toBe(1);
        expect(bar2.count).toBe(3);
    });
    it("очки за убийство: 2, +1 за равного или сильнее, +2 за охоту", () => {
        expect(killPurplePoints(3, 5, false)).toBe(2);
        expect(killPurplePoints(5, 5, false)).toBe(3);
        expect(killPurplePoints(7, 5, true)).toBe(5);
        expect(assistPurplePoints(false)).toBe(1);
        expect(assistPurplePoints(true)).toBe(2);
    });
});

describe("убывание и перебросы", () => {
    it("перезарядка 5% с убыванием до 40%", () => {
        expect(diminishing(1, 5, 40)).toBeCloseTo(5, 5);
        expect(diminishing(5, 5, 40)).toBeCloseTo(19.5, 1);
        expect(diminishing(100, 5, 40)).toBeLessThan(40);
    });
    it("без предела — обычное сложение", () => {
        expect(diminishing(3, 120, 0)).toBe(360);
    });
    it("цена переброса 150, 300, 450, дальше 600", () => {
        expect([0, 1, 2, 3, 4, 9].map(n => rerollCost(n))).toEqual([150, 300, 450, 600, 600, 600]);
    });
});

describe("данные сфер", () => {
    it("у каждого героя пула есть синие сферы во всех ветках Q W E R", () => {
        const heroes = new Set(UPGRADE_DEFS.filter(b => b.rarity === "blue").map(b => b.hero));
        expect(heroes.size).toBe(HERO_POOL.length);
        for (const h of heroes) {
            const branches = new Set(bluesOfHero(h).map(b => b.branch));
            for (const br of ["Q", "W", "E", "R"]) expect(branches.has(br as any)).toBe(true);
        }
    });
    it("13 серых сфер", () => {
        expect(GREY_DEFS.length).toBe(13);
    });
});

describe("предложение карточек", () => {
    const hero = "npc_dota_hero_axe";
    it("серые — 3 разных", () => {
        const o = makeOffer("grey", hero, {}, seq(1));
        expect(o.kind).toBe("cards");
        if (o.kind !== "cards") return;
        expect(o.cards.length).toBe(3);
        expect(new Set(o.cards.map(c => c.id)).size).toBe(3);
    });
    it("синие — из разных веток", () => {
        for (let s = 1; s < 30; s++) {
            const o = makeOffer("blue", hero, {}, seq(s));
            if (o.kind !== "cards") throw new Error("ожидались карточки");
            const plain = o.cards.filter(c => c.mech !== true);
            expect(new Set(plain.map(c => c.branch)).size).toBe(plain.length);
            expect(o.cards.length).toBe(3);
        }
    });
    it("в синих иногда попадается механика героя (фиолетовая)", () => {
        let mech = 0;
        for (let s = 1; s < 60; s++) {
            const o = makeOffer("blue", hero, {}, seq(s));
            if (o.kind !== "cards") continue;
            for (const c of o.cards) if (c.mech === true) { mech++; expect(c.rarity).toBe("purple"); }
        }
        expect(mech).toBeGreaterThan(0);
    });
    it("главная ветка идет первой", () => {
        for (let s = 1; s < 20; s++) {
            const o = makeOffer("blue", hero, {}, seq(s), "E");
            if (o.kind !== "cards") throw new Error("ожидались карточки");
            expect(o.cards[0].branch).toBe("E");
        }
    });
    it("предела стаков нет: серые с любым числом стаков предлагаются", () => {
        const stacks: Record<string, number> = {};
        for (const g of GREY_DEFS) stacks[g.id] = g.max + 5;
        const o = makeOffer("grey", hero, stacks, first);
        if (o.kind !== "cards") throw new Error("ожидались карточки");
        expect(o.cards.length).toBe(3);
    });
    it("фиолетовые: общие доступны любому герою", () => {
        const o = makeOffer("purple", hero, {}, seq(2));
        expect(o.kind === "cards" && o.rarity).toBe("purple");
        if (o.kind === "cards") expect(o.cards.length).toBe(3);
    });
    it("свои фиолетовые — по одной, общие — сколько угодно", () => {
        const stacks: Record<string, number> = {};
        for (const u of UPGRADE_DEFS) if (u.rarity === "purple") stacks[u.id] = u.max;
        const o = makeOffer("purple", hero, stacks, first);
        if (o.kind !== "cards") throw new Error();
        expect(o.rarity).toBe("purple");
        for (const c of o.cards) expect(UPGRADE_DEFS.find(u => u.id === c.id)!.hero).toBe("*");
        expect(maxStacks("p_crit")).toBe(ORB.stackLimit);
        expect(maxStacks("axe_e_dmg")).toBe(ORB.stackLimit);
        expect(maxStacks("g_health")).toBe(ORB.stackLimit);
    });
    it("фиолетовые выключены — предлагаются синие", () => {
        const off: Record<string, boolean> = {};
        for (const u of UPGRADE_DEFS) if (u.rarity === "purple") off[u.id] = true;
        const o = makeOffer("purple", hero, {}, first, undefined, [], off);
        expect(o.kind === "cards" && o.rarity).toBe("blue");
    });
    it("легендарка: 4 карточки, вторая не дается", () => {
        const o = makeOffer("legend", hero, {}, first);
        if (o.kind !== "cards") throw new Error();
        expect(o.rarity).toBe("legend");
        expect(o.cards.length).toBe(4);
        const o2 = makeOffer("legend", hero, { [o.cards[0].id]: 1 }, first);
        expect(o2.kind === "cards" && o2.rarity).toBe("purple");
    });
    it("у героя без синих — серые", () => {
        const o = makeOffer("blue", "npc_dota_hero_unknown", {}, first);
        expect(o.kind === "cards" && o.rarity).toBe("grey");
    });
    it("все выключено — золото", () => {
        const off: Record<string, boolean> = {};
        for (const g of GREY_DEFS) off[g.id] = true;
        const o = makeOffer("grey", "npc_dota_hero_unknown", {}, first, undefined, [], off);
        expect(o.kind).toBe("gold");
        if (o.kind === "gold") expect(o.gold).toBe(ORB.fallbackGold.grey);
    });
    it("переброс показывает другие карточки, если есть", () => {
        const a = makeOffer("grey", hero, {}, seq(3));
        if (a.kind !== "cards") throw new Error();
        const b = makeOffer("grey", hero, {}, seq(4), undefined, a.cards.map(c => c.id));
        if (b.kind !== "cards") throw new Error();
        for (const c of b.cards) expect(a.cards.some(x => x.id === c.id)).toBe(false);
    });
    it("выключенные проверкой данных не предлагаются", () => {
        const all = candidates("blue", hero, {}).length;
        expect(candidates("blue", hero, {}, { axe_q_radius: true }).length).toBe(all - 1);
    });
});

import { computeBonuses, overrideValue } from "../src/vscripts/core/orbstore";

describe("бонусы сфер", () => {
    it("серые складываются, перезарядка с убыванием", () => {
        const b = computeBonuses({ g_health: 2, g_cdr: 5 }, 0);
        expect(b.health).toBe(240);
        expect(b.cdr).toBeCloseTo(19.5, 1);
    });
    it("основной атрибут: сила, и универсальным по 2.5 ко всем", () => {
        expect(computeBonuses({ g_primary: 2 }, 0).str).toBe(12);
        const u = computeBonuses({ g_primary: 2 }, 3);
        expect([u.str, u.agi, u.int]).toEqual([5, 5, 5]);
    });
    it("синие меняют ключ способности и ее перезарядку", () => {
        const b = computeBonuses({ axe_q_radius: 2, axe_q_cd: 1 }, 0);
        expect(b.specials["axe_berserkers_call"]["radius"]).toBe(80);
        expect(b.abilityCdr["axe_berserkers_call"]).toBeCloseTo(15, 5);
        // Перезарядка с убыванием, не больше −60%
        const many = computeBonuses({ axe_q_cd: 30 }, 0);
        expect(many.abilityCdr["axe_berserkers_call"]).toBeLessThanOrEqual(60);
        expect(many.abilityCdr["axe_berserkers_call"]).toBeGreaterThan(59);
    });
    it("урон способностей — процентом от значения, после порога — половина", () => {
        const b = computeBonuses({ axe_e_dmg: 2 }, 0);
        expect(overrideValue(b, "axe_counter_helix", "damage", 160)).toBeCloseTo(160 * 1.4, 5);
        // Порог 5: шестая и седьмая сферы — по половине (действующих стаков 6)
        const c = computeBonuses({ axe_e_dmg: 7 }, 0);
        expect(overrideValue(c, "axe_counter_helix", "damage", 100)).toBeCloseTo(100 * (1 + 0.2 * 6), 5);
        expect(effectiveStacks(7, 5)).toBe(6);
        expect(effectiveStacks(3, 5)).toBe(3);
    });
    it("убывающее значение не уходит в ноль при любом числе стаков", () => {
        const b = computeBonuses({ lc_e_trig: 20 }, 0);
        expect(overrideValue(b, "legion_commander_moment_of_courage", "trigger_attacks", 4)).toBe(1);
    });
    it("серые после порога — половина прибавки", () => {
        const b = computeBonuses({ g_health: 8 }, 0);
        expect(b.health).toBe(120 * 7);
    });
    it("сферы-код и пробуждение", () => {
        const b = computeBonuses({ p_crit: 2, l_master: 1, awake: 1 }, 1);
        expect(b.code["p_crit"]).toBe(2);
        expect(b.code["l_master"]).toBe(1);
        expect(b.awake).toBe(true);
    });
    it("сферы-код меняют значения способностей: прибавка, замена, множитель, пробуждение", () => {
        const before = computeBonuses({ axe_l_eternal: 1 }, 0);
        expect(overrideValue(before, "axe_counter_helix", "trigger_attacks", 5)).toBe(2);
        expect(overrideValue(before, "axe_counter_helix", "damage", 160)).toBeCloseTo(112, 5);
        const after = computeBonuses({ axe_l_eternal: 1, awake: 1 }, 0);
        expect(overrideValue(after, "axe_counter_helix", "damage", 160)).toBeUndefined();
        const storm = computeBonuses({ jugg_l_storm: 1, jugg_q_radius: 2, awake: 1 }, 1);
        expect(overrideValue(storm, "juggernaut_blade_fury", "blade_fury_radius", 260)).toBe(260 + 80 + 120);
        expect(overrideValue(storm, "juggernaut_blade_fury", "duration", 5)).toBe(7);
        expect(overrideValue(storm, "juggernaut_blade_fury", "blade_fury_damage", 175)).toBeUndefined();
    });
    it("все взятые сферы видны эффектам-коду (и данные, и код)", () => {
        const b = computeBonuses({ jugg_p_dispel: 1, jugg_p_critfury: 1 }, 1);
        expect(b.code["jugg_p_dispel"]).toBe(1);
        expect(b.code["jugg_p_critfury"]).toBe(1);
        expect(b.specials["juggernaut_blade_fury"]["can_crit"]).toBe(1);
    });
});

describe("легендарки героев", () => {
    it("каждый герой получает только свои 4 легендарки", () => {
        for (const hero of ["npc_dota_hero_axe", "npc_dota_hero_juggernaut", "npc_dota_hero_lina", "npc_dota_hero_pudge"]) {
            const c = candidates("legend", hero, {});
            expect(c.length).toBe(4);
            for (const card of c) expect(UPGRADE_DEFS.find(u => u.id === card.id)?.hero).toBe(hero);
        }
    });
    it("после взятой легендарки вариантов нет", () => {
        expect(candidates("legend", "npc_dota_hero_axe", { axe_l_arena: 1 }).length).toBe(0);
    });
});

