// Ливеры: 3 минуты без связи или выход — игрок покинул партию (DESIGN 3.5).

import { CONFIG } from "../core/config";
import { goalAfterAbandon } from "../core/rules";
import { Hooks } from "./hooks";
import { State, allPlayers, pushNet, toast } from "./state";
import { fountainOf } from "./teams";
import { isValid, log, safe } from "./util";

export function leaversTick() {
    if (State.phase === "ended" || State.phase === "setup") return;
    for (const p of allPlayers()) {
        if (p.isBot) continue;
        const cs = PlayerResource.GetConnectionState(p.id);
        if (cs === ConnectionState.CONNECTED) {
            p.disconnectedFor = 0;
            if (p.left) markReturned(p.id);
            continue;
        }
        if (cs === ConnectionState.DISCONNECTED || cs === ConnectionState.FAILED || cs === ConnectionState.UNKNOWN) p.disconnectedFor++;
        if (!p.left && (cs === ConnectionState.ABANDONED || p.disconnectedFor >= CONFIG.abandonSeconds)) markLeft(p.id);
    }
}

export function markLeft(id: PlayerID) {
    const p = State.players.get(id);
    if (p === undefined || p.left) return;
    p.left = true;
    const leader = Math.max(0, ...allPlayers().filter(q => !q.left).map(q => q.kills));
    State.goal = goalAfterAbandon(State.goal, leader);
    const h = PlayerResource.GetSelectedHeroEntity(id);
    if (isValid(h)) {
        if (h.IsAlive()) {
            FindClearSpaceForUnit(h, fountainOf(p.team), true);
            h.AddNewModifier(h, undefined, "modifier_orb_left", {});
        }
    }
    log("игрок покинул партию:", id, "новый лимит", State.goal);
    toast("info", "#orb_toast_left", PlayerResource.GetPlayerName(id), tostring(State.goal));
    for (const f of Hooks.onPlayerLeft) safe("уход игрока", () => f(p));
    pushNet();
}

function markReturned(id: PlayerID) {
    const p = State.players.get(id);
    if (p === undefined) return;
    p.left = false;
    const h = PlayerResource.GetSelectedHeroEntity(id);
    if (isValid(h)) h.RemoveModifierByName("modifier_orb_left");
    toast("info", "#orb_toast_returned", PlayerResource.GetPlayerName(id));
    pushNet();
}
