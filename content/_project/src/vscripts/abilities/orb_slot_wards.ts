import { castSlotWard, slotWardError } from "../game/slots";
import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";

declare global {
    var orb_slot_observer: unknown;
    var orb_slot_sentry: unknown;
}

class OrbSlotWard extends AbilityBase {
    private kind() { return this.GetAbilityName() === "orb_slot_observer" ? "ob" : "se"; }

    CastFilterResultLocation(location: Vector) {
        if (!IsServer()) return UnitFilterResult.SUCCESS;
        const caster = this.GetCaster() as CDOTA_BaseNPC_Hero;
        return slotWardError(caster, this.kind(), location) === undefined ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }

    GetCustomCastErrorLocation(location: Vector) {
        if (!IsServer()) return "";
        return slotWardError(this.GetCaster() as CDOTA_BaseNPC_Hero, this.kind(), location) ?? "";
    }

    OnSpellStart() {
        if (IsServer()) castSlotWard(this.GetCaster() as CDOTA_BaseNPC_Hero, this.kind(), this.GetCursorPosition(), this);
    }
}

orb_slot_observer = registerAbility("orb_slot_observer", OrbSlotWard);
orb_slot_sentry = registerAbility("orb_slot_sentry", OrbSlotWard);
