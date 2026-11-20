// Предыгра: герой на базе, не может выйти и атаковать, чтобы все стартовали одновременно.
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_pregame: unknown;
}

export class ModifierOrbPregame extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    GetTexture() { return "item_ward_dispenser"; }
    CheckState(): Partial<Record<ModifierState, boolean>> {
        return {
            [ModifierState.ROOTED]: true,
            [ModifierState.DISARMED]: true,
            [ModifierState.INVULNERABLE]: true,
        };
    }
}
modifier_orb_pregame = registerModifier("modifier_orb_pregame", ModifierOrbPregame);
