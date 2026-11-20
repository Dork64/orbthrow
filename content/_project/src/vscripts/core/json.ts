// Маленький JSON-кодировщик для строки статистики в логе (в Lua нет встроенного JSON).
// Только то, что нужно: числа, строки, логические, массивы и объекты со строковыми ключами.

function esc(s: string): string {
    let out = "";
    for (let i = 0; i < s.length; i++) {
        const c = s.charAt(i);
        if (c === "\"" || c === "\\") out += "\\" + c;
        else if (c === "\n") out += "\\n";
        else out += c;
    }
    return "\"" + out + "\"";
}

export function toJson(v: unknown): string {
    if (v === undefined || v === null) return "null";
    if (typeof v === "number") return v !== v || v === Infinity || v === -Infinity ? "null" : `${Math.floor(v * 100 + 0.5) / 100}`;
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return esc(v);
    if (Array.isArray(v)) return "[" + v.map(x => toJson(x)).join(",") + "]";
    const keys = Object.keys(v as object).sort();
    return "{" + keys.map(k => esc(k) + ":" + toJson((v as Record<string, unknown>)[k])).join(",") + "}";
}
