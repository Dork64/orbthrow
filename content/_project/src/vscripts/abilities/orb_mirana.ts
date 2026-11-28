import { AbilityBase } from "../lib/modbase";
import { registerAbility } from "../lib/registry";
import type { MiranaLegends } from "../modifiers/modifier_orb_mirana_legend";

declare global {
    var orb_mirana_star: unknown;
    var orb_mirana_arrow: unknown;
    var orb_mirana_turn: unknown;
    var orb_mirana_swap: unknown;
}
function legend(caster: CDOTA_BaseNPC) {
    return caster.FindModifierByName("modifier_orb_mirana_legend") as unknown as MiranaLegends | undefined;
}

class Star extends AbilityBase {
    OnSpellStart() { if (IsServer()) legend(this.GetCaster())?.ThrowStar(this, this.GetCursorPosition()); }
    OnProjectileHit_ExtraData(target: CDOTA_BaseNPC | undefined, _point: Vector, data: { id: number }) {
        return legend(this.GetCaster())?.StarHit(target, Number(data.id)) ?? true;
    }
}
class Arrow extends AbilityBase {
    OnSpellStart() { if (IsServer()) legend(this.GetCaster())?.Redirect(this, this.GetCursorPosition()); }
    OnProjectileHit_ExtraData(target: CDOTA_BaseNPC | undefined, point: Vector, data: { id: number }) {
        return legend(this.GetCaster())?.ArrowHit(target, point, Number(data.id)) ?? true;
    }
    OnProjectileThink_ExtraData(point: Vector, data: { id: number }) {
        legend(this.GetCaster())?.ArrowThink(point, Number(data.id));
    }
}
class Turn extends AbilityBase {
    OnSpellStart() { if (IsServer()) legend(this.GetCaster())?.Turn(this, this.GetCursorPosition()); }
    OnProjectileHit_ExtraData(target: CDOTA_BaseNPC | undefined, _point: Vector, data: { id: number }) {
        return legend(this.GetCaster())?.FanHit(target, Number(data.id)) ?? true;
    }
}
class Swap extends AbilityBase {
    OnSpellStart() { if (IsServer()) legend(this.GetCaster())?.SwapMoon(this.GetCursorPosition()); }
}
orb_mirana_star = registerAbility("orb_mirana_star", Star);
orb_mirana_arrow = registerAbility("orb_mirana_arrow", Arrow);
orb_mirana_turn = registerAbility("orb_mirana_turn", Turn);
orb_mirana_swap = registerAbility("orb_mirana_swap", Swap);
