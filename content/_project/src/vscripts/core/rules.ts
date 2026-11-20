// Чистые правила арены: лимит, места, возрождение, награды, победа.
// Без обращений к API Доты — проверяется тестами в Node и в LuaJIT.

import { CONFIG } from "./config";

export interface ScoreRow {
    id: number;
    kills: number;
    deaths: number;
    networth: number;
    left?: boolean;
}

/** Лимит убийств: 16 + 1.5 × игроков, в пределах 20…30, с множителем длины партии. */
export function killGoal(players: number, lengthMul = 1): number {
    const raw = CONFIG.goalBase + CONFIG.goalPerPlayer * players;
    const clamped = Math.max(CONFIG.goalMin, Math.min(CONFIG.goalMax, Math.floor(raw + 0.5)));
    return Math.max(1, Math.floor(clamped * lengthMul + 0.5));
}

/** Длина партии из настроек лобби: множитель лимита убийств и времени. */
export const LENGTHS: Record<string, number> = { short: 0.8, normal: 1, long: 1.25 };

export function timeLimitFor(lengthMul: number): number {
    return Math.floor((CONFIG.timeLimit * lengthMul) / 60 + 0.5) * 60;
}

/** Лимит после ухода игрока: −2, но не ниже «счет лидера + 1». */
export function goalAfterAbandon(goal: number, leaderKills: number): number {
    return Math.max(goal - CONFIG.abandonGoalReduction, leaderKills + 1);
}

/**
 * Средние места по убийствам: равные по убийствам делят среднее место.
 * Используется для времени возрождения и скорости серой шкалы.
 */
export function averagePlaces(rows: ScoreRow[]): Map<number, number> {
    const sorted = rows.slice().sort((a, b) => b.kills - a.kills);
    const result = new Map<number, number>();
    let i = 0;
    while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1].kills === sorted[i].kills) j++;
        const avg = (i + 1 + (j + 1)) / 2;
        for (let k = i; k <= j; k++) result.set(sorted[k].id, avg);
        i = j + 1;
    }
    return result;
}

/** Итоговые места: убийства, потом меньше смертей, потом больше нетворс, потом номер игрока. */
export function finalPlaces(rows: ScoreRow[]): number[] {
    return rows
        .slice()
        .sort((a, b) => {
            if (b.kills !== a.kills) return b.kills - a.kills;
            if (a.deaths !== b.deaths) return a.deaths - b.deaths;
            if (b.networth !== a.networth) return b.networth - a.networth;
            return a.id - b.id;
        })
        .map(r => r.id);
}

/** Линейная интерполяция по месту: 1-е место → first, последнее → last. */
export function byPlace(place: number, players: number, first: number, last: number): number {
    if (players <= 1) return first;
    const t = Math.max(0, Math.min(1, (place - 1) / (players - 1)));
    return first + (last - first) * t;
}

export function respawnTime(place: number, players: number): number {
    return byPlace(place, players, CONFIG.respawnFirst, CONFIG.respawnLast);
}

/** Единоличный лидер или undefined, если лидеров несколько. */
export function uniqueLeader(rows: ScoreRow[]): ScoreRow | undefined {
    let best: ScoreRow | undefined;
    let tie = false;
    for (const r of rows) {
        if (best === undefined || r.kills > best.kills) {
            best = r;
            tie = false;
        } else if (r.kills === best.kills) {
            tie = true;
        }
    }
    return tie ? undefined : best;
}

/** Отрыв лидера от второго места (0, если игроков меньше двух). */
export function leaderGap(rows: ScoreRow[]): number {
    if (rows.length < 2) return 0;
    const k = rows.map(r => r.kills).sort((a, b) => b - a);
    return k[0] - k[1];
}

export type VictoryCheck =
    | { kind: "none" }
    | { kind: "winner"; id: number; reason: "goal" | "time" | "overtime" | "lastPlayer" }
    | { kind: "overtime" };

/**
 * Проверка конца партии.
 * - кто-то набрал лимит → победа;
 * - время вышло → единоличный лидер побеждает, иначе овертайм;
 * - в овертайме первый единоличный лидер побеждает.
 */
export function checkVictory(rows: ScoreRow[], goal: number, time: number, inOvertime: boolean, timeLimit: number = CONFIG.timeLimit): VictoryCheck {
    const active = rows.filter(r => !r.left);
    const reached = active.filter(r => r.kills >= goal).sort((a, b) => b.kills - a.kills);
    if (reached.length > 0) return { kind: "winner", id: reached[0].id, reason: "goal" };
    if (time >= timeLimit || inOvertime) {
        const leader = uniqueLeader(active);
        if (leader) return { kind: "winner", id: leader.id, reason: inOvertime ? "overtime" : "time" };
        return { kind: "overtime" };
    }
    return { kind: "none" };
}

// ---------- Награды за убийство ----------

export interface KillContext {
    victimLevel: number;
    victimNetworth: number;
    killerNetworth: number;
    victimStreak: number;
    victimHunted: boolean;
}

export function killGold(c: KillContext): number {
    let gold = CONFIG.killGoldBase + CONFIG.killGoldPerLevel * c.victimLevel;
    const diff = c.victimNetworth - c.killerNetworth;
    if (diff > 0) gold += Math.min(CONFIG.killGoldNetworthCap, diff * CONFIG.killGoldNetworthShare);
    if (c.victimStreak >= 3) gold += Math.min(CONFIG.killGoldStreakCap, CONFIG.killGoldStreakStep * (c.victimStreak - 2));
    if (c.victimHunted) gold += CONFIG.huntGold;
    return Math.floor(gold);
}

/** Золото каждому помогавшему: 35% золота убийцы, поровну. */
export function assistGoldEach(killerGold: number, assisters: number): number {
    if (assisters <= 0) return 0;
    return Math.floor((killerGold * CONFIG.assistGoldShare) / assisters);
}

/** Опыт каждому участнику убийства. */
export function killXpEach(victimTotalXp: number, assisters: number): number {
    return Math.floor((CONFIG.killXpBase + CONFIG.killXpShare * victimTotalXp) / (1 + assisters));
}

// ---------- Учет урона для помощи и засчитывания ----------

export interface DamageRecord {
    attacker: number; // номер игрока
    time: number;
    amount: number;
}

/** Последний вражеский игрок, нанесший урон за окно (для добивания нейтралом и т.п.). */
export function lastDamager(records: DamageRecord[], now: number, victimId: number): number | undefined {
    let best: DamageRecord | undefined;
    for (const r of records) {
        if (r.attacker === victimId) continue;
        if (now - r.time > CONFIG.creditWindow) continue;
        if (best === undefined || r.time > best.time) best = r;
    }
    return best?.attacker;
}

/** Помогавшие: суммарный урон за окно не меньше доли макс. здоровья жертвы. */
export function assistersOf(records: DamageRecord[], now: number, victimId: number, killerId: number, victimMaxHp: number): number[] {
    const sum = new Map<number, number>();
    for (const r of records) {
        if (r.attacker === victimId || r.attacker === killerId) continue;
        if (now - r.time > CONFIG.assistWindow) continue;
        sum.set(r.attacker, (sum.get(r.attacker) ?? 0) + r.amount);
    }
    const need = victimMaxHp * CONFIG.assistMinHpShare;
    const result: number[] = [];
    for (const [id, total] of sum) if (total >= need) result.push(id);
    result.sort((a, b) => a - b);
    return result;
}

/** Оставить только записи свежее окна (чтобы список не рос бесконечно). */
export function pruneDamage(records: DamageRecord[], now: number): DamageRecord[] {
    const keep = Math.max(CONFIG.assistWindow, CONFIG.creditWindow);
    return records.filter(r => now - r.time <= keep);
}

// ---------- Распределение баз ----------

/**
 * Какие базы занять, чтобы игроки стояли равномерно по кругу.
 * bases — число баз на карте (10), players — сколько игроков. Возвращает индексы баз по кругу.
 */
export function spreadBases(bases: number, players: number): number[] {
    const n = Math.max(0, Math.min(bases, players));
    const used: number[] = [];
    for (let i = 0; i < n; i++) {
        let idx = Math.floor((i * bases) / n + 0.5) % bases;
        while (used.includes(idx)) idx = (idx + 1) % bases;
        used.push(idx);
    }
    return used;
}
