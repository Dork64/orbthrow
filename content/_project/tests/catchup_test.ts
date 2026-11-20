import { describe, expect, it } from "vitest";
import {
    COURIER_POOLS, courierItem, courierTierByTime, courierTierFor, goblinHealth, helpGold, huntStep, lastTwo,
    revengeMultiplier, revengeOnKill,
} from "../src/vscripts/core/catchup";
import { ScoreRow } from "../src/vscripts/core/rules";

const row = (id: number, kills: number, deaths = 0): ScoreRow => ({ id, kills, deaths, networth: 0 });

describe("курьер", () => {
    it("уровень по времени", () => {
        expect([200, 400, 700, 1000, 1300].map(t => courierTierByTime(t))).toEqual([1, 2, 3, 4, 5]);
    });
    it("лидер с отрывом 3 — ниже, двое последних — выше", () => {
        const rows = [row(0, 10), row(1, 7), row(2, 5), row(3, 2), row(4, 1)];
        expect(courierTierFor(700, 0, rows)).toBe(2);
        expect(courierTierFor(700, 4, rows)).toBe(4);
        expect(courierTierFor(700, 3, rows)).toBe(4);
        expect(courierTierFor(700, 2, rows)).toBe(3);
        expect(courierTierFor(1500, 4, rows)).toBe(5);
        expect(courierTierFor(200, 0, rows)).toBe(1);
    });
    it("без повтора того, что есть", () => {
        const owned = COURIER_POOLS[1].slice(1);
        expect(courierItem(1, owned, () => 0)).toBe(COURIER_POOLS[1][0]);
    });
    it("в каждом пуле есть предметы", () => {
        for (let t = 1; t <= 5; t++) expect(COURIER_POOLS[t].length).toBeGreaterThan(8);
    });
});

describe("отстающие", () => {
    it("двое последних, при равенстве — больше смертей", () => {
        expect(lastTwo([row(0, 5), row(1, 1, 3), row(2, 1, 5), row(3, 2)])).toEqual([2, 1]);
    });
    it("меньше трех игроков — нет", () => {
        expect(lastTwo([row(0, 5), row(1, 1)])).toEqual([]);
    });
    it("золото подмоги", () => {
        expect(helpGold(10)).toBe(900);
    });
});

describe("месть", () => {
    it("копится до 3 и сбрасывается ответным убийством", () => {
        const rev = new Map<number, Map<number, number>>();
        for (let i = 0; i < 5; i++) revengeOnKill(rev, 1, 2); // 1 убил 2 пять раз
        expect(revengeMultiplier(rev, 2, 1)).toBeCloseTo(1.3, 5);
        expect(revengeMultiplier(rev, 1, 2)).toBeCloseTo(0.7, 5);
        revengeOnKill(rev, 2, 1); // 2 отомстил
        expect(revengeMultiplier(rev, 2, 1)).toBeCloseTo(0.9, 5);
        expect(revengeMultiplier(rev, 1, 2)).toBeCloseTo(1.1, 5);
    });
});

describe("охота", () => {
    it("начинается с отрыва 4, кончается на 2 или при смене лидера", () => {
        let h = huntStep(-1, 3, 3);
        expect(h).toBe(-1);
        h = huntStep(h, 3, 4);
        expect(h).toBe(3);
        h = huntStep(h, 3, 3);
        expect(h).toBe(3);
        h = huntStep(h, 3, 2);
        expect(h).toBe(-1);
        h = huntStep(huntStep(-1, 3, 5), 4, 4);
        expect(h).toBe(4);
    });
});

describe("Гоблин", () => {
    it("здоровье растет со временем", () => {
        expect(goblinHealth(5)).toBe(1950);
    });
});
