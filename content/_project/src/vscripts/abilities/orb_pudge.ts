import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";
import type { PudgeLegends } from "../modifiers/modifier_orb_pudge_legend";

declare global { var orb_pudge_counter: unknown; }

function legends(h: CDOTA_BaseNPC) {
    return h.FindModifierByName("modifier_orb_pudge_legend") as unknown as PudgeLegends | undefined;
}

class Counter extends AbilityBase {
    CastFilterResult() {
        return !IsServer() || legends(this.GetCaster())?.CanCounter() ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }
    GetCustomCastError() { return "#orb_pudge_counter_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.ArmCounter(this); }
}

orb_pudge_counter = registerAbility("orb_pudge_counter", Counter);
