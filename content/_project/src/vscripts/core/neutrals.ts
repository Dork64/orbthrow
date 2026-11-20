// Чистая логика нейтральных предметов: какой тир открыт, сколько жетонов нужно, варианты выбора.
// Без API Доты — проверяется тестами.

import { NEUTRAL_TIERS, NeutralTier } from "./neutraldata";

/** Новый тир каждые 4 минуты: 1-й — с начала партии, 5-й — с 16:00. */
export const NEUTRAL_TIER_EVERY = 240;

export function tierStart(tier: number): number {
    return Math.max(0, (tier - 1) * NEUTRAL_TIER_EVERY);
}

/** Старший открытый тир на момент времени партии. */
export function unlockedTier(now: number): number {
    let t = 0;
    for (const d of NEUTRAL_TIERS) if (now >= tierStart(d.tier)) t = d.tier;
    return t;
}

export function tierDef(tier: number): NeutralTier | undefined {
    for (const d of NEUTRAL_TIERS) if (d.tier === tier) return d;
    return undefined;
}

export interface NeutralNext {
    /** Какой тир создаем: 1-5; 0 — все тиры уже взяты. */
    tier: number;
    cost: number;
    /** Когда откроется (0 — уже открыт). */
    at: number;
}

/**
 * Следующее создание: старший открытый тир, если он выше имеющегося (младшие пропускаются,
 * как в Доте); иначе — следующий тир с временем открытия; после пятого — ничего (один на партию).
 */
export function nextCraft(owned: number, now: number): NeutralNext {
    const open = unlockedTier(now);
    if (open > owned) {
        const d = tierDef(open)!;
        return { tier: open, cost: d.craftCost, at: 0 };
    }
    if (owned >= 5) return { tier: 0, cost: 0, at: 0 };
    const d = tierDef(owned + 1)!;
    return { tier: owned + 1, cost: d.craftCost, at: tierStart(owned + 1) };
}

/** Группа улучшений по основному атрибуту (0 сила, 1 ловкость, 2 интеллект, 3 универсальный). */
export function attrGroup(primaryAttr: number): string {
    if (primaryAttr === 0) return "strength";
    if (primaryAttr === 1) return "agility";
    if (primaryAttr === 2) return "intelligence";
    return "universal";
}

function shuffleTake<T>(list: T[], n: number, rng: (n: number) => number): T[] {
    const left = list.slice();
    const out: T[] = [];
    while (out.length < n && left.length > 0) {
        const i = rng(left.length);
        out.push(left[i]);
        left.splice(i, 1);
    }
    return out;
}

export interface NeutralOffer {
    tier: number;
    trinkets: string[];
    enhancements: [string, number][];
}

/** Варианты на выбор: артефакты тира и улучшения (общие + группа атрибута), без повторов. */
export function makeNeutralOffer(tier: number, primaryAttr: number, rng: (n: number) => number, exclude: string[] = []): NeutralOffer {
    const t = Math.min(5, Math.max(1, tier));
    const d = tierDef(t)!;
    const pool = d.items.filter(i => !exclude.includes(i));
    const trinkets = shuffleTake(pool.length >= d.trinketOptions ? pool : d.items, d.trinketOptions, rng);
    const enh: [string, number][] = [];
    for (const e of (d.enh.global ?? []).concat(d.enh[attrGroup(primaryAttr)] ?? [])) {
        if (!enh.some(x => x[0] === e[0])) enh.push(e);
    }
    return { tier: t, trinkets, enhancements: shuffleTake(enh, d.enhancementOptions, rng) };
}
