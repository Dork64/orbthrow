// Команды и базы: каждый игрок — своя команда, базы заполняются равномерно по кругу.

import { CONFIG } from "../core/config";
import { MAP, angleOf, nearestBase } from "../core/mapinfo";
import { spreadBases, killGoal } from "../core/rules";
import { State, newPlayer } from "./state";
import { log } from "./util";

export const ALL_TEAMS: DotaTeam[] = [
    DotaTeam.GOODGUYS, DotaTeam.BADGUYS,
    DotaTeam.CUSTOM_1, DotaTeam.CUSTOM_2, DotaTeam.CUSTOM_3, DotaTeam.CUSTOM_4,
    DotaTeam.CUSTOM_5, DotaTeam.CUSTOM_6, DotaTeam.CUSTOM_7, DotaTeam.CUSTOM_8,
];

/** Цвета игроков (как в Overthrow), по индексу базы. */
export const BASE_COLORS: [number, number, number][] = [
    [61, 210, 150], [243, 201, 9], [197, 77, 168], [255, 108, 0], [52, 85, 255],
    [101, 212, 19], [129, 83, 54], [27, 192, 216], [199, 228, 13], [140, 42, 244],
];

/** Команда для каждой базы карты (индекс базы → команда). Узнаем по фонтанам. */
export const baseTeams: DotaTeam[] = [];

export function initTeamRules() {
    for (const t of ALL_TEAMS) GameRules.SetCustomGameTeamMaxPlayers(t, 1);
    GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.NOTEAM, 0);
    GameRules.SetIgnoreLobbyTeamsInCustomGame(true);
    // В редакторе — сразу в игру; в сети ждем хоста (наш таймер завершит настройку раньше Доты)
    GameRules.SetCustomGameSetupAutoLaunchDelay(IsInToolsMode() ? 0 : CONFIG.lobbyAutoStart + 20);
    GameRules.LockCustomGameSetupTeamAssignment(true);
}

/** Сопоставить базы карты и команды по фонтанам. Если фонтанов нет — по порядку. */
export function discoverBases() {
    baseTeams.length = 0;
    for (let i = 0; i < MAP.bases.length; i++) baseTeams.push(ALL_TEAMS[i]);
    const fountains = Entities.FindAllByClassname("ent_dota_fountain") as CDOTA_BaseNPC[];
    let found = 0;
    for (const f of fountains) {
        const team = f.GetTeamNumber();
        if (!ALL_TEAMS.includes(team)) continue;
        const o = f.GetAbsOrigin();
        const idx = nearestBase({ x: o.x, y: o.y });
        baseTeams[idx] = team;
        found++;
    }
    log("баз найдено по фонтанам:", found, "из", MAP.bases.length);
}

function humanPlayerIds(): PlayerID[] {
    const ids: PlayerID[] = [];
    for (let i = 0; i < 24; i++) {
        const id = i as PlayerID;
        if (PlayerResource.IsValidPlayerID(id) && !PlayerResource.IsFakeClient(id)) ids.push(id);
    }
    return ids;
}

/**
 * Раздать команды людям и зарезервировать команды для ботов.
 * Вызывается в начале CUSTOM_GAME_SETUP.
 */
export function assignTeams(botsWanted: number) {
    discoverBases();
    // Повторный вызов (изменились настройки лобби) раздает команды заново
    State.players.clear();
    State.teamToPlayer.clear();
    const humans = humanPlayerIds();
    const total = Math.min(MAP.bases.length, humans.length + botsWanted);
    State.plannedPlayers = total;
    State.goal = State.voteGoal > 0 ? State.voteGoal : killGoal(total);
    const slots = spreadBases(MAP.bases.length, total);
    humans.forEach((id, i) => {
        const baseIndex = slots[i];
        const team = baseTeams[baseIndex];
        PlayerResource.SetCustomTeamAssignment(id, team);
        const p = newPlayer(id, team, baseIndex, false);
        const c = BASE_COLORS[baseIndex];
        PlayerResource.SetCustomPlayerColor(id, c[0], c[1], c[2]);
        log("игрок", id, "→ база", baseIndex, "команда", team);
        return p;
    });
    State.reservedBotTeams = [];
    for (let i = humans.length; i < total; i++) State.reservedBotTeams.push(baseTeams[slots[i]]);
    for (let i = 0; i < baseTeams.length; i++) {
        const c = BASE_COLORS[i];
        SetTeamCustomHealthbarColor(baseTeams[i], c[0], c[1], c[2]);
    }
    log("игроков:", total, "людей:", humans.length, "ботов:", State.reservedBotTeams.length, "лимит:", State.goal);
}

/** Если Дота расставила команды по-своему (поздний старт), принимаем ее расстановку. */
export function syncRealTeams() {
    for (const [, p] of State.players) {
        if (p.isBot) continue;
        const real = PlayerResource.GetTeam(p.id as PlayerID);
        if (real === p.team || !ALL_TEAMS.includes(real)) continue;
        log("команда игрока", p.id, "на деле", real, "а не", p.team);
        if (State.teamToPlayer.get(p.team) === p.id) State.teamToPlayer.delete(p.team);
        p.team = real;
        p.baseIndex = baseIndexOfTeam(real);
        State.teamToPlayer.set(real, p.id);
    }
}

export function baseIndexOfTeam(team: DotaTeam): number {
    const i = baseTeams.indexOf(team);
    return i < 0 ? 0 : i;
}

export function fountainOf(team: DotaTeam): Vector {
    const b = MAP.bases[baseIndexOfTeam(team)];
    return Vector(b.fountain.x, b.fountain.y, 128);
}

export function baseAngle(baseIndex: number): number {
    return angleOf(MAP.bases[baseIndex].fountain);
}

export { CONFIG };
