// Доход: пассивный, кольцо Повелителя, рост наград за нейтралов. Фильтры золота и опыта.

import { CONFIG } from "../core/config";
import { State, allPlayers, gameNow } from "./state";
import { isValid } from "./util";

const RING_MOD = "modifier_orb_ring";
let grantingXp = false;
const actionRemainder = new Map<PlayerID, number>();

export function resetExperience() { actionRemainder.clear(); }

function scaleActionXp(pid: PlayerID, amount: number) {
    const total = amount * CONFIG.actionXpMultiplier + (actionRemainder.get(pid) ?? 0);
    const whole = Math.floor(total);
    actionRemainder.set(pid, total - whole);
    return whole;
}

/** AddExperience бывает источником фильтра. Наши выдачи уже содержат нужный множитель. */
export function grantArenaExperience(hero: CDOTA_BaseNPC_Hero, xp: number, rateAlreadyApplied = false) {
    const amount = rateAlreadyApplied ? xp : scaleActionXp(hero.GetPlayerOwnerID(), xp);
    const previous = grantingXp;
    grantingXp = true;
    try { hero.AddExperience(amount, ModifyXpReason.UNSPECIFIED, false, true, 0); }
    finally { grantingXp = previous; }
}

function growth(): number {
    const m = Math.max(0, Math.min(CONFIG.neutralGrowthCapMin, gameNow() / 60));
    return 1 + CONFIG.neutralBountyGrowthPerMin * m;
}

/** Каждую секунду: пассивный доход, кольцо и метка истинного зрения. */
export function economyTick() {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    if (gameNow() < 0) return;
    const center = Vector(0, 0, 0);
    for (const p of allPlayers()) {
        if (p.left) continue;
        const h = PlayerResource.GetSelectedHeroEntity(p.id);
        if (!isValid(h)) continue;
        let gold = CONFIG.passiveGpm / 60;
        let xp = CONFIG.passiveXpm / 60;
        const o = h.GetAbsOrigin();
        p.inRing = h.IsAlive() && (o.x - center.x) ** 2 + (o.y - center.y) ** 2 <= CONFIG.ringRadius ** 2;
        if (p.inRing) {
            gold += CONFIG.ringGpm / 60;
            xp += CONFIG.ringXpm / 60;
            // Вешаем один раз: модификатор сам снимется при выходе из кольца (без мигания)
            if (!h.HasModifier(RING_MOD)) h.AddNewModifier(h, undefined, RING_MOD, { r: CONFIG.ringRadius });
        }
        p.goldFrac += gold;
        p.xpFrac += xp;
        const g = Math.floor(p.goldFrac);
        const x = Math.floor(p.xpFrac);
        if (g > 0) {
            PlayerResource.ModifyGold(p.id, g, true, ModifyGoldReason.UNSPECIFIED);
            p.goldFrac -= g;
        }
        if (x > 0) {
            grantArenaExperience(h, x, true);
            p.xpFrac -= x;
        }
    }
}

/** Фильтр золота: стандартную награду за героя заменяем своей, нейтралы растут со временем. */
export function goldFilter(e: ModifyGoldFilterEvent): boolean {
    const r = e.reason_const;
    if (r === ModifyGoldReason.HERO_KILL || r === ModifyGoldReason.DEATH || r === ModifyGoldReason.BUILDING) return false;
    if (r === ModifyGoldReason.CREEP_KILL || r === ModifyGoldReason.NEUTRAL_KILL) {
        e.gold = Math.floor(e.gold * growth());
    }
    return true;
}

export function xpFilter(e: ModifyExperienceFilterEvent): boolean {
    const r = e.reason_const;
    if (r === ModifyXpReason.HERO_KILL || r === ModifyXpReason.CATCH_UP) return false;
    if (!grantingXp && e.experience > 0) {
        const amount = r === ModifyXpReason.CREEP_KILL ? Math.floor(e.experience * growth()) : e.experience;
        e.experience = scaleActionXp(e.player_id_const, amount);
    }
    return true;
}
