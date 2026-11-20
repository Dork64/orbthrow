// Монеты Повелителя: раз в ~45 с монета на 150 золота в кольцо (DESIGN 6.4).

import { CONFIG } from "../core/config";
import { State } from "./state";
import { Timers } from "./timers";
import { CHEST_ITEM, onChestPicked } from "./courier";
import { isValid, randomPointInRing } from "./util";

export function coinTick() {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    if (RandomFloat(0, 1) >= CONFIG.coinChancePerSecond) return;
    throwCoin();
}

export function throwCoin() {
    const boss = Entities.FindByName(undefined, "@overboss") as CDOTA_BaseNPC | undefined;
    if (isValid(boss)) {
        const anim = boss.FindAbilityByName("dota_ability_throw_coin");
        if (anim !== undefined) boss.CastAbilityNoTarget(anim, -1);
    }
    const start = Vector(0, 0, 300);
    const target = coinLandingPoint();
    const item = CreateItem("item_bag_of_gold", undefined, undefined);
    if (item === undefined) return;
    const drop = CreateItemOnPositionForLaunch(start, item);
    item.LaunchLootInitialHeight(false, 300, 400, 0.75, target);
    Timers.after(CONFIG.coinLifetime, "исчезновение монеты", () => expireLoot(item, drop));
}

/** Точка падения монеты: в кольце вокруг Повелителя, на проходимой земле (иначе монету не видно и не достать). */
function coinLandingPoint(): Vector {
    for (let i = 0; i < 20; i++) {
        const p = randomPointInRing(Vector(0, 0, 0), CONFIG.coinMinRadius, CONFIG.coinMaxRadius);
        if (GridNav.IsTraversable(p) && !GridNav.IsBlocked(p)) return GetGroundPosition(p, undefined);
    }
    const a = RandomFloat(0, Math.PI * 2);
    const r = (CONFIG.coinMinRadius + CONFIG.coinMaxRadius) / 2;
    return GetGroundPosition(Vector(Math.cos(a) * r, Math.sin(a) * r, 0), undefined);
}

/** Мешки с особой суммой (Гоблин): номер предмета → золото. */
const specialGold = new Map<number, number>();

/** Убрать неподобранную монету или мешок: и лежащий предмет, и сам предмет (иначе копятся сущности). */
export function expireLoot(item: CDOTA_Item, drop: CDOTA_Item_Physical | undefined) {
    if (!isValid(drop)) return; // уже подобрали
    if (isValid(item)) {
        specialGold.delete(item.entindex());
        UTIL_Remove(item);
    }
    if (isValid(drop)) UTIL_Remove(drop);
}

export function registerSpecialGold(item: CDOTA_Item, gold: number) {
    specialGold.set(item.entindex(), gold);
}

/** Подбор монеты или мешка: золото и удаление предмета. Сундук — отдельно (courier.ts). */
export function onItemPickedUp(e: DotaItemPickedUpEvent): boolean {
    const item = EntIndexToHScript(e.ItemEntityIndex) as CDOTA_Item | undefined;
    const hero = (e.HeroEntityIndex !== undefined ? EntIndexToHScript(e.HeroEntityIndex) : undefined) as CDOTA_BaseNPC_Hero | undefined;
    if (e.itemname === CHEST_ITEM) {
        if (isValid(hero) && hero.IsRealHero()) return onChestPicked(hero, item);
        return false;
    }
    if (e.itemname !== "item_bag_of_gold") return false;
    const gold = specialGold.get(e.ItemEntityIndex) ?? CONFIG.coinGold;
    specialGold.delete(e.ItemEntityIndex);
    if (isValid(hero) && hero.IsRealHero()) {
        PlayerResource.ModifyGold(hero.GetPlayerOwnerID(), gold, true, ModifyGoldReason.UNSPECIFIED);
        SendOverheadEventMessage(undefined, OverheadAlert.GOLD, hero, gold, undefined);
    }
    if (isValid(item)) UTIL_Remove(item);
    return true;
}
