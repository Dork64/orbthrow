// Константы Доты для симулятора: значения перечислений из @moddota/dota-lua-types
// и соответствие «свойство модификатора → имя метода».
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../../node_modules/@moddota/dota-lua-types/types/enums.generated.d.ts"), "utf8");
const lines = src.split("\n");
const consts = {};
const methods = {};
let pendingMethod = null;
for (const line of lines) {
    let m = line.match(/^declare const (\w+): (-?[\d.]+);/);
    if (m) { consts[m[1]] = Number(m[2]); continue; }
    m = line.match(/Method Name: `(\w+)`/);
    if (m) { pendingMethod = m[1]; continue; }
    m = line.match(/^\s+(?:\*\/\s*)?(\w+) = (-?[\d.]+),/);
    if (m) {
        consts[m[1]] = Number(m[2]);
        if (pendingMethod && /^MODIFIER_(PROPERTY|EVENT)_/.test(m[1])) methods[m[2]] = pendingMethod;
        pendingMethod = null;
    }
}
let out = "-- Сгенерировано tools/sim/gen_consts.js\nlocal C = {}\n";
for (const [k, v] of Object.entries(consts)) out += `C.${k} = ${v}\n`;
out += "local M = {}\n";
for (const [k, v] of Object.entries(methods)) out += `M[${k}] = "${v}"\n`;
out += "return { consts = C, methods = M }\n";
fs.mkdirSync(path.join(__dirname, "../../.sim"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "../../.sim/consts.lua"), out);
console.log("констант:", Object.keys(consts).length, "методов модификаторов:", Object.keys(methods).length);
