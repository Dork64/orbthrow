// Курьер с сокровищем (DESIGN 8): каждые 90 с с 3:00 сундук в одну из 8 точек карты.
// За 10 с — предупреждение, метка на земле, обзор и пинг. Курьер и сундук видны на миникарте,
// а в интерфейсе — метка над ними и стрелка у края экрана (сетевая таблица orb_game/chest).
// Сундук не подбирается, а захватывается, как сфера Повелителя, но быстрее (2 с).

import { CONFIG, TIMINGS } from "../core/config";
import { captureStep, CaptureState } from "../core/center";
import { courierItem, courierTierFor } from "../core/catchup";
import { MAP } from "../core/mapinfo";
import { captureSpeed } from "./orbs";
import { State, activePlayers, gameNow, scoreRows, toast } from "./state";
import { Timers } from "./timers";
import { isValid, log } from "./util";

const CHEST = "item_treasure_chest";
const CHEST_UNIT = "npc_orb_chest";
const WARN_SECONDS = 10;
const RING_PARTICLE = "particles/ui_mouseactions/range_display.vpcf";
const MARK_PARTICLE = "particles/econ/wards/f2p/f2p_ward/f2p_ward_true_sight_ambient.vpcf";

interface Chest {
    id: number;
    unit?: CDOTA_BaseNPC;
    pos: Vector;
    landed: boolean;
    cap: CaptureState;
    ring?: ParticleID;
    mark?: ParticleID;
}

let nextAt: number = TIMINGS.courierFirst;
let announced = false;
let target: Vector | undefined;
let targetFx: ParticleID[] = [];
const recent: number[] = [];
let courier: CDOTA_BaseNPC | undefined;
const chests: Chest[] = [];
let chestCounter = 0;
let lastTick = -1;
let lastSig = "";

/** Лежащий сундук (для ботов): точка или undefined. Не «export let»: в Lua импорт копирует значение. */
export function chestOnGroundNow(): Vector | undefined {
    for (const c of chests) if (c.landed) return c.pos;
    return undefined;
}
/** Сколько сундуков взял каждый игрок (для итогов). */
export const chestsTaken = new Map<number, number>();

function pickSpot(): Vector {
    const spots = MAP.itemSpawns;
    const free: number[] = [];
    for (let i = 0; i < spots.length; i++) if (!recent.includes(i)) free.push(i);
    const i = free[RandomInt(0, free.length - 1)];
    recent.push(i);
    while (recent.length > 2) recent.shift();
    const s = spots[i];
    return GetGroundPosition(Vector(s.x, s.y, 0), undefined);
}

function ringAt(pos: Vector, radius: number): ParticleID {
    const fx = ParticleManager.CreateParticle(RING_PARTICLE, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(fx, 0, pos);
    ParticleManager.SetParticleControl(fx, 1, Vector(radius, 0, 0));
    return fx;
}

function markAt(pos: Vector): ParticleID {
    const fx = ParticleManager.CreateParticle(MARK_PARTICLE, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(fx, 0, pos);
    return fx;
}

function freeFx(fx: ParticleID | undefined) {
    if (fx === undefined) return;
    ParticleManager.DestroyParticle(fx, false);
    ParticleManager.ReleaseParticleIndex(fx);
}

function announce() {
    announced = true;
    target = pickSpot();
    const t = target;
    // Метка места падения видна всем сразу
    targetFx = [ringAt(t, CONFIG.chestCaptureRadius), markAt(t)];
    for (const p of activePlayers()) {
        AddFOWViewer(p.team, t, 450, WARN_SECONDS + 8, false);
        const h = PlayerResource.GetSelectedHeroEntity(p.id);
        if (isValid(h)) MinimapEvent(p.team, h, t.x, t.y, MinimapEventType.HINT_LOCATION, 4);
    }
    toast("event", "#orb_toast_courier_incoming");
    EmitGlobalSound("powerup_03");
    // Курьер летит с края карты в сторону точки
    const len = Math.max(1, Math.sqrt(t.x * t.x + t.y * t.y));
    const start = Vector((t.x / len) * (MAP.bounds - 300), (t.y / len) * (MAP.bounds - 300), t.z + 200);
    const unit = CreateUnitByName("npc_orb_treasure_courier", start, false, undefined, undefined, DotaTeam.NEUTRALS);
    if (isValid(unit)) {
        courier = unit;
        unit.AddNewModifier(unit, undefined, "modifier_orb_sphere_unit", {});
        const dist = ((t - start) as Vector).Length2D();
        unit.SetBaseMoveSpeed(Math.min(550, Math.max(200, dist / (WARN_SECONDS - 0.5))));
        unit.MoveToPosition(t);
    }
}

function dropChest() {
    const t = target ?? pickSpot();
    announced = false;
    target = undefined;
    for (const fx of targetFx) freeFx(fx);
    targetFx = [];
    const from = isValid(courier) ? courier.GetAbsOrigin() : Vector(t.x, t.y, t.z + 300);
    const chest: Chest = { id: ++chestCounter, pos: t, landed: false, cap: { holder: -1, progress: 0, contested: false } };
    const unit = CreateUnitByName(CHEST_UNIT, from, false, undefined, undefined, DotaTeam.NEUTRALS);
    if (isValid(unit)) {
        chest.unit = unit;
        unit.AddNewModifier(unit, undefined, "modifier_orb_sphere_unit", {});
    }
    chests.push(chest);
    // Падение по дуге 0.6 с
    const t0 = GameRules.GetGameTime();
    const fall = Timers.every(0.03, "падение сундука", () => {
        const k = Math.min(1, (GameRules.GetGameTime() - t0) / 0.6);
        if (chest.unit !== undefined && isValid(chest.unit)) {
            const x = from.x + (t.x - from.x) * k;
            const y = from.y + (t.y - from.y) * k;
            const z = from.z + (t.z - from.z) * k + Math.sin(k * Math.PI) * 150;
            chest.unit.SetAbsOrigin(Vector(x, y, z));
        }
        if (k >= 1) {
            Timers.cancel(fall);
            land(chest);
        }
    });
    StartSoundEventFromPosition("Item.DropGemWorld", t);
    const c = courier;
    courier = undefined;
    if (isValid(c)) {
        c.MoveToPosition(Vector(-t.x * 2, -t.y * 2, t.z));
        Timers.after(5, "курьер улетел", () => { if (isValid(c)) UTIL_Remove(c); });
    }
    log("сундук упал:", Math.floor(t.x), Math.floor(t.y));
}

function land(chest: Chest) {
    chest.landed = true;
    if (chest.unit !== undefined && isValid(chest.unit)) {
        FindClearSpaceForUnit(chest.unit, chest.pos, false);
        chest.pos = chest.unit.GetAbsOrigin();
    }
    chest.ring = ringAt(chest.pos, CONFIG.chestCaptureRadius);
    chest.mark = markAt(chest.pos);
    // Сундук отталкивает героев рядом: захват начинается с равных позиций
    const heroes = FindUnitsInRadius(DotaTeam.NEUTRALS, chest.pos, undefined, 250, UnitTargetTeam.BOTH, UnitTargetType.HERO,
        UnitTargetFlags.MAGIC_IMMUNE_ENEMIES, FindOrder.ANY, false);
    for (const h of heroes) {
        h.AddNewModifier(h, undefined, "modifier_knockback", {
            center_x: chest.pos.x, center_y: chest.pos.y, center_z: chest.pos.z, duration: 0.3,
            knockback_duration: 0.3, knockback_distance: 200, knockback_height: 60, should_stun: 0,
        });
    }
}

function removeChest(chest: Chest) {
    freeFx(chest.ring);
    freeFx(chest.mark);
    if (chest.unit !== undefined && isValid(chest.unit)) UTIL_Remove(chest.unit);
    const i = chests.indexOf(chest);
    if (i >= 0) chests.splice(i, 1);
}

/** Кто из настоящих героев стоит в круге сундука. */
function heroesInside(chest: Chest): number[] {
    const units = FindUnitsInRadius(DotaTeam.NEUTRALS, chest.pos, undefined, CONFIG.chestCaptureRadius,
        UnitTargetTeam.BOTH, UnitTargetType.HERO, UnitTargetFlags.INVULNERABLE | UnitTargetFlags.MAGIC_IMMUNE_ENEMIES | UnitTargetFlags.NOT_ILLUSIONS,
        FindOrder.ANY, false);
    const ids: number[] = [];
    for (const unit of units) {
        const u = unit as CDOTA_BaseNPC;
        const real: boolean = u.IsRealHero();
        if (!real || !u.IsAlive() || u.IsInvulnerable() || u.IsTempestDouble() || u.IsClone()) continue;
        const pid = u.GetPlayerOwnerID();
        const p = State.players.get(pid);
        if (p === undefined || p.left || ids.includes(pid)) continue;
        ids.push(pid);
    }
    return ids;
}

/** Каждые 0.1 с (вызов из таймера курьера и сфер). */
export function courierTick() {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    const now = gameNow();
    const dt = lastTick < 0 ? 0 : Math.max(0, Math.min(0.5, now - lastTick));
    lastTick = now;
    if (!announced && now >= nextAt - WARN_SECONDS) announce();
    if (announced && now >= nextAt) {
        nextAt += TIMINGS.courierEvery;
        while (nextAt <= now) nextAt += TIMINGS.courierEvery; // после перемотки времени
        dropChest();
    }
    // Курьер и сундук видны всем: и на миникарте, и в мире
    const teams = activePlayers().map(p => p.team);
    const reveal = (u: CDOTA_BaseNPC | undefined) => {
        if (u === undefined || !isValid(u)) return;
        for (const team of teams) u.MakeVisibleToTeam(team, 0.5);
    };
    reveal(courier);
    for (const chest of chests) reveal(chest.unit);
    for (const chest of chests.slice()) {
        if (!chest.landed) continue;
        const inside = heroesInside(chest);
        const k = inside.length === 1 ? captureSpeed(inside[0]) : 1;
        if (captureStep(chest.cap, inside, dt * k, CONFIG.chestCaptureTime)) {
            const h = PlayerResource.GetSelectedHeroEntity(chest.cap.holder as PlayerID);
            removeChest(chest);
            if (isValid(h)) giveChestItem(h);
        }
    }
    pushChestNet(now);
}

/** Сетевая таблица для меток: где сейчас сундук (у курьера или на земле) и захват. */
function pushChestNet(now: number) {
    const list: Record<string, ChestNet> = {};
    let i = 0;
    const add = (pos: Vector, st: number, chest?: Chest) => {
        i++;
        list[tostring(i)] = {
            x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z), st,
            p: chest !== undefined ? Math.floor((chest.cap.progress / CONFIG.chestCaptureTime) * 100) / 100 : 0,
            h: chest !== undefined ? chest.cap.holder : -1,
            c: chest !== undefined && chest.cap.contested ? 1 : 0,
            t: st === 0 ? Math.max(0, Math.ceil(nextAt - now)) : 0,
        };
    };
    // st: 0 — летит (место падения и курьер), 1 — падает, 2 — лежит
    if (announced && target !== undefined) {
        add(target, 0);
        if (isValid(courier)) add(courier.GetAbsOrigin(), 3);
    }
    for (const c of chests) add(c.landed ? c.pos : (c.unit !== undefined && isValid(c.unit) ? c.unit.GetAbsOrigin() : c.pos), c.landed ? 2 : 1, c);
    let sig = "";
    for (const k in list) {
        const o = list[k];
        sig += "|" + o.x + ":" + o.y + ":" + o.z + ":" + o.st + ":" + o.p + ":" + o.h + ":" + o.c + ":" + o.t;
    }
    if (sig === lastSig) return;
    lastSig = sig;
    CustomNetTables.SetTableValue("orb_game", "chest", { list });
}

function ownedItems(h: CDOTA_BaseNPC_Hero): string[] {
    const list: string[] = [];
    for (let slot = 0; slot <= 16; slot++) {
        const it = h.GetItemInSlot(slot);
        if (it !== undefined && IsValidEntity(it)) list.push(it.GetAbilityName());
    }
    return list;
}

function hasFreeSlot(h: CDOTA_BaseNPC_Hero): boolean {
    for (let slot = 0; slot <= 8; slot++) {
        if (h.GetItemInSlot(slot) === undefined) return true;
    }
    return false;
}

/** Захват сундука: предмет по уровню пула (в инвентарь или на землю под героя). */
function giveChestItem(hero: CDOTA_BaseNPC_Hero) {
    const pid = hero.GetPlayerOwnerID();
    const rows = scoreRows().filter(r => !r.left);
    const tier = courierTierFor(gameNow(), pid, rows);
    const name = courierItem(tier, ownedItems(hero), n => RandomInt(0, n - 1));
    if (hasFreeSlot(hero)) {
        hero.AddItemByName(name);
    } else {
        const it = CreateItem(name, hero.GetPlayerOwner(), hero);
        if (it !== undefined) CreateItemOnPositionSync(hero.GetAbsOrigin(), it);
    }
    chestsTaken.set(pid, (chestsTaken.get(pid) ?? 0) + 1);
    toast("event", "#orb_toast_chest", hero.GetUnitName(), name, tostring(tier), pid);
    EmitSoundOn("General.Buy", hero);
    log("сундук:", hero.GetUnitName(), name, "уровень", tier);
}

/** Старый предмет-сундук больше не выпадает; если его как-то подобрали — просто убираем. */
export function onChestPicked(hero: CDOTA_BaseNPC_Hero, item: CDOTA_Item | undefined): boolean {
    if (isValid(item)) {
        hero.RemoveItem(item);
        if (isValid(item)) UTIL_Remove(item);
    }
    return true;
}

export const CHEST_ITEM = CHEST;

export function courierCheat() {
    nextAt = gameNow() + WARN_SECONDS;
    announced = false;
}
