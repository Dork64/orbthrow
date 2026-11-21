// Расходники из слотов (просьба автора 31.10, как в 1x6 — своя реализация):
// - modifier_orb_ward — на юните варда: невидим, получает только «удары» (герой — 4, остальные — 1,
//   всего 8), у сентри — аура истинного зрения;
// - modifier_orb_smoke — дым: невидимость и +15% скорости; рассеивается рядом с врагом или при атаке;
// - modifier_orb_dust — пыль на враге: снимает невидимость и замедляет невидимых.
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    /* eslint-disable no-var */
    var modifier_orb_ward: unknown;
    var modifier_orb_smoke: unknown;
    var modifier_orb_dust: unknown;
    /* eslint-enable no-var */
}

const WARD_HITS = 8;
const HERO_HIT = 4;
export const SMOKE_BREAK_RADIUS = 1025;

export class ModifierOrbWard extends ModBase {
    sentry = false;
    radius = 1050;
    left = WARD_HITS;

    IsHidden() { return true; }
    IsPurgable() { return false; }
    // Сентри: аура истинного зрения на врагов вокруг
    IsAura() { return this.sentry; }
    GetAuraRadius() { return this.radius; }
    GetModifierAura() { return "modifier_truesight"; }
    GetAuraSearchTeam() { return UnitTargetTeam.ENEMY; }
    GetAuraSearchType() { return UnitTargetType.ALL; }
    GetAuraSearchFlags() { return UnitTargetFlags.INVULNERABLE + UnitTargetFlags.MAGIC_IMMUNE_ENEMIES; }
    GetAuraDuration() { return 0.1; }

    OnCreated(p: { sentry?: number; radius?: number }) {
        this.sentry = (p.sentry ?? 0) === 1;
        this.radius = p.radius ?? 1050;
        this.left = WARD_HITS;
    }

    CheckState(): Partial<Record<ModifierState, boolean>> {
        return {
            [ModifierState.INVISIBLE]: true,
            [ModifierState.NO_UNIT_COLLISION]: true,
        };
    }

    DeclareFunctions() {
        return [
            ModifierFunction.ABSOLUTE_NO_DAMAGE_MAGICAL,
            ModifierFunction.ABSOLUTE_NO_DAMAGE_PHYSICAL,
            ModifierFunction.ABSOLUTE_NO_DAMAGE_PURE,
            ModifierFunction.HEALTHBAR_PIPS,
            ModifierFunction.ON_ATTACK_LANDED,
        ];
    }

    GetAbsoluteNoDamageMagical(): 0 | 1 { return 1; }
    GetAbsoluteNoDamagePhysical(): 0 | 1 { return 1; }
    GetAbsoluteNoDamagePure(): 0 | 1 { return 1; }
    GetModifierHealthBarPips() { return WARD_HITS / HERO_HIT; }

    OnAttackLanded(e: ModifierAttackEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.target !== parent) return;
        const attacker = e.attacker;
        if (attacker === undefined || !IsValidEntity(attacker)) return;
        this.left -= attacker.IsRealHero() ? HERO_HIT : 1;
        if (this.left <= 0) {
            parent.Kill(undefined, attacker);
            return;
        }
        parent.SetHealth(Math.max(1, Math.floor(parent.GetMaxHealth() * this.left / WARD_HITS)));
    }
}

export class ModifierOrbSmoke extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return true; }
    IsDebuff() { return false; }
    GetTexture() { return "item_smoke_of_deceit"; }
    GetEffectName() { return "particles/items2_fx/smoke_of_deceit_buff.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }

    OnCreated() {
        if (IsServer()) this.StartIntervalThink(0.2);
    }

    CheckState(): Partial<Record<ModifierState, boolean>> {
        return {
            [ModifierState.INVISIBLE]: true,
            [ModifierState.NOT_ON_MINIMAP_FOR_ENEMIES]: true,
        };
    }

    DeclareFunctions() {
        return [
            ModifierFunction.MOVESPEED_BONUS_PERCENTAGE,
            ModifierFunction.INVISIBILITY_LEVEL,
            ModifierFunction.ON_ATTACK,
        ];
    }

    GetModifierMoveSpeedBonus_Percentage() { return 15; }
    GetModifierInvisibilityLevel() { return 1; }

    private dissipate() {
        const parent = this.GetParent();
        EmitSoundOn("DOTA_Item.SmokeOfDeceit.Activate", parent);
        this.Destroy();
    }

    OnIntervalThink() {
        const parent = this.GetParent();
        const enemies = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, SMOKE_BREAK_RADIUS,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.INVULNERABLE + UnitTargetFlags.MAGIC_IMMUNE_ENEMIES +
            UnitTargetFlags.NOT_ILLUSIONS, FindOrder.ANY, false);
        for (const u of enemies) {
            if (u.IsRealHero() && u.IsAlive()) {
                this.dissipate();
                return;
            }
        }
    }

    OnAttack(e: ModifierAttackEvent) {
        if (!IsServer()) return;
        if (e.attacker === this.GetParent()) this.dissipate();
    }
}

export class ModifierOrbDust extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return true; }
    IsDebuff() { return true; }
    GetTexture() { return "item_dust"; }
    GetPriority() { return ModifierPriority.SUPER_ULTRA; }
    GetEffectName() { return "particles/items2_fx/true_sight_debuff.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.OVERHEAD_FOLLOW; }

    CheckState(): Partial<Record<ModifierState, boolean>> {
        return { [ModifierState.INVISIBLE]: false };
    }

    DeclareFunctions() { return [ModifierFunction.MOVESPEED_BONUS_PERCENTAGE]; }

    GetModifierMoveSpeedBonus_Percentage() {
        // Замедляет только тех, кто пытается быть невидимым (как пыль в Доте)
        const parent = this.GetParent();
        return parent.HasModifier("modifier_orb_smoke") || parent.HasModifier("modifier_item_invisibility_edge_windwalk") ||
            parent.HasModifier("modifier_item_silver_edge_windwalk") || parent.HasModifier("modifier_item_glimmer_cape_fade") ? -20 : 0;
    }
}

modifier_orb_ward = registerModifier("modifier_orb_ward", ModifierOrbWard);
modifier_orb_smoke = registerModifier("modifier_orb_smoke", ModifierOrbSmoke);
modifier_orb_dust = registerModifier("modifier_orb_dust", ModifierOrbDust);
