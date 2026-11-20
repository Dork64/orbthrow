// Проверки собранного Lua: нет debug/getfenv (ломается вне редактора), нет циклических require.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "../build/game/scripts/vscripts");
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".lua")) files.push(p); } })(root);
let bad = 0;
const graph = {};
// Привязки модификаторов из lib/links.ts: имя → файл
const linksTs = fs.readFileSync(path.join(__dirname, "../src/vscripts/lib/links.ts"), "utf8");
const buffsFile = (linksTs.match(/const BUFFS = "([^"]+)"/) || [])[1];
const LINKS = new Map([...linksTs.matchAll(/\["(modifier_\w+)",\s*(?:"([^"]+)"|BUFFS)\]/g)].map(m => [m[1], m[2] || buffsFile]));
const registered = new Set();
for (const f of files) {
  const rel = path.relative(root, f).replace(/\\/g, "/").replace(/\.lua$/, "");
  const src = fs.readFileSync(f, "utf8");
  if (!rel.startsWith("lualib_bundle")) {
    for (const m of ["debug.", "getfenv", "setfenv", "xpcall(", ".call(", ".apply(", "self.____constructor()"]) {
      if (src.includes(m)) { console.log("ЗАПРЕЩЕНО:", m, "в", rel); bad++; }
    }
  }
  // Модификатор должен лежать в глобальной переменной окружения своего файла, иначе «unknown modifier type».
  for (const m of src.matchAll(/registerModifier\(\s*"(\w+)",/g)) {
    if (!new RegExp("^" + m[1] + " = registerModifier\\(", "m").test(src)) { console.log("МОДИФИКАТОР без глобальной переменной:", m[1], "в", rel); bad++; }
    const link = LINKS.get(m[1]);
    if (link === undefined) { console.log("МОДИФИКАТОР не привязан в lib/links.ts:", m[1]); bad++; }
    else if (link !== rel) { console.log("МОДИФИКАТОР", m[1], "привязан к", link, "а лежит в", rel); bad++; }
    registered.add(m[1]);
  }
  // Activate/Precache — обычным глобальным присваиванием (движок не видит _G.Activate).
  if (rel === "addon_game_mode" && (!/^Activate = /m.test(src) || !/^Precache = /m.test(src))) { console.log("addon_game_mode: нет глобальных Activate/Precache"); bad++; }
  graph[rel] = [...src.matchAll(/require\("([^"]+)"\)/g)].map(m => m[1].replace(/\./g, "/")).filter(r => r !== "lualib_bundle");
}
// В исходниках для Lua запрещено «(число) || ...»: в Lua 0 — истина (TSTL переводит || в or).
(function walkTs(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walkTs(p); continue; }
    if (!f.endsWith(".ts")) continue;
    fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (/\([^()]*\s-\s[^()]*\)\s*\|\|/.test(line)) { console.log("ЧИСЛО || в Lua-коде:", path.relative(root, p) + ":" + (i + 1)); bad++; }
      if (/\)\?\.(to\w+|trim\w*|split|substring|substr|includes|indexOf|replace|startsWith|endsWith|slice|join|map|filter)\(/.test(line)) { console.log("?. со встроенным методом после вызова (TSTL вычислит вызов дважды):", path.relative(root, p) + ":" + (i + 1)); bad++; }
      if (/^export let /.test(line)) { console.log("export let (в Lua импорт копирует значение один раз, нужна функция):", path.relative(root, p) + ":" + (i + 1)); bad++; }
    });
  }
})(path.join(__dirname, "../src/vscripts"));
for (const n of LINKS.keys()) if (!registered.has(n)) { console.log("в lib/links.ts есть", n, "но нет registerModifier"); bad++; }
// Модификаторы эффектов регистрируются в цикле (modifier_orb_fx) — файл должен существовать
{
  const fxFile = files.find(f => f.replace(/\\/g, "/").endsWith("modifiers/modifier_orb_fx.lua"));
  if (fxFile === undefined) { console.log("нет modifiers/modifier_orb_fx.lua"); bad++; }
  else {
    const src = fs.readFileSync(fxFile, "utf8");
    const fxData = fs.readFileSync(path.join(__dirname, "../src/vscripts/core/fxdata.ts"), "utf8");
    const n = (src.match(/^modifier_orb_fx_\w+ = makeFx\(/gm) || []).length;
    if (n === 0 && fxData.includes('"key"')) { console.log("modifier_orb_fx.lua: нет модификаторов эффектов"); bad++; }
  }
}
// поиск циклов
const state = {};
function dfs(n, stack) {
  if (state[n] === 1) { console.log("ЦИКЛ require:", [...stack, n].join(" → ")); bad++; return; }
  if (state[n] === 2) return;
  state[n] = 1;
  for (const m of graph[n] || []) dfs(m, [...stack, n]);
  state[n] = 2;
}
for (const n of Object.keys(graph)) dfs(n, []);
const lualib = fs.readFileSync(path.join(root, "lualib_bundle.lua"), "utf8");
if (lualib.includes("debug.traceback") ) console.log("заметка: lualib_bundle содержит debug.traceback (используется только при ошибках)");
console.log(bad === 0 ? "Lua-проверки пройдены: файлов " + files.length : "Lua-проверки: проблем " + bad);
process.exit(bad === 0 ? 0 : 1);
