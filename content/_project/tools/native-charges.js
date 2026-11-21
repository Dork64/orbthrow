const fs = require("node:fs");
const path = require("node:path");
const { heroSummary } = require("./kv.js");

function valueOf(value) {
    return typeof value === "object" ? value.value : value;
}

function hasPositive(value) {
    return String(valueOf(value) ?? "").split(/\s+/).some(value => Number(value) > 0);
}

function kvEntries(record, indent) {
    return Object.entries(record).map(([key, value]) => typeof value === "object"
        ? `${indent}"${key}"\n${indent}{\n${kvEntries(value, indent + "\t")}\n${indent}}`
        : `${indent}"${key}"\t"${value}"`).join("\n");
}

function buildNativeCharges(root, { pool, ups, fxList }) {
    const summaries = new Map(pool.map(hero => [hero, heroSummary(path.join(root, "data/kv", hero + ".txt"))]));
    const selected = new Map();
    for (const u of ups) {
        if ([...u.mods, ...(u.awmods ?? [])].some(mod => mod.key === "AbilityCharges")) selected.set(u.ability, u.hero);
    }
    for (const fx of fxList) if (fx.t === "charges" && fx.ab) selected.set(fx.ab, fx.hero);

    // Общая легендарка на ультимейт выпадает только героям без своих легендарок.
    if (ups.some(u => u.id === "l_double_ult")) {
        for (const [hero, summary] of summaries) {
            if (ups.some(u => u.rarity === "legend" && u.hero === hero)) continue;
            for (const ability of summary.slots) {
                const def = summary.defs[ability];
                if (def?.AbilityType === "ABILITY_TYPE_ULTIMATE" && !/PASSIVE|TOGGLE|HIDDEN/.test(def.AbilityBehavior ?? "") &&
                    hasPositive(def.AbilityValues?.AbilityCooldown ?? def.AbilityCooldown)) selected.set(ability, hero);
            }
        }
    }

    const overrides = {};
    for (const [ability, hero] of [...selected].sort(([a], [b]) => a.localeCompare(b))) {
        const def = summaries.get(hero)?.defs[ability];
        if (def === undefined) throw new Error(`Штатные заряды: не найдена способность ${ability}`);
        const values = def.AbilityValues ?? {};
        const charges = values.AbilityCharges ?? def.AbilityCharges;
        const restore = values.AbilityChargeRestoreTime ?? def.AbilityChargeRestoreTime;
        if (charges !== undefined && hasPositive(restore)) continue;
        const abilityValues = {};
        if (charges === undefined) abilityValues.AbilityCharges = "0";
        if (!hasPositive(restore)) {
            const cooldown = values.AbilityCooldown ?? def.AbilityCooldown;
            if (!hasPositive(cooldown)) throw new Error(`Штатные заряды: нет времени восстановления для ${ability}`);
            // При нуле зарядов остаётся обычный КД. После сферы движок берёт его значения, включая таланты, для восстановления зарядов.
            abilityValues.AbilityChargeRestoreTime = cooldown;
        }
        overrides[ability] = { AbilityValues: abilityValues };
    }

    const output = path.join(root, "build/game/scripts/npc/orb_ability_charges.txt");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `// Сгенерировано tools/native-charges.js из игровых данных и сфер.\n${kvEntries({ DOTAAbilities: overrides }, "")}\n`);
    console.log(`Штатные заряды: ${selected.size} способностей, подготовлено ${Object.keys(overrides).length}`);
}

module.exports = { buildNativeCharges };
