// Таймеры на игровом времени: на паузе стоят. Каждый вызов защищен pcall,
// поэтому ошибка в одном таймере не убивает остальные (в отличие от библиотеки timers.lua).

import { safe, report } from "./util";

interface Timer {
    id: number;
    at: number;
    name: string;
    fn: (this: void) => number | void;
}

let timers: Timer[] = [];
let nextId = 1;
let started = false;
// Таймеры, которые выполняются прямо сейчас, и отмененные изнутри своего же вызова
let running = new Set<number>();
const cancelledWhileRunning = new Set<number>();

function tick() {
    const now = GameRules.GetGameTime();
    const due: Timer[] = [];
    const rest: Timer[] = [];
    for (const t of timers) (t.at <= now ? due : rest).push(t);
    timers = rest;
    running = new Set(due.map(t => t.id));
    for (const t of due) {
        if (cancelledWhileRunning.has(t.id)) continue;
        const r = safe(t.name, t.fn);
        if (cancelledWhileRunning.has(t.id)) continue;
        if (typeof r === "number") {
            t.at = now + Math.max(0.03, r);
            timers.push(t);
        }
    }
    running = new Set();
    cancelledWhileRunning.clear();
}

export const Timers = {
    start() {
        if (started) return;
        started = true;
        GameRules.GetGameModeEntity().SetContextThink(
            "orbthrow_timers",
            () => {
                const [ok, err] = pcall(tick);
                if (!ok) report("таймеры", err);
                return 0.05;
            },
            0,
        );
    },
    /** Один раз через delay секунд. Если fn вернет число — повторит через столько секунд. */
    after(delay: number, name: string, fn: (this: void) => number | void): number {
        const id = nextId++;
        timers.push({ id, at: GameRules.GetGameTime() + delay, name, fn });
        return id;
    },
    /** Каждые interval секунд, первый раз через firstDelay. */
    every(interval: number, name: string, fn: (this: void) => void, firstDelay = interval): number {
        return Timers.after(firstDelay, name, () => {
            const [ok, err] = pcall(fn);
            if (!ok) report(name, err);
            return interval;
        });
    },
    /** Отмена работает и изнутри вызова самого таймера. */
    cancel(id: number) {
        timers = timers.filter(t => t.id !== id);
        if (running.has(id)) cancelledWhileRunning.add(id);
    },
    count(): number {
        return timers.length;
    },
};
