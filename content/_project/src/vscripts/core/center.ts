// Чистая логика центра: редкость сфер Повелителя, захват, Свержение (DESIGN 6.2-6.5).

import { CONFIG } from "./config";

export type BossOrbRarity = "blue" | "purple";

/** Редкость сферы по времени партии; roll — случайное число 0..1. */
export function bossOrbRarity(time: number, roll: number): BossOrbRarity {
    if (time < CONFIG.bossOrbPurpleFrom) return "blue";
    const chance = time < CONFIG.bossOrbPurpleLate ? CONFIG.bossOrbPurpleChanceMid : CONFIG.bossOrbPurpleChanceLate;
    return roll < chance ? "purple" : "blue";
}

export interface CaptureState {
    holder: number;   // кто захватывает (-1 — никто)
    progress: number; // секунды удержания
    contested: boolean;
}

/**
 * Шаг захвата.
 * - никого в круге: прогресс медленно падает;
 * - двое и больше: прогресс замирает;
 * - один: если захватывал другой — сначала откат его прогресса, потом свой рост.
 * Возвращает true, когда сфера захвачена.
 */
export function captureStep(s: CaptureState, inside: number[], dt: number, need: number = CONFIG.bossOrbCaptureTime): boolean {
    s.contested = inside.length >= 2;
    if (inside.length === 0) {
        s.progress = Math.max(0, s.progress - CONFIG.bossOrbDecayPerSecond * dt);
        if (s.progress === 0) s.holder = -1;
        return false;
    }
    if (s.contested) return false;
    const pid = inside[0];
    if (s.holder === -1 || s.holder === pid) {
        s.holder = pid;
        s.progress += dt;
        return s.progress >= need;
    }
    s.progress -= dt;
    if (s.progress <= 0) {
        s.progress = 0;
        s.holder = pid;
    }
    return false;
}

/** Сектор кольца (0..7) по углу точки. */
export function sectorOf(x: number, y: number): number {
    let a = Math.atan2(y, x);
    if (a < 0) a += Math.PI * 2;
    return Math.floor(a / (Math.PI / 4)) % 8;
}

/** Выбрать сектор, не совпадающий с двумя последними. rng(n) → 0..n-1. */
export function pickSector(recent: number[], rng: (n: number) => number): number {
    const free: number[] = [];
    for (let i = 0; i < 8; i++) if (!recent.includes(i)) free.push(i);
    return free[rng(free.length)];
}

/**
 * Свержение: лидер, который когда-то отрывался на 5+, потерял единоличное лидерство.
 * armed — кто «заряжен» (-1 — никто). Возвращает новое значение armed и сработало ли Свержение.
 */
export function overthrowStep(armed: number, leader: number, gap: number): { armed: number; fired: boolean } {
    if (armed >= 0 && leader !== armed) return { armed: -1, fired: true };
    if (leader >= 0 && gap >= CONFIG.overthrowGap) return { armed: leader, fired: false };
    return { armed, fired: false };
}
