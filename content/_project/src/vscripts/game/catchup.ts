// Против отрыва лидера (DESIGN 9): месть, охота на лидера, подмога отстающим.

import { TIMINGS } from "../core/config";
import { helpGold, huntStep, lastTwo, revengeMultiplier, revengeOnKill } from "../core/catchup";
import { leaderGap } from "../core/rules";
import { Hooks } from "./hooks";
import { addPurpleRage, enqueue } from "./orbs";
import { State, activePlayers, currentLeaderId, gameNow, scoreRows, toast } from "./state";
import { isValid, safe } from "./util";

// ---------- Месть ----------

/** rev[a][b] — сколько раз b убил a (месть a против b), до 3. */
const rev = new Map<number, Map<number, number>>();

/** Из фильтра урона: множитель мести между игроками. */
export function revengeDamage(e: DamageFilterEvent) {
    if (e.entindex_attacker_const === undefined || e.entindex_victim_const === undefined) return;
    const victim = EntIndexToHScript(e.entindex_victim_const) as CDOTA_BaseNPC | undefined;
    const attacker = EntIndexToHScript(e.entindex_attacker_const) as CDOTA_BaseNPC | undefined;
    if (!isValid(victim) || !isValid(attacker) || !victim.IsHero()) return;
    const a = attacker.GetPlayerOwnerID();
    const v = victim.GetPlayerOwnerID();
    if (a < 0 || v < 0 || a === v) return;
    const m = revengeMultiplier(rev, a, v);
    if (m !== 1) e.damage = e.damage * m;
}

function pushRevenge() {
    const t: Record<string, Record<string, number>> = {};
    for (const [a, m] of rev) {
        const row: Record<string, number> = {};
        for (const [b, n] of m) if (n > 0) row[tostring(b)] = n;
        t[tostring(a)] = row;
    }
    CustomNetTables.SetTableValue("orb_game", "revenge", t);
}

// ---------- Охота ----------

let hunted = -1;
let huntForced = false; // чит -hunt: охота не снимается сама
let lastReveal = 0;

export function huntedId(): number {
    return hunted;
}

function huntTick() {
    const rows = scoreRows().filter(r => !r.left);
    let leader = currentLeaderId();
    // Отключившегося лидера не преследуем (иначе охота включалась бы и снималась каждые полсекунды)
    const lp = State.players.get(leader);
    if (lp !== undefined && !lp.isBot && PlayerResource.GetConnectionState(lp.id) !== ConnectionState.CONNECTED) leader = -1;
    const gap = leaderGap(rows);
    const next = huntForced ? hunted : huntStep(hunted, leader, gap);
    if (next !== hunted) {
        if (next >= 0) toast("event", "#orb_toast_hunt_start", PlayerResource.GetSelectedHeroName(next as PlayerID), undefined, undefined, next as PlayerID);
        else if (hunted >= 0) toast("info", "#orb_toast_hunt_end", PlayerResource.GetSelectedHeroName(hunted as PlayerID));
        hunted = next;
        lastReveal = 0;
    }
    if (hunted < 0) return;
    const p = State.players.get(hunted);
    // Охота заканчивается сразу, как лидер отключился (не ждем 3 минуты до статуса «ушел»)
    const offline = p !== undefined && !p.isBot && PlayerResource.GetConnectionState(p.id) !== ConnectionState.CONNECTED;
    if (p === undefined || p.left || offline) {
        if (p !== undefined) toast("info", "#orb_toast_hunt_end", PlayerResource.GetSelectedHeroName(p.id));
        hunted = -1;
        huntForced = false;
        return;
    }
    // Раз в 10 с лидер виден всем на 3 с
    const now = gameNow();
    if (now - lastReveal >= 10) {
        lastReveal = now;
        const h = PlayerResource.GetSelectedHeroEntity(p.id);
        if (isValid(h) && h.IsAlive()) {
            const o = h.GetAbsOrigin();
            for (const other of activePlayers()) {
                if (other.id === p.id) continue;
                AddFOWViewer(other.team, o, 400, 3, false);
                MinimapEvent(other.team, h, o.x, o.y, MinimapEventType.ENEMY_TELEPORTING, 3);
            }
        }
    }
}

// ---------- Подмога ----------

interface HelpOffer { deadline: number; minute: number }
const help = new Map<number, HelpOffer>();
let helpIndex = 0;
const HELP_TIMEOUT = 30;

function pushHelp() {
    const t: Record<string, { d: number; g: number }> = {};
    for (const [pid, o] of help) t[tostring(pid)] = { d: Math.floor(o.deadline), g: helpGold(o.minute) };
    CustomNetTables.SetTableValue("orb_game", "help", t);
}

function openHelp() {
    const rows = scoreRows().filter(r => !r.left);
    const minute = Math.floor(gameNow() / 60);
    for (const pid of lastTwo(rows)) {
        help.set(pid, { deadline: gameNow() + HELP_TIMEOUT, minute });
        const player = PlayerResource.GetPlayer(pid as PlayerID);
        if (player !== undefined) CustomGameEventManager.Send_ServerToPlayer(player, "orb_toast", { kind: "event", text: "#orb_toast_help_you" });
    }
    pushHelp();
}

export function chooseHelp(pid: number, choice: string) {
    const o = help.get(pid);
    if (o === undefined) return;
    help.delete(pid);
    const hero = PlayerResource.GetSelectedHeroEntity(pid as PlayerID);
    if (choice === "orb") {
        enqueue(pid, "blue", 1);
    } else if (choice === "rage") {
        addPurpleRage(pid);
    } else {
        const gold = helpGold(o.minute);
        PlayerResource.ModifyGold(pid as PlayerID, gold, true, ModifyGoldReason.UNSPECIFIED);
        if (isValid(hero)) SendOverheadEventMessage(undefined, OverheadAlert.GOLD, hero, gold, undefined);
    }
    pushHelp();
}

function helpTick() {
    const times = TIMINGS.lagBonusTimes;
    if (helpIndex < times.length && gameNow() >= times[helpIndex]) {
        helpIndex++;
        openHelp();
    }
    for (const [pid, o] of help) {
        const p = State.players.get(pid);
        if (gameNow() >= o.deadline || (p !== undefined && (p.left || p.isBot))) chooseHelp(pid, "gold");
    }
}

// ---------- Подключение ----------

/** Каждые 0.5 с. */
export function catchupTick() {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    safe("охота", huntTick);
    safe("подмога", helpTick);
}

export function initCatchup() {
    Hooks.isHunted = id => id === hunted;
    Hooks.onHeroKill.push(k => {
        revengeOnKill(rev, k.killer.id, k.victim.id);
        pushRevenge();
    });
    CustomGameEventManager.RegisterListener("orb_help", (_, e) => {
        safe("подмога", () => chooseHelp(e.PlayerID, tostring(e.choice)));
    });
    pushRevenge();
    pushHelp();
}

export function helpCheat(pid: number) {
    help.set(pid, { deadline: gameNow() + HELP_TIMEOUT, minute: Math.floor(gameNow() / 60) });
    pushHelp();
}

export function huntCheat(pid: number) {
    huntForced = hunted !== pid;
    hunted = huntForced ? pid : -1;
    lastReveal = 0;
}
