// Безопасный вызов: ошибка в одной системе не останавливает остальные.
// Ошибки печатаются в консоль и показываются в интерфейсе (на серверах Valve консоли не видно).

const lastShown = new Map<string, number>();

export function report(system: string, err: unknown) {
    const text = "[orbthrow] ошибка в «" + system + "»: " + tostring(err);
    print(text);
    const now = Time();
    const prev = lastShown.get(text);
    if (prev !== undefined && now - prev < 30) return;
    lastShown.set(text, now);
    CustomGameEventManager.Send_ServerToAllClients("orb_error", { text });
}

export function safe<T>(system: string, fn: (this: void) => T): T | undefined {
    const [ok, result] = pcall(fn);
    if (!ok) {
        report(system, result);
        return undefined;
    }
    return result as T;
}

export function log(...parts: any[]) {
    print("[orbthrow] " + parts.map(p => tostring(p)).join(" "));
}

export function heroOf(id: PlayerID): CDOTA_BaseNPC_Hero | undefined {
    const h = PlayerResource.GetSelectedHeroEntity(id);
    if (h !== undefined && IsValidEntity(h)) return h;
    return undefined;
}

export function isValid<T extends CBaseEntity>(e: T | undefined): e is T {
    return e !== undefined && IsValidEntity(e) && !e.IsNull();
}

export function dist2d(a: Vector, b: Vector): number {
    return ((a - b) as Vector).Length2D();
}

/** Случайная точка в кольце между rMin и rMax (равномерно по площади). */
export function randomPointInRing(center: Vector, rMin: number, rMax: number): Vector {
    const a2 = rMin * rMin;
    const r = Math.sqrt(a2 + (rMax * rMax - a2) * RandomFloat(0, 1));
    const ang = RandomFloat(0, Math.PI * 2);
    return Vector(center.x + r * Math.cos(ang), center.y + r * Math.sin(ang), center.z);
}

export function randomPointInCircle(center: Vector, radius: number): Vector {
    const r = radius * Math.sqrt(RandomFloat(0, 1));
    const ang = RandomFloat(0, Math.PI * 2);
    return Vector(center.x + r * Math.cos(ang), center.y + r * Math.sin(ang), center.z);
}
