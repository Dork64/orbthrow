// Компилирует тесты в Lua (TSTL) и запускает их в LuaJIT.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const tests = fs.readdirSync(path.join(root, "tests")).filter(f => f.endsWith("_test.ts") && !f.endsWith("_node_test.ts")).map(f => f.replace(/\.ts$/, ""));
fs.writeFileSync(path.join(root, "tests/lua_main.ts"),
  "// Сгенерировано tools/luatest.js\n" + tests.map(t => `import "./${t}";`).join("\n") + `\nimport { summary } from "./lua_vitest";\nif (summary() > 0) os.exit(1);\n`);
execSync("npx tstl --project tests/tsconfig.lua.json", { cwd: root, stdio: "inherit" });
execSync("luajit tests/lua_main.lua", { cwd: path.join(root, "build/luatest"), stdio: "inherit" });
