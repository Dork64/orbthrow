// Сфера Повелителя на земле: не цель, не мешает ходить, не получает урона.
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_sphere_unit: unknown;
}

export class ModifierOrbSphereUnit extends ModBase {
    IsHidden() { return true; }
    IsPurgable() { return false; }
    CheckState(): Partial<Record<ModifierState, boolean>> {
        return {
            [ModifierState.INVULNERABLE]: true,
            [ModifierState.NO_HEALTH_BAR]: true,
            [ModifierState.UNSELECTABLE]: true,
            [ModifierState.NO_UNIT_COLLISION]: true,
            [ModifierState.MAGIC_IMMUNE]: true,
            [ModifierState.UNTARGETABLE]: true,
        };
    }
}
modifier_orb_sphere_unit = registerModifier("modifier_orb_sphere_unit", ModifierOrbSphereUnit);
