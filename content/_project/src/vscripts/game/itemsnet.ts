// Сетевая таблица orb_items/<игрок>: расходники (slots.ts) и нейтральные предметы (neutrals.ts).
// Каждый модуль отдает свою часть; таблица пишется только при изменении.

const parts: ((pid: number) => Record<string, unknown>)[] = [];
const dirty = new Set<number>();
const lastSig = new Map<number, string>();

export function resetItemsNet() {
    parts.length = 0;
    dirty.clear();
    lastSig.clear();
}

export function addItemsNetPart(fn: (pid: number) => Record<string, unknown>) {
    parts.push(fn);
}

export function markItemsDirty(pid: number) {
    dirty.add(pid);
}

function sigOf(v: unknown): string {
    if (type(v) !== "table") return tostring(v);
    const keys: string[] = [];
    for (const k in v as Record<string, unknown>) keys.push(k);
    keys.sort();
    let s = "{";
    for (const k of keys) s += k + "=" + sigOf((v as Record<string, unknown>)[k]) + ",";
    return s + "}";
}

/** Отправить таблицу игрока, если она изменилась (force — каждый вызов проверяет). */
export function pushItemsNet(pid: number, force = false) {
    if (!force && !dirty.has(pid)) return;
    dirty.delete(pid);
    const t: Record<string, unknown> = {};
    for (const fn of parts) {
        const part = fn(pid);
        for (const k in part) t[k] = part[k];
    }
    const sig = sigOf(t);
    if (lastSig.get(pid) === sig) return;
    lastSig.set(pid, sig);
    CustomNetTables.SetTableValue("orb_items", tostring(pid), t as unknown as OrbItemsNet);
}
