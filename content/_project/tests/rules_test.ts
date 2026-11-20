import { describe, expect, it } from "vitest";
import {
    killGoal, goalAfterAbandon, averagePlaces, finalPlaces, respawnTime, uniqueLeader, leaderGap,
    checkVictory, killGold, assistGoldEach, killXpEach, lastDamager, assistersOf, spreadBases, ScoreRow,
} from "../src/vscripts/core/rules";

const row = (id: number, kills: number, deaths = 0, networth = 0): ScoreRow => ({ id, kills, deaths, networth });

describe("лимит убийств", () => {
    it("совпадает с таблицей BALANCE.md", () => {
        expect([4, 5, 6, 7, 8, 9, 10].map(n => killGoal(n))).toEqual([22, 24, 25, 27, 28, 30, 30]);
    });
    it("короткая и длинная партия", () => {
        expect(killGoal(8, 0.8)).toBe(22);
        expect(killGoal(8, 1.25)).toBe(35);
    });
    it("ниже минимума не бывает", () => {
        expect(killGoal(1)).toBe(20);
        expect(killGoal(2)).toBe(20);
    });
    it("уход игрока уменьшает лимит, но не ниже счета лидера + 1", () => {
        expect(goalAfterAbandon(28, 10)).toBe(26);
        expect(goalAfterAbandon(28, 27)).toBe(28);
        expect(goalAfterAbandon(28, 26)).toBe(27);
    });
});

describe("места", () => {
    it("ничьи делят среднее место", () => {
        const p = averagePlaces([row(0, 5), row(1, 3), row(2, 3), row(3, 0)]);
        expect(p.get(0)).toBe(1);
        expect(p.get(1)).toBe(2.5);
        expect(p.get(2)).toBe(2.5);
        expect(p.get(3)).toBe(4);
    });
    it("в начале у всех среднее место", () => {
        const p = averagePlaces([row(0, 0), row(1, 0), row(2, 0), row(3, 0)]);
        for (const v of p.values()) expect(v).toBe(2.5);
    });
    it("итоговые места: убийства, смерти, нетворс", () => {
        expect(finalPlaces([row(0, 5, 3, 100), row(1, 5, 2, 50), row(2, 7, 9, 0), row(3, 5, 2, 90)])).toEqual([2, 3, 1, 0]);
    });
    it("возрождение: 1-е место 12 с, последнее 5 с", () => {
        expect(respawnTime(1, 8)).toBe(12);
        expect(respawnTime(8, 8)).toBe(5);
        expect(respawnTime(4.5, 8)).toBeCloseTo(8.5);
        expect(respawnTime(1, 1)).toBe(12);
    });
});

describe("лидер и победа", () => {
    it("единоличный лидер", () => {
        expect(uniqueLeader([row(0, 3), row(1, 5), row(2, 5)])).toBeUndefined();
        expect(uniqueLeader([row(0, 3), row(1, 6), row(2, 5)])?.id).toBe(1);
        expect(leaderGap([row(0, 3), row(1, 9), row(2, 5)])).toBe(4);
    });
    it("лимит набран — победа", () => {
        expect(checkVictory([row(0, 28), row(1, 3)], 28, 600, false)).toEqual({ kind: "winner", id: 0, reason: "goal" });
    });
    it("время вышло: единоличный лидер побеждает, ничья — овертайм", () => {
        expect(checkVictory([row(0, 20), row(1, 18)], 28, 1800, false)).toEqual({ kind: "winner", id: 0, reason: "time" });
        expect(checkVictory([row(0, 20), row(1, 20)], 28, 1800, false)).toEqual({ kind: "overtime" });
        expect(checkVictory([row(0, 21), row(1, 20)], 28, 1810, true)).toEqual({ kind: "winner", id: 0, reason: "overtime" });
    });
    it("ушедшие игроки не побеждают", () => {
        const left = { ...row(0, 30), left: true };
        expect(checkVictory([left, row(1, 3)], 28, 100, false)).toEqual({ kind: "none" });
    });
});

describe("награды", () => {
    it("золото за убийство совпадает с примерами BALANCE.md", () => {
        expect(killGold({ victimLevel: 6, victimNetworth: 4000, killerNetworth: 4500, victimStreak: 0, victimHunted: false })).toBe(198);
        expect(killGold({ victimLevel: 12, victimNetworth: 12000, killerNetworth: 9000, victimStreak: 0, victimHunted: false })).toBe(846);
        expect(killGold({ victimLevel: 18, victimNetworth: 22000, killerNetworth: 14000, victimStreak: 4, victimHunted: false })).toBe(1414);
        expect(killGold({ victimLevel: 15, victimNetworth: 15000, killerNetworth: 18000, victimStreak: 0, victimHunted: false })).toBe(270);
        expect(killGold({ victimLevel: 1, victimNetworth: 0, killerNetworth: 0, victimStreak: 0, victimHunted: true })).toBe(458);
    });
    it("помощь и опыт", () => {
        expect(assistGoldEach(1000, 2)).toBe(175);
        expect(assistGoldEach(1000, 0)).toBe(0);
        expect(killXpEach(12400, 0)).toBe(804);
        expect(killXpEach(12400, 1)).toBe(402);
    });
});

describe("учет урона", () => {
    const recs = [
        { attacker: 1, time: 100, amount: 50 },
        { attacker: 2, time: 104, amount: 200 },
        { attacker: 3, time: 80, amount: 900 },
        { attacker: 0, time: 105, amount: 10 },
    ];
    it("последний нанесший урон за 10 с", () => {
        expect(lastDamager(recs, 106, 0)).toBe(2);
        expect(lastDamager(recs, 120, 0)).toBeUndefined();
    });
    it("помогавшие: не меньше 5% здоровья за 15 с, кроме убийцы и самой жертвы", () => {
        expect(assistersOf(recs, 106, 0, 2, 1000)).toEqual([1]);
        expect(assistersOf(recs, 106, 0, 1, 1000)).toEqual([2]);
        expect(assistersOf(recs, 106, 0, 2, 2000)).toEqual([]);
    });
});

describe("базы", () => {
    it("равномерно по кругу", () => {
        expect(spreadBases(10, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(spreadBases(10, 5)).toEqual([0, 2, 4, 6, 8]);
        expect(spreadBases(10, 2)).toEqual([0, 5]);
        const eight = spreadBases(10, 8);
        expect(new Set(eight).size).toBe(8);
        expect(spreadBases(10, 12).length).toBe(10);
    });
});
