// Сборка папок game/ и content/ для Доты + снимок исходников + архив для выкладки.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const root = path.join(__dirname, "..");
const build = path.join(root, "build");

function copyDir(src, dst, filter = () => true) {
  if (!fs.existsSync(src)) return;
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (!filter(s)) continue;
    if (fs.statSync(s).isDirectory()) copyDir(s, d, filter);
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
  }
}
// The generator already wrote the authored overrides and the charge fields into one KV file.
const authoredOverrides = path.join(root, "game/scripts/npc/npc_abilities_override.txt");
copyDir(path.join(root, "game"), path.join(build, "game"), file => file !== authoredOverrides);
copyDir(path.join(root, "content"), path.join(build, "content"));

// Защита lualib от урезанной библиотеки debug вне редактора.
const lualib = path.join(build, "game/scripts/vscripts/lualib_bundle.lua");
let lsrc = fs.readFileSync(lualib, "utf8");
lsrc = lsrc.replace(/if debug == nil then/g, "if debug == nil or debug.getinfo == nil or debug.traceback == nil then");
fs.writeFileSync(lualib, lsrc);

// Снимок исходников (без node_modules и build) — хранится на ПК в content/.../_project.
// data/kv — копии файлов Доты для проверки сфер: на ПК они уже есть в самой игре, не дублируем.
const skip = new Set(["node_modules", "build", ".git", ".backups"]);
const kvDir = path.join(root, "data", "kv");
copyDir(root, path.join(build, "content/_project"), s => !skip.has(path.basename(s)) && !s.endsWith(".zip") && s !== kvDir);

const ver = (fs.readFileSync(path.join(root, "src/vscripts/core/version.ts"), "utf8").match(/"(.*)"/) || [])[1];
fs.writeFileSync(path.join(build, "content/_project/BUILD_VERSION.txt"), ver + "\n");

if (process.platform === "win32") {
  console.log("локальная Windows-сборка: архив пропущен");
} else {
  execSync('zip -qr orbthrow_deploy.zip game content', { cwd: build });
}
console.log("сборка готова:", ver);
