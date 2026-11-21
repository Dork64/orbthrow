import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";
import type { JuggernautLegends } from "../modifiers/modifier_orb_jugg_legend";

declare global {
    var orb_jugg_three_cuts: unknown;
    var orb_jugg_encore: unknown;
}

function legends(caster: CDOTA_BaseNPC): JuggernautLegends | undefined {
    return caster.FindModifierByName("modifier_orb_jugg_legend") as unknown as JuggernautLegends | undefined;
}

class ThreeCuts extends AbilityBase {
    OnUpgrade() {
        if (!IsServer()) return;
        const passive = this.GetCaster().FindAbilityByName("juggernaut_blade_dance");
        if (passive !== undefined && passive.GetLevel() < this.GetLevel()) passive.SetLevel(this.GetLevel());
    }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.StartCuts(this); }
}

class Encore extends AbilityBase {
    CastFilterResultTarget(target: CDOTA_BaseNPC) {
        const caster = this.GetCaster();
        if (IsServer() && (!target.IsRealHero() || target.IsIllusion() || !legends(caster)?.CanEncore()))
            return UnitFilterResult.FAIL_CUSTOM;
        return UnitFilter(target, UnitTargetTeam.ENEMY, UnitTargetType.HERO,
            UnitTargetFlags.MAGIC_IMMUNE_ENEMIES, caster.GetTeamNumber());
    }
    GetCustomCastErrorTarget() { return "#orb_jugg_encore_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.StartEncore(this, this.GetCursorTarget()); }
}

orb_jugg_three_cuts = registerAbility("orb_jugg_three_cuts", ThreeCuts);
orb_jugg_encore = registerAbility("orb_jugg_encore", Encore);
