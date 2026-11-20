// Гоблин-казначей (DESIGN 7.3): в 5:00, 15:00, 25:00 в случайном лагере.
// Убегает от ближайшего героя, роняет мешки по 50 золота, через 60 с уходит.

import { TIMINGS } from "../core/config";
import { goblinHealth } from "../core/catchup";
import { MAP } from "../core/mapinfo";
import { addBlue } from "./orbs";
import { expireLoot, registerSpecialGold } from "./coins";
import { State, gameNow, toast } from "./state";
import { Timers } from "./timers";
import { isValid, log, safe } from "./util";
import type { ModifierOrbGoblin } from "../modifiers/modifier_orb_goblin";

const LIFETIME = 60;
const BAG_EVERY = 3;
const BAG_GOLD = 50;
const KILL_GOLD = 400;
const KILL_POINTS = 15;
const ASSIST_POINTS = 5;
const FLEE_RADIUS = 1000;

let goblin: CDOTA_BaseNPC | undefined;
/** Ссылка на список ударов: модификатор при смерти снимается, а список нужен в момент убийства. */
let goblinHits: { pid: number; time: number; amount: number }[] = [];
let spawnedAt = 0;
let lastBag = 0;
let nextIndex = 0;
/** Кто убил Гоблинов (для итогов). */
export const goblinKills = new Map<number, number>();

function spawnGoblin() {
    if (isValid(goblin) && goblin.IsAlive()) return;
    const camp = MAP.camps[RandomInt(0, MAP.camps.length - 1)];
    const pos = GetGroundPosition(Vector(camp.x, camp.y, 0), undefined);
    const g = CreateUnitByName("npc_orb_goblin", pos, true, undefined, undefined, DotaTeam.NEUTRALS);
    if (!isValid(g)) return;
    const hp = goblinHealth(Math.floor(gameNow() / 60));
    g.SetBaseMaxHealth(hp);
    g.SetMaxHealth(hp);
    g.SetHealth(hp);
    const gm = g.AddNewModifier(g, undefined, "modifier_orb_goblin", {}) as unknown as ModifierOrbGoblin | undefined;
    goblinHits = gm !== undefined ? gm.hits : [];
    goblin = g;
    spawnedAt = gameNow();
    lastBag = spawnedAt;
    toast("event", "#orb_toast_goblin");
    EmitGlobalSound("ui.npe_objective_given");
    log("Гоблин появился:", camp.x, camp.y, "здоровье", hp);
}

function dropBag(g: CDOTA_BaseNPC) {
    const item = CreateItem("item_bag_of_gold", undefined, undefined);
    if (item === undefined) return;
    const o = g.GetAbsOrigin();
    const drop = CreateItemOnPositionForLaunch(o, item);
    item.LaunchLootInitialHeight(false, 100, 150, 0.4, (o + RandomVector(RandomFloat(80, 180))) as Vector);
    registerSpecialGold(item, BAG_GOLD);
    Timers.after(20, "мешок Гоблина", () => expireLoot(item, drop));
}

/** Убегать от ближайшего героя: пробуем направление «от него», потом повороты. */
function flee(g: CDOTA_BaseNPC) {
    const o = g.GetAbsOrigin();
    const heroes = FindUnitsInRadius(DotaTeam.NEUTRALS, o, undefined, FLEE_RADIUS, UnitTargetTeam.ENEMY, UnitTargetType.HERO,
        UnitTargetFlags.MAGIC_IMMUNE_ENEMIES + UnitTargetFlags.INVULNERABLE, FindOrder.CLOSEST, false);
    if (heroes.length === 0) return;
    const away = ((o - heroes[0].GetAbsOrigin()) as Vector).Normalized();
    for (const angle of [0, 40, -40, 80, -80, 120, -120]) {
        const dir = RotatePosition(Vector(0, 0, 0), QAngle(0, angle, 0), away);
        const p = (o + dir * 500) as Vector;
        if (Math.abs(p.x) < MAP.bounds - 200 && Math.abs(p.y) < MAP.bounds - 200 && GridNav.IsTraversable(p) && !GridNav.IsBlocked(p)) {
            g.MoveToPosition(p);
            return;
        }
    }
}

function leave(g: CDOTA_BaseNPC) {
    const fx = ParticleManager.CreateParticle("particles/items_fx/blink_dagger_start.vpcf", ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(fx, 0, g.GetAbsOrigin());
    ParticleManager.ReleaseParticleIndex(fx);
    UTIL_Remove(g);
    goblin = undefined;
    toast("event", "#orb_toast_goblin_escaped");
}

/** Каждые 0.3 с. */
export function goblinTick() {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    const now = gameNow();
    const times = TIMINGS.goblinTimes;
    if (nextIndex < times.length && now >= times[nextIndex]) {
        nextIndex++;
        spawnGoblin();
    }
    const g = goblin;
    if (!isValid(g) || !g.IsAlive()) return;
    if (now - spawnedAt >= LIFETIME) {
        leave(g);
        return;
    }
    if (now - lastBag >= BAG_EVERY) {
        lastBag = now;
        dropBag(g);
    }
    flee(g);
}

function onKilled(e: EntityKilledEvent) {
    const g = goblin;
    if (!isValid(g) || e.entindex_killed !== g.entindex()) return;
    goblin = undefined;
    const mod = g.FindModifierByName("modifier_orb_goblin") as unknown as ModifierOrbGoblin | undefined;
    const hits = mod !== undefined ? mod.hits : goblinHits;
    let killer = -1;
    const attacker = e.entindex_attacker !== undefined ? (EntIndexToHScript(e.entindex_attacker) as CDOTA_BaseNPC | undefined) : undefined;
    if (isValid(attacker)) killer = attacker.GetPlayerOwnerID();
    if (killer < 0 && hits.length > 0) killer = hits[hits.length - 1].pid;
    const now = GameRules.GetGameTime();
    const sums = new Map<number, number>();
    for (const h of hits) if (now - h.time <= 15) sums.set(h.pid, (sums.get(h.pid) ?? 0) + h.amount);
    const need = g.GetMaxHealth() * 0.05;
    if (killer >= 0 && State.players.has(killer)) {
        PlayerResource.ModifyGold(killer as PlayerID, KILL_GOLD, true, ModifyGoldReason.UNSPECIFIED);
        addBlue(killer, KILL_POINTS);
        goblinKills.set(killer, (goblinKills.get(killer) ?? 0) + 1);
        toast("event", "#orb_toast_goblin_killed", PlayerResource.GetSelectedHeroName(killer as PlayerID), undefined, undefined, killer as PlayerID);
    }
    for (const [pid, dmg] of sums) if (pid !== killer && dmg >= need && State.players.has(pid)) addBlue(pid, ASSIST_POINTS);
}

export function initGoblin() {
    ListenToGameEvent("entity_killed", e => safe("Гоблин", () => onKilled(e)), undefined);
}

export function currentGoblin(): CDOTA_BaseNPC | undefined {
    return isValid(goblin) && goblin.IsAlive() ? goblin : undefined;
}

export function goblinCheat() {
    spawnGoblin();
}
