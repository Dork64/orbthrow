import { describe, expect, it } from "vitest";
import { DEFAULT_MINUTES, KILL_OPTIONS, MINUTE_OPTIONS, tally, voteCounts } from "../src/vscripts/core/vote";
import { makeNeutralOffer, nextCraft, tierStart, unlockedTier } from "../src/vscripts/core/neutrals";
import { NEUTRAL_TIERS } from "../src/vscripts/core/neutraldata";
import { captureStep, CaptureState } from "../src/vscripts/core/center";

const first = (_n: number) => 0;

describe("голосование в лобби", () => {
    it("без голосов — значение по умолчанию", () => {
        expect(tally([], KILL_OPTIONS, 25)).toBe(25);
        expect(tally([], MINUTE_OPTIONS, DEFAULT_MINUTES)).toBe(30);
    });
    it("больше голосов — побеждает", () => {
        expect(tally([40, 40, 20], KILL_OPTIONS, 25)).toBe(40);
        expect(tally([50], KILL_OPTIONS, 25)).toBe(50);
    });
    it("ничья — ближе к значению по умолчанию, потом меньший", () => {
        expect(tally([20, 50], KILL_OPTIONS, 30)).toBe(20);
        expect(tally([20, 40], KILL_OPTIONS, 30)).toBe(20);
        expect(tally([40, 50], MINUTE_OPTIONS, 30)).toBe(40);
    });
    it("чужие значения не считаются", () => {
        expect(tally([999, 7], KILL_OPTIONS, 25)).toBe(25);
        expect(voteCounts([20, 20, 30, 999], KILL_OPTIONS)).toEqual({ "20": 2, "30": 1, "40": 0, "50": 0 });
    });
});

describe("нейтральные предметы", () => {
    it("тир каждые 4 минуты: 1-й сразу, 5-й в 16:00", () => {
        expect([1, 2, 3, 4, 5].map(t => tierStart(t))).toEqual([0, 240, 480, 720, 960]);
        expect(unlockedTier(0)).toBe(1);
        expect(unlockedTier(239)).toBe(1);
        expect(unlockedTier(240)).toBe(2);
        expect(unlockedTier(5000)).toBe(5);
    });
    it("следующее создание: ждем тир, пропускаем младшие, пятый — последний", () => {
        expect(nextCraft(0, 10)).toEqual({ tier: 1, cost: 8, at: 0 });
        expect(nextCraft(1, 100)).toEqual({ tier: 2, cost: 12, at: 240 });
        expect(nextCraft(1, 600)).toEqual({ tier: 3, cost: 14, at: 0 });
        expect(nextCraft(5, 2000)).toEqual({ tier: 0, cost: 0, at: 0 });
    });
    it("варианты выбора: артефакты тира и улучшения своей группы без повторов", () => {
        const o = makeNeutralOffer(2, 0, first);
        const t2 = NEUTRAL_TIERS[1];
        expect(o.trinkets.length).toBe(t2.trinketOptions);
        for (const t of o.trinkets) expect(t2.items).toContain(t);
        const names = o.enhancements.map(e => e[0]);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain("item_enhancement_crude");
        expect(names).not.toContain("item_enhancement_nimble");
        const o5 = makeNeutralOffer(5, 3, first, ["item_desolator_2"]);
        expect(o5.trinkets).not.toContain("item_desolator_2");
        expect(o5.enhancements.map(e => e[0])).toContain("item_enhancement_manic");
    });
});

describe("захват сундука", () => {
    it("быстрее, чем сфера Повелителя: 2 секунды", () => {
        const s: CaptureState = { holder: -1, progress: 0, contested: false };
        let done = false;
        for (let i = 0; i < 19; i++) done = captureStep(s, [1], 0.1, 2) || done;
        expect(done).toBe(false);
        expect(captureStep(s, [1], 0.1, 2)).toBe(true);
    });
});
