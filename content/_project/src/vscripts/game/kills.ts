import { grantArenaExperience } from "./economy";
// Засчитывание убийств и награды. Все правила — в одном месте (DESIGN 3.3, 4.3).

import { CONFIG } from "../core/config";
import { assistGoldEach, assistersOf, killGold, killXpEach, lastDamager, pruneDamage, respawnTime } from "../core/rules";
import { Hooks } from "./hooks";
import { State, activePlayers, currentLeaderId, networthOf, placesNow, pushNet, toast } from "./state";
import { Timers } from "./timers";
import { isValid, log, safe } from "./util";

/** Фильтр урона: записываем, кто кому наносил урон (для помощи и добиваний нейтралами). */
export function recordDamage(e: DamageFilterEvent) {
    if (e.entindex_attacker_const === undefined || e.entindex_victim_const === undefined) return;
    const victim = EntIndexToHScript(e.entindex_victim_const) as CDOTA_BaseNPC | undefined;
    const attacker = EntIndexToHScript(e.entindex_attacker_const) as CDOTA_BaseNPC | undefined;
    if (!isValid(victim) || !isValid(attacker)) return;
    if (!victim.IsRealHero()) return;
    const vp = State.players.get(victim.GetPlayerOwnerID());
    if (vp === undefined) return;
    const aid = attacker.GetPlayerOwnerID();
    if (aid < 0 || aid === vp.id || !State.players.has(aid)) return;
    const now = GameRules.GetGameTime();
    vp.damageTaken.push({ attacker: aid, time: now, amount: e.damage });
    // Оба в бою: окна выбора сфер и нейтралок в бою сами не открываются
    vp.fightAt = now;
    const ap = State.players.get(aid);
    if (ap !== undefined) ap.fightAt = now;
    if (vp.damageTaken.length > 64) vp.damageTaken = pruneDamage(vp.damageTaken, now);
}

function heroName(id: number): string {
    return PlayerResource.GetSelectedHeroName(id as PlayerID);
}

export function onEntityKilled(e: EntityKilledEvent) {
    if (State.phase !== "game" && State.phase !== "overtime") return;
    const victim = EntIndexToHScript(e.entindex_killed) as CDOTA_BaseNPC_Hero | undefined;
    if (!isValid(victim) || !victim.IsRealHero()) return;
    if (victim.IsReincarnating()) return;
    const asNpc = victim as CDOTA_BaseNPC;
    const isCopy: boolean = asNpc.IsTempestDouble() || asNpc.IsClone();
    if (isCopy) return;
    const vp = State.players.get(victim.GetPlayerOwnerID());
    if (vp === undefined) return;

    const now = GameRules.GetGameTime();
    const victimStreak = vp.streak;
    const victimKillsBefore = vp.kills;
    const victimWasHunted = Hooks.isHunted(vp.id);
    const victimWasLeader = currentLeaderId() === vp.id;
    vp.deaths++;
    vp.streak = 0;

    // Кто убил: владелец убившего юнита, иначе последний вражеский герой за 10 с.
    let killerId: number | undefined;
    const attacker = e.entindex_attacker !== undefined ? (EntIndexToHScript(e.entindex_attacker) as CDOTA_BaseNPC | undefined) : undefined;
    if (isValid(attacker)) {
        const aid = attacker.GetPlayerOwnerID();
        if (aid >= 0 && aid !== vp.id && State.players.has(aid)) killerId = aid;
    }
    if (killerId === undefined) killerId = lastDamager(vp.damageTaken, now, vp.id);

    // Время возрождения по месту (после обновления счета).
    const finishRespawn = () => {
        Timers.after(0.1, "время возрождения", () => {
            if (!isValid(victim) || victim.IsAlive()) return;
            const places = placesNow();
            const n = activePlayers().length;
            const t = respawnTime(places.get(vp.id) ?? n, n);
            victim.SetTimeUntilRespawn(t);
        });
    };

    for (const f of Hooks.onHeroDeath) safe("смерть героя", () => f(vp));

    const kp = killerId === undefined ? undefined : State.players.get(killerId);
    if (kp === undefined || kp.team === vp.team) {
        vp.damageTaken = [];
        finishRespawn();
        toast("death", "#orb_toast_death", heroName(vp.id), undefined, undefined, vp.id);
        pushNet();
        return;
    }

    const assisterIds = assistersOf(vp.damageTaken, now, vp.id, kp.id, victim.GetMaxHealth());
    const assisters = assisterIds.map(id => State.players.get(id)).filter(p => p !== undefined && !p.left) as typeof kp[];
    const killerKillsBefore = kp.kills;
    kp.kills++;
    kp.streak++;
    for (const a of assisters) a.assists++;

    const gold = killGold({
        victimLevel: victim.GetLevel(),
        victimNetworth: networthOf(vp.id),
        killerNetworth: networthOf(kp.id),
        victimStreak,
        victimHunted: victimWasHunted,
    });
    PlayerResource.ModifyGold(kp.id, gold, true, ModifyGoldReason.UNSPECIFIED);
    const ag = assistGoldEach(gold, assisters.length);
    for (const a of assisters) if (ag > 0) PlayerResource.ModifyGold(a.id, ag, true, ModifyGoldReason.UNSPECIFIED);

    const xp = killXpEach(victim.GetCurrentXP(), assisters.length);
    for (const p of [kp, ...assisters]) {
        const h = PlayerResource.GetSelectedHeroEntity(p.id);
        if (isValid(h)) grantArenaExperience(h, xp);
    }

    const killerHero = PlayerResource.GetSelectedHeroEntity(kp.id);
    if (isValid(killerHero)) SendOverheadEventMessage(undefined, OverheadAlert.GOLD, killerHero, gold, undefined);

    vp.damageTaken = [];
    finishRespawn();
    log("убийство:", heroName(kp.id), "→", heroName(vp.id), "золото", gold, "опыт", xp, "помощь", assisters.length);

    for (const f of Hooks.onHeroKill) {
        safe("награда за убийство", () => f({ killer: kp, victim: vp, assisters, victimKillsBefore, killerKillsBefore, victimWasHunted, victimWasLeader }));
    }
    toast("kill", "#orb_toast_kill", heroName(kp.id), heroName(vp.id), tostring(gold), kp.id);
    pushNet();
}

export { CONFIG };
