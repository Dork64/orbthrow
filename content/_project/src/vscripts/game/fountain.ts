// Фонтан и база (просьба автора 31.10):
// - быстрое восстановление на фонтане и ускорение на выходе (modifier_orb_fountain);
// - защита от застревания: после телепорта на базу (двойное нажатие ТП) герой оказывался
//   за фонтаном на возвышенности, откуда нет пути. Такого героя переносим на точку появления;
// - магазин на всей базе (04.11): купленное, пока герой на своей базе, сразу из тайника в инвентарь;
// - проход к фонтану: вокруг выхода с базы убираем деревья (без столкновений на базе — modifier_orb_fountain);
// - Aghanim's Shard в продаже с начала партии (запас выставляем и кодом, на случай если
//   правка KV не сработает).

import { CONFIG } from "../core/config";
import { MAP } from "../core/mapinfo";
import { Hooks } from "./hooks";
import { State, PlayerState, allPlayers } from "./state";
import { ALL_TEAMS } from "./teams";
import { isValid, log } from "./util";

const FOUNTAIN_MOD = "modifier_orb_fountain";
/** Дальше этого от фонтана застревание не проверяем. */
const CHECK_RADIUS = 900;

const fountainCache = new Map<number, Vector>();

/** Где фонтан команды: по сущности фонтана, иначе по данным карты. */
export function fountainOf(p: PlayerState): Vector {
    const cached = fountainCache.get(p.team);
    if (cached !== undefined) return cached;
    let pos: Vector | undefined;
    for (const f of Entities.FindAllByClassname("ent_dota_fountain") as CBaseEntity[]) {
        if (f.GetTeamNumber() === p.team) pos = f.GetAbsOrigin();
    }
    if (pos === undefined) {
        const b = MAP.bases[p.baseIndex] ?? MAP.bases[0];
        pos = Vector(b.fountain.x, b.fountain.y, 0);
    }
    fountainCache.set(p.team, pos);
    return pos;
}

export function spawnPointOf(p: PlayerState): Vector {
    const b = MAP.bases[p.baseIndex] ?? MAP.bases[0];
    return GetGroundPosition(Vector(b.spawn.x, b.spawn.y, 0), undefined);
}

function attach(p: PlayerState, hero: CDOTA_BaseNPC_Hero) {
    if (hero.HasModifier(FOUNTAIN_MOD)) return;
    const f = fountainOf(p);
    hero.AddNewModifier(hero, undefined, FOUNTAIN_MOD, {
        x: f.x, y: f.y, r: CONFIG.fountainRadius, regen: CONFIG.fountainFastRegen,
        calm: CONFIG.fountainCalmSeconds, hd: CONFIG.fountainHasteDuration, hp: CONFIG.fountainHastePct,
    });
}

/** Магазин на всей базе: предметы из тайника (ячейки 9-14) переносятся в свободные ячейки инвентаря. */
function stashToInventory(h: CDOTA_BaseNPC_Hero) {
    for (let st = 9; st <= 14; st++) {
        const it = h.GetItemInSlot(st);
        if (it === undefined) continue;
        let free = -1;
        for (let i = 0; i <= 8; i++) if (h.GetItemInSlot(i) === undefined) { free = i; break; }
        if (free < 0) return;
        h.SwapItems(st, free);
    }
}

/** Каждые 0.5 с: магазин на базе; герой за фонтаном или без пути к выходу — на точку появления. */
export function fountainTick() {
    if (State.phase !== "game" && State.phase !== "overtime" && State.phase !== "pregame") return;
    for (const p of allPlayers()) {
        const h = PlayerResource.GetSelectedHeroEntity(p.id);
        if (!isValid(h) || !h.IsAlive()) continue;
        attach(p, h);
        const o = h.GetAbsOrigin();
        const f = fountainOf(p);
        const d = Math.sqrt((o.x - f.x) ** 2 + (o.y - f.y) ** 2);
        if (d <= CONFIG.fountainRadius) stashToInventory(h);
        if (d > CHECK_RADIUS) continue;
        const spawn = spawnPointOf(p);
        // Застрял: стоит на непроходимой клетке (уступ за фонтаном) или оттуда нет пути к выходу
        const stuck = !GridNav.IsTraversable(o) || GridNav.IsBlocked(o) || !GridNav.CanFindPath(o, spawn);
        if (!stuck) continue;
        FindClearSpaceForUnit(h, spawn, true);
        h.Stop();
        log("герой", p.id, "застрял у фонтана — перенесен на точку появления");
    }
}

export function initFountain() {
    Hooks.onHeroSpawned.push((p, hero) => attach(p, hero));
    Hooks.onGameStart.push(() => {
        for (const t of ALL_TEAMS) GameRules.SetItemStockCount(1, t, "item_aghanims_shard", -1 as PlayerID);
        // Шире проход: деревья на пути от фонтана через выход с базы
        for (const b of MAP.bases) {
            const dx = b.tower.x - b.fountain.x;
            const dy = b.tower.y - b.fountain.y;
            for (const k of [0.3, 0.6, 1.0, 1.4]) {
                GridNav.DestroyTreesAroundPoint(Vector(b.fountain.x + dx * k, b.fountain.y + dy * k, 0), 220, true);
            }
        }
    });
}
