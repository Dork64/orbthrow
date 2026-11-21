// Генерация файлов перевода Доты (UTF-16 LE с BOM — иначе Дота молча их игнорирует).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(root, "build/game/resource");
fs.mkdirSync(out, { recursive: true });
const langs = { russian: "Russian", english: "English" };
const ru = JSON.parse(fs.readFileSync(path.join(root, "data/locale/russian.json"), "utf8"));
const orbs = require("./orbs.js").build(root); // данные сфер: проверка по файлам Доты, модуль для Lua, тексты
require("./native-charges.js").buildNativeCharges(root, orbs);
require("./heroesdoc.js").build(root); // docs/HERO_ORBS.md
Object.assign(ru, orbs.tokens.russian);
for (const [file, name] of Object.entries(langs)) {
  const tokens = Object.assign(JSON.parse(fs.readFileSync(path.join(root, `data/locale/${file}.json`), "utf8")), orbs.tokens[file]);
  for (const k of Object.keys(ru)) if (!(k in tokens)) { console.warn(`нет перевода ${file}: ${k}`); tokens[k] = ru[k]; }
  const esc = s => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  let text = `"lang"\n{\n\t"Language"\t"${name}"\n\t"Tokens"\n\t{\n`;
  for (const [k, v] of Object.entries(tokens)) text += `\t\t"${k}"\t"${esc(v)}"\n`;
  text += "\t}\n}\n";
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  fs.writeFileSync(path.join(out, `addon_${file}.txt`), buf);
}
console.log("перевод: готово");

// Версия сборки — видна в логе и в интерфейсе, чтобы убедиться, что выложена свежая сборка.
const ver = new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16) + " МСК";
fs.writeFileSync(path.join(root, "src/vscripts/core/version.ts"), `export const BUILD_VERSION = "${ver}";\n`);
fs.writeFileSync(path.join(root, "src/panorama/version.ts"), `const BUILD_VERSION = "${ver}";\n`);

// Список предзагрузки: все частицы и модели из кода и наши юниты. Без предзагрузки
// в сети (не в редакторе) модели и эффекты у клиентов не видны.
{
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(path.join(root, "src/vscripts")).filter(f => f.endsWith(".ts") && !f.endsWith("precache_list.ts"));
  const particles = new Set(), models = new Set();
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    for (const m of t.matchAll(/"(particles\/[^"]+\.vpcf)"/g)) particles.add(m[1]);
    for (const m of t.matchAll(/"(models\/[^"]+\.vmdl)"/g)) models.add(m[1]);
  }
  const unitsKv = fs.readFileSync(path.join(root, "game/scripts/npc/npc_units_custom.txt"), "utf8");
  const units = [...unitsKv.matchAll(/^\t"(npc_orb_\w+)"/gm)].map(m => m[1]);
  for (const f of fs.readdirSync(path.join(root, "game/scripts/npc")).filter(f => f.endsWith(".txt"))) {
    const kv = fs.readFileSync(path.join(root, "game/scripts/npc", f), "utf8");
    for (const m of kv.matchAll(/"(?:Model|ItemModel)"\s+"(models\/[^"]+)"/g)) models.add(m[1]);
  }
  const arr = s => "[\n" + [...s].sort().map(x => `    "${x}",`).join("\n") + "\n]";
  fs.writeFileSync(path.join(root, "src/vscripts/core/precache_list.ts"),
    "// Создается tools/gen.js — не править руками.\n" +
    `export const PRECACHE_PARTICLES = ${arr(particles)};\n` +
    `export const PRECACHE_MODELS = ${arr(models)};\n` +
    `export const PRECACHE_UNITS = ${arr(units)};\n`);
  console.log(`предзагрузка: частиц ${particles.size}, моделей ${models.size}, юнитов ${units.length}`);
}
