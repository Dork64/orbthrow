// Нейтральные предметы (просьба автора 31.10, как в обычной Доте): за лесных крипов — жетоны,
// новый тир открывается раз в 4 минуты. Когда жетонов хватает и тир открыт, игрок выбирает
// артефакт и улучшение тира (они встают в нейтральные ячейки, старые пропадают).
// Пятый тир — последний, один раз за партию. Жетоны стоят дороже, чем в Доте.

import { makeNeutralOffer, nextCraft, NeutralOffer } from "../core/neutrals";
import { Hooks } from "./hooks";
import { addItemsNetPart, markItemsDirty, pushItemsNet } from "./itemsnet";
import { State, allPlayers, gameNow, toast } from "./state";
import { isValid, log, safe } from "./util";

const AUTO_PICK = 60;
const ACTIVE_SLOT = 16;
const PASSIVE_SLOT = 17;
/** Жетонов за лесного крипа; у древних — больше. */
const TOKENS: Record<string, number> = { small: 1, medium: 1, large: 1, ancient: 2 };

interface Open {
    seq: number;
    offer: NeutralOffer;
    openedAt: number;
    trinket: string;
    enh: string;
    lv: number;
}

interface NeutralPlayer {
    tokens: number;
    owned: number;
    open?: Open;
    lastTrinket: string;
}

const players = new Map<number, NeutralPlayer>();
let seqCounter = 0;

function np(pid: number): NeutralPlayer {
    let p = players.get(pid);
    if (p === undefined) {
        p = { tokens: 0, owned: 0, lastTrinket: "" };
        players.set(pid, p);
    }
    return p;
}

function netPart(pid: number): Record<string, unknown> {
    const p = np(pid);
    const now = Math.max(0, gameNow());
    const next = nextCraft(p.owned, now);
    const out: Record<string, unknown> = { nk: p.tokens, nn: next.cost, nx: next.tier, na: next.at };
    if (p.open !== undefined) {
        const o = p.open;
        const tr: Record<string, string> = {};
        o.offer.trinkets.forEach((t, i) => { tr[tostring(i + 1)] = t; });
        const en: Record<string, string> = {};
        const levels: Record<string, number> = {};
        o.offer.enhancements.forEach(([name, level], i) => {
            en[tostring(i + 1)] = name;
            levels[name] = level;
        });
        out.no = {
            seq: o.seq, tier: o.offer.tier, tr, en,
            levels,
            pt: o.trinket, pe: o.enh,
            t: Math.max(0, Math.ceil(AUTO_PICK - (now - o.openedAt))),
        };
    }
    return out;
}

/** Поставить предмет в нужную нейтральную ячейку. */
function placeIn(h: CDOTA_BaseNPC_Hero, item: CDOTA_Item | undefined, slot: number) {
    if (item === undefined || !isValid(item)) return;
    const cur = item.GetItemSlot();
    if (cur >= 0 && cur !== slot) h.SwapItems(cur, slot);
}

function clearSlot(h: CDOTA_BaseNPC_Hero, slot: number) {
    const it = h.GetItemInSlot(slot);
    if (it !== undefined && isValid(it)) {
        h.RemoveItem(it);
        if (isValid(it)) UTIL_Remove(it);
    }
}

function grant(pid: number) {
    const p = np(pid);
    const o = p.open;
    if (o === undefined || o.trinket === "" || o.enh === "") return;
    p.open = undefined;
    p.owned = Math.max(p.owned, o.offer.tier);
    p.lastTrinket = o.trinket;
    const h = PlayerResource.GetSelectedHeroEntity(pid as PlayerID);
    if (isValid(h)) {
        clearSlot(h, ACTIVE_SLOT);
        clearSlot(h, PASSIVE_SLOT);
        const t = h.AddItemByName(o.trinket);
        placeIn(h, t, ACTIVE_SLOT);
        const e = h.AddItemByName(o.enh);
        if (e !== undefined && isValid(e) && o.lv > 1) e.SetLevel(o.lv);
        placeIn(h, e, PASSIVE_SLOT);
        EmitSoundOn("Item.PickUpGemShop", h);
        toast("event", "#orb_toast_neutral", h.GetUnitName(), o.trinket, tostring(o.offer.tier), pid as PlayerID);
    }
    log("нейтральный предмет:", pid, o.trinket, o.enh, "тир", o.offer.tier);
    markItemsDirty(pid);
    pushItemsNet(pid);
}

/** Открыть выбор, если жетонов хватает и тир открыт. */
function tryOpen(pid: number) {
    const p = np(pid);
    if (p.open !== undefined) return;
    const now = Math.max(0, gameNow());
    const next = nextCraft(p.owned, now);
    if (next.tier === 0 || next.at > now || p.tokens < next.cost) return;
    const h = PlayerResource.GetSelectedHeroEntity(pid as PlayerID);
    if (!isValid(h)) return;
    p.tokens -= next.cost;
    const tier = next.tier;
    const offer = makeNeutralOffer(tier, Number(h.GetPrimaryAttribute()), n => RandomInt(0, n - 1));
    p.open = { seq: ++seqCounter, offer, openedAt: now, trinket: "", enh: "", lv: 1 };
    const ps = State.players.get(pid);
    if (ps !== undefined && ps.isBot) {
        // Бот выбирает сразу
        p.open.trinket = offer.trinkets[0];
        p.open.enh = offer.enhancements[0][0];
        p.open.lv = offer.enhancements[0][1];
        grant(pid);
        return;
    }
    emitToPlayer(pid);
    markItemsDirty(pid);
    pushItemsNet(pid);
}

function emitToPlayer(pid: number) {
    const player = PlayerResource.GetPlayer(pid as PlayerID);
    if (player !== undefined) EmitSoundOnClient("Item.PickUpRingShop", player);
}

function onPick(pid: number, seq: number, kind: string, name: string) {
    const p = np(pid);
    const o = p.open;
    if (o === undefined || o.seq !== seq) return;
    if (kind === "trinket" && o.offer.trinkets.includes(name)) o.trinket = name;
    if (kind === "enh") {
        for (const e of o.offer.enhancements) if (e[0] === name) { o.enh = e[0]; o.lv = e[1]; }
    }
    markItemsDirty(pid);
    if (o.trinket !== "" && o.enh !== "") grant(pid);
    else pushItemsNet(pid);
}

/** Каждые 0.5 с: открыть выбор, автовыбор по таймеру, таблица. */
export function neutralsTick() {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    const now = gameNow();
    for (const ps of allPlayers()) {
        const p = np(ps.id);
        if (p.open !== undefined && (now - p.open.openedAt >= AUTO_PICK || ps.left)) {
            const o = p.open;
            if (o.trinket === "") o.trinket = o.offer.trinkets[0];
            if (o.enh === "") { o.enh = o.offer.enhancements[0][0]; o.lv = o.offer.enhancements[0][1]; }
            grant(ps.id);
        }
        tryOpen(ps.id);
        markItemsDirty(ps.id);
    }
}

export function initNeutrals() {
    addItemsNetPart(netPart);
    Hooks.onCampCreepKilled.push((pid, campType) => {
        const p = np(pid);
        p.tokens += TOKENS[campType] ?? 1;
        markItemsDirty(pid);
        tryOpen(pid);
    });
    CustomGameEventManager.RegisterListener("orb_neutral_pick", (_, e) => safe("выбор нейтралки", () =>
        onPick(e.PlayerID, tonumber(e.seq) ?? -1, tostring(e.kind), tostring(e.name))));
}

/** Чит: жетоны. */
export function neutralTokensCheat(pid: number, n: number) {
    np(pid).tokens += n;
    markItemsDirty(pid);
    tryOpen(pid);
}

export function resetNeutralProgress(pid: number) {
    players.delete(pid);
}
