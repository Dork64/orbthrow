import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";
import type { SvenLegends } from "../modifiers/modifier_orb_sven_legend";

declare global {
    var orb_sven_redirect: unknown;
    var orb_sven_weight: unknown;
}

function legends(caster: CDOTA_BaseNPC): SvenLegends | undefined {
    return caster.FindModifierByName("modifier_orb_sven_legend") as unknown as SvenLegends | undefined;
}

class Redirect extends AbilityBase {
    OnUpgrade() {
        if (!IsServer()) return;
        const passive = this.GetCaster().FindAbilityByName("sven_great_cleave");
        if (passive !== undefined && passive.GetLevel() < this.GetLevel()) passive.SetLevel(this.GetLevel());
    }
    CastFilterResultLocation(point: Vector) {
        return !IsServer() || legends(this.GetCaster())?.CanRedirect(point)
            ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }
    GetCustomCastErrorLocation() { return "#orb_sven_redirect_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.Redirect(this.GetCursorPosition()); }
}

class Weight extends AbilityBase {
    CastFilterResultLocation() {
        return !IsServer() || legends(this.GetCaster())?.CanSwing()
            ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }
    GetCustomCastErrorLocation() { return "#orb_sven_weight_invalid"; }
    OnAbilityPhaseStart() {
        return !IsServer() || (legends(this.GetCaster())?.BeginSwing(this.GetCursorPosition(), this) ?? false);
    }
    OnAbilityPhaseInterrupted() { if (IsServer()) legends(this.GetCaster())?.CancelSwing(); }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.Swing(); }
}

orb_sven_redirect = registerAbility("orb_sven_redirect", Redirect);
orb_sven_weight = registerAbility("orb_sven_weight", Weight);
