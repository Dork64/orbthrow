// Точка входа аддона ORBTHROW.
// Activate и Precache задаются ОБЫЧНЫМ глобальным присваиванием: движок ищет их в окружении
// этого файла, а не в _G (запись в _G.Activate игра не видит — проверено в редакторе).
// getfenv не используем: вне редактора библиотека debug урезана.

import { linkModifiers } from "./lib/links";
import { Arena } from "./game/arena";
import { safe } from "./game/util";
import { ALL_NEUTRAL_NAMES } from "./game/camps";
import { PRECACHE_MODELS, PRECACHE_PARTICLES, PRECACHE_UNITS } from "./core/precache_list";

declare const _G: any;

// Модификаторы привязываются сразу при загрузке скрипта, до Activate.
linkModifiers();
declare global {
    // eslint-disable-next-line no-var
    var Precache: (this: void, context: CScriptPrecacheContext) => void;
    // eslint-disable-next-line no-var
    var Activate: (this: void) => void;
}

Precache = function (this: void, context: CScriptPrecacheContext) {
    for (const p of PRECACHE_PARTICLES) PrecacheResource("particle", p, context);
    for (const m of PRECACHE_MODELS) PrecacheResource("model", m, context);
    PrecacheResource("soundfile", "soundevents/game_sounds_overthrow.vsndevts", context);
    // Звуки механик сфер (мультикаст, гроза, петля времени, обмен, мины)
    for (const h of ["ogre_magi", "zuus", "weaver", "vengefulspirit", "techies", "pudge"]) {
        PrecacheResource("soundfile", "soundevents/game_sounds_heroes/game_sounds_" + h + ".vsndevts", context);
    }
    for (const n of ALL_NEUTRAL_NAMES) PrecacheUnitByNameSync(n, context);
    for (const n of PRECACHE_UNITS) PrecacheUnitByNameSync(n, context);
    PrecacheUnitByNameSync("npc_dota_observer_wards", context);
    PrecacheUnitByNameSync("npc_dota_sentry_wards", context);
};

Activate = function (this: void) {
    safe("запуск", () => Arena.Init());
};

// Запасной путь на случай другого окружения.
_G.Precache = Precache;
_G.Activate = Activate;

if (_G.ORBTHROW_LOADED === true) {
    safe("перезагрузка", () => Arena.Reload());
}
_G.ORBTHROW_LOADED = true;
