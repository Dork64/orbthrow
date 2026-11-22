// Сферы на сервере (DESIGN раздел 5): шкалы, очередь, предложения, выбор, перебросы, автовыбор.
// Состояние хранится по номеру игрока.

import {
    ORB, addBarPoints, assistPurplePoints, blueDef, blueNeed, candidates, heroUpgrades, Card, diminishing, greyDef, greyRate, upDef,
    killPurplePoints, makeOffer, maxStacks, purpleNeed, rerollCost,
} from "../core/orbs";
import type { Bar } from "../core/orbs";
import type { Branch, Rarity } from "../core/orbtypes";
import { computeBonuses, greyValue, overrideValue, setBonuses } from "../core/orbstore";
import { campOfUnit } from "./camps";
import { orbIcon } from "../core/orbicons";
import { Hooks } from "./hooks";
import { State, PlayerState, activePlayers, gameNow, inFight, placesNow, toast } from "./state";
import { isValid, log, safe } from "./util";

const CONTROLLER = "modifier_orb_controller";

interface OrbOffer {
    seq: number;
    asked: Rarity;
    rarity: Rarity;
    cards: Card[];
    openedAt: number;
    test?: boolean;
}

export interface OrbPlayer {
    pid: PlayerID;
    grey: Bar;
    blue: Bar;
    purple: Bar;
    queue: Rarity[];
    /** Когда каждая сфера встала в очередь: автовыбор через 60 с считается от этого момента. */
    queueAt: number[];
    offer?: OrbOffer;
    seq: number;
    stacks: Record<string, number>;
    order: string[];
    freeRerolls: number;
    paidRerolls: number;
    randomBonusGiven: boolean;
    mainBranch?: Branch;
    version: number;
    primaryAttr: number;
    disabled: Record<string, boolean>;
    dirty: boolean;
    lastPush: number;
    legendQueued: boolean;
    /** Сколько легендарок уже поставлено в очередь (первая на 10 уровне, вторая на 30-й минуте). */
    legendsQueued: number;
    /** Подмога «Ярость»: следующее убийство или помощь дает +3 очка боя. */
    rage: boolean;
    /** Сколько очков фарма набрал за партию (для звания «Лесник»). */
    farmPoints: number;
}

const players = new Map<number, OrbPlayer>();
let lastTick = -1;

function rng(n: number): number {
    return RandomInt(0, n - 1);
}

export function orbPlayer(pid: number): OrbPlayer {
    let op = players.get(pid);
    if (op === undefined) {
        op = {
            pid: pid as PlayerID,
            grey: { points: 0, count: 0 },
            blue: { points: 0, count: 0 },
            purple: { points: 0, count: 0 },
            queue: [],
            queueAt: [],
            seq: 0,
            stacks: {},
            order: [],
            freeRerolls: ORB.freeRerolls,
            paidRerolls: 0,
            randomBonusGiven: false,
            version: 1,
            primaryAttr: 0,
            disabled: {},
            dirty: true,
            lastPush: -100,
            legendQueued: false,
            legendsQueued: 0,
            rage: false,
            farmPoints: 0,
        };
        players.set(pid, op);
    }
    return op;
}

function heroNameOf(pid: number): string {
    return PlayerResource.GetSelectedHeroName(pid as PlayerID);
}

function heroOf(pid: number): CDOTA_BaseNPC_Hero | undefined {
    const h = PlayerResource.GetSelectedHeroEntity(pid as PlayerID);
    return isValid(h) ? h : undefined;
}

// ---------- Очередь и предложения ----------

export function enqueue(pid: number, rarity: Rarity, count = 1) {
    const op = orbPlayer(pid);
    for (let i = 0; i < count; i++) {
        op.queue.push(rarity);
        op.queueAt.push(gameNow());
    }
    openNext(op);
    op.dirty = true;
}

/** В редакторе следующая легендарка доступна сразу и не заменяется сферой другой редкости. */
export function offerTestLegend(pid: PlayerID): boolean {
    const op = orbPlayer(pid);
    const cards = candidates("legend", heroNameOf(pid), op.stacks, op.disabled, Infinity);
    if (cards.length === 0) return false;

    const queued = op.queue.indexOf("legend");
    if (queued >= 0) {
        op.queue.splice(queued, 1);
        op.queueAt.splice(queued, 1);
    }
    const now = gameNow();
    op.queue.unshift("legend");
    op.queueAt.unshift(now);
    op.offer = { seq: ++op.seq, asked: "legend", rarity: "legend", cards: cards.slice(0, ORB.legendCards), openedAt: now, test: true };
    const picked = op.order.filter(id => upDef(id)?.rarity === "legend").length;
    op.legendsQueued = Math.max(op.legendsQueued, picked + 1);
    op.legendQueued = true;
    pushPlayer(op, true);
    return true;
}

export function resetTestOrbs(pid: PlayerID) {
    const previous = orbPlayer(pid);
    players.delete(pid);
    const op = orbPlayer(pid);
    op.seq = previous.seq;
    op.version = previous.version + 1;
    setBonuses(pid, op.stacks, op.primaryAttr, op.version);
    pushPlayer(op, true);
}

function openNext(op: OrbPlayer) {
    let guard = 0;
    while (op.offer === undefined && op.queue.length > 0 && guard++ < 20) {
        const asked = op.queue[0];
        const o = makeOffer(asked, heroNameOf(op.pid), op.stacks, rng, op.mainBranch, [], op.disabled, legendSlotsOf(op));
        if (o.kind === "gold") {
            op.queue.shift();
            op.queueAt.shift();
            PlayerResource.ModifyGold(op.pid, o.gold, true, ModifyGoldReason.UNSPECIFIED);
            const h = heroOf(op.pid);
            if (h !== undefined) SendOverheadEventMessage(undefined, OverheadAlert.GOLD, h, o.gold, undefined);
            continue;
        }
        op.seq++;
        const queuedAt = op.queueAt[0] ?? gameNow();
        op.offer = { seq: op.seq, asked, rarity: o.rarity, cards: o.cards, openedAt: Math.min(gameNow(), queuedAt) };
    }
    op.dirty = true;
}


/** Постоянный исполнитель геройских эффектов сфер. */
function ensureExtras(op: OrbPlayer, h: CDOTA_BaseNPC_Hero) {
    // Эффекты фиолетовых и легендарных сфер (у каждого героя)
    if (h.GetUnitName() === "npc_dota_hero_tusk" && !h.HasModifier("modifier_orb_tusk"))
        h.AddNewModifier(h, undefined, "modifier_orb_tusk", {});
    if (h.GetUnitName() === "npc_dota_hero_juggernaut" && !h.HasModifier("modifier_orb_jugg_legend"))
        h.AddNewModifier(h, undefined, "modifier_orb_jugg_legend", {});
    if (h.GetUnitName() === "npc_dota_hero_pudge" && !h.HasModifier("modifier_orb_pudge_legend"))
        h.AddNewModifier(h, undefined, "modifier_orb_pudge_legend", {});
    if (h.GetUnitName() === "npc_dota_hero_sven" && !h.HasModifier("modifier_orb_sven_legend"))
        h.AddNewModifier(h, undefined, "modifier_orb_sven_legend", {});
    if (!h.HasModifier("modifier_orb_hero")) h.AddNewModifier(h, undefined, "modifier_orb_hero", {});

}

function applyCard(op: OrbPlayer, id: string) {
    op.stacks[id] = (op.stacks[id] ?? 0) + 1;
    op.order.push(id);
    op.version++;
    const d = upDef(id);
    if (d !== undefined && d.rarity === "legend" && d.branch !== "H") op.mainBranch = d.branch;
    setBonuses(op.pid, op.stacks, op.primaryAttr, op.version);
    const h = heroOf(op.pid);
    if (h !== undefined) {
        if (!h.HasModifier(CONTROLLER)) h.AddNewModifier(h, undefined, CONTROLLER, {});
        ensureExtras(op, h);
        h.CalculateStatBonus(true);
    }
}

/** Легендарка на 10 уровне (вне очереди — первой), Пробуждение на 20. */
/** Сколько легендарок можно взять: одна, с 30-й минуты — две. */
function legendSlotsOf(_op: OrbPlayer): number {
    return gameNow() >= ORB.secondLegendTime ? 2 : 1;
}

function checkLevels(op: OrbPlayer) {
    const h = heroOf(op.pid);
    if (h === undefined) return;
    const lvl = h.GetLevel();
    // Первая легендарка — на 10 уровне, вторая — на 30-й минуте (выбор из трех оставшихся)
    const want = lvl >= ORB.legendLevel ? legendSlotsOf(op) : 0;
    if (op.legendsQueued < want) {
        op.legendsQueued++;
        op.legendQueued = true;
        const at = op.offer !== undefined ? 1 : 0;
        op.queue.splice(at, 0, "legend");
        op.queueAt.splice(at, 0, gameNow());
        openNext(op);
        toast("event", op.legendsQueued >= 2 ? "#orb_toast_legend2" : "#orb_toast_legend", h.GetUnitName(), undefined, undefined, op.pid);
    }
    if (lvl >= ORB.awakeningLevel && (op.stacks["awake"] ?? 0) === 0) {
        op.stacks["awake"] = 1;
        op.version++;
        setBonuses(op.pid, op.stacks, op.primaryAttr, op.version);
        h.CalculateStatBonus(true);
        toast("event", "#orb_toast_awake", h.GetUnitName(), undefined, undefined, op.pid);
        op.dirty = true;
    }
}

function addFerocity(pid: number) {
    const op = players.get(pid);
    if (op === undefined || (op.stacks["p_ferocity"] ?? 0) <= 0) return;
    const h = heroOf(pid);
    if (h === undefined || !h.IsAlive()) return;
    const mod = h.FindModifierByName("modifier_orb_ferocity") ?? h.AddNewModifier(h, undefined, "modifier_orb_ferocity", {});
    // Каждая взятая Свирепость добавляет еще 5 возможных стаков
    if (mod !== undefined && mod.GetStackCount() < 5 * (op.stacks["p_ferocity"] ?? 1)) mod.IncrementStackCount();
}

/** Кровавый пир (общая фиолетовая): за убийство и помощь — здоровье, мана и перезарядки. */
function bloodFeast(pid: number) {
    const op = players.get(pid);
    const n = op !== undefined ? (op.stacks["p_feast"] ?? 0) : 0;
    if (n <= 0) return;
    const h = heroOf(pid);
    if (h === undefined || !h.IsAlive()) return;
    const share = Math.min(0.75, 0.3 + 0.15 * (n - 1));
    h.Heal(h.GetMaxHealth() * share, undefined);
    h.GiveMana(h.GetMaxMana() * share);
    for (let i = 0; i < h.GetAbilityCount(); i++) {
        const a = h.GetAbilityByIndex(i);
        if (a === undefined || a.GetAbilityType() === AbilityTypes.ULTIMATE || a.GetAbilityName().startsWith("orb_slot_")) continue;
        const left = a.GetCooldownTimeRemaining();
        if (left <= 0) continue;
        a.EndCooldown();
        a.StartCooldown(left * Math.max(0.1, 1 - share - 0.2));
    }
    EmitSoundOn("Hero_LifeStealer.Consume", h);
}

/** Чит -mech: все механики своего героя и общие фиолетовые-механики (проверка в редакторе и симуляторе). */
export function grantMechanics(pid: number): number {
    const op = players.get(pid);
    const h = heroOf(pid);
    if (op === undefined || h === undefined) return 0;
    let n = 0;
    for (const u of heroUpgrades(h.GetUnitName())) {
        if (u.rarity !== "purple" || u.mech !== true || (op.stacks[u.id] ?? 0) > 0) continue;
        applyCard(op, u.id);
        n++;
    }
    for (const id of ["p_grave", "p_feast", "p_meteor", "p_hunter", "p_martyr", "p_vanish"]) {
        if ((op.stacks[id] ?? 0) > 0) continue;
        applyCard(op, id);
        n++;
    }
    pushPlayer(op, true);
    return n;
}

/** Последний залп (общая фиолетовая): при смерти — взрыв вокруг героя. */
function lastSalvo(pid: number) {
    const op = players.get(pid);
    const n = op !== undefined ? (op.stacks["p_martyr"] ?? 0) : 0;
    if (n <= 0) return;
    const h = heroOf(pid);
    if (h === undefined || h.IsReincarnating()) return;
    const pos = h.GetAbsOrigin();
    const dmg = h.GetMaxHealth() * Math.min(0.6, 0.2 + 0.1 * (n - 1));
    const fx = ParticleManager.CreateParticle("particles/units/heroes/hero_techies/techies_land_mine_explode.vpcf", ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(fx, 0, pos);
    ParticleManager.SetParticleControl(fx, 1, Vector(450, 450, 450));
    ParticleManager.ReleaseParticleIndex(fx);
    StartSoundEventFromPosition("Hero_Techies.LandMine.Detonate", pos);
    const enemies = FindUnitsInRadius(h.GetTeamNumber(), pos, undefined, 450, UnitTargetTeam.ENEMY,
        UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
    for (const u of enemies) {
        if (u.IsAlive()) ApplyDamage({ victim: u, attacker: h, damage: dmg, damage_type: DamageTypes.MAGICAL });
    }
}

/** Множитель скорости захвата сфер и сундуков (Охотник за сокровищами). */
export function captureSpeed(pid: number): number {
    const n = players.get(pid)?.stacks["p_hunter"] ?? 0;
    return n > 0 ? 1 + 0.75 * n : 1;
}

/** Выбор карточки. Сервер проверяет номер предложения и карточку: двойной клик не дает две сферы. */
export function pick(pid: number, seq: number, id: string): boolean {
    if (State.phase === "ended") return false;
    const op = players.get(pid);
    if (op === undefined || op.offer === undefined) return false;
    if (op.offer.seq !== seq) return false;
    if (!op.offer.cards.some(c => c.id === id)) return false;
    applyCard(op, id);
    op.queue.shift();
    op.queueAt.shift();
    op.offer = undefined;
    openNext(op);
    pushPlayer(op, true);
    return true;
}

export function reroll(pid: number, seq: number): string | undefined {
    if (State.phase === "ended") return "ended";
    const op = players.get(pid);
    if (op === undefined || op.offer === undefined || op.offer.seq !== seq) return "stale";
    if (op.offer.rarity === "legend") return "legend";
    if (op.freeRerolls > 0) {
        op.freeRerolls--;
    } else {
        const cost = rerollCost(op.paidRerolls);
        if (PlayerResource.GetGold(op.pid) < cost) return "gold";
        PlayerResource.SpendGold(op.pid, cost, ModifyGoldReason.UNSPECIFIED);
        op.paidRerolls++;
    }
    const old = op.offer;
    const o = makeOffer(old.asked, heroNameOf(op.pid), op.stacks, rng, op.mainBranch, old.cards.map(c => c.id), op.disabled, legendSlotsOf(op));
    if (o.kind === "cards") {
        op.seq++;
        op.offer = { seq: op.seq, asked: old.asked, rarity: o.rarity, cards: o.cards, openedAt: old.openedAt };
    }
    pushPlayer(op, true);
    return undefined;
}

// ---------- Очки шкал ----------

export function addBlue(pid: number, pts: number) {
    if (pts <= 0) return;
    const op = orbPlayer(pid);
    op.farmPoints += pts;
    const n = addBarPoints(op.blue, pts, blueNeed);
    if (n > 0) enqueue(pid, "blue", n);
    op.dirty = true;
}

export function addPurpleRage(pid: number) {
    orbPlayer(pid).rage = true;
}

/** Очки боя с учетом «Ярости». */
function addFightPoints(pid: number, pts: number) {
    const op = orbPlayer(pid);
    if (op.rage) {
        op.rage = false;
        pts += 3;
    }
    addPurple(pid, pts);
}

export function addPurple(pid: number, pts: number) {
    if (pts <= 0) return;
    const op = orbPlayer(pid);
    const n = addBarPoints(op.purple, pts, purpleNeed);
    if (n > 0) enqueue(pid, "purple", n);
    op.dirty = true;
}

function onUnitKilled(e: EntityKilledEvent) {
    const camp = campOfUnit.get(e.entindex_killed);
    if (camp === undefined) return;
    const killed = EntIndexToHScript(e.entindex_killed) as CDOTA_BaseNPC | undefined;
    // Запись могла устареть: индекс уже занят иллюзией, призывом или крипом другого лагеря
    if (killed === undefined || camp.units.indexOf(killed) < 0) return;
    campOfUnit.delete(e.entindex_killed);
    if (e.entindex_attacker === undefined) return;
    const attacker = EntIndexToHScript(e.entindex_attacker) as CDOTA_BaseNPC | undefined;
    if (!isValid(attacker)) return;
    const pid = attacker.GetPlayerOwnerID();
    if (pid < 0 || !State.players.has(pid)) return;
    const size = Math.max(1, camp.ids.length);
    addBlue(pid, (ORB.campPoints[camp.type] ?? 0) / size);
    for (const f of Hooks.onCampCreepKilled) safe("лесной крип", () => f(pid, camp.type));
}

// ---------- Появление героя ----------

function onHeroSpawned(p: PlayerState, hero: CDOTA_BaseNPC_Hero) {
    const op = orbPlayer(p.id);
    op.primaryAttr = Number(hero.GetPrimaryAttribute());
    if (!op.randomBonusGiven && PlayerResource.HasRandomed(p.id)) {
        op.randomBonusGiven = true;
        op.freeRerolls++;
    }
    // Проверка данных: способность из синей сферы должна быть у героя (иначе улучшение выключается).
    for (const d of heroUpgrades(hero.GetUnitName())) {
        if (d.code || d.ability === "") continue;
        if (op.disabled[d.id] === undefined) {
            const ab = hero.FindAbilityByName(d.ability);
            op.disabled[d.id] = ab === undefined;
            if (ab === undefined) log("сфера выключена: у героя нет способности", d.ability, d.id);
        }
    }
    pushCatalog(op, hero.GetUnitName());
    setBonuses(op.pid, op.stacks, op.primaryAttr, op.version);
    if (!hero.HasModifier(CONTROLLER)) hero.AddNewModifier(hero, undefined, CONTROLLER, {});
    ensureExtras(op, hero);
    hero.CalculateStatBonus(true);
    openNext(op);
    pushPlayer(op, true);
}

// ---------- Тик ----------

/** Каждые 0.25 с: серая шкала, автовыбор, отправка таблиц. */
export function orbsTick() {
    const now = gameNow();
    const inGame = State.phase === "game" || State.phase === "overtime";
    const dt = lastTick < 0 ? 0 : Math.max(0, Math.min(1, now - lastTick));
    lastTick = now;
    if (inGame && now >= 0) {
        const active = activePlayers();
        const places = placesNow();
        for (const p of active) {
            const op = orbPlayer(p.id);
            const rate = greyRate(places.get(p.id) ?? active.length, active.length);
            const n = addBarPoints(op.grey, rate * dt, () => ORB.greyNeed);
            if (n > 0) enqueue(p.id, "grey", n);
        }
    }
    for (const [, op] of players) {
        const p = State.players.get(op.pid);
        if (inGame) checkLevels(op);
        if (op.offer !== undefined && State.phase !== "ended") {
            const timeout = now - op.offer.openedAt >= ORB.autoPickSeconds;
            // Ушедший игрок и бот выбирают сразу (первая карточка — «рекомендуемая»).
            if (timeout || (p !== undefined && (p.left || p.isBot))) {
                pick(op.pid, op.offer.seq, op.offer.cards[0].id);
                continue;
            }
        }
        if (op.dirty || now - op.lastPush >= 1) pushPlayer(op, false);
    }
}

// ---------- Сетевая таблица ----------

function pushCatalog(op: OrbPlayer, hero: string) {
    const cards: Record<string, OrbCatalogCardNet> = {};
    const rarities: Rarity[] = ["legend", "purple", "blue", "grey"];
    let index = 0;
    for (const rarity of rarities) {
        // Показываем весь пул, в том числе уже взятые и будущие легендарки.
        for (const card of candidates(rarity, hero, {}, op.disabled, Infinity)) {
            const common = card.branch === "G" || upDef(card.id)?.hero === "*";
            cards[tostring(++index)] = {
                id: card.id, br: common ? "G" : card.branch, rr: rarity, ic: orbIcon(card.id),
                m: card.mech === true ? 1 : undefined,
            };
        }
    }
    CustomNetTables.SetTableValue("orb_catalog", tostring(op.pid), { hero, cards });
}

function fmt(x: number): string {
    const r = Math.floor(x * 10 + 0.5) / 10;
    return r === Math.floor(r) ? tostring(Math.floor(r)) : tostring(r);
}

function unitText(unit: string): string {
    if (unit === "%") return "%";
    if (unit === "s") return "s";
    return "";
}

/** «Сейчас → станет» для карточки. */
function cardValues(op: OrbPlayer, id: string): [string, string] {
    const n = op.stacks[id] ?? 0;
    const g = greyDef(id);
    if (g !== undefined) {
        const sign = id === "g_cdr" ? "−" : "+";
        return [sign + fmt(greyValue(id, n)) + unitText(g.unit), sign + fmt(greyValue(id, n + 1)) + unitText(g.unit)];
    }
    const d = blueDef(id);
    if (d === undefined) return ["", ""];
    const h = heroOf(op.pid);
    const ab = h?.FindAbilityByName(d.ability);
    const lvl = ab !== undefined ? Math.max(1, ab.GetLevel()) : 1;
    if (d.cd > 0) {
        const cut = (k: number) => diminishing(k, d.cd, ORB.blueCdCap);
        return ["−" + fmt(cut(n)) + "%", "−" + fmt(cut(n + 1)) + "%"];
    }
    // У сфер-кода (фиолетовые и легендарки) нет чисел способности — только описание.
    if (d.code || d.mods.length !== 1 || d.rarity !== "blue") return ["", ""];
    const m = d.mods[0];
    const base = ab !== undefined ? ab.GetLevelSpecialValueNoOverride(m.key, lvl - 1) : m.base;
    const current = computeBonuses(op.stacks, op.primaryAttr);
    const nextStacks = { ...op.stacks, [id]: n + 1 };
    const next = computeBonuses(nextStacks, op.primaryAttr);
    const value = (bonuses: typeof current) => fmt(overrideValue(bonuses, d.ability, m.key, base) ?? base) + unitText(m.unit);
    return [value(current), value(next)];
}

function pushPlayer(op: OrbPlayer, force: boolean) {
    const now = gameNow();
    if (!force && !op.dirty && now - op.lastPush < 1) return;
    op.dirty = false;
    op.lastPush = now;
    const active = activePlayers();
    const places = placesNow();
    const q: Record<string, number> = { grey: 0, blue: 0, purple: 0, legend: 0 };
    for (const r of op.queue) q[r] = (q[r] ?? 0) + 1;
    let offer: OrbOfferNet | undefined;
    if (op.offer !== undefined) {
        const cards: Record<string, OrbCardNet> = {};
        op.offer.cards.forEach((c, i) => {
            const [nowText, nextText] = cardValues(op, c.id);
            cards[tostring(i + 1)] = { id: c.id, br: c.branch, st: op.stacks[c.id] ?? 0, mx: maxStacks(c.id), now: nowText, nx: nextText, ic: orbIcon(c.id),
                m: c.mech === true ? 1 : 0, rr: c.rarity };
        });
        offer = {
            seq: op.offer.seq,
            r: op.offer.rarity,
            a: op.offer.asked,
            c: cards,
            t: Math.max(0, Math.ceil(ORB.autoPickSeconds - (now - op.offer.openedAt))),
            test: op.offer.test ? 1 : undefined,
        };
    }
    const net: OrbSphereNet = {
        v: op.version,
        pa: op.primaryAttr,
        st: op.stacks,
        g: Math.floor(op.grey.points),
        gn: ORB.greyNeed,
        gr: Math.floor(greyRate(places.get(op.pid) ?? active.length, Math.max(1, active.length)) * 10) / 10,
        b: Math.floor(op.blue.points * 10) / 10,
        bn: blueNeed(op.blue.count),
        p: op.purple.points,
        pn: purpleNeed(op.purple.count),
        q,
        fr: op.freeRerolls,
        cost: rerollCost(op.paidRerolls),
        o: offer,
        fi: inFight(op.pid) ? 1 : 0,
    };
    CustomNetTables.SetTableValue("orb_spheres", tostring(op.pid), net);
}

// ---------- Подключение ----------

export function initOrbs() {
    Hooks.onHeroSpawned.push((p, hero, respawn) => {
        if (!respawn || !hero.HasModifier(CONTROLLER)) onHeroSpawned(p, hero);
    });
    Hooks.onHeroDeath.push(vp => lastSalvo(vp.id));
    Hooks.onHeroKill.push(k => {
        addFightPoints(k.killer.id, killPurplePoints(k.victimKillsBefore, k.killerKillsBefore, k.victimWasHunted));
        for (const a of k.assisters) addFightPoints(a.id, assistPurplePoints(k.victimWasHunted));
        addFerocity(k.killer.id);
        for (const a of k.assisters) addFerocity(a.id);
        bloodFeast(k.killer.id);
        for (const a of k.assisters) bloodFeast(a.id);
    });
    Hooks.onWealthRune.push(p => addBlue(p.id, ORB.runePoints));
    ListenToGameEvent("entity_killed", e => safe("очки лагеря", () => onUnitKilled(e)), undefined);
    CustomGameEventManager.RegisterListener("orb_pick", (_, e) => {
        safe("выбор сферы", () => pick(e.PlayerID, tonumber(e.seq) ?? -1, tostring(e.id)));
    });
    CustomGameEventManager.RegisterListener("orb_reroll", (_, e) => {
        safe("переброс сферы", () => {
            const err = reroll(e.PlayerID, tonumber(e.seq) ?? -1);
            if (err === "gold") {
                const player = PlayerResource.GetPlayer(e.PlayerID);
                if (player !== undefined) CustomGameEventManager.Send_ServerToPlayer(player, "orb_toast", { kind: "info", text: "#orb_reroll_no_gold" });
            }
        });
    });
}

/** Для итогов: взятые улучшения по порядку и легендарка. */
export function orbSummary(pid: number): { order: string[]; legend: string; farm: number } {
    const op = players.get(pid);
    if (op === undefined) return { order: [], legend: "", farm: 0 };
    const legend = op.order.find(id => upDef(id)?.rarity === "legend") ?? "";
    return { order: op.order.slice(), legend, farm: Math.floor(op.farmPoints) };
}

export function orbsDump(pid: number): string {
    const op = players.get(pid);
    if (op === undefined) return "нет данных";
    const parts: string[] = [];
    for (const id of op.order) parts.push(id);
    return "серая " + Math.floor(op.grey.points) + " синяя " + op.blue.points + "/" + blueNeed(op.blue.count) +
        " фиол. " + op.purple.points + "/" + purpleNeed(op.purple.count) + " очередь " + op.queue.join(",") + " взято: " + parts.join(",");
}
