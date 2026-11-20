// Защита возрождения: неуязвим, но не может атаковать, применять способности и предметы,
// пока не выйдет из круга вокруг своего фонтана (идея из Dota 1x6).

import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_spawn_protection: unknown;
}

export class ModifierOrbSpawnProtection extends ModBase {
    cx = 0;
    cy = 0;
    radius = 400;

    IsHidden() { return false; }
    IsPurgable() { return false; }
    IsDebuff() { return false; }
    RemoveOnDeath() { return true; }
    GetTexture() { return "item_glimmer_cape"; }

    OnCreated(params: { x?: number; y?: number; r?: number }) {
        if (!IsServer()) return;
        this.cx = params.x ?? 0;
        this.cy = params.y ?? 0;
        this.radius = params.r ?? 400;
        this.StartIntervalThink(0.1);
    }

    OnIntervalThink() {
        const o = this.GetParent().GetAbsOrigin();
        const dx = o.x - this.cx;
        const dy = o.y - this.cy;
        if (dx * dx + dy * dy > this.radius * this.radius) this.Destroy();
    }

    CheckState(): Partial<Record<ModifierState, boolean>> {
        return {
            [ModifierState.INVULNERABLE]: true,
            [ModifierState.DISARMED]: true,
            [ModifierState.SILENCED]: true,
            [ModifierState.MUTED]: true,
        };
    }

    GetStatusEffectName() { return "particles/status_fx/status_effect_dark_willow_shadow_realm.vpcf"; }
    StatusEffectPriority() { return ModifierPriority.SUPER_ULTRA; }
}
modifier_orb_spawn_protection = registerModifier("modifier_orb_spawn_protection", ModifierOrbSpawnProtection);
