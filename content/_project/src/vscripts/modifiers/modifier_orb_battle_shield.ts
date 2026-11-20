// Щит битвы (фиолетовая сфера): поглощает урон, пока не кончится запас или время.
// Запас хранится в числе стаков — так клиент видит полоску щита над здоровьем.
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_battle_shield: unknown;
}

export class ModifierOrbBattleShield extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    IsDebuff() { return false; }
    GetTexture() { return "item_aeon_disk"; }
    GetEffectName() { return "particles/items2_fx/vindicators_axe_armor.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }

    OnCreated(params: { amount?: number }) {
        if (IsServer()) this.SetStackCount(Math.max(1, Math.floor(params.amount ?? 1)));
    }

    DeclareFunctions() {
        return [ModifierFunction.INCOMING_DAMAGE_CONSTANT];
    }

    GetModifierIncomingDamageConstant(e: ModifierAttackEvent): number {
        if (!IsServer()) return this.GetStackCount();
        const left = this.GetStackCount();
        const absorb = Math.min(left, e.damage);
        if (absorb >= left) this.Destroy();
        else this.SetStackCount(left - Math.floor(absorb));
        return -absorb;
    }
}
modifier_orb_battle_shield = registerModifier("modifier_orb_battle_shield", ModifierOrbBattleShield);
