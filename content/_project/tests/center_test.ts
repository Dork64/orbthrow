import { describe, expect, it } from "vitest";
import { bossOrbRarity, captureStep, CaptureState, overthrowStep, pickSector, sectorOf } from "../src/vscripts/core/center";

const st = (): CaptureState => ({ holder: -1, progress: 0, contested: false });

describe("сферы Повелителя", () => {
    it("до 8:00 только синие", () => {
        expect(bossOrbRarity(479, 0)).toBe("blue");
    });
    it("8:00-18:00 — 50/50, после — 70% фиолетовых", () => {
        expect(bossOrbRarity(600, 0.49)).toBe("purple");
        expect(bossOrbRarity(600, 0.51)).toBe("blue");
        expect(bossOrbRarity(1200, 0.69)).toBe("purple");
        expect(bossOrbRarity(1200, 0.71)).toBe("blue");
    });
});

describe("захват", () => {
    it("один игрок захватывает за 4 секунды", () => {
        const s = st();
        let done = false;
        for (let i = 0; i < 39; i++) done = captureStep(s, [3], 0.1) || done;
        expect(done).toBe(false);
        expect(captureStep(s, [3], 0.1)).toBe(true);
        expect(s.holder).toBe(3);
    });
    it("двое в круге — прогресс замирает", () => {
        const s = st();
        captureStep(s, [1], 2);
        captureStep(s, [1, 2], 5);
        expect(s.progress).toBe(2);
        expect(s.contested).toBe(true);
    });
    it("чужой прогресс сначала откатывается", () => {
        const s = st();
        captureStep(s, [1], 2);
        captureStep(s, [2], 1.5);
        expect(s.holder).toBe(1);
        expect(s.progress).toBeCloseTo(0.5, 5);
        captureStep(s, [2], 1);
        expect(s.holder).toBe(2);
        expect(s.progress).toBe(0);
    });
    it("без героев прогресс медленно падает", () => {
        const s = st();
        captureStep(s, [1], 2);
        captureStep(s, [], 4);
        expect(s.progress).toBeCloseTo(1, 5);
        captureStep(s, [], 10);
        expect(s.holder).toBe(-1);
    });
});

describe("сектора", () => {
    it("сектор по углу", () => {
        expect(sectorOf(100, 1)).toBe(0);
        expect(sectorOf(0, 100)).toBe(2);
        expect(sectorOf(-100, -1)).toBe(4);
    });
    it("не повторяет два последних сектора", () => {
        for (let r = 0; r < 6; r++) expect([3, 4]).not.toContain(pickSector([3, 4], () => r));
    });
});

describe("Свержение", () => {
    it("срабатывает, когда лидер с отрывом 5 теряет лидерство", () => {
        let s = overthrowStep(-1, 2, 5);
        expect(s.armed).toBe(2);
        s = overthrowStep(s.armed, 2, 3);
        expect(s.fired).toBe(false);
        s = overthrowStep(s.armed, -1, 0); // ничья — нет единоличного лидера
        expect(s.fired).toBe(true);
        expect(s.armed).toBe(-1);
    });
    it("без отрыва 5 не заряжается", () => {
        expect(overthrowStep(-1, 2, 4).armed).toBe(-1);
    });
});
