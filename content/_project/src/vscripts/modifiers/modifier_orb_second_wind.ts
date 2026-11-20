// Второе дыхание (легендарная сфера): −50% получаемого урона на 4 с.
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_second_wind: unknown;
}

export class ModifierOrbSecondWind extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    IsDebuff() { return false; }
    GetTexture() { return "item_satanic"; }
    GetEffectName() { return "particles/items_fx/black_king_bar_avatar.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
    DeclareFunctions() {
        return [ModifierFunction.INCOMING_DAMAGE_PERCENTAGE];
    }
    GetModifierIncomingDamage_Percentage() { return -50; }
}
modifier_orb_second_wind = registerModifier("modifier_orb_second_wind", ModifierOrbSecondWind);
