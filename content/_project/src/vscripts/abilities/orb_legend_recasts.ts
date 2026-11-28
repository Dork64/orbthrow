
import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";
import type { SnapfireLegends } from "../modifiers/modifier_orb_snapfire_legend";
import type { TidehunterLegends } from "../modifiers/modifier_orb_tidehunter_legend";

declare global {
    var orb_snapfire_bank: unknown;
    var orb_snapfire_spring: unknown;
    var orb_tide_anchor_return: unknown;
}

class Bank extends AbilityBase {
    OnSpellStart() {
        if (!IsServer()) return;
        const modifier = this.GetCaster().FindModifierByName("modifier_orb_snapfire_legend") as SnapfireLegends | undefined;
        modifier?.Bank(this.GetCursorPosition());
    }
}

class Spring extends AbilityBase {
    OnSpellStart() {
        if (!IsServer()) return;
        const modifier = this.GetCaster().FindModifierByName("modifier_orb_snapfire_legend") as SnapfireLegends | undefined;
        modifier?.Spring(this.GetCursorPosition());
    }
}

class ReturnToAnchor extends AbilityBase {
    OnSpellStart() {
        if (!IsServer()) return;
        const modifier = this.GetCaster().FindModifierByName("modifier_orb_tidehunter_legend") as TidehunterLegends | undefined;
        modifier?.ReturnToAnchor();
    }
}

orb_snapfire_bank = registerAbility("orb_snapfire_bank", Bank);
orb_snapfire_spring = registerAbility("orb_snapfire_spring", Spring);
orb_tide_anchor_return = registerAbility("orb_tide_anchor_return", ReturnToAnchor);
