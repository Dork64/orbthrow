// Контроллер сфер: один постоянный модификатор на герое (и его иллюзиях).
// Все бонусы берутся из стаков игрока (OrbStore), поэтому смерть, переподключение
// и иллюзии ничего не теряют. Синие сферы подменяют значения способностей
// (OVERRIDE_ABILITY_SPECIAL) — подсказки у клиента показывают новые числа.
// Здесь же эффекты фиолетовых и легендарных сфер-кода (общий набор, HEROES.md 3.1-3.2).
// Зависит только от core и lib: файл загружается и на клиенте.

import { boundedOrbCooldown } from "../core/combatpatterns";
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusAbilityCharges, bonusesOf, OrbBonuses, overrideValue, nativeChargeCount, replacesWrathDamage } from "../core/orbstore";
import { diminishing, orbStatusResistance } from "../core/orbs";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_controller: unknown;
}

const ULTIMATE = 1; // ABILITY_TYPE_ULTIMATE
const BURN_RADIUS = 350;
const BURN_INTERVAL = 0.5;
const CLEAVE_PARTICLE = "particles/items_fx/battlefury_cleave.vpcf";
const BURN_PARTICLE = "particles/items2_fx/radiance_owner.vpcf";
const METEOR_PARTICLE = "particles/units/heroes/hero_lina/lina_spell_light_strike_array.vpcf";

export class ModifierOrbController extends ModBase {
    // Состояние эффектов (только на сервере)
    lastHurtAt = -100;
    shieldReadyAt = 0;
    secondWindReadyAt = 0;
    burnFx?: ParticleID;
    graveReadyAt = 0;
    meteorReadyAt = 0;

    IsHidden() { return true; }
    IsPurgable() { return false; }
    IsPermanent() { return true; }
    RemoveOnDeath() { return false; }
    AllowIllusionDuplicate() { return true; }
    GetAttributes() { return ModifierAttribute.PERMANENT + ModifierAttribute.IGNORE_INVULNERABLE; }

    private b(): OrbBonuses {
        const parent = this.GetParent();
        return bonusesOf(parent.GetPlayerOwnerID(), IsServer(), GameRules.GetGameTime());
    }

    OnCreated() {
        if (!IsServer()) return;
        this.lastHurtAt = -100;
        this.shieldReadyAt = 0;
        this.secondWindReadyAt = 0;
        this.StartIntervalThink(BURN_INTERVAL);
    }

    OnDestroy() {
        if (IsServer() && this.burnFx !== undefined) {
            ParticleManager.DestroyParticle(this.burnFx, false);
            ParticleManager.ReleaseParticleIndex(this.burnFx);
            this.burnFx = undefined;
        }
    }

    DeclareFunctions() {
        return [
            ModifierFunction.HEALTH_BONUS,
            ModifierFunction.PREATTACK_BONUS_DAMAGE,
            ModifierFunction.PHYSICAL_ARMOR_BONUS,
            ModifierFunction.ATTACKSPEED_BONUS_CONSTANT,
            ModifierFunction.SPELL_AMPLIFY_PERCENTAGE,
            ModifierFunction.MAGICAL_RESISTANCE_BONUS,
            ModifierFunction.MOVESPEED_BONUS_CONSTANT,
            ModifierFunction.HEALTH_REGEN_CONSTANT,
            ModifierFunction.MANA_BONUS,
            ModifierFunction.MANA_REGEN_CONSTANT,
            ModifierFunction.STATS_STRENGTH_BONUS,
            ModifierFunction.STATS_AGILITY_BONUS,
            ModifierFunction.STATS_INTELLECT_BONUS,
            ModifierFunction.COOLDOWN_PERCENTAGE_STACKING,
            ModifierFunction.STATUS_RESISTANCE_STACKING,
            ModifierFunction.SLOW_RESISTANCE_STACKING,
            ModifierFunction.ON_TAKEDAMAGE,
            ModifierFunction.OVERRIDE_ABILITY_SPECIAL,
            ModifierFunction.OVERRIDE_ABILITY_SPECIAL_VALUE,
            ModifierFunction.PREATTACK_CRITICALSTRIKE,
            ModifierFunction.ON_ATTACK_LANDED,
            ModifierFunction.TOTALDAMAGEOUTGOING_PERCENTAGE,
            ModifierFunction.ON_ABILITY_FULLY_CAST,
            ModifierFunction.MIN_HEALTH,
        ];
    }

    GetModifierHealthBonus() { return this.b().health; }
    GetModifierPreAttack_BonusDamage() { return this.b().damage; }
    GetModifierPhysicalArmorBonus() { return this.b().armor; }
    GetModifierAttackSpeedBonus_Constant() { return this.b().attackSpeed; }
    GetModifierSpellAmplify_Percentage() { return this.b().spellAmp; }
    GetModifierMagicalResistanceBonus() { return this.b().magicResist; }
    GetModifierMoveSpeedBonus_Constant() { return this.b().moveSpeed; }
    GetModifierConstantHealthRegen() { return this.b().hpRegen; }
    GetModifierManaBonus() { return this.b().mana; }
    GetModifierConstantManaRegen() { return this.b().manaRegen; }
    GetModifierBonusStats_Strength() { return this.b().str; }
    GetModifierBonusStats_Agility() { return this.b().agi; }
    GetModifierBonusStats_Intellect() { return this.b().int; }
    // Общие фиолетовые берутся сколько угодно раз: значения растут со стаками (с убыванием)
    // Все положительные источники от сфер складываются умножением в одном месте.
    GetModifierStatusResistanceStacking() {
        const b = this.b();
        const sources: number[] = [];
        for (const mod of this.GetParent().FindAllModifiers()) {
            const source = mod as CDOTA_Buff & { OrbStatusResistance?: () => number };
            if (source.OrbStatusResistance !== undefined) sources.push(source.OrbStatusResistance());
        }
        return orbStatusResistance(b.status, b.code["p_unstoppable"] ?? 0, sources);
    }
    GetModifierSlowResistance_Stacking(): number {
        return diminishing(this.b().code["p_unstoppable"] ?? 0, 15, 35);
    }

    /** Первые три способности героя (для «Мастера способностей»). */
    private isBasicAbility(ability: CDOTABaseAbility): boolean {
        if (ability.IsItem() || ability.GetAbilityType() === ULTIMATE) return false;
        const parent = this.GetParent();
        for (let i = 0; i < 3; i++) {
            const a = parent.GetAbilityByIndex(i);
            if (a !== undefined && a === ability) return true;
        }
        return false;
    }

    /** Перезарядка: серая, синие, легендарки — вместе умножением. */
    GetModifierPercentageCooldownStacking(e?: ModifierAbilityEvent): number {
        const ability = e?.ability;
        if (ability === undefined || ability.IsItem()) return 0;
        const b = this.b();
        let keep = (100 - b.cdr) / 100;
        keep *= (100 - (b.abilityCdr[ability.GetAbilityName()] ?? 0)) / 100;
        if ((b.code["l_master"] ?? 0) > 0 && this.isBasicAbility(ability)) keep *= b.awake ? 0.65 : 0.75;
        if ((b.code["l_double_ult"] ?? 0) > 0 && b.awake && ability.GetAbilityType() === ULTIMATE) keep *= 0.8;
        return boundedOrbCooldown(ability.GetAbilityName(), 100 - keep * 100);
    }

    GetModifierOverrideAbilitySpecial(e: ModifierOverrideAbilitySpecialEvent): 0 | 1 {
        const ability = e.ability;
        if (ability === undefined) return 0;
        const b = this.b();
        const name = ability.GetAbilityName();
        const k = e.ability_special_value;
        if (replacesWrathDamage(b, name, k)) return 1;
        if (k === "AbilityCharges" || k === "AbilityCooldown" || k === "AbilityChargeRestoreTime") {
            const extra = ability.IsPassive() ? 0 : bonusAbilityCharges(b, name, ability.GetAbilityType() === ULTIMATE);
            if (extra > 0) {
                if (k === "AbilityCharges") return 1;
                if (ability.GetLevelSpecialValueNoOverride("AbilityCharges", e.ability_special_level) <= 0 &&
                    (k === "AbilityCooldown" || ability.GetCooldownTimeRemaining() > 0)) return 1;
            }
        }
        if (b.specials[name]?.[k] !== undefined || b.specialsSet[name]?.[k] !== undefined || b.specialsMul[name]?.[k] !== undefined) return 1;
        return 0;
    }

    GetModifierOverrideAbilitySpecialValue(e: ModifierOverrideAbilitySpecialEvent): number {
        const ability = e.ability;
        const base = ability.GetLevelSpecialValueNoOverride(e.ability_special_value, e.ability_special_level);
        const b = this.b();
        const key = e.ability_special_value;
        if (IsServer() && replacesWrathDamage(b, ability.GetAbilityName(), key)) return 0;
        if (key === "AbilityCharges" || key === "AbilityCooldown" || key === "AbilityChargeRestoreTime") {
            const extra = ability.IsPassive() ? 0 : bonusAbilityCharges(b, ability.GetAbilityName(), ability.GetAbilityType() === ULTIMATE);
            if (extra > 0) {
                if (key === "AbilityCharges") return nativeChargeCount(base, extra);
                if (ability.GetLevelSpecialValueNoOverride("AbilityCharges", e.ability_special_level) <= 0) {
                    if (key === "AbilityCooldown") return 0;
                    const remaining = ability.GetCooldownTimeRemaining();
                    if (remaining > 0) return remaining;
                }
            }
        }
        const v = overrideValue(b, ability.GetAbilityName(), e.ability_special_value, base);
        return v !== undefined ? v : base;
    }

    /** Критический удар (фиолетовая): 20% шанс, 200% / 250%. */
    GetModifierPreAttack_CriticalStrike(e: ModifierAttackEvent): number {
        if (!IsServer()) return 0;
        // Эффекты-код фиолетовых и легендарок на иллюзиях не работают (DESIGN 12.1.11)
        if (this.GetParent().IsIllusion()) return 0;
        const n = this.b().code["p_crit"] ?? 0;
        if (n <= 0 || e.target === undefined || e.target.IsBuilding()) return 0;
        if (!RollPseudoRandomPercentage(20, PseudoRandom.CUSTOM_GAME_1, this.GetParent())) return 0;
        return Math.min(450, 150 + 50 * n);
    }

    /** Раскол / Рикошет (фиолетовая). */
    OnAttackLanded(e: ModifierAttackEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.attacker !== parent || parent.IsIllusion()) return;
        const n = this.b().code["p_cleave"] ?? 0;
        const target = e.target;
        if (n <= 0 || target === undefined || !IsValidEntity(target) || target.IsBuilding() || target.GetTeamNumber() === parent.GetTeamNumber()) return;
        if (!parent.IsRangedAttacker()) {
            DoCleaveAttack(parent, target, undefined, e.damage * 0.4 * n, 150, 360, 650, CLEAVE_PARTICLE);
            return;
        }
        const others = FindUnitsInRadius(parent.GetTeamNumber(), target.GetAbsOrigin(), undefined, 450,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
        let hits = 0;
        for (const u of others) {
            if (hits >= n) break;
            if (u === target || !u.IsAlive()) continue;
            ApplyDamage({ victim: u, attacker: parent, damage: e.damage * 0.5, damage_type: DamageTypes.PHYSICAL, damage_flags: DamageFlag.NO_SPELL_AMPLIFICATION });
            hits++;
        }
    }

    /** Палач и Мастер способностей — дополнительный урон. */
    GetModifierTotalDamageOutgoing_Percentage(e: ModifierAttackEvent): number {
        if (this.GetParent().IsIllusion()) return 0;
        const b = this.b();
        let pct = 0;
        const target = e.target;
        if ((b.code["p_executioner"] ?? 0) > 0 && target !== undefined && target.IsHero() && target.GetHealthPercent() < 30) pct += 20 * (b.code["p_executioner"] ?? 0);
        const inflictor = e.inflictor;
        if (inflictor !== undefined && !inflictor.IsItem()) {
            if ((b.code["l_master"] ?? 0) > 0 && this.isBasicAbility(inflictor)) pct += b.awake ? 30 : 20;
    
        }
        return pct;
    }

    /** Неупокоенный: пока готов — здоровье не падает ниже 1 (срабатывание — в OnTakeDamage). */
    GetMinHealth(): number {
        if (!IsServer() || this.GetParent().IsIllusion()) return 0;
        if ((this.b().code["p_grave"] ?? 0) <= 0) return 0;
        return GameRules.GetGameTime() >= this.graveReadyAt ? 1 : 0;
    }

    /** Метеор: способность с перезарядкой от 3 с роняет метеор в точку или цель. */
    private meteor(ability: CDOTABaseAbility, n: number) {
        const parent = this.parent();
        const now = GameRules.GetGameTime();
        if (now < this.meteorReadyAt) return;
        const level = Math.max(0, ability.GetLevel() - 1);
        const cooldown = ability.GetMaxAbilityCharges(level) > 0 ? ability.GetAbilityChargeRestoreTime(level) : ability.GetCooldown(level);
        if (cooldown < 3) return;
        this.meteorReadyAt = now + 3;
        const t = ability.GetCursorTarget();
        const pos = t !== undefined && IsValidEntity(t) && t !== parent ? t.GetAbsOrigin() : ability.GetCursorPosition();
        const pointCast = (Number(ability.GetBehavior()) & AbilityBehavior.POINT) !== 0;
        const far = ((pos - parent.GetAbsOrigin()) as Vector).Length2D() > 2500;
        const center = (t === undefined || t === parent) && (!pointCast || far) ? parent.GetAbsOrigin() : pos;
        const minute = Math.max(0, GameRules.GetDOTATime(false, false) / 60);
        const dmg = (60 + 6 * minute) * (1 + 0.5 * (n - 1));
        parent.SetContextThink("orb_meteor", () => {
            if (!IsValidEntity(parent)) return undefined;
            const fx = ParticleManager.CreateParticle(METEOR_PARTICLE, ParticleAttachment.WORLDORIGIN, undefined);
            ParticleManager.SetParticleControl(fx, 0, center);
            ParticleManager.SetParticleControl(fx, 1, Vector(275, 275, 275));
            ParticleManager.ReleaseParticleIndex(fx);
            StartSoundEventFromPosition("Ability.LightStrikeArray", center);
            const enemies = FindUnitsInRadius(parent.GetTeamNumber(), center, undefined, 275, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
            for (const u of enemies) {
                if (!u.IsAlive()) continue;
                ApplyDamage({ victim: u, attacker: parent, damage: dmg, damage_type: DamageTypes.MAGICAL });
                u.AddNewModifier(parent, undefined, "modifier_stunned", { duration: 0.4 });
            }
            return undefined;
        }, 0.7);
    }

    private parent(): CDOTA_BaseNPC {
        return this.GetParent();
    }

    /** События применения: Метеор и Исчезновение; заряды восстанавливает движок. */
    OnAbilityFullyCast(e: ModifierAbilityEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.unit !== parent || parent.IsIllusion()) return;
        const ability = e.ability;
        if (ability === undefined || ability.IsItem()) return;
        const meteors = this.b().code["p_meteor"] ?? 0;
        if (meteors > 0) this.meteor(ability, meteors);
        if (ability.GetAbilityType() !== ULTIMATE) return;
        // Исчезновение: невидимость и скорость после ультимейта
        const vanish = this.b().code["p_vanish"] ?? 0;
        if (vanish > 0) {
            const dur = 2.5 + (vanish - 1);
            parent.AddNewModifier(parent, undefined, "modifier_invisible", { duration: dur });
            parent.AddNewModifier(parent, undefined, "modifier_orb_vanish_speed", { duration: dur });
            EmitSoundOn("DOTA_Item.InvisibilitySword.Activate", parent);
        }

    }

    OnTakeDamage(e: ModifierInstanceEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        // Событие общее для всего урона в игре: сначала дешевая проверка, касается ли оно нас
        if (e.attacker !== parent && e.unit !== parent) return;
        if (parent.IsIllusion()) return;
        const b = this.b();
        const now = GameRules.GetGameTime();
        // Урон по врагам: вампиризм (серая) и Кровопийца (фиолетовая, только по героям)
        if (e.attacker === parent && e.damage > 0) {
            const unit = e.unit;
            if (unit === undefined || unit.GetTeamNumber() === parent.GetTeamNumber() || unit.IsBuilding()) return;
            const flags = e.damage_flags;
            if ((flags & DamageFlag.REFLECTION) !== 0 || (flags & DamageFlag.HPLOSS) !== 0) return;
            const spell = e.inflictor !== undefined;
            if (!parent.IsAlive() || (spell && (flags & DamageFlag.NO_SPELL_LIFESTEAL) !== 0)) return;
            let pct = b.lifesteal;
            if (unit.IsHero()) pct += 12 * (b.code["p_bloodsucker"] ?? 0);
            if (pct > 0)
                parent.HealWithParams(e.damage * pct / 100, e.inflictor as CDOTABaseAbility, true, true, parent, spell);
            return;
        }
        // Урон по нам: Щит битвы и Второе дыхание
        if (e.unit !== parent || parent.IsIllusion()) return;
        const attacker = e.attacker;
        const fromHero = attacker !== undefined && attacker.GetTeamNumber() !== parent.GetTeamNumber() &&
            attacker.GetPlayerOwnerID() >= 0;
        if ((b.code["p_battle_shield"] ?? 0) > 0 && fromHero && now - this.lastHurtAt >= 8 && now >= this.shieldReadyAt && parent.IsAlive()) {
            this.shieldReadyAt = now + 15;
            const share = Math.min(0.6, 0.2 * (b.code["p_battle_shield"] ?? 1));
            parent.AddNewModifier(parent, undefined, "modifier_orb_battle_shield", { duration: 5, amount: Math.floor(parent.GetMaxHealth() * share) });
        }
        this.lastHurtAt = now;
        // Неупокоенный: урон, который убил бы, оставил 1 здоровья (GetMinHealth)
        const graves = b.code["p_grave"] ?? 0;
        if (graves > 0 && parent.IsAlive() && parent.GetHealth() <= 1 && now >= this.graveReadyAt) {
            this.graveReadyAt = now + Math.max(30, 90 - 20 * (graves - 1));
            parent.AddNewModifier(parent, undefined, "modifier_invulnerable", { duration: 1.5 });
            parent.Heal(parent.GetMaxHealth() * 0.25, undefined);
            EmitSoundOn("Hero_Dazzle.Shallow_Grave", parent);
        }
        if ((b.code["l_second_wind"] ?? 0) > 0 && parent.IsAlive() && parent.GetHealthPercent() < 25 && now >= this.secondWindReadyAt) {
            this.secondWindReadyAt = now + (b.awake ? 40 : 60);
            parent.Heal(parent.GetMaxHealth() * 0.4, undefined);
            parent.AddNewModifier(parent, undefined, "modifier_orb_second_wind", { duration: 4 });
        }
    }

    /** Каждые 0.5 с: Сжигающая аура. */
    OnIntervalThink() {
        if (!IsServer()) return;
        const parent = this.GetParent();
        const b = this.b();
        const now = GameRules.GetGameTime();
        const n = parent.IsIllusion() ? 0 : (b.code["p_burn_aura"] ?? 0);
        if (n > 0 && this.burnFx === undefined) {
            this.burnFx = ParticleManager.CreateParticle(BURN_PARTICLE, ParticleAttachment.ABSORIGIN_FOLLOW, parent);
        }
        if (n <= 0 || !parent.IsAlive()) return;
        const minute = Math.max(0, GameRules.GetDOTATime(false, false) / 60);
        const dps = (40 + 3 * minute) * n;
        const enemies = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, BURN_RADIUS,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
        for (const u of enemies) {
            if (!u.IsAlive()) continue;
            ApplyDamage({ victim: u, attacker: parent, damage: dps * BURN_INTERVAL, damage_type: DamageTypes.MAGICAL });
        }
    }
}

modifier_orb_controller = registerModifier("modifier_orb_controller", ModifierOrbController);
