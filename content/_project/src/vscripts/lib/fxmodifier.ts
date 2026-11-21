// Баффы и дебаффы эффектов сфер-кода: для каждого эффекта со свойствами (core/fxdata.ts)
// свой модификатор modifier_orb_fx_<ключ>. Класс общий (здесь), а сами модификаторы
// перечислены в modifiers/modifier_orb_fx.ts — его создает tools/orbs.js: движок ищет
// модификатор по имени в окружении файла, поэтому имена записаны в файле явно.
// Значения считаются и на клиенте: панель героя и подсказки верные.

import { ModBase } from "./modbase";
import { registerModifier } from "./registry";
import { FxDef, FxProps, fxModifierName } from "../core/fxtypes";
import { fxByKey, fxNum, fxView } from "../core/fxutil";
import { bonusesOf } from "../core/orbstore";

type PropKey = keyof FxProps;

/** Свойство → функция модификатора → имя метода. */
const PROP_FUNCS: [PropKey, ModifierFunction, string][] = [
    ["armor", ModifierFunction.PHYSICAL_ARMOR_BONUS, "GetModifierPhysicalArmorBonus"],
    ["ms", ModifierFunction.MOVESPEED_BONUS_PERCENTAGE, "GetModifierMoveSpeedBonus_Percentage"],
    ["msc", ModifierFunction.MOVESPEED_BONUS_CONSTANT, "GetModifierMoveSpeedBonus_Constant"],
    ["as", ModifierFunction.ATTACKSPEED_BONUS_CONSTANT, "GetModifierAttackSpeedBonus_Constant"],
    ["dmg", ModifierFunction.TOTALDAMAGEOUTGOING_PERCENTAGE, "GetModifierTotalDamageOutgoing_Percentage"],
    ["dmgc", ModifierFunction.PREATTACK_BONUS_DAMAGE, "GetModifierPreAttack_BonusDamage"],
    ["inc", ModifierFunction.INCOMING_DAMAGE_PERCENTAGE, "GetModifierIncomingDamage_Percentage"],
    ["status", ModifierFunction.STATUS_RESISTANCE_STACKING, "GetModifierStatusResistanceStacking"],
    ["slowres", ModifierFunction.SLOW_RESISTANCE_STACKING, "GetModifierSlowResistance_Stacking"],
    ["sa", ModifierFunction.SPELL_AMPLIFY_PERCENTAGE, "GetModifierSpellAmplify_Percentage"],
    ["mr", ModifierFunction.MAGICAL_RESISTANCE_BONUS, "GetModifierMagicalResistanceBonus"],
    ["regen", ModifierFunction.HEALTH_REGEN_CONSTANT, "GetModifierConstantHealthRegen"],
    ["regenpct", ModifierFunction.HEALTH_REGEN_PERCENTAGE, "GetModifierHealthRegenPercentage"],
    ["evasion", ModifierFunction.EVASION_CONSTANT, "GetModifierEvasion_Constant"],
    ["range", ModifierFunction.ATTACK_RANGE_BONUS, "GetModifierAttackRangeBonus"],
    ["castrange", ModifierFunction.CAST_RANGE_BONUS_STACKING, "GetModifierCastRangeBonusStacking"],
    ["str", ModifierFunction.STATS_STRENGTH_BONUS, "GetModifierBonusStats_Strength"],
    ["agi", ModifierFunction.STATS_AGILITY_BONUS, "GetModifierBonusStats_Agility"],
    ["int", ModifierFunction.STATS_INTELLECT_BONUS, "GetModifierBonusStats_Intellect"],
    ["hp", ModifierFunction.HEALTH_BONUS, "GetModifierHealthBonus"],
];

const STATE_PROPS: [PropKey, ModifierState][] = [
    ["immune", ModifierState.MAGIC_IMMUNE],
    ["silence", ModifierState.SILENCED],
    ["root", ModifierState.ROOTED],
    ["stun", ModifierState.STUNNED],
    ["disarm", ModifierState.DISARMED],
    ["brk", ModifierState.PASSIVES_DISABLED],
    ["nocol", ModifierState.NO_UNIT_COLLISION],
    ["invis", ModifierState.INVISIBLE],
    ["fly", ModifierState.FLYING_FOR_PATHING_PURPOSES_ONLY],
];

/** Свойства эффекта (бафф, дебафф или стаки за убийства). */
export function fxPropsOf(f: FxDef): FxProps | undefined {
    switch (f.t) {
        case "guard": case "combo": case "buff": case "passive": case "lowhp": case "stacks": case "still": case "aura":
            return f.props;
        case "kill":
            return f.stack !== undefined ? f.stack.props : undefined;
        case "maneuver": case "wire": case "zone": case "hit": case "blast": case "trail": case "trap": case "storm":
            return f.debuff !== undefined ? f.debuff.props : undefined;
        default:
            return undefined;
    }
}

/** Все свойства, которые эффект может иметь (до и после Пробуждения). */
function allProps(f: FxDef): Set<PropKey> {
    const out = new Set<PropKey>();
    const add = (p: FxProps | undefined) => {
        if (p === undefined) return;
        for (const k in p) out.add(k as PropKey);
    };
    add(fxPropsOf(f));
    if (f.aw !== undefined) add(fxPropsOf(fxView(f, true)));
    return out;
}

export function fxIsDebuff(f: FxDef): boolean {
    return f.t === "maneuver" || f.t === "thunderball" || f.t === "wire" || f.t === "mark" || f.t === "zone" || f.t === "hit" || f.t === "blast" || f.t === "aura" || f.t === "trail" || f.t === "trap" || f.t === "storm";
}

/** Свойства умножаются на число стаков. */
export function fxStacking(f: FxDef): boolean {
    if (f.t === "hit" || f.t === "blast") return f.debuff !== undefined && (f.debuff.max ?? 1) > 1;
    if (f.t === "kill") return f.stack !== undefined;
    if (f.t === "stacks") return (f.perstack ?? 0) > 0;
    if (f.t === "passive") return (f.perlvl ?? 0) > 0;
    return false;
}

export class ModifierOrbFx extends ModBase {
    /** Ключ эффекта: задается таблице каждого зарегистрированного модификатора (без значения в конструкторе!). */
    declare fxKey: string;

    private fx(): FxDef | undefined {
        return fxByKey(this.fxKey);
    }

    /** Кто дал эффект: для баффов — сам герой, для дебаффов — герой-источник. */
    private owner(): CDOTA_BaseNPC {
        const c = this.GetCaster();
        return c !== undefined && IsValidEntity(c) ? c : this.GetParent();
    }

    private view(): FxDef | undefined {
        const f = this.fx();
        if (f === undefined) return undefined;
        if (f.aw === undefined) return f;
        const o = this.owner();
        const awake = bonusesOf(o.GetPlayerOwnerID(), IsServer(), GameRules.GetGameTime()).awake;
        return fxView(f, awake);
    }

    private val(prop: PropKey): number {
        const f = this.view();
        if (f === undefined) return 0;
        const p = fxPropsOf(f);
        if (p === undefined) return 0;
        const raw = p[prop];
        if (raw === undefined) return 0;
        const o = this.owner();
        const ab = f.ab !== "" ? o.FindAbilityByName(f.ab) : undefined;
        const v = fxNum(raw, key => (ab !== undefined ? ab.GetSpecialValueFor(key) : 0));
        return fxStacking(f) ? v * Math.max(1, this.GetStackCount()) : v;
    }

    IsHidden() { return false; }
    IsDebuff() {
        const f = this.fx();
        return f !== undefined && fxIsDebuff(f);
    }
    IsPurgable() { return !this.IgnoreTenacity() && this.IsDebuff(); }
    IgnoreTenacity() {
        const f = this.fx();
        return f?.t === "thunderball";
    }
    RemoveOnDeath() {
        const f = this.fx();
        if (f === undefined) return true;
        if (f.t === "passive") return false;
        if (f.t === "kill") return !(f.stack !== undefined && (f.stack.perm ?? 0) > 0);
        return true;
    }
    GetTexture() {
        const f = this.fx();
        return f !== undefined ? f.icon : "item_ultimate_orb";
    }
    GetEffectName() {
        const f = this.fx();
        if (f === undefined) return "";
        const p = fxPropsOf(f);
        if (p !== undefined && p.stun !== undefined) return "particles/generic_gameplay/generic_stunned.vpcf";
        if (p !== undefined && p.silence !== undefined) return "particles/generic_gameplay/generic_silenced.vpcf";
        return "";
    }
    GetEffectAttachType() { return ParticleAttachment.OVERHEAD_FOLLOW; }

    DeclareFunctions(): ModifierFunction[] {
        const f = this.fx();
        if (f === undefined) return [];
        const props = allProps(f);
        const list: ModifierFunction[] = [];
        for (const [k, fn] of PROP_FUNCS) if (props.has(k)) list.push(fn);
        if (props.has("healred")) {
            list.push(ModifierFunction.HEAL_AMPLIFY_PERCENTAGE_TARGET);
            list.push(ModifierFunction.HP_REGEN_AMPLIFY_PERCENTAGE);
            list.push(ModifierFunction.LIFESTEAL_AMPLIFY_PERCENTAGE);
            list.push(ModifierFunction.SPELL_LIFESTEAL_AMPLIFY_PERCENTAGE);
        }
        if (props.has("cleave")) list.push(ModifierFunction.ON_ATTACK_LANDED);
        if (props.has("ls") || props.has("sls")) list.push(ModifierFunction.ON_TAKEDAMAGE);
        if (props.has("stun")) list.push(ModifierFunction.OVERRIDE_ANIMATION);
        if (props.has("invis")) {
            list.push(ModifierFunction.INVISIBILITY_LEVEL);
            list.push(ModifierFunction.ON_ATTACK);
        }
        if (props.has("scale")) list.push(ModifierFunction.MODEL_SCALE);
        return list;
    }

    CheckState(): Partial<Record<ModifierState, boolean>> {
        const f = this.fx();
        const out: Partial<Record<ModifierState, boolean>> = {};
        if (f === undefined) return out;
        const props = allProps(f);
        for (const [k, st] of STATE_PROPS) if (props.has(k) && this.val(k) > 0) out[st] = true;
        if (props.has("reveal") && this.val("reveal") > 0) out[ModifierState.INVISIBLE] = false;
        return out;
    }

    GetOverrideAnimation() { return GameActivity.DOTA_DISABLED; }

    GetModifierPhysicalArmorBonus() { return this.val("armor"); }
    GetModifierMoveSpeedBonus_Percentage() { return this.val("ms"); }
    GetModifierMoveSpeedBonus_Constant() { return this.val("msc"); }
    GetModifierAttackSpeedBonus_Constant() { return this.val("as"); }
    GetModifierTotalDamageOutgoing_Percentage() { return this.val("dmg"); }
    GetModifierPreAttack_BonusDamage() { return this.val("dmgc"); }
    GetModifierIncomingDamage_Percentage() { return this.val("inc"); }
    // Положительное сопротивление учитывает контроллер вместе со всеми остальными сферами.
    OrbStatusResistance() { return Math.max(0, this.val("status")); }
    GetModifierStatusResistanceStacking() {
        // Положительные бонусы учитывает единый контроллер, дебаффы остаются самостоятельными.
        return Math.min(0, this.val("status"));
    }
    GetModifierSlowResistance_Stacking(): number { return this.val("slowres"); }
    GetModifierSpellAmplify_Percentage() { return this.val("sa"); }
    GetModifierMagicalResistanceBonus() { return this.val("mr"); }
    GetModifierConstantHealthRegen() { return this.val("regen"); }
    GetModifierHealthRegenPercentage() { return this.val("regenpct"); }
    GetModifierEvasion_Constant() { return this.val("evasion"); }
    GetModifierAttackRangeBonus() { return this.val("range"); }
    GetModifierCastRangeBonusStacking() { return this.val("castrange"); }
    GetModifierBonusStats_Strength() { return this.val("str"); }
    GetModifierBonusStats_Agility() { return this.val("agi"); }
    GetModifierBonusStats_Intellect() { return this.val("int"); }
    GetModifierHealthBonus() { return this.val("hp"); }
    GetModifierInvisibilityLevel() { return this.val("invis") > 0 ? 1 : 0; }
    GetModifierModelScale() { return this.val("scale") > 0 ? this.val("scale") - 100 : 0; }
    /** Невидимость эффекта снимается атакой (как тень в Доте). */
    OnAttack(e: ModifierAttackEvent) {
        if (!IsServer()) return;
        if (e.attacker === this.GetParent() && this.val("invis") > 0) this.Destroy();
    }
    GetModifierHealAmplify_PercentageTarget(): number { return -this.val("healred"); }
    GetModifierHPRegenAmplify_Percentage() { return -this.val("healred"); }
    GetModifierLifestealRegenAmplify_Percentage() { return -this.val("healred"); }
    GetModifierSpellLifestealRegenAmplify_Percentage() { return -this.val("healred"); }

    /** Раскол (только ближний бой). */
    OnAttackLanded(e: ModifierAttackEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.attacker !== parent || parent.IsRangedAttacker() || parent.IsIllusion()) return;
        const t = e.target;
        if (t === undefined || !IsValidEntity(t) || t.IsBuilding() || t.GetTeamNumber() === parent.GetTeamNumber()) return;
        const pct = this.val("cleave");
        if (pct <= 0) return;
        DoCleaveAttack(parent, t, undefined, e.damage * pct / 100, 150, 360, 625, "particles/items_fx/battlefury_cleave.vpcf");
    }

    /** Вампиризм атак (ls) и способностей (sls) по героям. */
    OnTakeDamage(e: ModifierInstanceEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.attacker !== parent || e.damage <= 0) return;
        const u = e.unit;
        if (u === undefined || !u.IsRealHero() || u.GetTeamNumber() === parent.GetTeamNumber()) return;
        if ((e.damage_flags & DamageFlag.REFLECTION) !== 0 || (e.damage_flags & DamageFlag.HPLOSS) !== 0) return;
        const spell = e.inflictor !== undefined;
        if (!parent.IsAlive() || (spell && (e.damage_flags & DamageFlag.NO_SPELL_LIFESTEAL) !== 0)) return;
        const pct = this.val(spell ? "sls" : "ls");
        if (pct > 0)
            parent.HealWithParams(e.damage * pct / 100, e.inflictor as CDOTABaseAbility, true, true, parent, spell);
    }
}

/** Модификатор эффекта по ключу (вызывается из modifiers/modifier_orb_fx.ts). */
export function makeFx(key: string): unknown {
    const t = registerModifier(fxModifierName(key), ModifierOrbFx) as { fxKey: string };
    t.fxKey = key;
    return t;
}
