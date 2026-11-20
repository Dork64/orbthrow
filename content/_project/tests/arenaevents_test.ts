import { describe, expect, it } from "vitest";
import { ARENA, ARENA_EVENTS, eventAllowed, eventStart, pickEvent } from "../src/vscripts/core/arenaevents";

describe("события арены", () => {
    it("первое на 7:00, дальше раз в 5 минут", () => {
        expect(eventStart(0)).toBe(420);
        expect(eventStart(1)).toBe(720);
        expect(eventStart(4)).toBe(420 + 4 * 300);
    });
    it("не начинаются в последнюю минуту, в овертайме — можно", () => {
        expect(eventAllowed(30 * 60 - 30, 30 * 60, false)).toBe(false);
        expect(eventAllowed(30 * 60 - 90, 30 * 60, false)).toBe(true);
        expect(eventAllowed(40 * 60, 30 * 60, true)).toBe(true);
    });
    it("событие не повторяется подряд", () => {
        for (const prev of ARENA_EVENTS) {
            for (let r = 0; r < 3; r++) expect(pickEvent(prev, () => r)).not.toBe(prev);
        }
    });
    it("у каждого события есть длительность", () => {
        for (const e of ARENA_EVENTS) expect(ARENA.duration[e]).toBeGreaterThan(20);
    });
});

import { toJson } from "../src/vscripts/core/json";
describe("строка статистики", () => {
    it("JSON с вложенными объектами и экранированием", () => {
        const s = toJson({ b: [1, 2.345, "x\"y"], a: { z: true } });
        expect(s).toBe('{"a":{"z":true},"b":[1,2.35,"x\\"y"]}');
    });
});
