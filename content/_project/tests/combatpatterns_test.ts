import { describe, expect, it } from "vitest";
import { advanceCombo, boundedOrbCooldown, ComboState, insideRing, tetherBand } from "../src/vscripts/core/combatpatterns";
import { computeBonuses, overrideValue } from "../src/vscripts/core/orbstore";

describe("сочетания заклинаний", () => {
    it("повтор одной способности и предметы не заменяют разные заклинания", () => {
        const state: ComboState = { casts: {}, readyAt: 0 };
        expect(advanceCombo(state, ["orb", "rift"], 2, 4, 8, "orb", 0)).toBe(false);
        expect(advanceCombo(state, ["orb", "rift"], 2, 4, 8, "orb", 1)).toBe(false);
        expect(advanceCombo(state, ["orb", "rift"], 2, 4, 8, "item_blink", 2)).toBe(false);
        expect(advanceCombo(state, ["orb", "rift"], 2, 4, 8, "rift", 3)).toBe(true);
    });
    it("старые применения истекают, а внутренний КД не ускоряется новыми применениями", () => {
        const state: ComboState = { casts: {}, readyAt: 0 };
        advanceCombo(state, ["q", "w"], 2, 4, 8, "q", 0);
        expect(advanceCombo(state, ["q", "w"], 2, 4, 8, "w", 5)).toBe(false);
        expect(advanceCombo(state, ["q", "w"], 2, 4, 8, "q", 6)).toBe(true);
        expect(state.readyAt).toBe(14);
        expect(advanceCombo(state, ["q", "w"], 2, 4, 8, "w", 7)).toBe(false);
        expect(advanceCombo(state, ["q", "w"], 2, 4, 8, "q", 14)).toBe(false);
        expect(advanceCombo(state, ["q", "w"], 2, 4, 8, "w", 15)).toBe(true);
    });
    it("трёхходовое комбо Пака требует всех трёх способностей", () => {
        const state: ComboState = { casts: {}, readyAt: 0 };
        const abs = ["orb", "rift", "jaunt"];
        advanceCombo(state, abs, 3, 5, 12, "rift", 0);
        expect(advanceCombo(state, abs, 3, 5, 12, "jaunt", 1)).toBe(false);
        expect(advanceCombo(state, abs, 3, 5, 12, "orb", 2)).toBe(true);
        expect(Object.keys(state.casts).length).toBe(0);
    });
});

describe("геометрия областей и связей", () => {
    it("внутри песчаного кольца есть безопасная область", () => {
        expect(insideRing(200, 250, 600)).toBe(false);
        expect(insideRing(250, 250, 600)).toBe(true);
        expect(insideRing(500, 250, 600)).toBe(true);
        expect(insideRing(650, 250, 600)).toBe(false);
    });
    it("связь различает рабочую дистанцию, паузу и окончательный обрыв", () => {
        expect(tetherBand(100, 250, 550, 800)).toBe("outside");
        expect(tetherBand(400, 250, 550, 800)).toBe("active");
        expect(tetherBand(700, 250, 550, 800)).toBe("outside");
        expect(tetherBand(801, 250, 550, 800)).toBe("broken");
    });
});

describe("потолки новых синих сфер", () => {
    it("у Phase Shift отдельный предел снижения КД, другие герои не затронуты", () => {
        expect(boundedOrbCooldown("puck_phase_shift", 84)).toBe(20);
        expect(boundedOrbCooldown("puck_phase_shift", 12)).toBe(12);
        expect(boundedOrbCooldown("lina_dragon_slave", 60)).toBe(60);
    });
    it("Коса и Heartstopper Aura не уходят в бесконечный урон", () => {
        const b = computeBonuses({ necrolyte_b_10: 99, necrolyte_b_8: 99 }, 2);
        expect(overrideValue(b, "necrolyte_reapers_scythe", "damage_per_health", 0.9)).toBe(1.15);
        expect(overrideValue(b, "necrolyte_heartstopper_aura", "aura_damage", 2.3)).toBe(4);
    });
    it("увеличение контроля и длины Link ограничено, но не ослабляет штатное значение", () => {
        const b = computeBonuses({ sand_king_b_3: 99, razor_b_5: 99 }, 0);
        expect(overrideValue(b, "sandking_burrowstrike", "burrow_duration", 1.8)).toBe(2.8);
        expect(overrideValue(b, "razor_static_link", "drain_length", 10)).toBe(14);
        expect(overrideValue(b, "razor_static_link", "drain_length", 16)).toBe(16);
    });
});
