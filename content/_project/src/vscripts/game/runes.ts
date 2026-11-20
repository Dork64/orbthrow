import { grantArenaExperience } from "./economy";
// Руны. Свои руны богатства (бонусные) убраны по просьбе автора 04.11: они появлялись на месте
// обычных рун. Остаются руны Доты на своих местах; за любую подобранную руну — очки синей шкалы.
// Фильтр бонусной руны оставлен на случай, если Дота сама положит бонусную.

import { TIMINGS } from "../core/config";
import { MAP } from "../core/mapinfo";
import { Hooks } from "./hooks";
import { State, gameNow } from "./state";
import { isValid, log } from "./util";

let nextAt: number = TIMINGS.runesFirst;
let current: CBaseEntity[] = [];

export function wealthGold(minute: number): number {
    return 40 + 3 * minute;
}
export function wealthXp(minute: number): number {
    return 50 + 5 * minute;
}

function spawnRunes() {
    for (const r of current) if (isValid(r)) UTIL_Remove(r);
    current = [];
    for (const s of MAP.runeSpots) {
        const pos = Vector(s.x, s.y, GetGroundHeight(Vector(s.x, s.y, 0), undefined));
        const rune = CreateRune(pos, RuneType.BOUNTY);
        if (rune !== undefined) current.push(rune);
    }
    log("руны богатства:", current.length);
}

/** Свои руны богатства выключены (просьба автора 04.11). */
const WEALTH_RUNES_ENABLED = false;

export function runesTick() {
    if (!WEALTH_RUNES_ENABLED) return;
    if (State.phase !== "game" && State.phase !== "overtime") return;
    if (gameNow() < nextAt) return;
    nextAt += TIMINGS.runesEvery;
    // Если время перемотали читом — догоняем без пачки рун.
    while (nextAt <= gameNow()) nextAt += TIMINGS.runesEvery;
    spawnRunes();
}

/** Фильтр бонусной руны: своя награда вместо стандартной. */
export function bountyRuneFilter(e: BountyRunePickupFilterEvent): boolean {
    const minute = Math.max(0, Math.floor(gameNow() / 60));
    e.gold_bounty = wealthGold(minute);
    // Нынешние бонусные руны Доты дают только золото: опыт начисляем сами
    e.xp_bounty = 0;
    const hero = PlayerResource.GetSelectedHeroEntity(e.player_id_const);
    if (hero !== undefined && IsValidEntity(hero)) grantArenaExperience(hero, wealthXp(minute));
    const p = State.players.get(e.player_id_const);
    if (p !== undefined) for (const f of Hooks.onWealthRune) f(p);
    return true;
}

export function logRuneSpawners() {
    const a = Entities.FindAllByClassname("dota_item_rune_spawner_powerup").length;
    const b = Entities.FindAllByClassname("dota_item_rune_spawner_bounty").length;
    const c = Entities.FindAllByClassname("dota_item_rune_spawner").length;
    log("спаунеры рун на карте: усиления", a, "бонусные", b, "прочие", c);
}

/** Подбор любой руны Доты: очки синей шкалы (как раньше за руну богатства). */
export function onRuneActivated(e: DotaRuneActivatedServerEvent) {
    const p = State.players.get(e.PlayerID);
    if (p === undefined) return;
    for (const f of Hooks.onWealthRune) f(p);
}
