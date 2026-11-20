// События арены (12.11): Кровавая луна, Золотой дождь, Гроза, Ускорение. Первое на 7:00, дальше
// раз в 5 минут. За 10 секунд — предупреждение; интерфейс показывает плашку под таймером
// (сетевая таблица orb_game.event).

import { ARENA, ArenaEventId, eventAllowed, eventStart, pickEvent } from "../core/arenaevents";
import { addPurple } from "./orbs";
import { throwCoin } from "./coins";
import { Hooks } from "./hooks";
import { State, gameNow, toast } from "./state";
import { isValid, log } from "./util";

const MOD: Partial<Record<ArenaEventId, string>> = {
    haste: "modifier_orb_event_haste",
    bloodmoon: "modifier_orb_event_bloodmoon",
};
const STRIKE_PFX = "particles/units/heroes/hero_zuus/zuus_lightning_bolt.vpcf";
const MARK_PFX = "particles/ui_mouseactions/range_display.vpcf";

let index = 0;
let warned = -1;
let current: { id: ArenaEventId; start: number; end: number; cheat: boolean } | undefined;
let nextId: ArenaEventId | undefined;
let prevId: ArenaEventId | undefined;
let nextStrike = 0;
let pushedKey = "";

function heroes(): CDOTA_BaseNPC_Hero[] {
    const out: CDOTA_BaseNPC_Hero[] = [];
    for (const [id] of State.players) {
        const h = PlayerResource.GetSelectedHeroEntity(id as PlayerID);
        if (isValid(h)) out.push(h);
    }
    return out;
}

function pushEvent(now: number) {
    const start = eventStart(index);
    const soon = current === undefined && nextId !== undefined && now >= start - ARENA.warn;
    const net = current !== undefined
        ? { id: current.id, on: 1, left: Math.max(0, Math.ceil(current.end - now)), next: 0 }
        : { id: soon ? nextId! : "", on: 0, left: soon ? Math.max(0, Math.ceil(start - now)) : 0, next: Math.max(0, Math.floor(start - now)) };
    const key = `${net.id}:${net.on}:${net.left}:${net.next}`;
    if (key === pushedKey) return;
    pushedKey = key;
    CustomNetTables.SetTableValue("orb_game", "event", net);
}

function applyModifier(h: CDOTA_BaseNPC_Hero) {
    if (current === undefined) return;
    const name = MOD[current.id];
    if (name === undefined || h.HasModifier(name)) return;
    h.AddNewModifier(h, undefined, name, { duration: Math.max(0.1, current.end - gameNow()) });
}

function begin(id: ArenaEventId, now: number, cheat = false) {
    current = { id, start: now, end: now + ARENA.duration[id], cheat };
    prevId = id;
    nextStrike = now + 1;
    for (const h of heroes()) applyModifier(h);
    if (id === "bloodmoon") GameRules.SetTimeOfDay(0.0);
    toast("event", "#orb_event_start_" + id);
    EmitGlobalSound(id === "storm" ? "Hero_Zuus.GodsWrath" : "General.Combine");
    log("событие арены:", id);
}

function finish() {
    if (current === undefined) return;
    const name = MOD[current.id];
    if (name !== undefined) for (const h of heroes()) h.RemoveModifierByName(name);
    if (current.id === "bloodmoon") GameRules.SetTimeOfDay(0.3);
    toast("event", "#orb_event_end_" + current.id);
    const wasCheat = current.cheat;
    current = undefined;
    if (!wasCheat) {
        index++;
        nextId = undefined;
    }
}

/** Гроза: метка под случайным героем, через 1.2 с — молния (урон и мини-оглушение всем героям рядом). */
function stormStrike() {
    const list = heroes().filter(h => h.IsAlive());
    if (list.length === 0) return;
    const target = list[RandomInt(0, list.length - 1)];
    const off = RandomVector(RandomFloat(0, 150));
    const pos = (target.GetAbsOrigin() + off) as Vector;
    const mark = ParticleManager.CreateParticle(MARK_PFX, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(mark, 0, pos);
    ParticleManager.SetParticleControl(mark, 1, Vector(ARENA.stormRadius, 0, 0));
    const boss = Entities.FindByName(undefined, "@overboss") as CDOTA_BaseNPC | undefined;
    target.SetContextThink("orb_event_storm_" + DoUniqueString("s"), () => {
        ParticleManager.DestroyParticle(mark, false);
        ParticleManager.ReleaseParticleIndex(mark);
        if (current === undefined || current.id !== "storm") return undefined;
        const fx = ParticleManager.CreateParticle(STRIKE_PFX, ParticleAttachment.WORLDORIGIN, undefined);
        ParticleManager.SetParticleControl(fx, 0, (pos + Vector(0, 0, 1200)) as Vector);
        ParticleManager.SetParticleControl(fx, 1, pos);
        ParticleManager.ReleaseParticleIndex(fx);
        StartSoundEventFromPosition("Hero_Zuus.LightningBolt", pos);
        for (const h of heroes()) {
            if (!h.IsAlive() || ((h.GetAbsOrigin() - pos) as Vector).Length2D() > ARENA.stormRadius) continue;
            const attacker = isValid(boss) ? boss : h;
            ApplyDamage({ victim: h, attacker, damage: ARENA.stormDmgBase + h.GetMaxHealth() * ARENA.stormDmgMaxHpPct / 100, damage_type: DamageTypes.MAGICAL });
            h.AddNewModifier(attacker, undefined, "modifier_stunned", { duration: ARENA.stormStun });
        }
        return undefined;
    }, ARENA.stormDelay);
}

export function arenaEventsTick() {
    if (State.phase !== "game" && State.phase !== "overtime") {
        if (current !== undefined) finish();
        return;
    }
    const now = gameNow();
    if (current !== undefined) {
        if (now >= current.end) finish();
        else if (current.id === "goldrain") { if (RandomFloat(0, 1) < ARENA.rainCoinChance) throwCoin(); }
        else if (current.id === "storm" && now >= nextStrike) { nextStrike = now + ARENA.stormEvery; stormStrike(); }
    } else {
        const start = eventStart(index);
        if (!eventAllowed(start, State.timeLimit, State.phase === "overtime")) { pushEvent(now); return; }
        if (nextId === undefined) nextId = pickEvent(prevId, n => RandomInt(0, n - 1));
        if (now >= start - ARENA.warn && warned !== index) {
            warned = index;
            toast("event", "#orb_event_soon_" + nextId, tostring(ARENA.warn));
        }
        if (now >= start) begin(nextId, now);
    }
    pushEvent(now);
}

/** Чит -event <имя>: начать событие сейчас. */
export function arenaEventCheat(id: string) {
    const all: ArenaEventId[] = ["bloodmoon", "goldrain", "storm", "haste"];
    const ev = all.find(e => e === id) ?? pickEvent(prevId, n => RandomInt(0, n - 1));
    if (current !== undefined) finish();
    begin(ev, gameNow(), true);
}

export function initArenaEvents() {
    Hooks.onHeroSpawned.push((_p, hero) => applyModifier(hero));
    Hooks.onHeroKill.push(k => {
        if (current === undefined || current.id !== "bloodmoon") return;
        // Сбить лидера под луной — вдвое больше очков
        addPurple(k.killer.id, ARENA.moonKillPurple * (k.victimWasLeader ? 2 : 1));
        const minute = Math.max(0, gameNow() / 60);
        const gold = Math.floor(ARENA.moonKillGoldBase + ARENA.moonKillGoldPerMin * minute);
        PlayerResource.ModifyGold(k.killer.id as PlayerID, gold, true, ModifyGoldReason.UNSPECIFIED);
    });
}
