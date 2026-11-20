// «Крючки» между модулями, чтобы не было циклических импортов (циклический require в Lua падает).
import type { PlayerState } from "./state";

export interface KillInfo {
    killer: PlayerState;
    victim: PlayerState;
    assisters: PlayerState[];
    victimKillsBefore: number;
    killerKillsBefore: number;
    victimWasHunted: boolean;
    /** Жертва была единоличным лидером до этого убийства. */
    victimWasLeader: boolean;
}

export const Hooks = {
    onHeroKill: [] as ((k: KillInfo) => void)[],
    onHeroDeath: [] as ((victim: PlayerState) => void)[],
    onPlayerLeft: [] as ((p: PlayerState) => void)[],
    onHeroSpawned: [] as ((p: PlayerState, hero: CDOTA_BaseNPC_Hero, respawn: boolean) => void)[],
    onGameStart: [] as (() => void)[],
    onLeaderChanged: [] as ((newLeader: number, oldLeader: number) => void)[],
    onWealthRune: [] as ((p: PlayerState) => void)[],
    /** Герой игрока убил лесного крипа (тип лагеря: small, medium, large, ancient). */
    onCampCreepKilled: [] as ((pid: number, campType: string) => void)[],
    isHunted: (_id: number): boolean => false,
};
