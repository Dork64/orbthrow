/** Запас для сфер на способностях, у которых сама Дота не ведёт счётчик. */
export interface ChargePool {
    count: number;
    max: number;
    next: number;
}

export function createChargePool(max: number, now: number, cooldownLeft: number): ChargePool {
    return { count: max - (cooldownLeft > 0 ? 1 : 0), max, next: cooldownLeft > 0 ? now + cooldownLeft : 0 };
}

export function restoreCharges(pool: ChargePool, now: number, duration: number) {
    if (pool.next === 0 || pool.next > now) return;
    const restored = Math.min(pool.max - pool.count, 1 + Math.floor((now - pool.next) / duration));
    pool.count += restored;
    pool.next = pool.count >= pool.max ? 0 : pool.next + restored * duration;
}

export function resizeCharges(pool: ChargePool, max: number) {
    pool.count = Math.min(max, pool.count + Math.max(0, max - pool.max));
    pool.max = max;
    if (pool.count >= max) pool.next = 0;
}

export function spendCharge(pool: ChargePool, now: number, duration: number): boolean {
    restoreCharges(pool, now, duration);
    if (pool.count <= 0) return false;
    pool.count--;
    if (pool.next === 0) pool.next = now + duration;
    return true;
}
