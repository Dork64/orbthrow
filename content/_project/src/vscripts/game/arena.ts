import type { ModifierOrbHero } from "../modifiers/modifier_orb_hero";
import { resetItemsNet } from "./itemsnet";
// Ход партии: настройки Доты, состояния игры, главный цикл, победа.

import { CONFIG, TIMINGS } from "../core/config";
import { BUILD_VERSION } from "../core/version";
import { HERO_POOL } from "../core/heroes";
import { checkVictory } from "../core/rules";
import { botsTick, spawnReservedBots } from "./bots";
import { campsTick, initCamps } from "./camps";
import { bountyRuneFilter, logRuneSpawners, onRuneActivated, runesTick } from "./runes";
import { initOrbs, orbsTick } from "./orbs";
import { bossOrbsTick } from "./bossorbs";
import { courierTick, CHEST_ITEM } from "./courier";
import { goblinTick, initGoblin } from "./goblin";
import { catchupTick, initCatchup, revengeDamage } from "./catchup";
import { initEndscreen, publishFinal } from "./endscreen";
import { modifierSelfTest } from "./selftest";
import { beginSetup, finishSetup, initLobby } from "./lobby";
import { initTestPanel, onPlayerChat } from "./cheats";
import { coinTick, onItemPickedUp } from "./coins";
import { economyTick, goldFilter, resetExperience, xpFilter } from "./economy";
import { Hooks } from "./hooks";
import { fountainTick, initFountain } from "./fountain";
import { initSlots, slotsItemFilter, slotsTick } from "./slots";
import { arenaEventsTick, initArenaEvents } from "./arenaevents";
import { initNeutrals, neutralsTick } from "./neutrals";
import { onEntityKilled, recordDamage } from "./kills";
import { leaversTick } from "./leavers";
import { State, allPlayers, currentLeaderId, gameNow, pushNet, scoreRows, toast } from "./state";
import { ALL_TEAMS, initTeamRules, syncRealTeams } from "./teams";
import { Timers } from "./timers";
import { isValid, log, safe } from "./util";

let lastLeader = -1;
let lastPlayerTimer = -1;

function configureGameRules() {
    const mode = GameRules.GetGameModeEntity();
    // Партия начинается сразу после выбора героя: без стратегии, витрины и ожидания горна.
    GameRules.SetHeroSelectionTime(CONFIG.heroSelectionTime);
    GameRules.SetHeroSelectPenaltyTime(0); // без лишних 30 с «штрафного» выбора: не успел — случайный герой
    GameRules.SetStrategyTime(0);
    GameRules.SetShowcaseTime(0);
    GameRules.SetPreGameTime(CONFIG.preGameTime);
    GameRules.SetPostGameTime(60);
    GameRules.SetHeroRespawnEnabled(true);
    GameRules.SetUseUniversalShopMode(true);
    GameRules.SetSameHeroSelectionEnabled(false);
    GameRules.SetGoldPerTick(0);
    GameRules.SetStartingGold(CONFIG.startGold);
    GameRules.SetCustomGameEndDelay(0);
    GameRules.SetCustomVictoryMessageDuration(10);
    GameRules.SetHideKillMessageHeaders(false);
    GameRules.SetUseBaseGoldBountyOnHeroes(false);

    mode.SetLoseGoldOnDeath(false);
    mode.SetBuybackEnabled(false);
    mode.SetTopBarTeamValuesOverride(true);
    mode.SetTopBarTeamValuesVisible(false);
    mode.SetFreeCourierModeEnabled(true);
    mode.SetUseTurboCouriers(true);
    mode.SetCanSellAnywhere(true);
    mode.SetAllowNeutralItemDrops(false);
    mode.SetNeutralStashEnabled(false);
    mode.SetBotThinkingEnabled(false);
    mode.SetGiveFreeTPOnDeath(false);
    mode.SetFountainPercentageHealthRegen(4);
    mode.SetFountainPercentageManaRegen(4);
    mode.SetRuneEnabled(RuneType.BOUNTY, false); // бонусных рун нет (просьба автора 04.11)
    mode.SetRuneEnabled(RuneType.WATER, false);
    mode.SetRuneEnabled(RuneType.XP, false);
    mode.SetDaynightCycleDisabled(false);
    mode.SetAnnouncerDisabled(false);

    // Фильтры под защитой: при ошибке пропускаем значение как есть, а не блокируем.
    mode.SetModifyGoldFilter(e => safe("фильтр золота", () => goldFilter(e)) ?? true, {});
    mode.SetModifyExperienceFilter(e => safe("фильтр опыта", () => xpFilter(e)) ?? true, {});
    mode.SetBountyRunePickupFilter(e => {
        const r = safe("руна богатства", () => bountyRuneFilter(e));
        return r !== false;
    }, {});
    mode.SetDamageFilter(e => {
        safe("месть", () => revengeDamage(e));
        safe("учет урона", () => recordDamage(e));
        return true;
    }, {});
    mode.SetExecuteOrderFilter(e => safe("фильтр приказов", () => orderFilter(e)) ?? true, {});
    mode.SetItemAddedToInventoryFilter(e => safe("фильтр предметов", () => slotsItemFilter(e)) ?? true, {});
}

/** Сундук и мешки золота поднимают только настоящие герои (не курьер, не иллюзия). */
function orderFilter(e: ExecuteOrderFilterEvent): boolean {
    const kind = e.order_type;
    if (kind === UnitOrder.MOVE_TO_POSITION || kind === UnitOrder.MOVE_TO_TARGET || kind === UnitOrder.ATTACK_MOVE) {
        // Особый приказ относится только к своему герою, выделенному отдельно.
        const units = Object.keys(e.units);
        if (units.length === 1) {
            const hero = EntIndexToHScript(e.units[units[0]]) as CDOTA_BaseNPC | undefined;
            if (isValid(hero) && hero.IsRealHero() && hero.GetPlayerOwnerID() === e.issuer_player_id_const) {
                const mod = hero.FindModifierByName("modifier_orb_hero") as unknown as ModifierOrbHero | undefined;
                const target = e.entindex_target > 0 ? EntIndexToHScript(e.entindex_target) as CDOTA_BaseNPC | undefined : undefined;
                if (mod?.ManeuverOrder(kind, target, Vector(e.position_x ?? 0, e.position_y ?? 0, e.position_z ?? 0))) return false;
            }
        }
    }
    if (e.order_type !== UnitOrder.PICKUP_ITEM) return true;
    const phys = EntIndexToHScript(e.entindex_target) as CDOTA_Item_Physical | undefined;
    if (!isValid(phys)) return true;
    const item = phys.GetContainedItem();
    if (item === undefined) return true;
    const name = item.GetAbilityName();
    if (name !== CHEST_ITEM && name !== "item_bag_of_gold") return true;
    for (const k in e.units) {
        const u = EntIndexToHScript(e.units[k]) as CDOTA_BaseNPC | undefined;
        if (isValid(u) && !u.IsRealHero()) return false;
    }
    return true;
}

function onStateChange() {
    const s = GameRules.State_Get();
    log("состояние игры:", s);
    if (s === GameState.CUSTOM_GAME_SETUP) {
        safe("самопроверка", modifierSelfTest);
        beginSetup();
    } else if (s === GameState.HERO_SELECTION) {
        // На случай, если Дота сама завершила настройку раньше нас
        if (!State.setupDone) finishSetup();
    } else if (s === GameState.STRATEGY_TIME) {
        forceHeroes();
    } else if (s === GameState.PRE_GAME) {
        forceHeroes();
        State.phase = "pregame";
        syncRealTeams();
        spawnReservedBots();
        pushNet();
    } else if (s === GameState.GAME_IN_PROGRESS) {
        startGame();
    }
}

/** Кто не успел выбрать героя — получает случайного (иначе Дота оставляет игрока без героя). */
function forceHeroes() {
    for (let i = 0; i < 24; i++) {
        const id = i as PlayerID;
        if (!PlayerResource.IsValidPlayerID(id) || PlayerResource.IsFakeClient(id)) continue;
        if (PlayerResource.HasSelectedHero(id)) continue;
        const player = PlayerResource.GetPlayer(id);
        if (player === undefined) continue;
        player.MakeRandomHeroSelection();
        log("игрок", id, "не выбрал героя — случайный");
    }
}

function startGame() {
    State.phase = "game";
    State.started = true;
    for (const p of allPlayers()) {
        const h = PlayerResource.GetSelectedHeroEntity(p.id);
        if (isValid(h)) h.RemoveModifierByName("modifier_orb_pregame");
    }
    makeTowersInvulnerable();
    logRuneSpawners();
    for (const t of ALL_TEAMS) AddFOWViewer(t, Vector(0, 0, 0), CONFIG.centerVisionRadius, 99999, false);
    for (const f of Hooks.onGameStart) safe("старт партии", f);
    toast("goal", "#orb_toast_start", tostring(State.goal));
    pushNet();
    // Советник первых минут: короткие подсказки по одной
    const tips: [number, string][] = [[6, "#orb_tip_bars"], [15, "#orb_tip_slots"], [25, "#orb_tip_ring"], [TIMINGS.bossOrbFirst - 10, "#orb_tip_boss"], [TIMINGS.courierFirst - 25, "#orb_tip_courier"]];
    for (const [t, text] of tips) Timers.after(t, "подсказка", () => toast("tip", text));
}

function makeTowersInvulnerable() {
    const towers = Entities.FindAllByClassname("npc_dota_tower") as CDOTA_BaseNPC[];
    for (const t of towers) if (isValid(t)) t.AddNewModifier(t, undefined, "modifier_invulnerable", {});
}

function onNpcSpawned(e: NpcSpawnedEvent) {
    const unit = EntIndexToHScript(e.entindex) as CDOTA_BaseNPC | undefined;
    if (!isValid(unit) || !unit.IsRealHero()) return;
    const hero = unit as CDOTA_BaseNPC_Hero;
    const p = State.players.get(hero.GetPlayerOwnerID());
    if (p === undefined) return;
    // Небольшая задержка: герой должен полностью появиться.
    Timers.after(0.05, "появление героя", () => {
        if (!isValid(hero)) return;
        if (State.phase === "pregame" || GameRules.State_Get() < GameState.GAME_IN_PROGRESS) {
            hero.AddNewModifier(hero, undefined, "modifier_orb_pregame", {});
        }
        if (p.left) {
            hero.AddNewModifier(hero, undefined, "modifier_orb_left", {});
        } else {
            // Круг защиты — вокруг точки появления (она в ~430 от фонтана, круг у фонтана не накрывал ее)
            const o = hero.GetAbsOrigin();
            hero.AddNewModifier(hero, undefined, "modifier_orb_spawn_protection", { x: o.x, y: o.y, r: CONFIG.spawnProtectionRadius });
        }
        for (const fn of Hooks.onHeroSpawned) safe("появление героя", () => fn(p, hero, e.is_respawn === 1));
    });
}

function endGame(winnerId: number, reason: string) {
    if (State.phase === "ended") return;
    State.phase = "ended";
    State.winner = winnerId;
    const p = State.players.get(winnerId);
    log("победа:", winnerId, reason);
    toast("goal", "#orb_toast_winner", PlayerResource.GetSelectedHeroName(winnerId as PlayerID), reason);
    safe("итоги", () => publishFinal(winnerId, reason));
    pushNet();
    if (p !== undefined) {
        GameRules.SetCustomVictoryMessage("#orb_victory_" + reason);
        GameRules.SetGameWinner(p.team);
    }
}

/** Каждые 0.5 с: победа, овертайм, смена лидера, сетевые таблицы. */
function mainTick() {
    if (State.phase !== "game" && State.phase !== "overtime") {
        pushNet();
        return;
    }
    const rows = scoreRows();
    const v = checkVictory(rows, State.goal, gameNow(), State.phase === "overtime", State.timeLimit);
    if (v.kind === "winner") {
        endGame(v.id, v.reason);
        return;
    }
    if (v.kind === "overtime" && State.phase !== "overtime") {
        State.phase = "overtime";
        toast("goal", "#orb_toast_overtime");
    }
    const leader = currentLeaderId();
    if (leader !== lastLeader) {
        const old = lastLeader;
        lastLeader = leader;
        for (const f of Hooks.onLeaderChanged) safe("смена лидера", () => f(leader, old));
    }
    checkLastPlayer();
    pushNet();
}

/** Если подключенным остался один игрок (без ботов), через 30 с он побеждает. */
function checkLastPlayer() {
    if (IsInToolsMode()) return;
    const active = allPlayers().filter(p => !p.left);
    if (active.length === 1 && lastPlayerTimer < 0) {
        const id = active[0].id;
        lastPlayerTimer = Timers.after(CONFIG.lastPlayerWinDelay, "последний игрок", () => {
            const still = allPlayers().filter(p => !p.left);
            if (still.length === 1 && still[0].id === id) endGame(id, "lastPlayer");
            lastPlayerTimer = -1;
        });
    }
}

export const Arena = {
    Init() {
        log("ORBTHROW загружается, сборка", BUILD_VERSION, "редактор:", IsInToolsMode());
        resetExperience();
        initTeamRules();
        configureGameRules();
        writeHeroList();
        initCamps();
        initOrbs();
        initGoblin();
        initCatchup();
        initEndscreen();
        initLobby();
        initTestPanel();
        initFountain();
        resetItemsNet();
        initSlots();
        initNeutrals();
        initArenaEvents();
        ListenToGameEvent("game_rules_state_change", () => safe("смена состояния", onStateChange), undefined);
        ListenToGameEvent("npc_spawned", e => safe("появление", () => onNpcSpawned(e)), undefined);
        ListenToGameEvent("entity_killed", e => safe("убийство", () => onEntityKilled(e)), undefined);
        ListenToGameEvent("player_chat", e => safe("чат", () => onPlayerChat(e)), undefined);
        ListenToGameEvent("dota_item_picked_up", e => safe("подбор предмета", () => onItemPickedUp(e)), undefined);
        ListenToGameEvent("dota_rune_activated_server", e => safe("руна", () => onRuneActivated(e)), undefined);
        Timers.start();
        Timers.every(0.5, "главный цикл", mainTick, 1);
        Timers.every(1, "экономика", economyTick, 1);
        Timers.every(1, "монеты", coinTick, 1);
        Timers.every(1, "ливеры", leaversTick, 2);
        Timers.every(0.4, "боты", botsTick, 1);
        Timers.every(0.5, "лагеря", campsTick, 1);
        Timers.every(0.5, "руны", runesTick, 1);
        Timers.every(0.25, "сферы", orbsTick, 1);
        Timers.every(0.1, "сферы Повелителя", bossOrbsTick, 1);
        Timers.every(0.1, "курьер", courierTick, 1);
        Timers.every(0.5, "фонтан", fountainTick, 1);
        Timers.every(0.5, "нейтральные предметы", neutralsTick, 1);
        Timers.every(0.5, "слоты", slotsTick, 1);
        Timers.every(0.3, "Гоблин", goblinTick, 1);
        Timers.every(0.5, "отстающие", catchupTick, 1);
        Timers.every(0.5, "события арены", arenaEventsTick, 1);
    },
    Reload() {
        log("скрипты перезагружены");
    },
};

function writeHeroList() {
    // Пул героев задается файлом scripts/npc/herolist.txt; здесь только печатаем для проверки.
    log("пул героев:", HERO_POOL.length);
}
