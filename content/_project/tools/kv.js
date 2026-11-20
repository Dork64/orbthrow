// Разбор KeyValues Valve (KV1) и выгрузка способностей героев для работы над сферами.
// Использование: node tools/kv.js data/kv/npc_dota_hero_axe.txt  → сводка способностей.
const fs = require("fs");

function parseKV(text) {
    let i = 0;
    const n = text.length;
    function skip() {
        for (;;) {
            while (i < n && /\s/.test(text[i])) i++;
            if (text.startsWith("//", i)) { while (i < n && text[i] !== "\n") i++; continue; }
            if (text[i] === "#") { while (i < n && text[i] !== "\n") i++; continue; }
            break;
        }
    }
    function str() {
        skip();
        if (text[i] === '"') {
            i++;
            let s = "";
            while (i < n && text[i] !== '"') { if (text[i] === "\\" && i + 1 < n) { s += text[i + 1]; i += 2; continue; } s += text[i++]; }
            i++;
            return s;
        }
        let s = "";
        while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
        return s;
    }
    function obj() {
        const o = {};
        for (;;) {
            skip();
            if (i >= n) return o;
            if (text[i] === "}") { i++; return o; }
            const k = str();
            skip();
            let v;
            if (text[i] === "{") { i++; v = obj(); } else v = str();
            skip();
            if (text[i] === "[") { while (i < n && text[i] !== "]") i++; i++; } // условия платформ
            if (o[k] !== undefined && typeof o[k] === "object" && typeof v === "object") Object.assign(o[k], v);
            else o[k] = v;
        }
    }
    return obj();
}

function loadHeroFile(path) {
    return parseKV(fs.readFileSync(path, "utf8"));
}

/** Значения способности: ключ → {levels: number[], raw}. */
function abilityValues(ab) {
    const out = {};
    const av = ab.AbilityValues || {};
    for (const [k, v] of Object.entries(av)) {
        const raw = typeof v === "object" ? v.value : v;
        if (raw === undefined) continue;
        out[k] = String(raw).trim().split(/\s+/).map(Number);
    }
    for (const k of ["AbilityCooldown", "AbilityManaCost", "AbilityCastRange", "AbilityCharges", "AbilityChargeRestoreTime", "AbilityDuration", "AbilityDamage"]) {
        if (ab[k] !== undefined && out[k] === undefined) out[k] = String(ab[k]).trim().split(/\s+/).map(Number);
    }
    return out;
}

function heroSummary(path) {
    const kv = loadHeroFile(path);
    const root = kv.DOTAAbilities || kv.DOTAHeroes || kv;
    const res = { hero: null, abilities: {} };
    // Герой и список способностей
    for (const [name, def] of Object.entries(kv)) {
        if (typeof def !== "object") continue;
        for (const [k, v] of Object.entries(def)) {
            if (k.startsWith("npc_dota_hero_") && typeof v === "object") {
                res.hero = k;
                res.slots = [];
                for (let s = 1; s <= 9; s++) {
                    const a = v["Ability" + s];
                    if (a && a !== "generic_hidden" && !a.startsWith("special_bonus")) res.slots.push(a);
                }
                res.primary = v.AttributePrimary;
                res.attackCap = v.AttackCapabilities;
                res.defs = v.AbilityDefinitions || {};
            }
        }
    }
    const abilitiesRoot = Object.assign({}, kv.DOTAAbilities || {}, res.defs || {});
    for (const [name, def] of Object.entries(abilitiesRoot)) {
        if (typeof def !== "object" || name.startsWith("special_bonus")) continue;
        res.abilities[name] = {
            innate: def.Innate === "1",
            type: def.AbilityType,
            behavior: def.AbilityBehavior,
            values: abilityValues(def),
            grantedUpgrade: def.IsGrantedByScepter === "1" || def.IsGrantedByShard === "1",
            upgradeKeys: Object.entries(def.AbilityValues || {}).filter(([key, v]) =>
                typeof v === "object" && Object.entries(v).some(([k, value]) =>
                    /^special_bonus_(scepter|shard)$/.test(k) && String(value).split(/\s+/).some(n => Number(n.replace(/^[+=]/, "").replace(/%$/, "")) !== 0)))
                .map(([key]) => key),
        };
    }
    return res;
}

module.exports = { parseKV, loadHeroFile, heroSummary, abilityValues };

if (require.main === module) {
    for (const p of process.argv.slice(2)) {
        const s = heroSummary(p);
        console.log("== " + s.hero + " (" + s.primary + ", " + s.attackCap + ") слоты: " + (s.slots || []).join(", "));
        for (const a of s.slots || []) {
            const d = s.abilities[a];
            if (!d) { console.log("  " + a + " — нет описания"); continue; }
            console.log("  " + a + (d.innate ? " [врожденная]" : "") + (d.type ? " " + d.type : ""));
            for (const [k, v] of Object.entries(d.values)) console.log("     " + k + " = " + v.join(" "));
        }
    }
}
