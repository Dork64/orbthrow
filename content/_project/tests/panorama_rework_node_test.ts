import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { runInNewContext } from "vm";
import ts from "typescript";

function script(name: string) {
    return ts.transpileModule(readFileSync("src/panorama/" + name + ".ts", "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2017 },
    }).outputText;
}

function panel() {
    const children: Record<string, ReturnType<typeof panel>> = {};
    return {
        children, style: {} as Record<string, string>, classes: {} as Record<string, boolean>,
        text: "", hittest: false, hittestchildren: false,
        IsValid: () => true, AddClass: vi.fn(), DeleteAsync: vi.fn(),
        FindChildTraverse: (id: string) => children[id],
        SetHasClass(name: string, value: boolean) { this.classes[name] = value; },
        actualuiscale_x: 1.25, actualuiscale_y: 1.25,
    };
}

describe("индикаторы захвата", () => {
    it("после ошибки продолжается обновление; повторное появление не сталкивается с DeleteAsync", () => {
        const roots: Record<string, ReturnType<typeof panel>> = {};
        const marks: { id: string; panel: ReturnType<typeof panel> }[] = [];
        const queue: (() => void)[] = [];
        let fail = true;
        let present = true;
        const $ = Object.assign((id: string) => roots[id] ?? (roots[id] = panel()), {
            GetContextPanel: () => panel(),
            CreatePanel: (_type: string, parent: ReturnType<typeof panel>, id: string) => {
                const child = panel();
                parent.children[id] = child;
                if (/^(BossOrb|ChestMark)/.test(id)) marks.push({ id, panel: child });
                return child;
            },
            Schedule: (_delay: number, callback: () => void) => { queue.push(callback); },
            Msg: vi.fn(),
        });
        const context = {
            $, L: () => "", playerColorCss: () => "#ffffff",
            CustomNetTables: { GetTableValue: (_table: string, key: string) => {
                if (key === "boss") {
                    if (fail) throw new Error("temporary layout failure");
                    return { orbs: present ? { 1: { id: 1, l: 1, x: 0, y: 0, z: 0, p: 0.5, h: 0 } } : {} };
                }
                return { list: present ? { 1: { st: 2, x: 0, y: 0, z: 0, p: 0.5, h: 0 } } : {} };
            } },
            Game: { WorldToScreenX: () => 500, WorldToScreenY: () => 300, GetScreenWidth: () => 1920, GetScreenHeight: () => 1080 },
            GameUI: { GetCameraLookAtPosition: () => [0, 0, 0] },
        };
        runInNewContext(script("boss"), context);
        expect(marks.length).toBe(1); // сундук обновлён несмотря на ошибку сфер
        expect(queue.length).toBe(1);
        fail = false;
        queue.shift()!();
        expect(marks.length).toBe(2);
        expect(marks.every(m => m.panel.classes.Offscreen === false)).toBe(true);
        present = false;
        queue.shift()!();
        expect(marks.every(m => m.panel.DeleteAsync.mock.calls.length === 1)).toBe(true);
        present = true;
        queue.shift()!();
        expect(marks.length).toBe(4);
        expect(new Set(marks.map(m => m.id)).size).toBe(4);
    });
});

describe("слоты расходников", () => {
    it("варды включают штатный прицел от героя, а дым использует своё событие", () => {
        let hero = 42;
        const send = vi.fn();
        const execute = vi.fn();
        const source = script("slots");
        const context = {
            $: () => panel(),
            GameUI: { CustomUIConfig: () => ({}), GetScreenWorldPosition: () => [120, 240, 0], GetCursorPosition: () => [0, 0] },
            Players: { GetLocalPlayer: () => 0, GetPlayerHeroEntityIndex: () => hero },
            Entities: { GetAbilityByName: (_: number, name: string) => name === "orb_slot_observer" ? 80 : 81 },
            Abilities: { ExecuteAbility: execute },
            GameEvents: { SendCustomGameEventToServer: send },
        };
        runInNewContext(source.slice(0, source.indexOf("(function initSlots()")), context);
        runInNewContext('slotKeyPressed("5");', context);
        expect(execute).toHaveBeenLastCalledWith(80, 42, false);
        hero = 43;
        runInNewContext('slotKeyPressed("6"); slotKeyPressed("7");', context);
        expect(execute).toHaveBeenLastCalledWith(81, 43, false);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenLastCalledWith("orb_slot_use", { kind: "sm" });
    });
});

describe("каталог сфер", () => {
    it("показывает весь пул героя и обновляет взятые стаки и пробуждение", () => {
        const roots: Record<string, ReturnType<typeof panel>> = {};
        const rows: { kind: string; panel: ReturnType<typeof panel> }[] = [];
        const $ = Object.assign((id: string) => roots[id] ?? (roots[id] = panel()), {
            CreatePanel: (_type: string, _parent: unknown, _id: string, attrs: { class: string }) => {
                const child = panel();
                rows.push({ kind: attrs.class, panel: child });
                return child;
            },
        });
        Object.assign($("#OrbCatalogRows"), { RemoveAndDeleteChildren: () => { rows.length = 0; } });
        let spheres = { v: 1, st: {} as Record<string, number> };
        let catalog = {
            hero: "zuus",
            cards: {
                1: { id: "bolt_legend", br: "W", rr: "legend" },
                2: { id: "bolt_blue", br: "W", rr: "blue" },
                3: { id: "g_armor", br: "G", rr: "grey" },
            } as Record<string, { id: string; br: string; rr: string }>,
        };
        const context = {
            $, Players: { GetLocalPlayer: () => 0 }, CustomNetTables: { GetTableValue: () => catalog },
            L: (key: string, count?: string) => count === undefined ? key : key + ":" + count,
            orbData: () => spheres, heroLabel: (name: string) => name,
            orbIconPanel: vi.fn(), orbTooltip: vi.fn(),
        };
        const run = (code: string) => runInNewContext(code, context);
        run(script("orb_catalog"));
        run("OrbToggleCatalog()");
        const tiles = () => rows.filter(row => row.kind.startsWith("OrbCatalogTile "));
        expect(tiles().map(row => row.kind)).toEqual(["OrbCatalogTile legend", "OrbCatalogTile blue"]);
        expect(tiles().every(row => !row.panel.classes.Taken)).toBe(true);
        run("OrbSetCatalogTab('Common')");
        expect(tiles().map(row => row.kind)).toEqual(["OrbCatalogTile grey"]);
        run("OrbSetCatalogTab('Taken')");
        expect(rows.some(row => row.kind === "OrbCatalogEmpty")).toBe(true);

        spheres = { v: 2, st: { bolt_legend: 1, bolt_blue: 2, awake: 1 } };
        run("orbRenderCatalog(orbData())");
        expect(tiles().map(row => row.panel.classes.Awakened)).toEqual([true, false]);
        expect(rows.filter(row => row.kind === "OrbCatalogCount").map(row => row.panel.text)).toEqual(["×1", "×2"]);
        expect($("#OrbCatalogTakenText").text).toBe("orb_catalog_taken_tab:3");

        catalog = { hero: "axe", cards: { 1: { id: "axe_blue", br: "Q", rr: "blue" } } };
        spheres = { v: 3, st: {} };
        run("orbRenderCatalog(orbData())");
        expect($("#OrbCatalogHeroName").text).toBe("axe");
        expect(tiles()).toHaveLength(0);
    });
});

describe("счётчик зарядов на кнопке способности", () => {
    it("читает остаток из движка при 2 → 1 → 0 → 1 → 2, уступает штатному HUD и скрывается при смене цели", () => {
        let current = 0;
        let max = 0;
        let remaining = 0;
        let portrait = 42;
        let nativeBadge = false;
        const queue: (() => void)[] = [];
        const created: (ReturnType<typeof panel> & { visible: boolean })[] = [];
        const button = {
            actuallayoutwidth: 50, actuallayoutheight: 50,
            FindChildTraverse: () => null, GetPositionWithinWindow: () => ({ x: 100, y: 200 }),
        };
        const slots = [0, 2].map(i => ({
            id: "Ability" + i, actuallayoutwidth: 50,
            BHasClass: (c: string) => c === "show_ability_charges" && i === 2 && nativeBadge,
            FindChildTraverse: (id: string) => id === "AbilityButton" ? button : null,
        }));
        const $ = Object.assign(() => panel(), {
            CreatePanel: () => {
                const child = { ...panel(), visible: false };
                created.push(child);
                return child;
            },
            Schedule: (_delay: number, callback: () => void) => { queue.push(callback); },
        });
        runInNewContext(script("ability_charges"), {
            $,
            dotaHudElement: () => ({ FindChildTraverse: () => ({ Children: () => slots }) }),
            Players: { GetLocalPlayer: () => 0, GetPlayerHeroEntityIndex: () => 42, GetLocalPlayerPortraitUnit: () => portrait },
            Entities: { IsValidEntity: () => true, GetAbilityCount: () => 3, GetAbility: (_: number, i: number) => i + 10 },
            Abilities: {
                GetAbilityName: (id: number) => id === 12 ? "zuus_lightning_bolt" : "other",
                IsHidden: () => false, IsDisplayedAbility: (id: number) => id !== 11, GetLevel: () => 4,
                GetMaxAbilityCharges: (id: number) => id === 12 ? max : 0,
                GetCurrentAbilityCharges: (id: number) => id === 12 ? current : 0,
                GetAbilityChargeRestoreTimeRemaining: (id: number) => id === 12 ? remaining : 0,
                GetSpecialValueFor: () => 6,
            },
        });
        const tick = () => queue.shift()!();
        expect(created).toHaveLength(0);
        max = 2;
        for (const [count, time, angle] of [[2, 0, 360], [1, 6, 0], [0, 3, 180], [1, 6, 0], [2, 0, 360]]) {
            current = count;
            remaining = time;
            tick();
            const [badge, ring, label] = created;
            expect(badge.visible).toBe(true);
            expect(label.text).toBe(String(count));
            expect(ring.style.clip).toContain(angle.toFixed(1) + "deg");
        }
        nativeBadge = true;
        tick();
        expect(created[0].visible).toBe(false);
        nativeBadge = false;
        tick();
        expect(created[0].visible).toBe(true);
        portrait = 43;
        tick();
        expect(created[0].visible).toBe(false);
    });
});
