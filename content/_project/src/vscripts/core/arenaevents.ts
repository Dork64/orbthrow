// События арены (12.11): раз в несколько минут на всю карту включается короткое событие,
// которое меняет правила на 40-60 секунд. Чистая логика: расписание и выбор события.

export type ArenaEventId = "bloodmoon" | "goldrain" | "storm" | "haste";

export const ARENA_EVENTS: ArenaEventId[] = ["bloodmoon", "goldrain", "storm", "haste"];

export const ARENA = {
    /** Первое событие (секунды партии). */
    first: 7 * 60,
    /** Дальше — раз в столько секунд. */
    every: 5 * 60,
    /** Предупреждение до начала. */
    warn: 10,
    /** Не начинать новое событие позже, чем за столько секунд до конца времени. */
    tailGuard: 60,
    duration: { bloodmoon: 60, goldrain: 45, storm: 40, haste: 45 } as Record<ArenaEventId, number>,
    // Кровавая луна
    moonLifesteal: 20,
    moonKillPurple: 2,
    moonKillGoldBase: 100,
    moonKillGoldPerMin: 10,
    // Золотой дождь: шанс монеты каждые полсекунды
    rainCoinChance: 0.35,
    // Гроза
    stormEvery: 1.5,
    stormDelay: 1.2,
    stormRadius: 225,
    stormDmgBase: 40,
    stormDmgMaxHpPct: 8,
    stormStun: 0.4,
    // Ускорение
    hasteMs: 25,
    hasteCdr: 30,
    hasteMana: 50,
};

/** Время начала события номер n (с нуля). */
export function eventStart(n: number): number {
    return ARENA.first + n * ARENA.every;
}

/** Можно ли начинать событие в момент t при лимите времени limit (овертайм — limit 0). */
export function eventAllowed(t: number, limit: number, overtime: boolean): boolean {
    if (overtime) return true;
    return limit <= 0 || t + ARENA.tailGuard <= limit;
}

/** Случайное событие, не повторяющее предыдущее. rnd(n) — целое от 0 до n-1. */
export function pickEvent(prev: ArenaEventId | undefined, rnd: (n: number) => number): ArenaEventId {
    const pool = ARENA_EVENTS.filter(e => e !== prev);
    return pool[Math.max(0, Math.min(pool.length - 1, rnd(pool.length)))];
}
