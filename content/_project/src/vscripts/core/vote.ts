// Голосование в лобби (просьба автора 31.10): до скольки убийств и сколько минут играть.
// Без API Доты — проверяется тестами.

export const KILL_OPTIONS = [20, 30, 40, 50];
export const MINUTE_OPTIONS = [20, 30, 40, 50];
export const DEFAULT_MINUTES = 30;

/**
 * Итог голосования: вариант с наибольшим числом голосов.
 * Ничья — вариант ближе к значению по умолчанию, при равенстве — меньший.
 * Нет голосов — значение по умолчанию.
 */
export function tally(votes: number[], options: number[], fallback: number): number {
    const count = new Map<number, number>();
    for (const v of votes) if (options.includes(v)) count.set(v, (count.get(v) ?? 0) + 1);
    if (count.size === 0) return fallback;
    let best = -1;
    let bestN = -1;
    for (const o of options) {
        const n = count.get(o) ?? 0;
        if (n === 0) continue;
        if (n > bestN) { best = o; bestN = n; continue; }
        if (n === bestN) {
            const dBest = Math.abs(best - fallback);
            const dO = Math.abs(o - fallback);
            if (dO < dBest || (dO === dBest && o < best)) best = o;
        }
    }
    return best;
}

/** Сколько голосов у каждого варианта. */
export function voteCounts(votes: number[], options: number[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const o of options) out[`${o}`] = 0;
    for (const v of votes) if (options.includes(v)) out[`${v}`] = (out[`${v}`] ?? 0) + 1;
    return out;
}
