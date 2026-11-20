// Игрок покинул партию: герой скрыт и выведен из игры, пока игрок не вернется.
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_left: unknown;
}

export class ModifierOrbLeft extends ModBase {
    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    OnCreated() {
        if (IsServer()) this.GetParent().AddNoDraw();
    }
    OnDestroy() {
        if (IsServer()) this.GetParent().RemoveNoDraw();
    }
    CheckState(): Partial<Record<ModifierState, boolean>> {
        return {
            [ModifierState.INVULNERABLE]: true,
            [ModifierState.OUT_OF_GAME]: true,
            [ModifierState.NO_HEALTH_BAR]: true,
            [ModifierState.UNSELECTABLE]: true,
            [ModifierState.NOT_ON_MINIMAP]: true,
            [ModifierState.STUNNED]: true,
            [ModifierState.NO_UNIT_COLLISION]: true,
        };
    }
}
modifier_orb_left = registerModifier("modifier_orb_left", ModifierOrbLeft);
