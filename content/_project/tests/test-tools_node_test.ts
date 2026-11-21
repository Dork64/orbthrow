import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { enqueue, offerTestLegend, orbPlayer, pick, resetTestOrbs } from "../src/vscripts/game/orbs";
import { State } from "../src/vscripts/game/state";

const pid = 0 as PlayerID;

function match() {
    vi.stubGlobal("GameRules", { GetDOTATime: () => 120 });
    vi.stubGlobal("PlayerResource", {
        GetSelectedHeroName: () => "npc_dota_hero_axe",
        GetSelectedHeroEntity: () => undefined,
    });
    vi.stubGlobal("CustomNetTables", { SetTableValue: vi.fn() });
    vi.stubGlobal("tostring", String);
    vi.stubGlobal("RandomInt", (min: number) => min);
    State.phase = "game";
    resetTestOrbs(pid);
}

afterEach(() => {
    State.phase = "setup";
    vi.unstubAllGlobals();
});

describe("тестовые сферы", () => {
    it("выдаёт четыре разные легендарки до наступления обычного лимита и сохраняет очередь синих", () => {
        match();
        enqueue(pid, "blue");
        const op = orbPlayer(pid);
        const chosen = new Set<string>();
        for (let left = 4; left > 0; left--) {
            expect(offerTestLegend(pid)).toBe(true);
            const offer = op.offer!;
            expect(offer.rarity).toBe("legend");
            expect(offer.cards).toHaveLength(left);
            expect(offer.cards.every(card => !chosen.has(card.id))).toBe(true);
            chosen.add(offer.cards[0].id);
            expect(pick(pid, offer.seq, offer.cards[0].id)).toBe(true);
        }
        expect(offerTestLegend(pid)).toBe(false);
        expect(op.offer?.rarity).toBe("blue");
        expect(op.queue).toEqual(["blue"]);
    });

    it("при сбросе героя удаляет старые сферы и не принимает клик по старому предложению", () => {
        match();
        offerTestLegend(pid);
        const taken = orbPlayer(pid).offer!;
        pick(pid, taken.seq, taken.cards[0].id);
        offerTestLegend(pid);
        const previous = orbPlayer(pid);
        const stale = previous.offer!;

        resetTestOrbs(pid);
        expect(orbPlayer(pid).stacks).toEqual({});
        expect(orbPlayer(pid).queue).toEqual([]);
        expect(orbPlayer(pid).version).toBeGreaterThan(previous.version);
        offerTestLegend(pid);
        expect(pick(pid, stale.seq, stale.cards[0].id)).toBe(false);
        expect(orbPlayer(pid).offer?.cards).toHaveLength(4);
    });
});

it("выбор героя открывается в Panorama без локальной сортировки ICU", () => {
    class Panel {
        children: Panel[] = [];
        classes = new Set<string>();
        events = new Map<string, () => void>();
        text = "";
        enabled = true;
        AddClass(name: string) { this.classes.add(name); }
        SetHasClass(name: string, has: boolean) { if (has) this.classes.add(name); else this.classes.delete(name); }
        RemoveAndDeleteChildren() { this.children = []; }
        SetFocus() { }
        SetPanelEvent(name: string, action: () => void) { this.events.set(name, action); }
    }
    const panels = new Map<string, Panel>();
    const getPanel = (name: string) => {
        if (!panels.has(name)) panels.set(name, new Panel());
        return panels.get(name)!;
    };
    const $ = Object.assign(getPanel, {
        CreatePanel: (_type: string, parent: Panel) => {
            const panel = new Panel();
            parent.children.push(panel);
            return panel;
        },
    });
    const send = vi.fn();
    const context = createContext({
        $, Game: { IsInToolsMode: () => true }, L: (s: string) => s,
        heroLabel: (name: string) => name.replace("npc_dota_hero_", ""),
        CustomNetTables: {
            SubscribeNetTableListener: vi.fn(),
            GetTableValue: (_table: string, key: string) => key === "state" ? { phase: "game" }
                : { "1": "npc_dota_hero_slark", "2": "npc_dota_hero_puck" },
        },
        GameEvents: { Subscribe: vi.fn(), SendCustomGameEventToServer: send },
    });
    runInContext("String.prototype.localeCompare = function () { throw new RangeError('Icu error'); };", context);
    const source = readFileSync("src/panorama/test_panel.ts", "utf8");
    runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017 } }).outputText, context);
    runInContext("OrbShowTestHeroPicker()", context);
    const grid = getPanel("#OrbTestHeroGrid");
    expect(grid.children.map(card => card.children[1].text)).toEqual(["puck", "slark"]);
    const search = getPanel("#OrbTestHeroSearch");
    search.text = "puck";
    search.events.get("ontextentrychange")!();
    expect(grid.children[1].classes.has("Hidden")).toBe(true);
    grid.children[0].events.get("onactivate")!();
    runInContext("OrbConfirmTestHero()", context);
    expect(send).toHaveBeenCalledWith("orb_test_pick_hero", { hero: "npc_dota_hero_puck" });
    expect(getPanel("#OrbTestHeroConfirm").enabled).toBe(false);
});
