const fs = require("node:fs");
const path = require("node:path");
const { readCatalog } = require("../orbs.js");
const names = require("./names.json");

const root = path.resolve(__dirname, "../..");
const { grey, ups, tokens, pool, statLabels, specialCaps } = readCatalog(root);

const rulesSource = fs.readFileSync(path.join(root, "src/vscripts/core/orbs.ts"), "utf8");
const fields = ["greyNeed", "blueFirst", "blueStep", "purpleFirst", "purpleStep", "killPoints", "assistPoints",
    "stackLimit", "mechInBluePct", "legendLevel", "secondLegendTime", "awakeningLevel"];
const rules = Object.fromEntries(fields.map(key => {
    const value = rulesSource.match(new RegExp(`\\b${key}: (\\d+),`))?.[1];
    if (value === undefined) throw new Error(`Wiki: missing ${key} in orb rules`);
    return [key, Number(value)];
}));

const plainName = id => id.replace(/^npc_dota_hero_/, "").split("_").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
const heroes = Object.fromEntries(pool.map(id => [id, names.heroes[id] ?? ["", plainName(id)]]));
const abilityIds = [...new Set(ups.map(orb => orb.ability).filter(Boolean))];
const abilities = Object.fromEntries(abilityIds.map(id => [id, names.abilities[id] ?? ["", plainName(id)]]));

function formatMod(mod, ability) {
    const label = statLabels[mod.key];
    return {
        name: label?.[0] ?? mod.key.replaceAll("_", " "),
        value: mod.add,
        operation: mod.op ?? "add",
        unit: mod.unit || label?.[2] || "",
        cap: specialCaps[ability]?.[mod.key],
    };
}

function orbText(id) {
    const key = `orb_up_${id}`;
    return {
        title: tokens.russian[key],
        english: tokens.english[key],
        description: tokens.russian[`${key}_d`],
        awakening: tokens.russian[`${key}_aw`]?.replace(/^Пробуждение:\s*/i, ""),
    };
}

const orbs = [
    ...grey.map(orb => ({ id: orb.id, ...orbText(orb.id), rarity: "grey", hero: "*", max: rules.stackLimit })),
    ...ups.map(orb => ({
        id: orb.id,
        ...orbText(orb.id),
        rarity: orb.rarity,
        hero: orb.hero,
        branch: orb.branch,
        ability: orb.ability,
        mechanic: orb.mech,
        max: orb.rarity === "blue" || (orb.rarity === "purple" && orb.hero === "*") ? rules.stackLimit : orb.max,
        mods: orb.mods.map(mod => formatMod(mod, orb.ability)),
        awakeningMods: orb.awmods?.map(mod => formatMod(mod, orb.ability)),
    })),
];

const payload = JSON.stringify({ orbs, heroes, abilities, rules }).replaceAll("<", "\\u003c");
const cover = fs.readFileSync(path.join(root, "publish/preview_wide.jpg")).toString("base64");
const template = fs.readFileSync(path.join(__dirname, "index.template.html"), "utf8");
const html = template.replace("<!-- CATALOG_JSON -->", () => payload).replace("COVER_IMAGE_DATA", () => cover);
const output = path.join(root, "docs/orbs-wiki.html");
fs.writeFileSync(output, html);
console.log(`Сферы: ${orbs.length}. Герои: ${pool.length}. ${output}`);
