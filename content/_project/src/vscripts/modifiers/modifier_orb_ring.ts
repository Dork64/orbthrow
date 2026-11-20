// Кольцо Повелителя: внутри снята невидимость (истинное зрение, как в Overthrow 3.0).
// Модификатор висит, пока герой в кольце, и сам снимается при выходе. Раньше его вешали
// заново каждую секунду на 1.2 с — значок и эффект над головой мигали без остановки.
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_ring: unknown;
}

export class ModifierOrbRing extends ModBase {
    radius = 900;

    IsHidden() { return false; }
    IsPurgable() { return false; }
    IsDebuff() { return false; }
    RemoveOnDeath() { return true; }
    GetTexture() { return "item_gem"; }
    GetPriority() { return ModifierPriority.SUPER_ULTRA; }
    CheckState(): Partial<Record<ModifierState, boolean>> {
        return { [ModifierState.INVISIBLE]: false };
    }

    OnCreated(params: { r?: number }) {
        if (!IsServer()) return;
        this.radius = params.r ?? 900;
        this.StartIntervalThink(0.2);
    }

    OnIntervalThink() {
        const o = this.GetParent().GetAbsOrigin();
        if (o.x * o.x + o.y * o.y > this.radius * this.radius) this.Destroy();
    }
}
modifier_orb_ring = registerModifier("modifier_orb_ring", ModifierOrbRing);
