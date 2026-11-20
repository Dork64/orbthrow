// Лобби (DESIGN 13): все игроки голосуют за лимит убийств и время партии (просьба автора 31.10),
// хост выбирает число ботов и может начать раньше. Через 40 с старт сам; если проголосовали
// все — через 5 с. В редакторе — сразу, с 5 ботами.

import { CONFIG } from "../core/config";
import { killGoal } from "../core/rules";
import { DEFAULT_MINUTES, KILL_OPTIONS, MINUTE_OPTIONS, tally, voteCounts } from "../core/vote";
import { State, pushNet } from "./state";
import { assignTeams } from "./teams";
import { Timers } from "./timers";
import { log, safe } from "./util";

const AUTO_START = CONFIG.lobbyAutoStart;
/** Когда проголосовали все — до старта не больше стольких секунд. */
const ALL_VOTED_LEFT = 5;
let autoTimer = -1;
let startAt = 0;
let lastLeft: number = AUTO_START;
const votes = new Map<number, { k: number; m: number }>();

function humanIds(): PlayerID[] {
    const ids: PlayerID[] = [];
    for (let i = 0; i < 24; i++) {
        const id = i as PlayerID;
        if (PlayerResource.IsValidPlayerID(id) && !PlayerResource.IsFakeClient(id)) ids.push(id);
    }
    return ids;
}

function humanCount(): number {
    return humanIds().length;
}

function autoGoal(): number {
    return killGoal(Math.min(10, humanCount() + State.botsWanted));
}

function killVotes(): number[] {
    const out: number[] = [];
    for (const [, v] of votes) if (v.k > 0) out.push(v.k);
    return out;
}

function minuteVotes(): number[] {
    const out: number[] = [];
    for (const [, v] of votes) if (v.m > 0) out.push(v.m);
    return out;
}

/** Итог голосов: лимит убийств (0 — по числу игроков) и минуты. */
function voteResult(): { goal: number; minutes: number } {
    const kv = killVotes();
    return {
        goal: kv.length > 0 ? tally(kv, KILL_OPTIONS, autoGoal()) : 0,
        minutes: tally(minuteVotes(), MINUTE_OPTIONS, DEFAULT_MINUTES),
    };
}

function applyVotes() {
    const r = voteResult();
    State.voteGoal = r.goal;
    State.timeLimit = r.minutes * 60;
}

function allVoted(): boolean {
    const ids = humanIds();
    if (ids.length === 0) return false;
    for (const id of ids) {
        const v = votes.get(id);
        if (v === undefined || v.k <= 0 || v.m <= 0) return false;
    }
    return true;
}

function pushSettings(left: number) {
    lastLeft = left;
    applyVotes();
    const r = voteResult();
    const my: Record<string, { k: number; m: number }> = {};
    for (const [id, v] of votes) my[tostring(id)] = { k: v.k, m: v.m };
    const ko: Record<string, number> = {};
    KILL_OPTIONS.forEach((o, i) => { ko[tostring(i + 1)] = o; });
    const mo: Record<string, number> = {};
    MINUTE_OPTIONS.forEach((o, i) => { mo[tostring(i + 1)] = o; });
    CustomNetTables.SetTableValue("orb_game", "settings", {
        bots: State.botsWanted,
        humans: humanCount(),
        goal: r.goal > 0 ? r.goal : autoGoal(),
        minutes: r.minutes,
        left,
        done: State.setupDone ? 1 : 0,
        ko, mo,
        kv: voteCounts(killVotes(), KILL_OPTIONS),
        mv: voteCounts(minuteVotes(), MINUTE_OPTIONS),
        my,
        auto: autoGoal(),
    });
}

export function beginSetup() {
    State.botsWanted = IsInToolsMode() ? CONFIG.toolsDefaultBots : Math.max(0, 4 - humanCount());
    applyVotes();
    if (IsInToolsMode()) {
        // В редакторе не ждем: сразу в партию (просьба автора). Синхронно — до автозапуска Доты.
        finishSetup();
        return;
    }
    assignTeams(State.botsWanted);
    startAt = GameRules.GetGameTime() + AUTO_START;
    pushSettings(AUTO_START);
    autoTimer = Timers.every(1, "лобби", () => {
        if (State.setupDone) return;
        const left = Math.max(0, Math.ceil(startAt - GameRules.GetGameTime()));
        pushSettings(left);
        if (left <= 0) finishSetup();
    });
}

export function finishSetup() {
    if (State.setupDone) return;
    State.setupDone = true;
    if (autoTimer >= 0) Timers.cancel(autoTimer);
    applyVotes();
    assignTeams(State.botsWanted);
    pushSettings(0);
    pushNet();
    log("настройки: ботов", State.botsWanted, "лимит", State.goal, "время", State.timeLimit, "голосов", votes.size);
    GameRules.FinishCustomGameSetup();
}

function isHost(pid: PlayerID): boolean {
    const player = PlayerResource.GetPlayer(pid);
    if (player === undefined) return false;
    return GameRules.PlayerHasCustomGameHostPrivileges(player);
}

export function initLobby() {
    CustomGameEventManager.RegisterListener("orb_settings", (_, e) => safe("настройки лобби", () => {
        if (State.setupDone || !isHost(e.PlayerID)) return;
        if (e.bots !== undefined) State.botsWanted = Math.max(0, Math.min(10 - humanCount(), tonumber(e.bots) ?? 0));
        assignTeams(State.botsWanted);
        pushSettings(lastLeft);
    }));
    CustomGameEventManager.RegisterListener("orb_vote", (_, e) => safe("голосование", () => {
        if (State.setupDone) return;
        const v = votes.get(e.PlayerID) ?? { k: 0, m: 0 };
        const k = tonumber(e.kills);
        const m = tonumber(e.minutes);
        if (k !== undefined && KILL_OPTIONS.includes(k)) v.k = k;
        if (m !== undefined && MINUTE_OPTIONS.includes(m)) v.m = m;
        votes.set(e.PlayerID, v);
        // Проголосовали все — не ждем полный таймер
        if (allVoted()) startAt = Math.min(startAt, GameRules.GetGameTime() + ALL_VOTED_LEFT);
        pushSettings(Math.max(0, Math.ceil(startAt - GameRules.GetGameTime())));
    }));
    CustomGameEventManager.RegisterListener("orb_start", (_, e) => safe("старт", () => {
        if (!isHost(e.PlayerID)) return;
        finishSetup();
    }));
}
