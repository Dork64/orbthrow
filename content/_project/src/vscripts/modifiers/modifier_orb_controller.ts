import type { OgreMagiLegends } from "../modifiers/modifier_orb_ogre_magi_legend";
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
    private orbCriticals?: Map<number, { target: CDOTA_BaseNPC; bonus: number }>;

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
            ModifierFunction.STATUS_RESISTANCE_STACKING,
            ModifierFunction.SLOW_RESISTANCE_STACKING,
            ModifierFunction.ON_TAKEDAMAGE,
            ModifierFunction.OVERRIDE_ABILITY_SPECIAL,
            ModifierFunction.OVERRIDE_ABILITY_SPECIAL_VALUE,
            ModifierFunction.ON_ATTACK_RECORD,
            ModifierFunction.ON_ATTACK_RECORD_DESTROY,
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
        const parent = this.GetParent();
        const modifiers = typeof parent.FindAllModifiers === "function" ? parent.FindAllModifiers() : [];
        for (const mod of modifiers) {
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
        if (this.isItem(ability) || this.isUltimate(ability)) return false;
        const parent = this.GetParent();
        if (typeof parent.GetAbilityByIndex !== "function") return false;
        for (let i = 0; i < 3; i++) {
            const a = parent.GetAbilityByIndex(i);
            if (a !== undefined && a === ability) return true;
        }
        return false;
    }

    private isItem(ability: CDOTABaseAbility): boolean {
        return typeof ability.IsItem === "function" ? ability.IsItem() : ability.GetAbilityName().startsWith("item_");
    }

    private isUltimate(ability: CDOTABaseAbility): boolean {
        return typeof ability.GetAbilityType === "function" && ability.GetAbilityType() === ULTIMATE;
    }

    /** Сферы меняют базовое время способности. Процент предметов движок применяет к нему отдельно. */
    private orbCooldownFactor(b: OrbBonuses, ability: CDOTABaseAbility, name: string): number {
        if (this.isItem(ability)) return 1;
        let keep = (1 - b.cdr / 100) * (1 - (b.abilityCdr[name] ?? 0) / 100);
        if ((b.code["l_master"] ?? 0) > 0 && this.isBasicAbility(ability)) keep *= b.awake ? 0.65 : 0.75;
        if (b.awake && (b.code["l_double_ult"] ?? 0) > 0 && this.isUltimate(ability)) keep *= 0.8;
        return 1 - boundedOrbCooldown(name, 100 - keep * 100) / 100;
    }

    private extraCharges(b: OrbBonuses, ability: CDOTABaseAbility, name: string): number {
        if (typeof ability.IsPassive === "function" && ability.IsPassive()) return 0;
        return bonusAbilityCharges(b, name, this.isUltimate(ability));
    }

    private scriptedMulticastFloor(name: string, key: string, b: OrbBonuses): number | undefined {
        if (!IsServer() || name !== "ogre_magi_multicast" || (b.code["ogre_l_multicast"] ?? 0) === 0 ||
            (key !== "multicast_2_times" && key !== "multicast_3_times" && key !== "multicast_4_times")) return undefined;
        const ogre = this.GetParent().FindModifierByName("modifier_orb_ogre_magi_legend") as OgreMagiLegends | undefined;
        return ogre?.GetMulticastChanceFloor(key);
    }

    private usesMovingFissure(name: string, key: string, b: OrbBonuses): boolean {
        return name === "earthshaker_fissure" && key === "fissure_duration" &&
            (b.code["es_l_rift"] ?? 0) > 0 && IsServer() && this.GetParent().HasModifier("modifier_orb_earthshaker_legend");
    }

    GetModifierOverrideAbilitySpecial(e: ModifierOverrideAbilitySpecialEvent): 0 | 1 {
        const ability = e.ability;
        if (ability === undefined) return 0;
        const b = this.b();
        const name = ability.GetAbilityName(), key = e.ability_special_value;
        if (name === "necrolyte_heartstopper_aura" && key === "aura_radius" && this.GetParent().HasModifier("modifier_orb_necro_beacon")) return 1;
        if (this.usesMovingFissure(name, key, b) || this.scriptedMulticastFloor(name, key, b) !== undefined) return 1;
        if (replacesWrathDamage(b, name, key)) return 1;
        if (key === "AbilityCharges" || key === "AbilityCooldown" || key === "AbilityChargeRestoreTime") {
            const extra = this.extraCharges(b, ability, name);
            if (key === "AbilityCharges" && extra > 0) return 1;
            if (key === "AbilityCooldown" && extra > 0 &&
                ability.GetLevelSpecialValueNoOverride("AbilityCharges", e.ability_special_level) <= 0) return 1;
            if (key !== "AbilityCharges" && this.orbCooldownFactor(b, ability, name) < 1) return 1;
        }
        if (b.specials[name]?.[key] !== undefined || b.specialsSet[name]?.[key] !== undefined || b.specialsMul[name]?.[key] !== undefined) return 1;
        return 0;
    }

    GetModifierOverrideAbilitySpecialValue(e: ModifierOverrideAbilitySpecialEvent): number {
        const ability = e.ability, key = e.ability_special_value, level = e.ability_special_level;
        const name = ability.GetAbilityName(), b = this.b();
        const base = ability.GetLevelSpecialValueNoOverride(key, level);
        if (name === "necrolyte_heartstopper_aura" && key === "aura_radius" && this.GetParent().HasModifier("modifier_orb_necro_beacon")) return 0;
        if (this.usesMovingFissure(name, key, b)) return 0.03;
        if (IsServer() && replacesWrathDamage(b, name, key)) return 0;
        if (key === "AbilityCharges") {
            const extra = this.extraCharges(b, ability, name);
            if (extra > 0) return nativeChargeCount(base, extra);
        } else if (key === "AbilityCooldown" && this.extraCharges(b, ability, name) > 0 &&
            ability.GetLevelSpecialValueNoOverride("AbilityCharges", level) <= 0) return 0;
        const adjusted = overrideValue(b, name, key, base) ?? base;
        if (key === "AbilityCooldown" || key === "AbilityChargeRestoreTime")
            return adjusted * this.orbCooldownFactor(b, ability, name);
        const floor = this.scriptedMulticastFloor(name, key, b);
        return floor === undefined ? adjusted : Math.max(adjusted, floor);
    }

    /** Отдельный бросок на атаку, чтобы слоты штатных критов и крита сферы не конкурировали. */
    OnAttackRecord(e: ModifierAttackEvent) {
        const parent = this.GetParent(), target = e.target;
        if (!IsServer() || e.attacker !== parent || parent.IsIllusion() || e.record === undefined || e.no_attack_cooldown ||
            target === undefined || target.IsBuilding() || target.IsWard() ||
            target.GetTeamNumber() === parent.GetTeamNumber()) return;
        const n = this.b().code["p_crit"] ?? 0;
        if (n <= 0 || !RollPseudoRandomPercentage(20, PseudoRandom.CUSTOM_GAME_1, parent)) return;
        this.orbCriticals ??= new Map();
        this.orbCriticals.set(e.record, { target, bonus: Math.min(350, 50 + 50 * n) });
    }

    OnAttackRecordDestroy(e: ModifierAttackEvent) {
        if (IsServer() && e.attacker === this.GetParent()) this.orbCriticals?.delete(e.record);
    }

    /** Раскол / Рикошет (фиолетовая). */
    OnAttackLanded(e: ModifierAttackEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.attacker !== parent || parent.IsIllusion()) return;
        const target = e.target;
        if (e.damage > 0 && target !== undefined && this.orbCriticals?.get(e.record)?.target === target && IsValidEntity(target))
            SendOverheadEventMessage(undefined, OverheadAlert.CRITICAL, target, Math.round(e.damage), undefined);
        const n = this.b().code["p_cleave"] ?? 0;
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
        const target = e?.target;
        if ((b.code["p_executioner"] ?? 0) > 0 && target !== undefined && target.IsHero() && target.GetHealthPercent() < 30) pct += 20 * (b.code["p_executioner"] ?? 0);
        const inflictor = e?.inflictor;
        if (inflictor !== undefined && (b.code["l_master"] ?? 0) > 0 && this.isBasicAbility(inflictor)) pct += b.awake ? 30 : 20;
        const crit = IsServer() && e?.attacker === this.GetParent() && e.damage_category === DamageCategory.ATTACK &&
            inflictor === undefined && e.record !== undefined ? this.orbCriticals?.get(e.record) : undefined;
        const bonus = crit !== undefined && crit.target === target ? crit.bonus : 0;
        return pct + bonus + pct * bonus / 100;
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
        const key = ability.GetMaxAbilityCharges(level) > 0 ? "AbilityChargeRestoreTime" : "AbilityCooldown";
        const cooldown = ability.GetLevelSpecialValueNoOverride(key, level);
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
            const spell = e.damage_category !== undefined ? e.damage_category === DamageCategory.SPELL : e.inflictor !== undefined;
            if (!parent.IsAlive() || (spell && (flags & DamageFlag.NO_SPELL_LIFESTEAL) !== 0)) return;
            let pct = b.lifesteal;
            if (unit.IsHero()) pct += 12 * (b.code["p_bloodsucker"] ?? 0);
            if (pct > 0)
                parent.HealWithParams(e.damage * pct / 100, e.inflictor as CDOTABaseAbility, true, true, parent, spell && e.inflictor !== undefined);
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
