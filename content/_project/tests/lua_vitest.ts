// Мини-замена vitest для запуска тех же тестов в LuaJIT после компиляции TSTL.
// Проверяет, что код ведет себя одинаково в Node и в Lua (ловит особенности TSTL).

declare function print(...args: any[]): void;

let failures = 0;
let passed = 0;
let prefix = "";

export function describe(name: string, fn: () => void) {
    const old = prefix;
    prefix = prefix === "" ? name : prefix + " / " + name;
    fn();
    prefix = old;
}

export function it(name: string, fn: () => void) {
    const [ok, err] = pcall(fn);
    if (ok) passed++;
    else {
        failures++;
        print("FAIL: " + prefix + " / " + name + "\n      " + tostring(err));
    }
}

function isArrayLike(t: any): boolean {
    return type(t) === "table" && (t as any[]).length !== undefined && (t as any[]).length > 0;
}

function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (type(a) !== "table" || type(b) !== "table") return false;
    for (const k in a) if (!deepEqual(a[k], b[k])) return false;
    for (const k in b) if (a[k] === undefined && b[k] !== undefined) return false;
    return true;
}

function show(v: any): string {
    if (type(v) !== "table") return tostring(v);
    const parts: string[] = [];
    for (const k in v) parts.push(tostring(k) + "=" + show((v as any)[k]));
    return "{" + parts.join(", ") + "}";
}

function makeExpect(v: any, negate: boolean) {
    const check = (cond: boolean, msg: string) => {
        if (cond === negate) error((negate ? "NOT " : "") + msg, 2);
    };
    return {
        toBe: (e: any) => check(v === e, "ожидалось " + show(e) + ", получено " + show(v)),
        toEqual: (e: any) => check(deepEqual(v, e), "ожидалось " + show(e) + ", получено " + show(v)),
        toBeUndefined: () => check(v === undefined, "ожидалось undefined, получено " + show(v)),
        toBeDefined: () => check(v !== undefined, "ожидалось значение"),
        toBeTruthy: () => check(!!v, "ожидалось истинное, получено " + show(v)),
        toBeFalsy: () => check(!v, "ожидалось ложное, получено " + show(v)),
        toBeCloseTo: (e: number, digits = 2) => check(Math.abs(v - e) < Math.pow(10, -digits) / 2, "ожидалось ≈" + e + ", получено " + v),
        toBeGreaterThan: (e: number) => check(v > e, "ожидалось > " + e + ", получено " + v),
        toBeGreaterThanOrEqual: (e: number) => check(v >= e, "ожидалось >= " + e + ", получено " + v),
        toBeLessThan: (e: number) => check(v < e, "ожидалось < " + e + ", получено " + v),
        toBeLessThanOrEqual: (e: number) => check(v <= e, "ожидалось <= " + e + ", получено " + v),
        toContain: (e: any) => check((v as any[]).includes(e), "ожидалось наличие " + show(e) + " в " + show(v)),
    };
}

export function expect(v: any) {
    const base = makeExpect(v, false);
    return { ...base, not: makeExpect(v, true) };
}

export function summary(): number {
    print("Lua-тесты: прошло " + passed + ", упало " + failures);
    return failures;
}
