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
    it("клавиша 5 выбирает точку, сервер получает клик даже без клиентской способности", () => {
        let hero = 42;
        const send = vi.fn();
        const source = script("slots");
        const context = {
            $: () => panel(),
            GameUI: { CustomUIConfig: () => ({}), GetScreenWorldPosition: () => [120, 240, 0], GetCursorPosition: () => [0, 0] },
            Players: { GetLocalPlayer: () => 0, GetPlayerHeroEntityIndex: () => hero },
            Entities: { IsAlive: () => true },
            GameEvents: { SendCustomGameEventToServer: send },
        };
        runInNewContext(source.slice(0, source.indexOf("(function initSlots()")), context);
        runInNewContext('slotKeyPressed("5"); slotMouse("pressed", 0);', context);
        expect(send).toHaveBeenLastCalledWith("orb_slot_use", { kind: "ob", x: 120, y: 240 });
        runInNewContext('slotKeyPressed("6");', context);
        hero = 43;
        runInNewContext('slotMouse("pressed", 0);', context);
        expect(send).toHaveBeenCalledTimes(1);
        runInNewContext('slotKeyPressed("6"); slotMouse("pressed", 0); slotKeyPressed("7");', context);
        expect(send).toHaveBeenNthCalledWith(2, "orb_slot_use", { kind: "se", x: 120, y: 240 });
        expect(send).toHaveBeenLastCalledWith("orb_slot_use", { kind: "sm" });
    });
});
