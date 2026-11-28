import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";
import type { NecroLegends } from "../modifiers/modifier_orb_necro_legend";

declare global {
    var orb_necro_pulse: unknown;
    var orb_necro_return: unknown;
    var orb_necro_beacon: unknown;
    var orb_necro_move_beacon: unknown;
    var orb_necro_verdict: unknown;
}

function legends(caster: CDOTA_BaseNPC) {
    return caster.FindModifierByName("modifier_orb_necro_legend") as unknown as NecroLegends | undefined;
}

class Pulse extends AbilityBase {
    GetCastPoint() { return legends(this.GetCaster())?.IsAwake() ? 0.4 : 0.6; }
    OnAbilityPhaseStart() { return !IsServer() || (legends(this.GetCaster())?.BeginPulse() ?? false); }
    OnAbilityPhaseInterrupted() { if (IsServer()) legends(this.GetCaster())?.InterruptPulse(); }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.FinishPulse(this); }
}

class ReturnToAnchor extends AbilityBase {
    CastFilterResult() {
        return !IsServer() || legends(this.GetCaster())?.CanReturn()
            ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }
    GetCustomCastError() { return "#orb_necro_return_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.ReturnToAnchor(this); }
}

function beaconRadius(caster: CDOTA_BaseNPC) {
    const active = caster.FindModifierByName("modifier_orb_necro_beacon");
    if (active !== undefined) return active.GetStackCount();
    const aura = caster.FindAbilityByName("necrolyte_heartstopper_aura");
    return Math.max(500, (aura?.GetSpecialValueFor("aura_radius") ?? 700) - 200);
}

class Beacon extends AbilityBase {
    GetAOERadius() { return beaconRadius(this.GetCaster()); }
    OnUpgrade() {
        if (!IsServer()) return;
        const aura = this.GetCaster().FindAbilityByName("necrolyte_heartstopper_aura");
        if (aura !== undefined && aura.GetLevel() < this.GetLevel()) aura.SetLevel(this.GetLevel());
    }
    CastFilterResultLocation(point: Vector) {
        return !IsServer() || legends(this.GetCaster())?.CanPlace(point, false)
            ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }
    GetCustomCastErrorLocation() { return "#orb_necro_beacon_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.PlaceBeacon(this.GetCursorPosition()); }
}

class ShiftBeacon extends AbilityBase {
    GetAOERadius() { return beaconRadius(this.GetCaster()); }
    CastFilterResultLocation(point: Vector) {
        return !IsServer() || legends(this.GetCaster())?.CanPlace(point, true)
            ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }
    GetCustomCastErrorLocation() { return "#orb_necro_shift_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.ShiftBeacon(this.GetCursorPosition()); }
}

class Verdict extends AbilityBase {
    OnAbilityPhaseStart() { return !IsServer() || (legends(this.GetCaster())?.CanVerdict() ?? false); }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.FinishVerdict(this); }
}

orb_necro_pulse = registerAbility("orb_necro_pulse", Pulse);
orb_necro_return = registerAbility("orb_necro_return", ReturnToAnchor);
orb_necro_beacon = registerAbility("orb_necro_beacon", Beacon);
orb_necro_move_beacon = registerAbility("orb_necro_move_beacon", ShiftBeacon);
orb_necro_verdict = registerAbility("orb_necro_verdict", Verdict);
