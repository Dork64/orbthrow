import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../src/vscripts/core/config";
import { economyTick, grantArenaExperience, resetExperience, xpFilter } from "../src/vscripts/game/economy";
import { resetItemsNet } from "../src/vscripts/game/itemsnet";
import { castSlotWard, initSlots, slotWardError } from "../src/vscripts/game/slots";
import { newPlayer, State } from "../src/vscripts/game/state";

afterEach(() => {
    vi.unstubAllGlobals();
    State.players.clear();
    resetExperience();
    resetItemsNet();
});

function game() {
    let time = 100;
    const valid = { IsNull: () => false };
    const hero = {
        ...valid, IsAlive: () => true, IsStunned: () => false, IsMuted: () => false, IsHexed: () => false,
        IsOutOfGame: () => false, GetPlayerOwnerID: () => 0, GetTeamNumber: () => 2,
        origin: { x: 0, y: 0, z: 0 }, GetAbsOrigin() { return this.origin; },
        GetItemInSlot: () => undefined, HasModifier: () => true,
        AddExperience: vi.fn((amount: number) => {
            const event = { reason_const: 0, experience: amount, player_id_const: 0 };
            xpFilter(event as never);
            return event.experience;
        }),
    };
    const events: Record<string, (_: number, event: any) => unknown> = {};
    const ward = { ...valid, AddNewModifier: vi.fn() };
    const create = vi.fn(() => ward as typeof ward | undefined);
    const send = vi.fn();
    vi.stubGlobal("GameRules", { GetGameTime: () => time, GetDOTATime: () => time });
    vi.stubGlobal("PlayerResource", { GetSelectedHeroEntity: () => hero, GetPlayer: () => valid, ModifyGold: vi.fn() });
    vi.stubGlobal("CustomGameEventManager", { RegisterListener: (name: string, cb: typeof events[string]) => { events[name] = cb; }, Send_ServerToPlayer: send });
    vi.stubGlobal("CustomNetTables", { SetTableValue: vi.fn() });
    vi.stubGlobal("ModifyXpReason", { UNSPECIFIED: 0, CREEP_KILL: 1, HERO_KILL: 2, CATCH_UP: 3 });
    vi.stubGlobal("ModifyGoldReason", { UNSPECIFIED: 0 });
    vi.stubGlobal("IsValidEntity", (entity: unknown) => entity != null);
    vi.stubGlobal("GetGroundPosition", (pos: unknown) => pos);
    vi.stubGlobal("Vector", (x: number, y: number, z: number) => ({ x, y, z }));
    vi.stubGlobal("CreateUnitByName", create);
    vi.stubGlobal("EmitSoundOnLocationWithCaster", vi.fn());
    vi.stubGlobal("tostring", String);
    vi.stubGlobal("type", (v: unknown) => typeof v === "object" && v !== null ? "table" : typeof v);
    vi.stubGlobal("pcall", (f: () => unknown) => [true, f()]);
    State.phase = "game";
    newPlayer(0 as PlayerID, 2 as DotaTeam, 0, false);
    return { hero, events, create, send, advance: () => { time++; } };
}

describe("варды через применение способности", () => {
    it("списывает запас только после создания варда и обновляет запас в следующей партии", () => {
        const f = game();
        const ability = { GetSpecialValueFor: () => 1600 };
        const place = (x: number) => castSlotWard(f.hero as never, "ob", { x, y: 0, z: 0 } as never, ability as never);
        initSlots();
        f.events.orb_slot_use(0, { PlayerID: 0, kind: "ob", x: 200, y: 0 });
        expect(f.create).not.toHaveBeenCalled();
        for (let i = 0; i < CONFIG.startObservers; i++) { place(200); f.advance(); }
        place(200);
        expect(f.create).toHaveBeenCalledTimes(CONFIG.startObservers);
        resetItemsNet();
        initSlots();
        expect(slotWardError(f.hero as never, "ob", { x: 900, y: 0, z: 0 } as never)).toBeUndefined();
        place(100000);
        f.create.mockReturnValueOnce(undefined);
        place(200);
        place(200);
        expect(f.create).toHaveBeenCalledTimes(CONFIG.startObservers + 2);
        expect(f.create).toHaveBeenLastCalledWith("npc_dota_observer_wards", { x: 200, y: 0, z: 0 }, true, f.hero, f.hero, 2);
        expect(f.send).toHaveBeenCalledWith(expect.anything(), "orb_error", { text: "#orb_slot_bad_point" });
    });
});

describe("опыт наград и круга", () => {
    it("масштабирует опыт Доты и свои награды ровно один раз", () => {
        const f = game();
        const engine = { reason_const: 4, player_id_const: 0, experience: 100 };
        expect(xpFilter(engine as never)).toBe(true);
        expect(engine.experience).toBe(150);
        expect(xpFilter({ ...engine, reason_const: 2 } as never)).toBe(false);
        grantArenaExperience(f.hero as never, 101);
        grantArenaExperience(f.hero as never, 101);
        expect(f.hero.AddExperience.mock.results.map(r => r.value)).toEqual([151, 152]);
    });

    it("за минуту снаружи 450, внутри 1650, включая удвоенный бонус круга", () => {
        const f = game();
        const run = () => {
            f.hero.AddExperience.mockClear();
            for (let i = 0; i < 60; i++) { economyTick(); f.advance(); }
            return f.hero.AddExperience.mock.results.reduce((total, r) => total + r.value, 0);
        };
        f.hero.origin.x = CONFIG.ringRadius + 1;
        expect(run()).toBe(450);
        f.hero.origin.x = 0;
        expect(run()).toBe(1650);
    });
});
