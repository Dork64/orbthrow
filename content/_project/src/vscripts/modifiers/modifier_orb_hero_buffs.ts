// Видимые эффекты сфер-кода Axe и Juggernaut (баффы и дебаффы). Логика, которая их вешает, —
// в modifier_orb_hero.ts. Числа — из core/herocode.ts. Все классы этого файла привязаны
// к одному файлу (lib/links.ts): движок загружает файл и ищет глобальную переменную по имени.

import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { HERO_CODE } from "../core/herocode";

declare global {
    /* eslint-disable no-var */
    var modifier_orb_axe_iron_will: unknown;
    var modifier_orb_axe_lacerate: unknown;
    var modifier_orb_axe_spin: unknown;
    var modifier_orb_axe_hunt: unknown;
    var modifier_orb_axe_arena: unknown;
    var modifier_orb_axe_arena_buff: unknown;
    var modifier_orb_axe_free_cull: unknown;
    var modifier_orb_jugg_ward_armor: unknown;
    /* eslint-enable no-var */
}

const RANGE_FX = "particles/ui_mouseactions/range_display.vpcf";

/** Железная воля: сопротивление эффектам на время Вызова. */
export class ModifierOrbAxeIronWill extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return "axe_berserkers_call"; }
    DeclareFunctions() { return [ModifierFunction.STATUS_RESISTANCE_STACKING]; }
    OrbStatusResistance() { return HERO_CODE.ironWillStatus; }
    GetModifierStatusResistanceStacking() { return 0; }
}

/** Рваные раны: −1 брони за стак. */
export class ModifierOrbAxeLacerate extends ModBase {
    IsHidden() { return false; }
    IsDebuff() { return true; }
    IsPurgable() { return true; }
    GetTexture() { return "axe_counter_helix"; }
    DeclareFunctions() { return [ModifierFunction.PHYSICAL_ARMOR_BONUS]; }
    GetModifierPhysicalArmorBonus() { return -HERO_CODE.lacerateArmor * this.GetStackCount(); }
}

/** Раскрутка: скорость бега и атаки за стак. */
export class ModifierOrbAxeSpin extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return true; }
    GetTexture() { return "axe_counter_helix"; }
    DeclareFunctions() { return [ModifierFunction.MOVESPEED_BONUS_PERCENTAGE, ModifierFunction.ATTACKSPEED_BONUS_CONSTANT]; }
    GetModifierMoveSpeedBonus_Percentage() { return HERO_CODE.spinMs * this.GetStackCount(); }
    GetModifierAttackSpeedBonus_Constant() { return HERO_CODE.spinAs * this.GetStackCount(); }
}

/** Кровавая охота: броня и скорость за каждого врага под Голодом (стаки ставит modifier_orb_hero). */
export class ModifierOrbAxeHunt extends ModBase {
    IsHidden() { return this.GetStackCount() <= 0; }
    IsPurgable() { return false; }
    GetTexture() { return "axe_battle_hunger"; }
    DeclareFunctions() { return [ModifierFunction.PHYSICAL_ARMOR_BONUS, ModifierFunction.MOVESPEED_BONUS_PERCENTAGE]; }
    GetModifierPhysicalArmorBonus() { return HERO_CODE.huntArmor * this.GetStackCount(); }
    GetModifierMoveSpeedBonus_Percentage() { return HERO_CODE.huntMs * this.GetStackCount(); }
}

/**
 * Арена гладиатора (на невидимом «мыслителе»): враги, побывавшие внутри, не могут выйти пешком
 * (рывок дальше 300 за край — можно). Акс внутри получает бафф.
 */
export class ModifierOrbAxeArena extends ModBase {
    radius = HERO_CODE.arenaRadius;
    awake = 0;
    fx?: ParticleID;
    inside = new Set<EntityIndex>();

    IsHidden() { return true; }
    IsPurgable() { return false; }

    OnCreated(params: { awake?: number }) {
        if (!IsServer()) return;
        this.awake = params.awake ?? 0;
        this.inside = new Set();
        const p = this.GetParent();
        this.fx = ParticleManager.CreateParticle(RANGE_FX, ParticleAttachment.WORLDORIGIN, undefined);
        ParticleManager.SetParticleControl(this.fx, 0, p.GetAbsOrigin());
        ParticleManager.SetParticleControl(this.fx, 1, Vector(this.radius, 0, 0));
        ParticleManager.SetParticleControl(this.fx, 2, Vector(10, 0, 0));
        ParticleManager.SetParticleControl(this.fx, 3, Vector(100, 0, 0));
        ParticleManager.SetParticleControl(this.fx, 15, Vector(255, 80, 40));
        EmitSoundOn("Hero_Axe.Berserkers_Call", p);
        this.OnIntervalThink();
        this.StartIntervalThink(0.03);
    }

    OnIntervalThink() {
        const thinker = this.GetParent();
        const caster = this.GetCaster();
        if (caster === undefined || !IsValidEntity(caster)) return;
        const c = thinker.GetAbsOrigin();
        const r = this.radius;
        const units = FindUnitsInRadius(caster.GetTeamNumber(), c, undefined, r + 300, UnitTargetTeam.ENEMY,
            UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.MAGIC_IMMUNE_ENEMIES, FindOrder.ANY, false);
        for (const u of units) {
            if (!u.IsAlive()) continue;
            const o = u.GetAbsOrigin();
            const dx = o.x - c.x;
            const dy = o.y - c.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const id = u.entindex();
            if (d < r - 30) {
                this.inside.add(id);
                continue;
            }
            if (!this.inside.has(id) || d <= 0) continue;
            // Был внутри и дошел до края — возвращаем на край арены
            const k = (r - 40) / d;
            FindClearSpaceForUnit(u, Vector(c.x + dx * k, c.y + dy * k, o.z), false);
        }
        const o = caster.GetAbsOrigin();
        if (caster.IsAlive() && (o.x - c.x) * (o.x - c.x) + (o.y - c.y) * (o.y - c.y) <= r * r) {
            const m = caster.AddNewModifier(caster, this.GetAbility(), "modifier_orb_axe_arena_buff", { duration: 0.15 });
            if (m !== undefined) m.SetStackCount(this.awake > 0 ? 1 : 0);
        }
    }

    OnDestroy() {
        if (!IsServer()) return;
        if (this.fx !== undefined) {
            ParticleManager.DestroyParticle(this.fx, false);
            ParticleManager.ReleaseParticleIndex(this.fx);
        }
        UTIL_Remove(this.GetParent());
    }
}

/** Арена: броня Акса внутри; после Пробуждения (стак 1) — еще и урон. */
export class ModifierOrbAxeArenaBuff extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return "axe_berserkers_call"; }
    DeclareFunctions() { return [ModifierFunction.PHYSICAL_ARMOR_BONUS, ModifierFunction.TOTALDAMAGEOUTGOING_PERCENTAGE]; }
    GetModifierPhysicalArmorBonus() { return HERO_CODE.arenaArmor; }
    GetModifierTotalDamageOutgoing_Percentage() { return this.GetStackCount() > 0 ? HERO_CODE.arenaDamageAwake : 0; }
}

/** Палач: окно, в которое Culling Blade можно применить снова бесплатно и дальше. */
export class ModifierOrbAxeFreeCull extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return "axe_culling_blade"; }
    DeclareFunctions() { return [ModifierFunction.CAST_RANGE_BONUS_TARGET]; }
    GetModifierCastRangeBonusTarget(e: ModifierAbilityEvent): number {
        const a = e.ability;
        if (a === undefined || a.GetAbilityName() !== "axe_culling_blade") return 0;
        return HERO_CODE.executionerRange;
    }
}

/** Бродячий тотем: броня рядом с тотемом. */
export class ModifierOrbJuggWardArmor extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return "juggernaut_healing_ward"; }
    DeclareFunctions() { return [ModifierFunction.PHYSICAL_ARMOR_BONUS]; }
    GetModifierPhysicalArmorBonus() { return HERO_CODE.wardArmor; }
}

modifier_orb_axe_iron_will = registerModifier("modifier_orb_axe_iron_will", ModifierOrbAxeIronWill);
modifier_orb_axe_lacerate = registerModifier("modifier_orb_axe_lacerate", ModifierOrbAxeLacerate);
modifier_orb_axe_spin = registerModifier("modifier_orb_axe_spin", ModifierOrbAxeSpin);
modifier_orb_axe_hunt = registerModifier("modifier_orb_axe_hunt", ModifierOrbAxeHunt);
modifier_orb_axe_arena = registerModifier("modifier_orb_axe_arena", ModifierOrbAxeArena);
modifier_orb_axe_arena_buff = registerModifier("modifier_orb_axe_arena_buff", ModifierOrbAxeArenaBuff);
modifier_orb_axe_free_cull = registerModifier("modifier_orb_axe_free_cull", ModifierOrbAxeFreeCull);
modifier_orb_jugg_ward_armor = registerModifier("modifier_orb_jugg_ward_armor", ModifierOrbJuggWardArmor);
