// Документ со своими фиолетовыми и легендарными сферами всех героев (docs/HERO_ORBS.md).
// Создается из data/orbs при каждой сборке, чтобы описание не расходилось с данными.
const fs = require("fs");
const path = require("path");

function build(root) {
    const read = f => JSON.parse(fs.readFileSync(path.join(root, "data/orbs", f), "utf8"));
    const byHero = {};
    const add = (hero, e) => { (byHero[hero] = byHero[hero] || []).push(e); };
    for (const [rarity, file] of [["purple", "purple.json"], ["legend", "legend.json"]]) {
        for (const [hero, list] of Object.entries(read(file))) {
            if (hero.startsWith("_")) continue;
            for (const e of list) add(hero, { id: e[0], r: rarity, branch: e[1], ru: e[5], ru_d: e[7], ru_aw: e[9] });
        }
    }
    const dir = path.join(root, "data/orbs/heroes");
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        for (const e of d.orbs) add(d.hero, e);
    }
    const name = h => h.replace("npc_dota_hero_", "").split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
    const order = { Q: 0, W: 1, E: 2, R: 3, H: 4 };
    let md = "# Свои сферы героев\n\nСоздается `tools/heroesdoc.js` из `data/orbs` при каждой сборке — не править руками.\n" +
        "Синие сферы — в `HEROES.md`, общие фиолетовые — там же, раздел 3.\n";
    for (const hero of Object.keys(byHero).sort((a, b) => name(a).localeCompare(name(b)))) {
        const list = byHero[hero].sort((a, b) => order[a.branch] - order[b.branch]);
        md += `\n## ${name(hero)}\n\n**Фиолетовые**\n\n| Ветка | Название | Эффект |\n|---|---|---|\n`;
        for (const e of list.filter(e => e.r === "purple" && !e.mech)) md += `| ${e.branch} | ${e.ru} | ${e.ru_d} |\n`;
        const mech = list.filter(e => e.r === "purple" && e.mech);
        if (mech.length > 0) {
            md += `\n**Механики** (фиолетовые с меткой «МЕХАНИКА», приходят и в синих)\n\n| Ветка | Название | Эффект |\n|---|---|---|\n`;
            for (const e of mech) md += `| ${e.branch} | ${e.ru} | ${e.ru_d} |\n`;
        }
        md += `\n**Легендарки**\n\n| Ветка | Название | Эффект | Пробуждение |\n|---|---|---|---|\n`;
        for (const e of list.filter(e => e.r === "legend")) md += `| ${e.branch} | ${e.ru} | ${e.ru_d} | ${(e.ru_aw || "").replace(/^Пробуждение: /, "")} |\n`;
    }
    fs.writeFileSync(path.join(root, "docs/HERO_ORBS.md"), md);
}

module.exports = { build };
if (require.main === module) build(path.join(__dirname, ".."));
