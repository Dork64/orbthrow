// Общие помощники эффектов сфер-кода (сервер, клиент, тесты).

import type { FxDef, FxNum } from "./fxtypes";
import { FX_LIST } from "./fxdata";

const byOrb = new Map<string, FxDef[]>();
const byKey = new Map<string, FxDef>();
for (const f of FX_LIST) {
    const list = byOrb.get(f.orb) ?? [];
    list.push(f);
    byOrb.set(f.orb, list);
    byKey.set(f.key, f);
}

/** Эффекты сферы. */
export function fxOfOrb(orb: string): FxDef[] {
    return byOrb.get(orb) ?? [];
}

export function fxByKey(key: string): FxDef | undefined {
    return byKey.get(key);
}

const awakeCache = new Map<string, FxDef>();

/** Эффект с учетом Пробуждения: поля из aw заменяют исходные (props и debuff — по отдельным свойствам). */
export function fxView(f: FxDef, awake: boolean): FxDef {
    if (!awake || f.aw === undefined) return f;
    const cached = awakeCache.get(f.key);
    if (cached !== undefined) return cached;
    const out: Record<string, unknown> = {};
    const src = f as unknown as Record<string, unknown>;
    for (const k in src) out[k] = src[k];
    const aw = f.aw;
    for (const k in aw) {
        const a = aw[k];
        const b = src[k];
        if (typeof a === "object" && a !== undefined && !Array.isArray(a) && typeof b === "object" && b !== undefined && !Array.isArray(b)) {
            const merged: Record<string, unknown> = {};
            for (const kk in b as Record<string, unknown>) merged[kk] = (b as Record<string, unknown>)[kk];
            for (const kk in a as Record<string, unknown>) {
                const av = (a as Record<string, unknown>)[kk];
                const bv = (b as Record<string, unknown>)[kk];
                if (kk === "props" && typeof av === "object" && typeof bv === "object") {
                    const p: Record<string, unknown> = {};
                    for (const x in bv as Record<string, unknown>) p[x] = (bv as Record<string, unknown>)[x];
                    for (const x in av as Record<string, unknown>) p[x] = (av as Record<string, unknown>)[x];
                    merged[kk] = p;
                } else merged[kk] = av;
            }
            out[k] = merged;
        } else out[k] = a;
    }
    const view = out as unknown as FxDef;
    awakeCache.set(f.key, view);
    return view;
}

/** Разбор «ключ» или «ключ*множитель». */
export function parseFxExpr(s: string): { key: string; mult: number } {
    const i = s.indexOf("*");
    if (i < 0) return { key: s, mult: 1 };
    const m = Number(s.substring(i + 1));
    return { key: s.substring(0, i), mult: m === m ? m : 1 };
}

/**
 * Значение числа эффекта. Строку берем из способности: special(ключ) × множитель.
 * special — функция, читающая значение способности (на сервере и клиенте своя).
 */
export function fxNum(v: FxNum | undefined, special: (key: string) => number): number {
    if (v === undefined) return 0;
    if (typeof v === "number") return v;
    const e = parseFxExpr(v);
    return special(e.key) * e.mult;
}
