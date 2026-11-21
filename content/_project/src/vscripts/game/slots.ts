// Слоты расходников (просьба автора 31.10, как в 1x6): обсерверы и сентри справа от инвентаря,
// дым и пыль над ним; в начале 2 обсервера, 3 дыма и 3 пыли. Купленные в магазине варды, дым и
// пыль не занимают инвентарь — сразу становятся зарядами слотов. Здесь же — съеденные Boots of Travel.

import { MAP } from "../core/mapinfo";
import { CONFIG } from "../core/config";
import { Hooks } from "./hooks";
import { addItemsNetPart, markItemsDirty, pushItemsNet } from "./itemsnet";
import { State, allPlayers, toast } from "./state";
import { Timers } from "./timers";
import { isValid, log, safe } from "./util";

type Kind = "ob" | "se" | "sm" | "du";
type WardKind = "ob" | "se";
interface Slots { ob: number; se: number; sm: number; du: number; tb: number }

const TRAVEL_MOD = "modifier_orb_travel";
const TRAVEL_ITEMS = ["item_travel_boots", "item_travel_boots_2"];
/** Предмет магазина → слот. */
const SHOP_ITEMS: Record<string, Kind> = {
    item_ward_observer: "ob",
    item_ward_sentry: "se",
    item_smoke_of_deceit: "sm",
    item_dust: "du",
};

const slots = new Map<number, Slots>();

function slotsOf(pid: number): Slots {
    let s = slots.get(pid);
    if (s === undefined) {
        s = { ob: CONFIG.startObservers, se: CONFIG.startSentries, sm: CONFIG.startSmokes, du: CONFIG.startDusts, tb: 0 };
        slots.set(pid, s);
        markItemsDirty(pid);
    }
    return s;
}

function heroHasTravel(h: CDOTA_BaseNPC_Hero): CDOTA_Item | undefined {
    for (let slot = 0; slot <= 8; slot++) {
        const it = h.GetItemInSlot(slot);
        if (it !== undefined && IsValidEntity(it) && TRAVEL_ITEMS.includes(it.GetAbilityName())) return it;
    }
    return undefined;
}

function netPart(pid: number): Record<string, unknown> {
    const s = slotsOf(pid);
    const h = PlayerResource.GetSelectedHeroEntity(pid as PlayerID);
    const canEat = isValid(h) && s.tb < CONFIG.travelEatMax && heroHasTravel(h) !== undefined ? 1 : 0;
    return { ob: s.ob, se: s.se, sm: s.sm, du: s.du, tb: s.tb, te: canEat, tm: CONFIG.travelEatMax };
}

const slotCooldown = new Map<number, Partial<Record<Kind, number>>>();

function slotError(pid: PlayerID, text: string) {
    const player = PlayerResource.GetPlayer(pid);
    if (player !== undefined) CustomGameEventManager.Send_ServerToPlayer(player, "orb_error", { text });
}

export function slotWardError(hero: CDOTA_BaseNPC_Hero, kind: WardKind, point: Vector): string | undefined {
    const pid = hero.GetPlayerOwnerID();
    const player = State.players.get(pid);
    if (player === undefined || player.left || State.phase === "setup" || State.phase === "ended" ||
        PlayerResource.GetSelectedHeroEntity(pid) !== hero || !hero.IsAlive() || hero.IsMuted() || hero.IsOutOfGame()) return "#orb_slot_cannot_cast";
    if (slotsOf(pid)[kind] <= 0) return "#orb_slot_empty";
    if (!(Math.abs(point.x) <= MAP.bounds && Math.abs(point.y) <= MAP.bounds)) return "#orb_slot_bad_point";
    return undefined;
}

/** Вызывается после штатного point-cast. Дальность и подход к точке проверяет движок. */
export function castSlotWard(hero: CDOTA_BaseNPC_Hero, kind: WardKind, point: Vector, ability: CDOTABaseAbility) {
    const pid = hero.GetPlayerOwnerID();
    if (slotWardError(hero, kind, point) !== undefined) return;
    const pos = GetGroundPosition(point, hero);
    const sentry = kind === "se";
    const unit = sentry ? "npc_dota_sentry_wards" : "npc_dota_observer_wards";
    const ward = CreateUnitByName(unit, pos, true, hero, hero, hero.GetTeamNumber());
    if (!isValid(ward)) { slotError(pid, "#orb_slot_bad_point"); return; }
    const range = ability.GetSpecialValueFor("ward_radius");
    ward.AddNewModifier(hero, ability, "modifier_orb_ward", { sentry: sentry ? 1 : 0, radius: range });
    ward.AddNewModifier(hero, ability, "modifier_kill", { duration: sentry ? 420 : 360 });
    if (sentry) AddFOWViewer(hero.GetTeamNumber(), pos, 150, 12, false);
    EmitSoundOnLocationWithCaster(pos, sentry ? "DOTA_Item.SentryWard.Activate" : "DOTA_Item.ObserverWard.Activate", hero);
    slotsOf(pid)[kind]--;
    markItemsDirty(pid);
    pushItemsNet(pid);
}

function applyConsumable(hero: CDOTA_BaseNPC_Hero, kind: "sm" | "du") {
    if (kind === "sm") {
        const fx = ParticleManager.CreateParticle("particles/items2_fx/smoke_of_deceit.vpcf", ParticleAttachment.WORLDORIGIN, undefined);
        ParticleManager.SetParticleControl(fx, 0, hero.GetAbsOrigin());
        ParticleManager.SetParticleControl(fx, 1, Vector(1200, 1, 1200));
        ParticleManager.ReleaseParticleIndex(fx);
        EmitSoundOn("DOTA_Item.SmokeOfDeceit.Activate", hero);
        hero.AddNewModifier(hero, undefined, "modifier_orb_smoke", { duration: 35 });
        return;
    }
    const radius = 1050;
    const fx = ParticleManager.CreateParticle("particles/items_fx/dust_of_appearance.vpcf", ParticleAttachment.ABSORIGIN_FOLLOW, hero);
    ParticleManager.SetParticleControl(fx, 1, Vector(radius, radius, radius));
    ParticleManager.ReleaseParticleIndex(fx);
    EmitSoundOn("DOTA_Item.DustOfAppearance.Activate", hero);
    const enemies = FindUnitsInRadius(hero.GetTeamNumber(), hero.GetAbsOrigin(), undefined, radius, UnitTargetTeam.ENEMY,
        UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.INVULNERABLE + UnitTargetFlags.MAGIC_IMMUNE_ENEMIES, FindOrder.ANY, false);
    for (const u of enemies) u.AddNewModifier(hero, undefined, "modifier_orb_dust", { duration: 12 });
}

function useSlot(pid: PlayerID, kind: string) {
    if (kind !== "sm" && kind !== "du") return;
    const player = State.players.get(pid);
    if (player === undefined || player.left || State.phase === "setup" || State.phase === "ended") return;
    const hero = PlayerResource.GetSelectedHeroEntity(pid);
    if (!isValid(hero) || !hero.IsAlive() || hero.GetPlayerOwnerID() !== pid || hero.IsStunned() || hero.IsMuted() || hero.IsHexed() || hero.IsOutOfGame()) return;
    const stock = slotsOf(pid);
    if (stock[kind] <= 0) { slotError(pid, "#orb_slot_empty"); return; }
    const now = GameRules.GetGameTime();
    const ready = slotCooldown.get(pid) ?? {};
    if ((ready[kind] ?? 0) > now) return;
    applyConsumable(hero, kind);
    ready[kind] = now + 2;
    slotCooldown.set(pid, ready);
    stock[kind] -= 1;
    markItemsDirty(pid);
    pushItemsNet(pid);
}

/** Купленный расходник → заряды слота (на следующем кадре: внутри фильтра предмет еще не в инвентаре). */
function convertLater(item: CDOTA_Item, hero: CDOTA_BaseNPC_Hero, kind: Kind | "pair") {
    Timers.after(0.03, "расходник в слот", () => {
        if (!isValid(item) || !isValid(hero)) return;
        const pid = hero.GetPlayerOwnerID();
        const s = slotsOf(pid);
        const n = Math.max(1, item.GetCurrentCharges());
        if (kind === "pair") {
            s.ob += Math.max(0, item.GetCurrentCharges());
            s.se += Math.max(0, item.GetSecondaryCharges());
        } else {
            s[kind] += n;
        }
        hero.RemoveItem(item);
        if (isValid(item)) UTIL_Remove(item);
        markItemsDirty(pid);
        pushItemsNet(pid);
    });
}

/** Фильтр предметов: варды, дым и пыль у героев игроков уходят в слоты. */
export function slotsItemFilter(e: ItemAddedToInventoryFilterEvent): boolean {
    const item = EntIndexToHScript(e.item_entindex_const) as CDOTA_Item | undefined;
    const parent = EntIndexToHScript(e.inventory_parent_entindex_const) as CDOTA_BaseNPC | undefined;
    if (!isValid(item) || !isValid(parent) || !parent.IsRealHero()) return true;
    const pid = parent.GetPlayerOwnerID();
    if (!State.players.has(pid)) return true;
    const name = item.GetAbilityName();
    if (name === "item_ward_dispenser") convertLater(item, parent as CDOTA_BaseNPC_Hero, "pair");
    else if (SHOP_ITEMS[name] !== undefined) convertLater(item, parent as CDOTA_BaseNPC_Hero, SHOP_ITEMS[name]);
    else if (TRAVEL_ITEMS.includes(name)) Timers.after(0.05, "тревела", () => { markItemsDirty(pid); pushItemsNet(pid); });
    return true;
}

/** Съесть Boots of Travel: предмет исчезает, герой навсегда получает скорость. */
function eatTravel(pid: number) {
    const h = PlayerResource.GetSelectedHeroEntity(pid as PlayerID);
    if (!isValid(h) || !h.IsAlive()) return;
    const s = slotsOf(pid);
    if (s.tb >= CONFIG.travelEatMax) return;
    const it = heroHasTravel(h);
    if (it === undefined) return;
    h.RemoveItem(it);
    if (isValid(it)) UTIL_Remove(it);
    s.tb++;
    let mod = h.FindModifierByName(TRAVEL_MOD);
    if (mod === undefined) mod = h.AddNewModifier(h, undefined, TRAVEL_MOD, {});
    if (mod !== undefined) mod.SetStackCount(s.tb);
    EmitSoundOn("Item.MoonShard.Consume", h);
    toast("event", "#orb_toast_travel_eaten", h.GetUnitName(), tostring(s.tb * CONFIG.travelEatSpeed), undefined, pid as PlayerID);
    markItemsDirty(pid);
    pushItemsNet(pid);
    log("игрок", pid, "съел Boots of Travel:", s.tb);
}

/** Каждые 0.5 с: способности на героях, бафф съеденных тревел, таблица. */
export function slotsTick() {
    for (const p of allPlayers()) {
        const h = PlayerResource.GetSelectedHeroEntity(p.id);
        if (isValid(h)) {
            const s = slotsOf(p.id);
            if (s.tb > 0 && !h.HasModifier(TRAVEL_MOD)) {
                const mod = h.AddNewModifier(h, undefined, TRAVEL_MOD, {});
                if (mod !== undefined) mod.SetStackCount(s.tb);
            }
        }
        // «Можно съесть» зависит от инвентаря — пересчитываем раз в полсекунды
        markItemsDirty(p.id);
        pushItemsNet(p.id);
    }
}

export function initSlots() {
    addItemsNetPart(netPart);
    slots.clear();
    slotCooldown.clear();
    Hooks.onHeroSpawned.push((p, hero) => {
        if (p.isBot) return;
        for (const name of ["orb_slot_observer", "orb_slot_sentry"]) {
            const ability = hero.FindAbilityByName(name) ?? hero.AddAbility(name);
            if (isValid(ability) && ability.GetLevel() === 0) ability.SetLevel(1);
        }
    });
    CustomGameEventManager.RegisterListener("orb_slot_use", (_, e) =>
        safe("расходник", () => useSlot(e.PlayerID, e.kind)));
    CustomGameEventManager.RegisterListener("orb_eat_travel", (_, e) => safe("съесть тревела", () => eatTravel(e.PlayerID)));
}

/** Чит: по n зарядов каждого расходника. */
export function slotsCheat(pid: number, n: number) {
    const s = slotsOf(pid);
    s.ob += n;
    s.se += n;
    s.sm += n;
    s.du += n;
    markItemsDirty(pid);
    pushItemsNet(pid);
}

export function resetConsumables(pid: number) {
    slots.delete(pid);
    slotCooldown.delete(pid);
}
