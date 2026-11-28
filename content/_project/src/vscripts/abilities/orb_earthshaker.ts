import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";
import type { ShakerLegends } from "../modifiers/modifier_orb_earthshaker_legend";

declare global {
    var orb_es_pivot: unknown;
    var orb_es_step: unknown;
    var orb_es_seismograph: unknown;
}

class LegendButton extends AbilityBase {
    ProcsMagicStick() { return false; }
    controller() {
        return this.GetCaster().FindModifierByName("modifier_orb_earthshaker_legend") as unknown as ShakerLegends | undefined;
    }
}
class Pivot extends LegendButton {
    OnSpellStart() { if (IsServer()) this.controller()?.Pivot(this.GetCursorPosition()); }
}
class Step extends LegendButton {
    OnSpellStart() { if (IsServer()) this.controller()?.Step(this.GetCursorPosition()); }
}
class Seismograph extends LegendButton {
    OnUpgrade() {
        if (!IsServer()) return;
        const e = this.GetCaster().FindAbilityByName("earthshaker_aftershock");
        if (e !== undefined && e.GetLevel() < this.GetLevel()) e.SetLevel(this.GetLevel());
    }
    OnSpellStart() { if (IsServer()) this.controller()?.Detonate(this); }
}

orb_es_pivot = registerAbility("orb_es_pivot", Pivot);
orb_es_step = registerAbility("orb_es_step", Step);
orb_es_seismograph = registerAbility("orb_es_seismograph", Seismograph);
