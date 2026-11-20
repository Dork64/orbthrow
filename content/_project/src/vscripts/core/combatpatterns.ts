/** Состояние сочетания разных заклинаний; не учитывает предметы и повторные OnSpellStart. */
export interface ComboState { casts: Record<string, number>; readyAt: number }

export function advanceCombo(state: ComboState, allowed: string[], need: number, within: number, cooldown: number, name: string, now: number): boolean {
    if (now < state.readyAt || !allowed.includes(name)) return false;
    state.casts[name] = now;
    let count = 0;
    for (const ab in state.casts) {
        if (now - state.casts[ab] <= within) count++;
        else delete state.casts[ab];
    }
    if (count < need) return false;
    state.casts = {};
    state.readyAt = now + cooldown;
    return true;
}

export function insideRing(distance: number, inner: number, outer: number): boolean {
    return distance >= inner && distance <= outer;
}

export function tetherBand(distance: number, inner: number, outer: number, breakRange: number): "broken" | "outside" | "active" {
    if (distance > breakRange) return "broken";
    return insideRing(distance, inner, outer) ? "active" : "outside";
}

/** Не даём сферам превратить Phase Shift в непрерывную неуязвимость. */
export function boundedOrbCooldown(ability: string, reduction: number): number {
    return ability === "puck_phase_shift" ? Math.min(20, reduction) : reduction;
}
