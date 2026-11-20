// Повелитель бросает сферы в кольцо (DESIGN 6.2-6.5): захват удержанием 4 с, Свержение лидера.

import { CONFIG, TIMINGS } from "../core/config";
import { bossOrbRarity, BossOrbRarity, captureStep, CaptureState, overthrowStep, pickSector } from "../core/center";
import { leaderGap } from "../core/rules";
import { captureSpeed, enqueue } from "./orbs";
import { MAP } from "../core/mapinfo";
import { State, activePlayers, currentLeaderId, gameNow, placesNow, scoreRows, toast } from "./state";
import { Timers } from "./timers";
import { isValid, log, safe } from "./util";

interface BossOrb {
    id: number;
    rarity: BossOrbRarity;
    unit?: CDOTA_BaseNPC;
    pos: Vector;
    landed: boolean;
    bornAt: number;
    cap: CaptureState;
    ring?: ParticleID;
    /** Сфера у края возвышенности (напротив базы игрока), а не в кольце Повелителя. */
    edge?: boolean;
}

const ORB_MODELS: Record<BossOrbRarity, string> = {
    blue: "models/props_gameplay/rune_doubledamage01.vmdl",
    purple: "models/props_gameplay/rune_arcane.vmdl",
};
const RING_PARTICLE = "particles/ui_mouseactions/range_display.vpcf";

const orbs: BossOrb[] = [];
let orbCounter = 0;
let nextThrowAt: number = TIMINGS.bossOrbFirst;
const recentSectors: number[] = [];
let overthrowArmed = -1;
/** Дробная часть «сфер на бросок» (число сфер растет с числом игроков). */
let throwCarry = 0;
let nextEdgeAt: number = CONFIG.edgeOrbFirst;
/** Точки у края возвышенности по индексу базы (считаются один раз по высоте земли). */
const edgePoints = new Map<number, Vector>();
/** Сколько сфер Повелителя взял каждый игрок (для званий в итогах). */
export const bossOrbsTaken = new Map<number, number>();

function boss(): CDOTA_BaseNPC | undefined {
    const b = Entities.FindByName(undefined, "@overboss") as CDOTA_BaseNPC | undefined;
    return isValid(b) ? b : undefined;
}

function rng(n: number): number {
    return RandomInt(0, n - 1);
}

/** Точка посадки: сектор не из двух последних, проходимая клетка в кольце. */
function landingPoint(keep = 2): Vector {
    const sector = pickSector(recentSectors, rng);
    recentSectors.push(sector);
    while (recentSectors.length > Math.min(6, Math.max(2, keep))) recentSectors.shift();
    for (let i = 0; i < 25; i++) {
        const a = (sector + RandomFloat(0.1, 0.9)) * (Math.PI / 4);
        // Не ближе 430: там сферу закрывает модель Повелителя
        const r = RandomFloat(430, CONFIG.ringRadius - 120);
        const p = Vector(Math.cos(a) * r, Math.sin(a) * r, 0);
        if (GridNav.IsTraversable(p) && !GridNav.IsBlocked(p)) return GetGroundPosition(p, undefined);
    }
    const a = (sector + 0.5) * (Math.PI / 4);
    return GetGroundPosition(Vector(Math.cos(a) * 600, Math.sin(a) * 600, 0), undefined);
}

export function throwBossOrb(rarity: BossOrbRarity, quiet = false, keep = 2, edgeTarget?: Vector) {
    const b = boss();
    if (b !== undefined && edgeTarget === undefined) {
        const anim = b.FindAbilityByName("dota_ability_throw_coin_long") ?? b.FindAbilityByName("dota_ability_throw_coin");
        if (anim !== undefined) b.CastAbilityNoTarget(anim, -1);
    }
    const target = edgeTarget ?? landingPoint(keep);
    // Сферы у края падают сверху, сферы кольца летят от Повелителя
    const start = edgeTarget !== undefined ? Vector(target.x, target.y, target.z + 900) : Vector(0, 0, target.z + 350);
    const unit = CreateUnitByName("npc_orb_boss_sphere", start, false, undefined, undefined, DotaTeam.NEUTRALS);
    const orb: BossOrb = {
        id: ++orbCounter,
        rarity,
        unit: isValid(unit) ? unit : undefined,
        pos: target,
        landed: false,
        bornAt: gameNow(),
        cap: { holder: -1, progress: 0, contested: false },
        edge: edgeTarget !== undefined,
    };
    if (orb.unit !== undefined) {
        orb.unit.AddNewModifier(orb.unit, undefined, "modifier_orb_sphere_unit", {});
        orb.unit.SetModel(ORB_MODELS[rarity]);
        orb.unit.SetOriginalModel(ORB_MODELS[rarity]);
    }
    orbs.push(orb);
    // Полет по дуге 1 секунду
    const t0 = GameRules.GetGameTime();
    const flight = Timers.every(0.03, "полет сферы", () => {
        const t = Math.min(1, (GameRules.GetGameTime() - t0) / 1.0);
        if (orb.unit !== undefined && isValid(orb.unit)) {
            const x = start.x + (target.x - start.x) * t;
            const y = start.y + (target.y - start.y) * t;
            const z = start.z + (target.z - start.z) * t + (orb.edge === true ? 0 : Math.sin(t * Math.PI) * 300);
            orb.unit.SetAbsOrigin(Vector(x, y, z));
        }
        if (t >= 1) {
            Timers.cancel(flight);
            land(orb);
        }
    });
    const pinger = b ?? orb.unit;
    if (pinger !== undefined && edgeTarget === undefined) for (const team of teamsInGame()) MinimapEvent(team, pinger, target.x, target.y, MinimapEventType.HINT_LOCATION, 3);
    if (!quiet) toast("event", rarity === "purple" ? "#orb_toast_boss_purple" : "#orb_toast_boss_blue");
    log("сфера Повелителя:", rarity, Math.floor(target.x), Math.floor(target.y));
}

function teamsInGame(): DotaTeam[] {
    return activePlayers().map(p => p.team);
}

function land(orb: BossOrb) {
    orb.landed = true;
    if (orb.unit !== undefined && isValid(orb.unit)) {
        FindClearSpaceForUnit(orb.unit, orb.pos, false);
        orb.pos = orb.unit.GetAbsOrigin();
    }
    const fx = ParticleManager.CreateParticle(RING_PARTICLE, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(fx, 0, orb.pos);
    ParticleManager.SetParticleControl(fx, 1, Vector(CONFIG.bossOrbCaptureRadius, 0, 0));
    orb.ring = fx;
    StartSoundEventFromPosition("General.Coins", orb.pos);
}

function removeOrb(orb: BossOrb) {
    if (orb.ring !== undefined) {
        ParticleManager.DestroyParticle(orb.ring, false);
        ParticleManager.ReleaseParticleIndex(orb.ring);
    }
    if (orb.unit !== undefined && isValid(orb.unit)) UTIL_Remove(orb.unit);
    const i = orbs.indexOf(orb);
    if (i >= 0) orbs.splice(i, 1);
}

/** Кто из настоящих героев стоит в круге захвата. */
function heroesInside(orb: BossOrb): number[] {
    const units = FindUnitsInRadius(DotaTeam.NEUTRALS, orb.pos, undefined, CONFIG.bossOrbCaptureRadius,
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

function giveOrb(orb: BossOrb, pid: number, reason: string) {
    enqueue(pid, orb.rarity, 1);
    bossOrbsTaken.set(pid, (bossOrbsTaken.get(pid) ?? 0) + 1);
    const hero = PlayerResource.GetSelectedHeroName(pid as PlayerID);
    toast("event", reason, hero, undefined, undefined, pid as PlayerID);
    const h = PlayerResource.GetSelectedHeroEntity(pid as PlayerID);
    if (isValid(h)) EmitSoundOn("Rune.Arcane", h);
    removeOrb(orb);
}

function lastPlaceId(): number {
    const places = placesNow();
    let worst = -1;
    let worstPlace = -1;
    for (const [id, place] of places) if (place > worstPlace) { worst = id; worstPlace = place; }
    return worst;
}

let lastTick = -1;

/** Каждые 0.1 с: броски по расписанию, захват, Свержение, сетевая таблица. */
export function bossOrbsTick() {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    const now = gameNow();
    const dt = lastTick < 0 ? 0 : Math.max(0, Math.min(0.5, now - lastTick));
    lastTick = now;

    if (now >= nextThrowAt) {
        nextThrowAt = now + TIMINGS.bossOrbEvery + RandomFloat(-TIMINGS.bossOrbJitter, TIMINGS.bossOrbJitter);
        // Число сфер растет с числом игроков: на каждого игрока — четверть сферы за бросок
        throwCarry += Math.max(1, activePlayers().length) * CONFIG.bossOrbsPerPlayer;
        const n = Math.max(1, Math.floor(throwCarry));
        throwCarry = Math.max(0, throwCarry - n);
        for (let i = 0; i < n; i++) {
            const rarity = bossOrbRarity(now, RandomFloat(0, 1));
            if (i === 0) throwBossOrb(rarity, false, n + 1);
            else Timers.after(0.7 * i, "бросок сферы", () => throwBossOrb(rarity, true, n + 1));
        }
    }
    if (now >= nextEdgeAt) {
        nextEdgeAt = now + CONFIG.edgeOrbEvery;
        spawnEdgeOrbs(now);
    }

    for (const orb of orbs.slice()) {
        if (!orb.landed) continue;
        const inside = heroesInside(orb);
        const k = inside.length === 1 ? captureSpeed(inside[0]) : 1;
        if (captureStep(orb.cap, inside, dt * k)) {
            giveOrb(orb, orb.cap.holder, orb.rarity === "purple" ? "#orb_toast_captured_purple" : "#orb_toast_captured_blue");
            continue;
        }
        if (now - orb.bornAt >= CONFIG.bossOrbMaxAge) {
            const last = lastPlaceId();
            if (last >= 0) giveOrb(orb, last, "#orb_toast_orb_to_last");
            else removeOrb(orb);
        }
    }

    // Свержение
    const rows = scoreRows().filter(r => !r.left);
    // Заряженный лидер ушел из игры — Свержения нет, просто снимаем заряд
    if (overthrowArmed >= 0) {
        const ap = State.players.get(overthrowArmed);
        if (ap === undefined || ap.left) overthrowArmed = -1;
    }
    const st = overthrowStep(overthrowArmed, currentLeaderId(), leaderGap(rows));
    overthrowArmed = st.armed;
    if (st.fired) {
        toast("goal", "#orb_toast_overthrow");
        for (let i = 0; i < CONFIG.overthrowOrbs; i++) Timers.after(0.6 * i, "свержение", () => throwBossOrb("purple", true));
    }
    pushBossNet();
}

function pushBossNet() {
    const list: Record<string, BossOrbNet> = {};
    orbs.forEach((o, i) => {
        list[tostring(i + 1)] = {
            id: o.id,
            x: Math.floor(o.pos.x),
            y: Math.floor(o.pos.y),
            z: Math.floor(o.pos.z),
            r: o.rarity,
            p: Math.floor((o.cap.progress / CONFIG.bossOrbCaptureTime) * 100) / 100,
            h: o.cap.holder,
            c: o.cap.contested ? 1 : 0,
            l: o.landed ? 1 : 0,
        };
    });
    // Пишем только при изменении: каждый клиент перерисовывает верхнюю панель по событию таблицы
    let sig = tostring(Math.floor(nextThrowAt)) + "a" + tostring(overthrowArmed);
    for (const k in list) {
        const o = list[k];
        sig += "|" + o.id + ":" + o.x + ":" + o.y + ":" + o.z + ":" + o.p + ":" + o.h + ":" + o.c + ":" + o.l;
    }
    if (sig === lastBossSig) return;
    lastBossSig = sig;
    CustomNetTables.SetTableValue("orb_game", "boss", { orbs: list, next: Math.floor(nextThrowAt), armed: overthrowArmed });
}
let lastBossSig = "";

// ---------- Сферы у края возвышенности ----------

/** Высота земли без учета юнитов. */
function groundZ(x: number, y: number): number {
    return GetGroundHeight(Vector(x, y, 0), undefined);
}

/**
 * Точка у края центральной возвышенности на луче от центра к базе:
 * идем от кольца наружу, пока высота земли не упадет (спуск с возвышенности), и отступаем внутрь.
 */
function computeEdgePoint(baseIndex: number): Vector {
    const b = MAP.bases[baseIndex] ?? MAP.bases[0];
    const ang = Math.atan2(b.fountain.y, b.fountain.x);
    const dir = (r: number, da = 0) => Vector(Math.cos(ang + da) * r, Math.sin(ang + da) * r, 0);
    const top = groundZ(dir(CONFIG.ringRadius - 100).x, dir(CONFIG.ringRadius - 100).y);
    let edge = 1300;
    for (let r = CONFIG.ringRadius; r <= 3200; r += 25) {
        const p = dir(r);
        if (Math.abs(groundZ(p.x, p.y) - top) > 48) {
            edge = r;
            break;
        }
    }
    const want = Math.min(2200, Math.max(CONFIG.ringRadius + 150, edge - CONFIG.edgeOrbInset));
    // Проходимая клетка рядом: немного в стороны и внутрь
    for (const dr of [0, -60, -120, 40, -180, -240]) {
        for (const da of [0, 0.06, -0.06, 0.12, -0.12]) {
            const p = dir(want + dr, da);
            if (GridNav.IsTraversable(p) && !GridNav.IsBlocked(p) && Math.abs(groundZ(p.x, p.y) - top) <= 48) {
                return GetGroundPosition(p, undefined);
            }
        }
    }
    return GetGroundPosition(dir(want), undefined);
}

export function edgePointOf(baseIndex: number): Vector {
    let p = edgePoints.get(baseIndex);
    if (p === undefined) {
        p = computeEdgePoint(baseIndex);
        edgePoints.set(baseIndex, p);
        log("край возвышенности для базы", baseIndex, ":", Math.floor(p.x), Math.floor(p.y));
    }
    return p;
}

/** По одной сфере напротив выхода с базы каждого игрока (реже, чем сферы кольца). */
function spawnEdgeOrbs(now: number) {
    const players = activePlayers();
    if (players.length === 0) return;
    players.forEach((p, i) => {
        const point = edgePointOf(p.baseIndex);
        // Если прошлая сфера на этом месте еще лежит — новую не кладем
        for (const o of orbs) if (o.edge === true && ((o.pos - point) as Vector).Length2D() < 200) return;
        const rarity = bossOrbRarity(now, RandomFloat(0, 1));
        Timers.after(0.15 * i, "сфера у края", () => throwBossOrb(rarity, true, 2, point));
    });
    toast("event", "#orb_toast_edge_orbs");
}

/** Лежащие сферы (для ботов). */
export function landedBossOrbs(): Vector[] {
    return orbs.filter(o => o.landed).map(o => o.pos);
}

export function bossOrbCheat(rarity: string) {
    safe("чит сферы", () => throwBossOrb(rarity === "purple" ? "purple" : "blue"));
}
