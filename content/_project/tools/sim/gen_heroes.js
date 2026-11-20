// Данные героев для симулятора: способности, значения по уровням, перезарядки (из data/kv).
const fs = require("fs");
const path = require("path");
const { heroSummary } = require("../kv.js");
const root = path.join(__dirname, "../..");
const kvDir = path.join(root, "data/kv");
const lua = v => {
    if (Array.isArray(v)) return "{" + v.map(lua).join(",") + "}";
    if (v !== null && typeof v === "object") return "{" + Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}]=${lua(x)}`).join(",") + "}";
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    return String(v);
};
const heroes = {};
for (const f of fs.readdirSync(kvDir)) {
    if (!/^npc_dota_hero_\w+\.txt$/.test(f)) continue;
    const s = heroSummary(path.join(kvDir, f));
    if (!s.hero) continue;
    const abilities = [];
    for (const name of s.slots) {
        const a = s.abilities[name] || { values: {} };
        abilities.push({
            name,
            ult: a.type === "ABILITY_TYPE_ULTIMATE",
            innate: !!a.innate,
            behavior: a.behavior || "",
            values: a.values,
        });
    }
    heroes[s.hero] = {
        primary: { DOTA_ATTRIBUTE_STRENGTH: 0, DOTA_ATTRIBUTE_AGILITY: 1, DOTA_ATTRIBUTE_INTELLECT: 2, DOTA_ATTRIBUTE_ALL: 3 }[s.primary] ?? 0,
        ranged: s.attackCap === "DOTA_UNIT_CAP_RANGED_ATTACK",
        abilities,
    };
}
fs.mkdirSync(path.join(root, ".sim"), { recursive: true });
fs.writeFileSync(path.join(root, ".sim/heroes.lua"), "-- Сгенерировано tools/sim/gen_heroes.js\nreturn " + lua(heroes) + "\n");
console.log("героев для симулятора:", Object.keys(heroes).length);
