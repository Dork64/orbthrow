// Чистая логика курьера, Гоблина и механик против отрыва лидера (DESIGN 7.3, 8, 9).

import type { ScoreRow } from "./rules";

// ---------- Курьер ----------

export const COURIER_POOLS: string[][] = [
    [],
    ["falcon_blade", "orb_of_corrosion", "phase_boots", "power_treads", "arcane_boots", "tranquil_boots", "pavise", "urn_of_shadows", "soul_ring", "aghanims_shard"],
    ["vanguard", "veil_of_discord", "mask_of_madness", "dragon_lance", "lesser_crit", "kaya", "sange", "yasha", "glimmer_cape", "force_staff", "vladmir", "rod_of_atos", "aether_lens", "blink"],
    ["blade_mail", "armlet", "diffusal_blade", "echo_sabre", "spirit_vessel", "witch_blade", "basher", "maelstrom", "aeon_disk", "mage_slayer", "invis_sword", "orchid", "heavens_halberd", "solar_crest", "cyclone", "meteor_hammer"],
    ["desolator", "bfury", "black_king_bar", "kaya_and_sange", "sange_and_yasha", "yasha_and_kaya", "ultimate_scepter", "nullifier", "shivas_guard", "hurricane_pike", "gungir", "manta", "bloodstone", "radiance", "sphere", "lotus_orb"],
    ["monkey_king_bar", "refresher", "satanic", "octarine_core", "assault", "ethereal_blade", "greater_crit", "sheepstick", "heart", "butterfly", "mjollnir", "silver_edge", "skadi", "abyssal_blade", "bloodthorn"],
].map(list => list.map(n => "item_" + n));

/** Уровень пула по времени: 3-6 мин — 1, 6-10 — 2, 10-15 — 3, 15-21 — 4, дальше 5. */
export function courierTierByTime(time: number): number {
    const m = time / 60;
    if (m < 6) return 1;
    if (m < 10) return 2;
    if (m < 15) return 3;
    if (m < 21) return 4;
    return 5;
}

/**
 * Поправка по месту: единоличный лидер с отрывом 3+ — уровень ниже,
 * двое последних по убийствам — уровень выше. Пределы 1..5.
 */
export function courierTierFor(time: number, playerId: number, rows: ScoreRow[]): number {
    let tier = courierTierByTime(time);
    const sorted = rows.slice().sort((a, b) => b.kills - a.kills);
    if (sorted.length >= 2 && sorted[0].id === playerId && sorted[0].kills - sorted[1].kills >= 3) tier--;
    if (lastTwo(rows).includes(playerId)) tier++;
    return Math.max(1, Math.min(5, tier));
}

/** Предмет из пула без повтора того, что уже есть у героя. Если все есть — любой. */
export function courierItem(tier: number, owned: string[], rng: (n: number) => number): string {
    const pool = COURIER_POOLS[Math.max(1, Math.min(5, tier))];
    const fresh = pool.filter(n => !owned.includes(n));
    const from = fresh.length > 0 ? fresh : pool;
    return from[rng(from.length)];
}

// ---------- Отстающие ----------

/** Двое последних по убийствам; при равенстве — у кого больше смертей. Нужно минимум 3 игрока. */
export function lastTwo(rows: ScoreRow[]): number[] {
    if (rows.length < 3) return [];
    // Без «||» между числами: в Lua 0 — истина, сравнение сломалось бы.
    const sorted = rows.slice().sort((a, b) => {
        if (a.kills !== b.kills) return a.kills - b.kills;
        if (a.deaths !== b.deaths) return b.deaths - a.deaths;
        return a.id - b.id;
    });
    return [sorted[0].id, sorted[1].id];
}

export function helpGold(minute: number): number {
    return 600 + 30 * minute;
}

// ---------- Месть ----------

export const REVENGE_STEP = 0.1;
export const REVENGE_MAX = 3;

/** Множитель урона attacker → victim с учетом мести в обе стороны. rev[a][b] — месть a против b. */
export function revengeMultiplier(rev: Map<number, Map<number, number>>, attacker: number, victim: number): number {
    const mine = rev.get(attacker)?.get(victim) ?? 0;   // меня убивал victim — бью сильнее
    const theirs = rev.get(victim)?.get(attacker) ?? 0; // я убивал victim — бью слабее
    return (1 + REVENGE_STEP * mine) * (1 - REVENGE_STEP * theirs);
}

/** Убийство: у жертвы растет месть против убийцы, у убийцы сбрасывается месть против жертвы. */
export function revengeOnKill(rev: Map<number, Map<number, number>>, killer: number, victim: number) {
    const v = rev.get(victim) ?? new Map<number, number>();
    v.set(killer, Math.min(REVENGE_MAX, (v.get(killer) ?? 0) + 1));
    rev.set(victim, v);
    rev.get(killer)?.delete(victim);
}

// ---------- Охота ----------

export const HUNT_START_GAP = 4;
export const HUNT_END_GAP = 2;

/** Кто под охотой после шага (-1 — никто). leader — единоличный лидер или -1. */
export function huntStep(hunted: number, leader: number, gap: number): number {
    if (hunted >= 0) {
        if (leader !== hunted || gap <= HUNT_END_GAP) return leader >= 0 && gap >= HUNT_START_GAP ? leader : -1;
        return hunted;
    }
    return leader >= 0 && gap >= HUNT_START_GAP ? leader : -1;
}

// ---------- Гоблин ----------

export function goblinHealth(minute: number): number {
    return 1200 + 150 * minute;
}
