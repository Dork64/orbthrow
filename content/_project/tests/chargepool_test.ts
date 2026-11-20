import { describe, expect, it } from "vitest";
import { createChargePool, resizeCharges, restoreCharges, spendCharge } from "../src/vscripts/core/chargepool";

describe("очередь зарядов сфер", () => {
    it("два каста, запрет третьего, восстановление по одному", () => {
        const pool = createChargePool(2, 0, 0);
        expect(spendCharge(pool, 0, 8)).toBe(true);
        expect(spendCharge(pool, 3, 8)).toBe(true);
        expect(spendCharge(pool, 7, 8)).toBe(false);
        restoreCharges(pool, 8, 8);
        expect(pool.count).toBe(1);
        expect(pool.next).toBe(16);
        restoreCharges(pool, 16, 8);
        expect(pool.count).toBe(2);
        expect(pool.next).toBe(0);
    });

    it("пробуждение даёт один новый заряд, не сбрасывая прежний таймер", () => {
        const pool = createChargePool(2, 10, 5);
        spendCharge(pool, 11, 8);
        resizeCharges(pool, 3);
        expect(pool.count).toBe(1);
        expect(pool.next).toBe(15);
    });
});
