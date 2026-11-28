import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";
import type { OgreMagiLegends } from "../modifiers/modifier_orb_ogre_magi_legend";

declare global {
    var orb_ogre_club: unknown;
    var orb_ogre_challenge: unknown;
    var orb_ogre_loaded_die: unknown;
}

function legends(caster: CDOTA_BaseNPC) {
    return caster.FindModifierByName("modifier_orb_ogre_magi_legend") as unknown as OgreMagiLegends | undefined;
}

class Club extends AbilityBase {
    CastFilterResultLocation(point: Vector) {
        return !IsServer() || legends(this.GetCaster())?.CanThrowClub(point)
            ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }
    GetCustomCastErrorLocation() { return "#orb_ogre_club_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.ThrowClub(this.GetCursorPosition(), this); }
}

class Challenge extends AbilityBase {
    CastFilterResultTarget(target: CDOTA_BaseNPC) {
        if (IsServer() && !legends(this.GetCaster())?.CanChallenge(target)) return UnitFilterResult.FAIL_CUSTOM;
        return UnitFilter(target, UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NONE, this.GetCaster().GetTeamNumber());
    }
    GetCustomCastErrorTarget() { return "#orb_ogre_challenge_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.StartChallenge(this.GetCursorTarget(), this); }
}
class LoadedDie extends AbilityBase {
    CastFilterResult() {
        return !IsServer() || legends(this.GetCaster())?.CanLoadDie()
            ? UnitFilterResult.SUCCESS : UnitFilterResult.FAIL_CUSTOM;
    }
    GetCustomCastError() { return "#orb_ogre_die_invalid"; }
    OnSpellStart() { if (IsServer()) legends(this.GetCaster())?.LoadDie(); }
}

orb_ogre_club = registerAbility("orb_ogre_club", Club);
orb_ogre_challenge = registerAbility("orb_ogre_challenge", Challenge);
orb_ogre_loaded_die = registerAbility("orb_ogre_loaded_die", LoadedDie);
