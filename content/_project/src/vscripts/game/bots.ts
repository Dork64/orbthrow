// Простые боты для тестов: ходят в кольцо, фармят лагеря, дерутся, отступают на базу.
// Стандартный ИИ Доты выключен (SetBotThinkingEnabled(false)).

import { CONFIG } from "../core/config";
import { HERO_POOL } from "../core/heroes";
import { MAP } from "../core/mapinfo";
import { Hooks } from "./hooks";
import { landedBossOrbs } from "./bossorbs";
import { chestOnGroundNow } from "./courier";
import { currentGoblin } from "./goblin";
import { State, allPlayers, newPlayer, gameNow } from "./state";
import { BASE_COLORS, baseIndexOfTeam, baseTeams, fountainOf } from "./teams";
import { Timers } from "./timers";
import { isValid, log, randomPointInCircle, safe } from "./util";

interface BotBrain {
    id: PlayerID;
    mode: "ring" | "farm" | "retreat" | "fight";
    target?: Vector;
    until: number;
    /** Последний приказ: не повторяем его каждый тик (иначе атака сбивается). */
    lastKey: string;
    lastAt: number;
    buyIndex: number;
    nextShop: number;
}

const HERO_BUILDS: Record<string, string[]> = {
    npc_dota_hero_puck: ["item_arcane_boots", "item_witch_blade", "item_blink", "item_cyclone", "item_black_king_bar", "item_octarine_core", "item_sheepstick"],
    npc_dota_hero_slark: ["item_power_treads", "item_diffusal_blade", "item_echo_sabre", "item_black_king_bar", "item_skadi", "item_basher", "item_abyssal_blade"],
    npc_dota_hero_razor: ["item_phase_boots", "item_falcon_blade", "item_black_king_bar", "item_sange_and_yasha", "item_shivas_guard", "item_satanic", "item_refresher"],
    npc_dota_hero_necrolyte: ["item_arcane_boots", "item_kaya_and_sange", "item_blink", "item_shivas_guard", "item_black_king_bar", "item_octarine_core", "item_sheepstick"],
    npc_dota_hero_tusk: ["item_phase_boots", "item_blink", "item_desolator", "item_black_king_bar", "item_assault", "item_abyssal_blade"],
    npc_dota_hero_sand_king: ["item_arcane_boots", "item_blink", "item_kaya_and_sange", "item_black_king_bar", "item_shivas_guard", "item_octarine_core", "item_refresher"],
};

const brains = new Map<number, BotBrain>();
const pendingBotTeams = new Set<DotaTeam>();
let botCounter = 0;
/** Герои, уже обещанные ботам (загрузка героя асинхронная, без этого боты берут одинаковых). */
const reservedHeroes: string[] = [];

/** Простые сборки по основному атрибуту: бот покупает по порядку, когда хватает золота. */
const BUILDS: string[][] = [
    ["item_phase_boots", "item_vanguard", "item_blink", "item_black_king_bar", "item_assault", "item_heart", "item_abyssal_blade"],
    ["item_power_treads", "item_mask_of_madness", "item_manta", "item_black_king_bar", "item_butterfly", "item_satanic", "item_skadi"],
    ["item_arcane_boots", "item_glimmer_cape", "item_cyclone", "item_black_king_bar", "item_octarine_core", "item_sheepstick", "item_refresher"],
    ["item_phase_boots", "item_maelstrom", "item_kaya_and_sange", "item_black_king_bar", "item_mjollnir", "item_greater_crit", "item_satanic"],
];

function takenHeroes(): string[] {
    const list: string[] = [];
    for (let i = 0; i < 24; i++) {
        const id = i as PlayerID;
        if (PlayerResource.IsValidPlayerID(id)) {
            const n = PlayerResource.GetSelectedHeroName(id);
            if (n !== "") list.push(n);
        }
    }
    return list;
}

/** Занять команду до конца асинхронной загрузки героя. */
function spawnBot(team: DotaTeam) {
    if (State.teamToPlayer.has(team) || pendingBotTeams.has(team)) return;
    pendingBotTeams.add(team);
    const taken = takenHeroes().concat(reservedHeroes);
    const free = HERO_POOL.filter(h => !taken.includes(h));
    const heroName = free.length > 0 ? free[RandomInt(0, free.length - 1)] : HERO_POOL[RandomInt(0, HERO_POOL.length - 1)];
    reservedHeroes.push(heroName);
    botCounter++;
    const botName = "Бот " + botCounter;
    const scheduled = safe("загрузка героя бота", () => {
        PrecacheUnitByNameAsync(heroName, () => {
            pendingBotTeams.delete(team);
            safe("создание бота", () => {
                const hero = GameRules.AddBotPlayerWithEntityScript(heroName, botName, team, "", false);
                if (hero === undefined) {
                    log("не удалось создать бота", heroName, "в команде", team);
                    return;
                }
                const id = hero.GetPlayerOwnerID();
                const baseIndex = baseIndexOfTeam(team);
                const player = newPlayer(id, team, baseIndex, true);
                const c = BASE_COLORS[baseIndex];
                PlayerResource.SetCustomPlayerColor(id, c[0], c[1], c[2]);
                brains.set(id, { id, mode: "ring", until: 0, lastKey: "", lastAt: -100, buyIndex: 0, nextShop: 0 });
                log("бот", botName, heroName, "команда", team);
                for (const f of Hooks.onHeroSpawned) safe("появление героя", () => f(player, hero, false));
            });
        });
        return true;
    });
    if (scheduled !== true) pendingBotTeams.delete(team);
}

export function spawnExtraBots(count: number) {
    const free = baseTeams.filter(team => !State.teamToPlayer.has(team) && !pendingBotTeams.has(team));
    for (let i = 0; i < Math.min(count, free.length); i++) spawnBot(free[i]);
}

export function spawnReservedBots() {
    const teams = State.reservedBotTeams.slice();
    State.reservedBotTeams = [];
    teams.forEach((t, i) => Timers.after(0.3 * i, "бот", () => spawnBot(t)));
}

export function isBot(id: number): boolean {
    return brains.has(id);
}

// ---------- Мозги ----------

function nearestEnemyHero(h: CDOTA_BaseNPC_Hero, radius: number): CDOTA_BaseNPC | undefined {
    const units = FindUnitsInRadius(h.GetTeamNumber(), h.GetAbsOrigin(), undefined, radius,
        UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NO_INVIS | UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
    for (const u of units) if (u.IsAlive() && !u.IsInvulnerable()) return u;
    return undefined;
}

function nearestCreep(h: CDOTA_BaseNPC_Hero, radius: number): CDOTA_BaseNPC | undefined {
    const units = FindUnitsInRadius(h.GetTeamNumber(), h.GetAbsOrigin(), undefined, radius,
        UnitTargetTeam.ENEMY, UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.CLOSEST, false);
    for (const u of units) if (u.IsAlive() && u.GetTeamNumber() === DotaTeam.NEUTRALS) return u;
    return undefined;
}

const BEHAVIOR_NO_TARGET = 4;
const BEHAVIOR_UNIT_TARGET = 8;
const BEHAVIOR_POINT = 16;
const BEHAVIOR_PASSIVE = 2;
const BEHAVIOR_TOGGLE = 512;
const BEHAVIOR_AUTOCAST = 4096;

/** Приказ без повторов: тот же приказ не чаще раза в 2.5 с. */
function issue(b: BotBrain, key: string, fn: () => void) {
    const now = GameRules.GetGameTime();
    if (b.lastKey === key && now - b.lastAt < 2.5) return;
    b.lastKey = key;
    b.lastAt = now;
    fn();
}

function attack(b: BotBrain, h: CDOTA_BaseNPC_Hero, target: CDOTA_BaseNPC) {
    if (!isValid(target) || !target.IsAlive()) return;
    issue(b, "attack:" + target.entindex(), () => h.MoveToTargetToAttack(target));
}

function moveTo(b: BotBrain, h: CDOTA_BaseNPC_Hero, pos: Vector, aggressive = false) {
    if (((h.GetAbsOrigin() - pos) as Vector).Length2D() < 80) return;
    const key = (aggressive ? "amove:" : "move:") + Math.floor(pos.x / 100) + ":" + Math.floor(pos.y / 100);
    issue(b, key, () => (aggressive ? h.MoveToPositionAggressive(pos) : h.MoveToPosition(pos)));
}

function tryCast(h: CDOTA_BaseNPC_Hero, enemy: CDOTA_BaseNPC): boolean {
    if (!isValid(enemy) || !enemy.IsAlive() || enemy.IsInvulnerable()) return false;
    for (let i = 0; i < h.GetAbilityCount(); i++) {
        const a = h.GetAbilityByIndex(i);
        if (a === undefined || a.GetLevel() <= 0 || a.IsHidden() || a.IsPassive()) continue;
        const name = a.GetAbilityName();
        if (name === "puck_ethereal_jaunt") continue; // бот не должен вслепую прыгать к случайной сфере
        if (name === "puck_phase_shift" && h.GetHealthPercent() > 50) continue;
        if (name === "necrolyte_ghost_shroud" && h.GetHealthPercent() > 70) continue;
        if (a.GetAbilityName().startsWith("orb_slot_")) continue; // варды, дым и пыль боты не тратят
        if (!a.IsFullyCastable() || !a.IsCooldownReady() || a.IsInAbilityPhase()) continue;
        const b = Number(a.GetBehavior());
        if ((b & BEHAVIOR_PASSIVE) !== 0 || (b & BEHAVIOR_TOGGLE) !== 0 || ((b & BEHAVIOR_AUTOCAST) !== 0 && name !== "slark_saltwater_shiv")) continue;
        const range = Math.max(250, a.GetEffectiveCastRange(enemy.GetAbsOrigin(), enemy));
        const d = ((enemy.GetAbsOrigin() - h.GetAbsOrigin()) as Vector).Length2D();
        if ((b & BEHAVIOR_UNIT_TARGET) !== 0) {
            if (d <= range + 100 && (a.GetAbilityTargetTeam() & UnitTargetTeam.ENEMY) !== 0) {
                h.CastAbilityOnTarget(enemy, a, h.GetPlayerOwnerID());
                return true;
            }
        } else if ((b & BEHAVIOR_POINT) !== 0) {
            if (d <= range + 100) {
                h.CastAbilityOnPosition(enemy.GetAbsOrigin(), a, h.GetPlayerOwnerID());
                return true;
            }
        } else if ((b & BEHAVIOR_NO_TARGET) !== 0) {
            if (d <= 350) {
                h.CastAbilityNoTarget(a, h.GetPlayerOwnerID());
                return true;
            }
        }
    }
    return false;
}

function levelUp(h: CDOTA_BaseNPC_Hero) {
    let guard = 0;
    while (h.GetAbilityPoints() > 0 && guard++ < 10) {
        let pick: CDOTABaseAbility | undefined;
        for (let i = 0; i < Math.min(6, h.GetAbilityCount()); i++) {
            const a = h.GetAbilityByIndex(i);
            if (a === undefined || a.IsHidden() || a.GetLevel() >= a.GetMaxLevel()) continue;
            if (a.GetHeroLevelRequiredToUpgrade() > h.GetLevel()) continue;
            if (a.GetAbilityType() === AbilityTypes.ULTIMATE) { pick = a; break; }
            if (pick === undefined || a.GetLevel() < pick.GetLevel()) pick = a;
        }
        if (pick === undefined) break;
        h.UpgradeAbility(pick);
    }
}

/** Покупка следующего предмета сборки, когда хватает золота (боты не ходят в магазин). */
function shop(b: BotBrain, h: CDOTA_BaseNPC_Hero) {
    const now = GameRules.GetGameTime();
    if (now < b.nextShop) return;
    b.nextShop = now + 5;
    const build = HERO_BUILDS[h.GetUnitName()] ?? BUILDS[(b.id + Number(h.GetPrimaryAttribute())) % BUILDS.length];
    if (b.buyIndex >= build.length) return;
    let free = false;
    for (let slot = 0; slot <= 5; slot++) if (h.GetItemInSlot(slot) === undefined) free = true;
    if (!free) return;
    const name = build[b.buyIndex];
    const cost = GetItemCost(name);
    if (cost <= 0 || PlayerResource.GetGold(b.id) < cost) return;
    PlayerResource.SpendGold(b.id, cost, ModifyGoldReason.PURCHASE_ITEM);
    h.AddItemByName(name);
    b.buyIndex++;
}

function think(b: BotBrain) {
    const h = PlayerResource.GetSelectedHeroEntity(b.id);
    if (!isValid(h) || !h.IsAlive()) return;
    if (h.HasModifier("modifier_orb_pregame") || h.IsChanneling()) return;
    levelUp(h);
    shop(b, h);
    const now = gameNow();
    const hpPct = h.GetHealthPercent();
    const home = fountainOf(h.GetTeamNumber());

    if (b.mode === "retreat") {
        if (hpPct >= 85) b.mode = "ring";
        else { moveTo(b, h, home); return; }
    }
    if (hpPct < 25) {
        b.mode = "retreat";
        moveTo(b, h, home);
        return;
    }

    const enemy = nearestEnemyHero(h, 1100);
    if (enemy !== undefined && (hpPct > 45 || enemy.GetHealthPercent() < 30)) {
        b.mode = "fight";
        if (!tryCast(h, enemy)) attack(b, h, enemy);
        return;
    }

    if (now >= b.until || b.target === undefined) {
        // Раз в 15-25 с выбираем: кольцо или ближайший лагерь.
        if (RandomFloat(0, 1) < 0.55) {
            b.mode = "ring";
            b.target = randomPointInCircle(Vector(0, 0, 128), CONFIG.ringRadius * 0.7);
        } else {
            b.mode = "farm";
            const o = h.GetAbsOrigin();
            let best = MAP.camps[0];
            let bd = 1e18;
            for (const c of MAP.camps) {
                const d = (c.x - o.x) ** 2 + (c.y - o.y) ** 2 + RandomFloat(0, 4e6);
                if (d < bd) { bd = d; best = c; }
            }
            b.target = Vector(best.x, best.y, 128);
        }
        b.until = now + RandomFloat(15, 25);
    }
    // Цели поважнее леса: сундук, сфера Повелителя, Гоблин
    const o = h.GetAbsOrigin();
    const chest = chestOnGroundNow();
    if (chest !== undefined && ((chest - o) as Vector).Length2D() < 2000) {
        moveTo(b, h, chest);
        return;
    }
    const goblin = currentGoblin();
    if (goblin !== undefined && ((goblin.GetAbsOrigin() - o) as Vector).Length2D() < 1500) {
        attack(b, h, goblin);
        return;
    }
    for (const p of landedBossOrbs()) {
        if (((p - o) as Vector).Length2D() < 1800) {
            moveTo(b, h, p);
            return;
        }
    }
    const creep = nearestCreep(h, 600);
    if (creep !== undefined) {
        if (!tryCast(h, creep)) attack(b, h, creep);
        return;
    }
    if (b.target !== undefined) moveTo(b, h, b.target, true);
}

export function botsTick() {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    for (const [, b] of brains) safe("бот", () => think(b));
}

export function botsCount(): number {
    return allPlayers().filter(p => p.isBot).length;
}
