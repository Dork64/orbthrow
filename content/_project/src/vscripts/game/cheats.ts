// Читы для тестов — только в редакторе (IsInToolsMode). Команды пишутся в чат.

import { Hooks } from "./hooks";
import { State, allPlayers, gameNow, pushNet, toast } from "./state";
import { ALL_TEAMS, baseTeams } from "./teams";
import { spawnBot } from "./bots";
import { campUnitsAlive, forceRespawnCamps } from "./camps";
import { addBlue, addPurple, enqueue, grantMechanics, orbsDump } from "./orbs";
import { bossOrbCheat } from "./bossorbs";
import { courierCheat } from "./courier";
import { goblinCheat } from "./goblin";
import { helpCheat, huntCheat } from "./catchup";
import { neutralTokensCheat } from "./neutrals";
import { slotsCheat } from "./slots";
import { arenaEventCheat } from "./arenaevents";
import { isValid, log } from "./util";

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
cheatHandlers.set("bot", (_id, a) => {
    const n = tonumber(a[0]) ?? 1;
    const used = allPlayers().map(p => p.team);
    const free = baseTeams.filter(t => !used.includes(t));
    for (let i = 0; i < Math.min(n, free.length); i++) spawnBot(free[i]);
});
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
    for (let i = 0; i < h.GetAbilityCount(); i++) h.GetAbilityByIndex(i)?.EndCooldown();
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
