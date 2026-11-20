// Итоги партии (DESIGN 11.9): места, счет, билд и звания. Отправляется в сетевую таблицу при победе.

import { finalPlaces } from "../core/rules";
import { bossOrbsTaken } from "./bossorbs";
import { Hooks } from "./hooks";
import { orbSummary } from "./orbs";
import { State, allPlayers, networthOf, scoreRows } from "./state";
import { orbIcon } from "../core/orbicons";
import { rarityOf } from "../core/orbs";
import { toJson } from "../core/json";
import { BUILD_VERSION } from "../core/version";
import { gameNow } from "./state";
import { log } from "./util";

const leaderKills = new Map<number, number>();

export function initEndscreen() {
    Hooks.onHeroKill.push(k => {
        if (k.victimWasLeader) leaderKills.set(k.killer.id, (leaderKills.get(k.killer.id) ?? 0) + 1);
    });
}

type Metric = (id: number) => number;

/** Звание получает лучший по показателю (ничья — все лучшие), если показатель больше нуля. */
function award(ids: number[], metric: Metric, lowerIsBetter = false): number[] {
    let best: number | undefined;
    for (const id of ids) {
        const v = metric(id);
        if (best === undefined || (lowerIsBetter ? v < best : v > best)) best = v;
    }
    if (best === undefined || (!lowerIsBetter && best <= 0)) return [];
    return ids.filter(id => metric(id) === best);
}

export function publishFinal(winner: number, reason: string) {
    const rows = scoreRows();
    const order = finalPlaces(rows.filter(r => !r.left)).concat(rows.filter(r => r.left).map(r => r.id));
    const active = allPlayers().filter(p => !p.left).map(p => p.id);
    const titles = new Map<number, string[]>();
    const give = (name: string, ids: number[]) => {
        for (const id of ids) titles.set(id, (titles.get(id) ?? []).concat([name]));
    };
    const pl = (id: number) => State.players.get(id)!;
    give("butcher", award(active, id => pl(id).kills));
    give("overthrower", award(active, id => leaderKills.get(id) ?? 0));
    give("forester", award(active, id => orbSummary(id).farm));
    give("keeper", award(active, id => bossOrbsTaken.get(id) ?? 0));
    give("immortal", award(active, id => pl(id).deaths, true));
    give("partner", award(active, id => pl(id).assists));

    const out: Record<string, FinalRowNet> = {};
    order.forEach((id, i) => {
        const p = State.players.get(id);
        if (p === undefined) return;
        const s = orbSummary(id);
        const build: Record<string, string> = {};
        const ic: Record<string, string> = {};
        const rr: Record<string, string> = {};
        s.order.forEach((u, j) => {
            build[tostring(j + 1)] = u;
            ic[u] = orbIcon(u);
            rr[u] = rarityOf(u) ?? "blue";
        });
        const t: Record<string, string> = {};
        (titles.get(id) ?? []).forEach((name, j) => { t[tostring(j + 1)] = name; });
        out[tostring(i + 1)] = {
            id,
            hero: PlayerResource.GetSelectedHeroName(id as PlayerID),
            place: i + 1,
            k: p.kills, d: p.deaths, a: p.assists,
            nw: networthOf(id as PlayerID),
            left: p.left ? 1 : 0,
            bot: p.isBot ? 1 : 0,
            legend: s.legend,
            build,
            titles: t,
            ic,
            rr,
        };
    });
    CustomNetTables.SetTableValue("orb_game", "final", { winner, reason, rows: out });
    logStats(order, winner, reason);
}

/**
 * Одна строка статистики в лог (console.log): по ней настраиваем баланс героев и сфер.
 * Строку начинает ORBTHROW_STATS — автор присылает такие строки после игр, их легко собрать поиском.
 */
function logStats(order: number[], winner: number, reason: string) {
    const players: unknown[] = [];
    order.forEach((id, i) => {
        const p = State.players.get(id);
        if (p === undefined) return;
        const s = orbSummary(id);
        players.push({
            hero: PlayerResource.GetSelectedHeroName(id as PlayerID).replace("npc_dota_hero_", ""),
            place: i + 1, k: p.kills, d: p.deaths, a: p.assists, nw: networthOf(id as PlayerID),
            bot: p.isBot ? 1 : 0, left: p.left ? 1 : 0, legend: s.legend, orbs: s.order,
        });
    });
    log("ORBTHROW_STATS " + toJson({ v: BUILD_VERSION, min: Math.floor(gameNow() / 6) / 10, goal: State.goal, reason, winner: winner >= 0 ? 1 : 0, players }));
}
