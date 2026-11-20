// Общее состояние партии. Все хранится по номеру игрока, а не по герою:
// смерть, переподключение и иллюзии ничего не теряют.

import { CONFIG } from "../core/config";
import { DamageRecord, ScoreRow, averagePlaces, finalPlaces, uniqueLeader } from "../core/rules";
import { Hooks } from "./hooks";

export interface PlayerState {
    id: PlayerID;
    team: DotaTeam;
    baseIndex: number;
    isBot: boolean;
    kills: number;
    deaths: number;
    assists: number;
    streak: number;
    left: boolean;
    disconnectedFor: number;
    goldFrac: number;
    xpFrac: number;
    damageTaken: DamageRecord[];
    inRing: boolean;
    huntKillsOfLeader: number;
    /** Когда последний раз бил героя или получал урон от героя (GameRules.GetGameTime). */
    fightAt: number;
}

export type Phase = "setup" | "pregame" | "game" | "overtime" | "ended";

export const State = {
    phase: "setup" as Phase,
    players: new Map<number, PlayerState>(),
    teamToPlayer: new Map<number, number>(),
    reservedBotTeams: [] as DotaTeam[],
    goal: 28,
    plannedPlayers: 0,
    /** Лимит убийств по голосам лобби (0 — по числу игроков). */
    voteGoal: 0,
    timeLimit: CONFIG.timeLimit as number,
    botsWanted: 0,
    setupDone: false,
    timeOffset: 0,
    winner: -1,
    started: false,
};

/** Время партии в секундах (0 — горн), с учетом читерского сдвига. На паузе стоит. */
export function gameNow(): number {
    return GameRules.GetDOTATime(false, false) + State.timeOffset;
}

export function newPlayer(id: PlayerID, team: DotaTeam, baseIndex: number, isBot: boolean): PlayerState {
    const p: PlayerState = {
        id, team, baseIndex, isBot,
        kills: 0, deaths: 0, assists: 0, streak: 0,
        left: false, disconnectedFor: 0,
        goldFrac: 0, xpFrac: 0,
        damageTaken: [],
        inRing: false,
        huntKillsOfLeader: 0,
        fightAt: -100,
    };
    State.players.set(id, p);
    State.teamToPlayer.set(team, id);
    return p;
}

export function playerByTeam(team: number): PlayerState | undefined {
    const id = State.teamToPlayer.get(team);
    return id === undefined ? undefined : State.players.get(id);
}

export function allPlayers(): PlayerState[] {
    const list: PlayerState[] = [];
    for (const [, p] of State.players) list.push(p);
    list.sort((a, b) => a.id - b.id);
    return list;
}

export function activePlayers(): PlayerState[] {
    return allPlayers().filter(p => !p.left);
}

// Ценность героя считаем не чаще раза в секунду: ее спрашивают много раз за тик
const nwCache = new Map<number, { at: number; value: number }>();

export function networthOf(id: PlayerID): number {
    const now = GameRules.GetGameTime();
    const c = nwCache.get(id);
    if (c !== undefined && now - c.at < 1 && now >= c.at) return c.value;
    const h = PlayerResource.GetSelectedHeroEntity(id);
    let nw = 0;
    if (h !== undefined && IsValidEntity(h)) {
        nw = PlayerResource.GetGold(id);
        for (let slot = 0; slot <= 16; slot++) {
            const item = h.GetItemInSlot(slot);
            if (item !== undefined && IsValidEntity(item)) nw += item.GetCost();
        }
    }
    nwCache.set(id, { at: now, value: nw });
    return nw;
}

export function scoreRows(): ScoreRow[] {
    return allPlayers().map(p => ({ id: p.id, kills: p.kills, deaths: p.deaths, networth: networthOf(p.id), left: p.left }));
}

export function placesNow(): Map<number, number> {
    return averagePlaces(scoreRows().filter(r => !r.left));
}

export function currentLeaderId(): number {
    const l = uniqueLeader(scoreRows().filter(r => !r.left));
    return l === undefined ? -1 : l.id;
}

/** Отправить таблицы счета и состояния в интерфейс. */
export function pushNet() {
    const rows = scoreRows();
    const order = finalPlaces(rows.filter(r => !r.left));
    const scores: { [id: string]: OrbScoreRow } = {};
    for (const p of allPlayers()) {
        const h = PlayerResource.GetSelectedHeroEntity(p.id);
        const place = order.indexOf(p.id) + 1;
        scores[tostring(p.id)] = {
            id: p.id,
            team: p.team,
            hero: h !== undefined && IsValidEntity(h) ? h.GetUnitName() : PlayerResource.GetSelectedHeroName(p.id),
            k: p.kills,
            d: p.deaths,
            a: p.assists,
            streak: p.streak,
            left: p.left ? 1 : 0,
            bot: p.isBot ? 1 : 0,
            place: place > 0 ? place : 0,
            nw: networthOf(p.id),
        };
    }
    CustomNetTables.SetTableValue("orb_game", "scores", scores);
    CustomNetTables.SetTableValue("orb_game", "state", {
        phase: State.phase,
        goal: State.goal,
        now: Math.floor(gameNow()),
        limit: State.timeLimit,
        leader: currentLeaderId(),
        winner: State.winner,
        players: activePlayers().length,
        hunted: huntedNow(),
    });
}

function huntedNow(): number {
    for (const p of allPlayers()) if (Hooks.isHunted(p.id)) return p.id;
    return -1;
}

export function toast(kind: string, text: string, p1?: string, p2?: string, p3?: string, player?: PlayerID) {
    CustomGameEventManager.Send_ServerToAllClients("orb_toast", { kind, text, p1, p2, p3, player });
}

/** Игрок в бою: бил героя или получал урон от героя за последние 5 секунд. */
export function inFight(id: number): boolean {
    const p = State.players.get(id);
    return p !== undefined && GameRules.GetGameTime() - p.fightAt < 5;
}
