// Лагеря нейтралов: появление в 0:00, возрождение в начале каждой минуты, если лагерь пуст,
// рост силы со временем и «поводок» (крипы не уходят далеко от своего лагеря).

import { CONFIG } from "../core/config";
import { MAP } from "../core/mapinfo";
import { Hooks } from "./hooks";
import { State, gameNow } from "./state";
import { isValid, log, randomPointInCircle } from "./util";

export type CampType = "small" | "medium" | "large" | "ancient";

const N = "npc_dota_neutral_";

/** Составы лагерей (стандартные нейтралы Доты). */
const PACKS: Record<CampType, string[][]> = {
    small: [
        [N + "kobold", N + "kobold", N + "kobold_tunneler", N + "kobold_taskmaster"],
        [N + "gnoll_assassin", N + "gnoll_assassin", N + "gnoll_assassin"],
        [N + "forest_troll_berserker", N + "forest_troll_berserker", N + "forest_troll_high_priest"],
        [N + "fel_beast", N + "fel_beast", N + "ghost"],
    ],
    medium: [
        [N + "harpy_scout", N + "harpy_scout", N + "harpy_storm"],
        [N + "giant_wolf", N + "giant_wolf", N + "alpha_wolf"],
        [N + "ogre_mauler", N + "ogre_mauler", N + "ogre_magi"],
        [N + "satyr_trickster", N + "satyr_trickster", N + "satyr_soulstealer"],
    ],
    large: [
        [N + "centaur_khan", N + "centaur_outrunner", N + "centaur_outrunner"],
        [N + "dark_troll_warlord", N + "dark_troll", N + "dark_troll"],
        [N + "polar_furbolg_ursa_warrior", N + "polar_furbolg_champion"],
        [N + "enraged_wildkin", N + "wildkin", N + "wildkin"],
        [N + "satyr_hellcaller", N + "satyr_soulstealer", N + "satyr_trickster"],
    ],
    ancient: [
        [N + "black_dragon", N + "black_drake", N + "black_drake"],
        [N + "granite_golem", N + "rock_golem", N + "rock_golem"],
        [N + "big_thunder_lizard", N + "small_thunder_lizard", N + "small_thunder_lizard"],
        [N + "prowler_shaman", N + "prowler_acolyte", N + "prowler_acolyte"],
    ],
};

export const ALL_NEUTRAL_NAMES: string[] = [];
for (const t of ["small", "medium", "large", "ancient"] as CampType[]) {
    for (const pack of PACKS[t]) for (const n of pack) if (!ALL_NEUTRAL_NAMES.includes(n)) ALL_NEUTRAL_NAMES.push(n);
}

export interface Camp {
    index: number;
    type: CampType;
    home: Vector;
    units: CDOTA_BaseNPC[];
    ids: EntityIndex[];
    spawnedAt: number;
}

export const camps: Camp[] = [];
/** Крип → лагерь (для очков синей шкалы и Гоблина). */
export const campOfUnit = new Map<number, Camp>();

const LEASH = 1100;          // дальше этого крип бросает погоню и идет домой
const BLOCK_RADIUS = 260;    // герой на точке лагеря не дает ему возродиться (как в Доте)
const SPREAD = 170;          // разброс крипов вокруг точки лагеря

let lastMinute = -1;
let started = false;

function statGrowth(): number {
    const m = Math.max(0, Math.min(CONFIG.neutralGrowthCapMin, gameNow() / 60));
    return 1 + CONFIG.neutralStatGrowthPerMin * m;
}

function aliveUnits(c: Camp): CDOTA_BaseNPC[] {
    c.units = c.units.filter(u => isValid(u) && u.IsAlive());
    return c.units;
}

function heroBlocks(c: Camp): boolean {
    const heroes = FindUnitsInRadius(DotaTeam.NEUTRALS, c.home, undefined, BLOCK_RADIUS,
        UnitTargetTeam.BOTH, UnitTargetType.HERO, UnitTargetFlags.INVULNERABLE | UnitTargetFlags.MAGIC_IMMUNE_ENEMIES,
        FindOrder.ANY, false);
    return heroes.length > 0;
}

function spawnCamp(c: Camp) {
    const packs = PACKS[c.type];
    const pack = packs[RandomInt(0, packs.length - 1)];
    const mul = statGrowth();
    // Индексы сущностей Дота использует повторно: удаляем только свои записи
    for (const id of c.ids) if (campOfUnit.get(id) === c) campOfUnit.delete(id);
    c.ids = [];
    for (const name of pack) {
        const pos = randomPointInCircle(c.home, SPREAD);
        const u = CreateUnitByName(name, pos, true, undefined, undefined, DotaTeam.NEUTRALS);
        if (!isValid(u)) continue;
        if (mul > 1.001) {
            const hp = Math.floor(u.GetMaxHealth() * mul);
            u.SetBaseMaxHealth(hp);
            u.SetMaxHealth(hp);
            u.SetHealth(hp);
            u.SetBaseDamageMin(Math.floor(u.GetBaseDamageMin() * mul));
            u.SetBaseDamageMax(Math.floor(u.GetBaseDamageMax() * mul));
        }
        u.SetForwardVector(((c.home - pos) as Vector).Normalized());
        c.units.push(u);
        c.ids.push(u.entindex());
        campOfUnit.set(u.entindex(), c);
    }
    c.spawnedAt = gameNow();
}

/** Возродить пустые лагеря (в начале каждой минуты). */
function respawnEmpty(force: boolean) {
    let n = 0;
    for (const c of camps) {
        if (aliveUnits(c).length > 0) continue;
        if (!force && heroBlocks(c)) continue;
        spawnCamp(c);
        n++;
    }
    if (n > 0) log("лагеря: возрождено", n);
}

/** Поводок: далеко ушедшие крипы возвращаются к лагерю. */
function leash() {
    for (const c of camps) {
        for (const u of aliveUnits(c)) {
            const d = ((u.GetAbsOrigin() - c.home) as Vector).Length2D();
            if (d > LEASH) {
                u.MoveToPosition(randomPointInCircle(c.home, SPREAD));
            }
        }
    }
}

export function initCamps() {
    camps.length = 0;
    MAP.camps.forEach((p, i) => {
        const z = GetGroundHeight(Vector(p.x, p.y, 0), undefined);
        camps.push({ index: i, type: p.type, home: Vector(p.x, p.y, z), units: [], ids: [], spawnedAt: -1 });
    });
    Hooks.onGameStart.push(() => {
        started = true;
        lastMinute = 0;
        respawnEmpty(true);
    });
}

/** Каждые 0.5 с. */
export function campsTick() {
    if (!started) return;
    if (State.phase !== "game" && State.phase !== "overtime") return;
    const minute = Math.floor(gameNow() / 60);
    if (minute > lastMinute) {
        lastMinute = minute;
        respawnEmpty(false);
    }
    leash();
}

/** Для чита -camps: сразу возродить все пустые лагеря. */
export function forceRespawnCamps() {
    respawnEmpty(true);
}

export function campUnitsAlive(): number {
    let n = 0;
    for (const c of camps) n += aliveUnits(c).length;
    return n;
}
