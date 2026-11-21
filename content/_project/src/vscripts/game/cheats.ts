// Действия для проверки в Workshop Tools, из панели или чата.

import { Hooks } from "./hooks";
import { HERO_POOL } from "../core/heroes";
import { State, allPlayers, gameNow, pushNet, toast } from "./state";
import type { PlayerState } from "./state";
import { ALL_TEAMS } from "./teams";
import { spawnExtraBots } from "./bots";
import { campUnitsAlive, forceRespawnCamps } from "./camps";
import { addBlue, addPurple, enqueue, grantMechanics, offerTestLegend, orbsDump, resetTestOrbs } from "./orbs";
import { bossOrbCheat } from "./bossorbs";
import { courierCheat } from "./courier";
import { goblinCheat } from "./goblin";
import { helpCheat, huntCheat } from "./catchup";
import { neutralTokensCheat, resetNeutralProgress } from "./neutrals";
import { resetConsumables, slotsCheat } from "./slots";
import { arenaEventCheat } from "./arenaevents";
import { spawnPointOf } from "./fountain";
import { pushItemsNet } from "./itemsnet";
import { Timers } from "./timers";
import { isValid, log, safe } from "./util";

export const cheatHandlers = new Map<string, (id: PlayerID, args: string[]) => void>();

function hero(id: PlayerID) {
    const h = PlayerResource.GetSelectedHeroEntity(id);
    return isValid(h) ? h : undefined;
}

cheatHandlers.set("gold", (id, a) => PlayerResource.ModifyGold(id, tonumber(a[0]) ?? 5000, true, ModifyGoldReason.CHEAT_COMMAND));
cheatHandlers.set("lvl", (id, a) => {
    const h = hero(id);
    if (h === undefined) return;
    const target = Math.min(30, tonumber(a[0]) ?? 10);
    let guard = 0;
    while (h.GetLevel() < target && guard++ < 30) h.HeroLevelUp(false);
});
cheatHandlers.set("kills", (id, a) => {
    const p = State.players.get(id);
    if (p !== undefined) p.kills = tonumber(a[0]) ?? p.kills + 5;
    pushNet();
});
cheatHandlers.set("time", (_id, a) => {
    State.timeOffset += (tonumber(a[0]) ?? 5) * 60;
    toast("info", "#orb_toast_cheat", "time " + Math.floor(gameNow() / 60));
});
cheatHandlers.set("bot", (_id, a) => spawnExtraBots(tonumber(a[0]) ?? 1));
cheatHandlers.set("tokens", (id, a) => neutralTokensCheat(id, tonumber(a[0]) ?? 10));
cheatHandlers.set("wards", (id, a) => slotsCheat(id, tonumber(a[0]) ?? 5));
cheatHandlers.set("travel", id => {
    const h = hero(id);
    if (h !== undefined) h.AddItemByName("item_travel_boots");
});
cheatHandlers.set("pos", id => {
    const h = hero(id);
    if (h === undefined) return;
    const o = h.GetAbsOrigin();
    const text = "pos " + Math.floor(o.x) + " " + Math.floor(o.y) + " " + Math.floor(o.z);
    log(text);
    toast("info", "#orb_toast_cheat", text);
});
cheatHandlers.set("refresh", id => {
    const h = hero(id);
    if (h === undefined) return;
    h.SetHealth(h.GetMaxHealth());
    h.SetMana(h.GetMaxMana());
    for (let i = 0; i < h.GetAbilityCount(); i++) {
        const ability = h.GetAbilityByIndex(i);
        if (ability === undefined) continue;
        ability.EndCooldown();
        if (ability.GetLevel() > 0 && ability.GetMaxAbilityCharges(ability.GetLevel() - 1) > 0) ability.RefreshCharges();
    }
});
cheatHandlers.set("win", id => {
    const p = State.players.get(id);
    if (p !== undefined) p.kills = State.goal - 1;
    pushNet();
});
cheatHandlers.set("camps", () => {
    forceRespawnCamps();
    toast("info", "#orb_toast_cheat", "camps " + campUnitsAlive());
});
// -orb grey|blue|purple|legend [N] — дать сферы; -orbs N — N случайных; -pts blue|purple N — очки шкалы
const RARITIES = ["grey", "blue", "purple", "legend"];
cheatHandlers.set("orb", (id, a) => {
    const r = RARITIES.includes(a[0] ?? "") ? a[0] : "grey";
    enqueue(id, r as "grey", Math.min(20, tonumber(a[1]) ?? 1));
});
cheatHandlers.set("orbs", (id, a) => {
    const n = Math.min(30, tonumber(a[0]) ?? 5);
    for (let i = 0; i < n; i++) enqueue(id, RARITIES[RandomInt(0, 2)] as "grey"); // без легендарок
});
// -mech — все механики своего героя и общие фиолетовые-механики
// -event [bloodmoon|goldrain|storm|haste] — начать событие арены сейчас
cheatHandlers.set("event", (_id, a) => arenaEventCheat(a[0] ?? ""));
cheatHandlers.set("mech", id => toast("info", "#orb_toast_cheat", "mech " + grantMechanics(id)));
cheatHandlers.set("pts", (id, a) => {
    const n = tonumber(a[1]) ?? 10;
    if (a[0] === "purple") addPurple(id, n);
    else addBlue(id, n);
});
// -boss [blue|purple] — Повелитель бросает сферу сейчас
cheatHandlers.set("boss", (_id, a) => bossOrbCheat(a[0] ?? "blue"));
// -courier, -goblin — событие сейчас; -hunt — охота на себя (вкл/выкл); -help — подмога себе
cheatHandlers.set("courier", () => courierCheat());
cheatHandlers.set("goblin", () => goblinCheat());
cheatHandlers.set("hunt", id => huntCheat(id));
cheatHandlers.set("help", id => helpCheat(id));
cheatHandlers.set("dump", () => {
    for (const p of allPlayers()) {
        log("игрок", p.id, "команда", p.team, "база", p.baseIndex, "бот", p.isBot, "у/с/п", p.kills, p.deaths, p.assists, "ушел", p.left);
        log("   сферы:", orbsDump(p.id));
    }
    log("лимит", State.goal, "фаза", State.phase, "время", gameNow(), "нейтралов", campUnitsAlive());
});

const testActions = new Map<string, [command: string, ...args: string[]]>([
    ["level_20", ["lvl", "20"]],
    ["level_30", ["lvl", "30"]],
    ["gold", ["gold", "5000"]],
    ["refresh", ["refresh"]],
    ["bot", ["bot", "1"]],
    ["grey", ["orb", "grey"]],
    ["blue", ["orb", "blue"]],
    ["purple", ["orb", "purple"]],
    ["wards", ["wards", "5"]],
    ["tokens", ["tokens", "10"]],
    ["courier", ["courier"]],
    ["goblin", ["goblin"]],
    ["camps", ["camps"]],
    ["mech", ["mech"]],
]);

const changingHero = new Map<PlayerID, { name: string }>();

function testPlayer(id: PlayerID): PlayerState | undefined {
    if (State.phase !== "game" && State.phase !== "overtime") return undefined;
    const p = State.players.get(id);
    return p !== undefined && !p.isBot && !p.left ? p : undefined;
}

function changeTestHero(p: PlayerState, player: CDOTAPlayerController, name: string) {
    const id = p.id;
    const reply = (error?: string) => {
        if (isValid(player)) CustomGameEventManager.Send_ServerToPlayer(player, "orb_test_hero_result", { error });
    };
    if (!HERO_POOL.includes(name)) { reply("#orb_test_hero_failed"); return; }
    if (changingHero.has(id)) return;

    const request = { name };
    changingHero.set(id, request);
    const scheduled = safe("загрузка героя для теста", () => {
        PrecacheUnitByNameAsync(name, () => {
            if (changingHero.get(id) !== request) return;
            const changed = safe("смена героя для теста", () => {
                if (testPlayer(id) !== p || !isValid(player)) return false;
                const before = hero(id);
                PlayerResource.ReplaceHeroWithNoTransfer(id, name, -1, 0);
                const after = hero(id);
                if (after === undefined || after === before || after.GetUnitName() !== name) return false;

                p.damageTaken = [];
                p.fightAt = -100;
                p.inRing = false;
                resetTestOrbs(id);
                resetNeutralProgress(id);
                resetConsumables(id);
                pushItemsNet(id, true);
                FindClearSpaceForUnit(after, spawnPointOf(p), true);
                PlayerResource.SetCameraTarget(id, after);
                Timers.after(0.2, "камера после смены героя", () => {
                    if (hero(id) === after) PlayerResource.SetCameraTarget(id, undefined);
                });
                pushNet();
                log("тест: герой заменён", id, name);
                return true;
            });
            changingHero.delete(id);
            reply(changed === true ? undefined : "#orb_test_hero_failed");
        }, id);
        return true;
    });
    if (scheduled !== true) {
        changingHero.delete(id);
        reply("#orb_test_hero_failed");
        return;
    }
    Timers.after(15, "ожидание героя для теста", () => {
        if (changingHero.get(id) !== request) return;
        changingHero.delete(id);
        reply("#orb_test_hero_failed");
    });
}

export function initTestPanel() {
    if (!IsInToolsMode()) return;
    const heroNames: Record<string, string> = {};
    HERO_POOL.forEach((name, i) => { heroNames[tostring(i + 1)] = name; });
    CustomNetTables.SetTableValue("orb_game", "test_heroes", heroNames);
    CustomGameEventManager.RegisterListener("orb_test_pick_hero", (_, e) => safe("выбор героя для теста", () => {
        const p = testPlayer(e.PlayerID);
        if (p === undefined) return;
        const player = PlayerResource.GetPlayer(p.id);
        if (isValid(player)) changeTestHero(p, player, e.hero);
    }));
    CustomGameEventManager.RegisterListener("orb_test_action", (_, e) => safe("тестовая панель", () => {
        const p = testPlayer(e.PlayerID);
        if (p === undefined || changingHero.has(p.id)) return;
        const player = PlayerResource.GetPlayer(p.id);
        if (!isValid(player)) return;

        if (e.action === "level_up") {
            const h = hero(p.id);
            if (h !== undefined) cheatHandlers.get("lvl")?.(p.id, [tostring(h.GetLevel() + 1)]);
            return;
        }
        if (e.action === "legend") {
            if (offerTestLegend(p.id)) log("тест: открыт выбор легендарки", p.id);
            else CustomGameEventManager.Send_ServerToPlayer(player, "orb_toast", { kind: "info", text: "#orb_test_no_legends" });
            return;
        }
        const action = testActions.get(e.action);
        if (action === undefined) return;
        const [command, ...args] = action;
        cheatHandlers.get(command)?.(p.id, args);
        log("тест:", e.action, p.id);
    }));
}

export function onPlayerChat(e: PlayerChatEvent) {
    if (!IsInToolsMode()) return;
    const text = e.text.trim();
    if (!text.startsWith("-")) return;
    const parts = text.substring(1).split(" ").filter(s => s !== "");
    // Без «?.» у строкового метода: TSTL вычисляет parts.shift() дважды (ошибка компилятора).
    const first = parts.shift();
    const cmd = first !== undefined ? first.toLowerCase() : "";
    const handler = cheatHandlers.get(cmd);
    if (handler === undefined) return;
    log("чит", cmd, parts.join(" "));
    handler(e.playerid, parts);
}

export { Hooks, ALL_TEAMS };
