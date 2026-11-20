// Свирепость (фиолетовая сфера): за убийство и помощь +12 урона и +4% скорости бега до смерти, до 5 раз.
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_ferocity: unknown;
}

export class ModifierOrbFerocity extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    IsDebuff() { return false; }
    RemoveOnDeath() { return true; }
    GetTexture() { return "item_armlet"; }
    DeclareFunctions() {
        return [ModifierFunction.PREATTACK_BONUS_DAMAGE, ModifierFunction.MOVESPEED_BONUS_PERCENTAGE];
    }
    GetModifierPreAttack_BonusDamage() { return 12 * this.GetStackCount(); }
    GetModifierMoveSpeedBonus_Percentage() { return 4 * this.GetStackCount(); }
}
modifier_orb_ferocity = registerModifier("modifier_orb_ferocity", ModifierOrbFerocity);
