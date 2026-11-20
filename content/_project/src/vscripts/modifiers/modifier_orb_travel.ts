// Съеденные Boots of Travel (просьба автора 31.10): +100 скорости за каждые, до двух.
// Стаки — сколько съедено; скорость за стак — CONFIG.travelEatSpeed (одинаково на сервере и клиенте).
import { CONFIG } from "../core/config";
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_travel: unknown;
}

export class ModifierOrbTravel extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    IsPermanent() { return true; }
    RemoveOnDeath() { return false; }
    AllowIllusionDuplicate() { return true; }
    GetTexture() { return "item_travel_boots"; }
    GetAttributes() { return ModifierAttribute.PERMANENT; }

    DeclareFunctions() { return [ModifierFunction.MOVESPEED_BONUS_CONSTANT]; }
    GetModifierMoveSpeedBonus_Constant() { return CONFIG.travelEatSpeed * this.GetStackCount(); }
}
modifier_orb_travel = registerModifier("modifier_orb_travel", ModifierOrbTravel);
