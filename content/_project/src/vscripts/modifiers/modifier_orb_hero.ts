// Эффекты сфер-кода героев уровня A: Axe и Juggernaut (HEROES.md 2.1-2.2).
// Один скрытый модификатор на герое слушает применения способностей, урон, атаки и смерти
// и включает эффекты взятых сфер. Состояние — только в самом модификаторе (файл движок
// загружает в своем окружении, модули game/* отсюда не используются).
// Встроенные способности не трогаем изнутри: их длительность узнаем из значений способности,
// а действующие модификаторы ищем по части имени — так код не зависит от точных имен Valve.

import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf, OrbBonuses } from "../core/orbstore";
import { HERO_CODE as H } from "../core/herocode";
import { FxEngine } from "../lib/fxengine";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_hero: unknown;
}

const THINK = 0.1;
const WARD_UNIT = "npc_dota_juggernaut_healing_ward";

function hasModifierLike(u: CDOTA_BaseNPC, parts: string[]): boolean {
    for (const m of u.FindAllModifiers()) {
        const n = m.GetName();
        for (const p of parts) if (n.indexOf(p) >= 0) return true;
    }
    return false;
}

function isEnemyHero(parent: CDOTA_BaseNPC, u: CDOTA_BaseNPC | undefined): u is CDOTA_BaseNPC {
    return u !== undefined && IsValidEntity(u) && u.IsRealHero() && u.GetTeamNumber() !== parent.GetTeamNumber();
}

export class ModifierOrbHero extends ModBase {
    // Окна действия способностей (игровое время)
    callUntil = 0;
    furyUntil = 0;
    // Голод: цель → когда кончается
    hunger = new Map<EntityIndex, number>();
    spreading = false;
    lastHelixAt = -100;
    // Тотем
    ward?: CDOTA_BaseNPC;
    wardSearchUntil = 0;
    wardSearchPos?: Vector;
    lastWardOrder = 0;
    // Палач
    freeCullUntil = 0;
    cullRestore = 0;
    cullUsedInWindow = false;

    /** Эффекты сфер-кода, описанные данными (все герои). */
    engine?: FxEngine;

    IsHidden() { return true; }
    IsPurgable() { return false; }
    IsPermanent() { return true; }
    RemoveOnDeath() { return false; }
    AllowIllusionDuplicate() { return false; }
    GetAttributes() { return ModifierAttribute.PERMANENT; }

    private b(): OrbBonuses {
        return bonusesOf(this.GetParent().GetPlayerOwnerID(), IsServer(), GameRules.GetGameTime());
    }

    private has(id: string, b?: OrbBonuses): boolean {
        return ((b ?? this.b()).code[id] ?? 0) > 0;
    }

    OnCreated() {
        if (!IsServer()) return;
        this.hunger = new Map();
        this.engine = new FxEngine(this.GetParent());
        this.StartIntervalThink(THINK);
    }

    OnDestroy() { if (IsServer() && this.engine !== undefined) this.engine.clear(); }

    /** Движок эффектов с актуальным списком взятых сфер. */
    private fx(b?: OrbBonuses): FxEngine | undefined {
        const e = this.engine;
        if (e === undefined) return undefined;
        e.refresh(b ?? this.b());
        return e;
    }

    DeclareFunctions() {
        return [
            ModifierFunction.ON_ABILITY_START,
            ModifierFunction.ON_ABILITY_FULLY_CAST,
            ModifierFunction.ON_TAKEDAMAGE,
            ModifierFunction.ON_DEATH,
            ModifierFunction.ON_ATTACK_LANDED,
            ModifierFunction.PREATTACK_CRITICALSTRIKE,
            ModifierFunction.STATS_STRENGTH_BONUS,
            ModifierFunction.TOTALDAMAGEOUTGOING_PERCENTAGE,
        ];
    }

    // ---------- Свойства ----------

    /** Один в поле воин: удвоенный бонус One Man Army (значение считает OnIntervalThink). */
    GetModifierBonusStats_Strength() { return this.GetStackCount(); }

    /** Криты эффектов сфер и Добивание Джаггернаута (наибольший множитель). */
    GetModifierPreAttack_CriticalStrike(e: ModifierAttackEvent): number {
        if (!IsServer()) return 0;
        const engine = this.fx();
        const best = engine !== undefined ? engine.crit(e.target) : 0;
        return Math.max(best, this.finisherCrit(e));
    }

    /** Больше урона по оглушенным, раненым и т.п. (эффекты сфер). */
    GetModifierTotalDamageOutgoing_Percentage(e: ModifierAttackEvent): number {
        if (!IsServer()) return 0;
        const engine = this.fx();
        return engine !== undefined ? engine.outgoing(e.target, e.inflictor) : 0;
    }

    /** Добивание: дополнительный шанс крита Blade Dance по раненым героям. */
    private finisherCrit(e: ModifierAttackEvent): number {
        if (!this.has("jugg_p_finisher")) return 0;
        const parent = this.GetParent();
        const t = e.target;
        if (!isEnemyHero(parent, t) || t.GetHealthPercent() >= H.finisherHealthPct) return 0;
        const dance = parent.FindAbilityByName("juggernaut_blade_dance");
        if (dance === undefined || dance.GetLevel() <= 0) return 0;
        if (!RollPseudoRandomPercentage(H.finisherChance, PseudoRandom.CUSTOM_GAME_2, parent)) return 0;
        return dance.GetSpecialValueFor("blade_dance_crit_mult");
    }

    // ---------- События ----------

    OnAbilityStart(e: ModifierAbilityEvent) {
        if (!IsServer() || e.unit !== this.GetParent() || e.ability === undefined) return;
        this.engine?.maneuverStart(e.ability);
    }

    OnAbilityFullyCast(e: ModifierAbilityEvent) {
        if (!IsServer() || this.spreading) return;
        const parent = this.GetParent();
        if (e.unit !== parent) return;
        const ability = e.ability;
        if (ability === undefined) return;
        if (ability.IsItem()) return;
        const name = ability.GetAbilityName();
        if (name.startsWith("orb_slot_")) return;
        const now = GameRules.GetGameTime();
        const b = this.b();
        const engine = this.fx(b);
        if (engine !== undefined) engine.onCast(ability, e.target ?? ability.GetCursorTarget());
        if (name === "axe_berserkers_call") {
            const dur = ability.GetSpecialValueFor("duration");
            this.callUntil = now + dur;
            if (this.has("axe_p_iron_will", b)) parent.AddNewModifier(parent, ability, "modifier_orb_axe_iron_will", { duration: dur });
            if (this.has("axe_l_arena", b)) {
                CreateModifierThinker(parent, ability, "modifier_orb_axe_arena",
                    { duration: b.awake ? H.arenaDurationAwake : H.arenaDuration, awake: b.awake ? 1 : 0 },
                    parent.GetAbsOrigin(), parent.GetTeamNumber(), false);
            }
        } else if (name === "axe_battle_hunger") {
            const target = e.target ?? ability.GetCursorTarget();
            if (target === undefined) return;
            const dur = ability.GetSpecialValueFor("duration");
            this.hunger.set(target.entindex(), now + dur);
            if (this.has("axe_l_hunt", b)) this.spreadHunger(ability, target, dur);
        } else if (name === "axe_culling_blade") {
            if (now < this.freeCullUntil) {
                // Бесплатное применение в окне Палача: вернуть ману
                this.cullUsedInWindow = true;
                parent.GiveMana(ability.GetManaCost(ability.GetLevel() - 1));
                parent.RemoveModifierByName("modifier_orb_axe_free_cull");
                this.freeCullUntil = 0;
            }
        } else if (name === "juggernaut_blade_fury") {
            this.furyUntil = now + ability.GetSpecialValueFor("duration");
        } else if (name === "juggernaut_healing_ward") {
            this.ward = undefined;
            this.wardSearchUntil = now + 1;
            this.wardSearchPos = ability.GetCursorPosition();
        }
    }

    /** Кровавая охота: Голод на всех врагов вокруг цели (через саму способность). */
    private spreadHunger(ability: CDOTABaseAbility, target: CDOTA_BaseNPC, dur: number) {
        const parent = this.GetParent();
        const others = FindUnitsInRadius(parent.GetTeamNumber(), target.GetAbsOrigin(), undefined, H.huntRadius,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
        this.spreading = true;
        const now = GameRules.GetGameTime();
        for (const u of others) {
            if (u === target || !u.IsAlive()) continue;
            parent.SetCursorCastTarget(u);
            ability.OnSpellStart();
            this.hunger.set(u.entindex(), now + dur);
        }
        parent.SetCursorCastTarget(target);
        this.spreading = false;
    }

    OnTakeDamage(e: ModifierInstanceEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.attacker !== parent && e.unit !== parent) return;
        if (e.damage <= 0) return;
        const flags = e.damage_flags;
        const reflected = (flags & DamageFlag.REFLECTION) !== 0;
        const now = GameRules.GetGameTime();
        const b = this.b();
        const engine = this.fx(b);
        if (engine !== undefined) {
            if (e.attacker === parent) engine.onDealt(e);
            else engine.onTaken(e);
        }
        if (e.unit === parent) {
            // Шипованная броня: возврат урона от героев, пока действует Вызов
            const a = e.attacker;
            if (!reflected && now < this.callUntil && this.has("axe_p_spiked", b) && isEnemyHero(parent, a) && a.IsAlive()) {
                ApplyDamage({
                    victim: a, attacker: parent, damage: e.damage * H.spikedReturn, damage_type: DamageTypes.PURE,
                    damage_flags: DamageFlag.REFLECTION + DamageFlag.NO_SPELL_AMPLIFICATION,
                });
            }
            return;
        }
        // Урон, нанесенный нами
        const victim = e.unit;
        if (victim === undefined || victim.GetTeamNumber() === parent.GetTeamNumber() || victim.IsBuilding()) return;
        const inflictor = e.inflictor;
        const iname = inflictor !== undefined ? inflictor.GetAbilityName() : "";
        if (iname === "axe_battle_hunger" && this.has("axe_p_feast", b)) parent.Heal(e.damage * H.feastHeal, inflictor);
        if (iname === "axe_counter_helix") {
            if (this.has("axe_p_lacerate", b)) {
                const m = victim.FindModifierByName("modifier_orb_axe_lacerate") ??
                    victim.AddNewModifier(parent, inflictor, "modifier_orb_axe_lacerate", { duration: H.lacerateDuration });
                if (m !== undefined) {
                    if (m.GetStackCount() < H.lacerateMax) m.IncrementStackCount();
                    m.SetDuration(H.lacerateDuration, true);
                }
            }
            // Одна Спираль задевает нескольких: стак Раскрутки — один на срабатывание
            if (this.has("axe_p_spin", b) && now - this.lastHelixAt > 0.1) {
                this.lastHelixAt = now;
                const m = parent.FindModifierByName("modifier_orb_axe_spin") ??
                    parent.AddNewModifier(parent, inflictor, "modifier_orb_axe_spin", { duration: H.spinDuration });
                if (m !== undefined) {
                    if (m.GetStackCount() < H.spinMax) m.IncrementStackCount();
                    m.SetDuration(H.spinDuration, true);
                }
            }
        }
    }

    OnAttackLanded(e: ModifierAttackEvent) {
        if (!IsServer()) return;
        this.engine?.onObservedAttack(e);
        const parent = this.GetParent();
        if (e.attacker !== parent) return;
        const b = this.b();
        const engine = this.fx(b);
        if (engine !== undefined) engine.onAttack(e);
        const t = e.target;
        if (!isEnemyHero(parent, t)) return;
        const ward = this.ward;
        if (this.has("jugg_p_healing_fury", b) && ward !== undefined && IsValidEntity(ward) && ward.IsAlive() &&
            !t.IsDebuffImmune() && !e.no_attack_cooldown && e.damage > 0) {
            const center = ward.GetAbsOrigin();
            const range = (u: CDOTA_BaseNPC) => {
                const p = u.GetAbsOrigin();
                return (p.x - center.x) ** 2 + (p.y - center.y) ** 2 <= 475 ** 2 && Math.abs(p.z - center.z) <= 150;
            };
            if (range(t) && range(parent)) t.AddNewModifier(parent, parent.FindAbilityByName("juggernaut_healing_ward"),
                "modifier_orb_jugg_guardcut", { duration: 1.2 });
        }
    }

    OnDeath(e: ModifierInstanceEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        const dead = e.unit;
        if (dead === parent) { if (this.engine !== undefined) this.engine.clearCombat(); return; }
        if (dead === undefined) return;
        const now = GameRules.GetGameTime();
        const b = this.b();
        // Заразный голод: с умершей цели Голод перескакивает на ближайшего героя
        const until = this.hunger.get(dead.entindex());
        if (until !== undefined) {
            this.hunger.delete(dead.entindex());
            if (until > now && this.has("axe_p_contagious", b)) this.jumpHunger(dead);
        }
        if (e.attacker !== parent || !isEnemyHero(parent, dead)) return;
        const engine = this.fx(b);
        if (engine !== undefined) engine.onKill(dead, e.inflictor);
        const inflictor = e.inflictor;
        const iname = inflictor !== undefined ? inflictor.GetAbilityName() : "";
        if (iname === "axe_culling_blade" && inflictor !== undefined) this.onCullKill(inflictor, b);
    }

    private jumpHunger(dead: CDOTA_BaseNPC) {
        const parent = this.GetParent();
        const ability = parent.FindAbilityByName("axe_battle_hunger");
        if (ability === undefined || ability.GetLevel() <= 0) return;
        const near = FindUnitsInRadius(parent.GetTeamNumber(), dead.GetAbsOrigin(), undefined, H.contagiousRadius,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NONE, FindOrder.CLOSEST, false);
        for (const u of near) {
            if (u === dead || !u.IsAlive() || !u.IsRealHero()) continue;
            this.spreading = true;
            parent.SetCursorCastTarget(u);
            ability.OnSpellStart();
            this.spreading = false;
            this.hunger.set(u.entindex(), GameRules.GetGameTime() + ability.GetSpecialValueFor("duration"));
            return;
        }
    }

    private onCullKill(ability: CDOTABaseAbility, b: OrbBonuses) {
        const parent = this.GetParent();
        if (this.has("axe_p_execution", b)) {
            ability.EndCooldown();
        }
        if (this.has("axe_l_executioner", b)) {
            const window = b.awake ? H.executionerWindowAwake : H.executionerWindow;
            const left = ability.GetCooldownTimeRemaining();
            ability.EndCooldown();
            this.freeCullUntil = GameRules.GetGameTime() + window;
            this.cullUsedInWindow = false;
            // Не применил в окне — перезарядка возвращается (кроме случая с «Казнью»)
            this.cullRestore = this.has("axe_p_execution", b) ? 0 : Math.max(0, left - window);
            parent.AddNewModifier(parent, ability, "modifier_orb_axe_free_cull", { duration: window });
        }
    }

    // ---------- Каждые 0.1 с ----------

    OnIntervalThink() {
        const parent = this.GetParent();
        const now = GameRules.GetGameTime();
        const b = this.b();
        const engine = this.fx(b);
        if (engine !== undefined) engine.think();
        this.thinkOneArmy(parent, b);
        this.thinkHunt(parent, b, now);
        this.thinkCull(parent, now);
        this.thinkWard(parent, b, now);
        this.thinkStorm(parent, b, now);
    }

    private thinkOneArmy(parent: CDOTA_BaseNPC, b: OrbBonuses) {
        let bonus = 0;
        if (this.has("axe_p_one_army", b) && parent.IsAlive()) {
            const oma = parent.FindAbilityByName("axe_one_man_army");
            const enemies = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, H.oneArmyRadius,
                UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NONE, FindOrder.ANY, false);
            let heroes = 0;
            for (const u of enemies) if (u.IsRealHero()) heroes++;
            if (oma !== undefined && heroes >= 2) {
                const pct = oma.GetSpecialValueFor("armor_pct_as_strength");
                bonus = Math.floor(Math.max(0, parent.GetPhysicalArmorValue(false)) * pct / 100);
            }
        }
        if (bonus !== this.GetStackCount()) {
            this.SetStackCount(bonus);
            if (parent.IsHero()) (parent as CDOTA_BaseNPC_Hero).CalculateStatBonus(true);
        }
    }

    private thinkHunt(parent: CDOTA_BaseNPC, b: OrbBonuses, now: number) {
        let n = 0;
        for (const [id, until] of this.hunger) {
            const u = EntIndexToHScript(id) as CDOTA_BaseNPC | undefined;
            if (until <= now || u === undefined || !IsValidEntity(u) || !u.IsAlive() || !hasModifierLike(u, ["battle_hunger"])) {
                // Цель умерла — запись нужна Заразному голоду до события смерти, поэтому удаляем только живых без Голода
                if (u === undefined || !IsValidEntity(u) || u.IsAlive() || until <= now) this.hunger.delete(id);
                continue;
            }
            n++;
        }
        if (!this.has("axe_l_hunt", b)) return;
        let m = parent.FindModifierByName("modifier_orb_axe_hunt");
        if (n > 0 && m === undefined) m = parent.AddNewModifier(parent, undefined, "modifier_orb_axe_hunt", {});
        if (m !== undefined && m.GetStackCount() !== n) m.SetStackCount(n);
    }

    private thinkCull(parent: CDOTA_BaseNPC, now: number) {
        if (this.freeCullUntil <= 0 || now < this.freeCullUntil) return;
        this.freeCullUntil = 0;
        const ability = parent.FindAbilityByName("axe_culling_blade");
        if (ability !== undefined && !this.cullUsedInWindow && this.cullRestore > 0 && ability.IsCooldownReady()) {
            ability.StartCooldown(this.cullRestore);
        }
        this.cullRestore = 0;
    }

    private thinkWard(parent: CDOTA_BaseNPC, b: OrbBonuses, now: number) {
        const roaming = this.has("jugg_p_roaming_ward", b);
        if (!roaming && !this.has("jugg_p_healing_fury", b)) return;
        // Найти свой новый тотем рядом с точкой применения
        if (this.ward === undefined && now < this.wardSearchUntil && this.wardSearchPos !== undefined) {
            const units = FindUnitsInRadius(parent.GetTeamNumber(), this.wardSearchPos, undefined, 500,
                UnitTargetTeam.FRIENDLY, UnitTargetType.ALL, UnitTargetFlags.INVULNERABLE, FindOrder.CLOSEST, false);
            for (const u of units) {
                if (u.GetUnitName() !== WARD_UNIT || u.GetPlayerOwnerID() !== parent.GetPlayerOwnerID()) continue;
                this.ward = u;
                break;
            }
        }
        const w = this.ward;
        if (w === undefined || !IsValidEntity(w) || !w.IsAlive()) {
            this.ward = undefined;
            return;
        }
        if (!parent.IsAlive()) return;
        const po = parent.GetAbsOrigin();
        const wo = w.GetAbsOrigin();
        const dist = ((po - wo) as Vector).Length2D();
        const healAbility = parent.FindAbilityByName("juggernaut_healing_ward");
        const radius = healAbility !== undefined ? healAbility.GetSpecialValueFor("healing_ward_aura_radius") : 400;
        if (roaming && dist > 150 && now - this.lastWardOrder >= 0.5) {
            this.lastWardOrder = now;
            w.MoveToNPC(parent);
        }
        if (roaming && dist <= radius) parent.AddNewModifier(parent, healAbility, "modifier_orb_jugg_ward_armor", { duration: 0.25 });
    }

    private thinkStorm(parent: CDOTA_BaseNPC, b: OrbBonuses, now: number) {
        if (now >= this.furyUntil || !this.has("jugg_l_storm", b) || !parent.IsAlive()) return;
        const fury = parent.FindAbilityByName("juggernaut_blade_fury");
        const radius = fury !== undefined ? fury.GetSpecialValueFor("blade_fury_radius") : 380;
        const c = parent.GetAbsOrigin();
        const units = FindUnitsInRadius(parent.GetTeamNumber(), c, undefined, radius, UnitTargetTeam.ENEMY,
            UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
        const step = H.stormPullPerSecond * THINK;
        for (const u of units) {
            if (!u.IsAlive()) continue;
            const o = u.GetAbsOrigin();
            const d = ((o - c) as Vector).Length2D();
            if (d <= 120) continue;
            const dir = ((c - o) as Vector).Normalized();
            FindClearSpaceForUnit(u, (o + dir * step) as Vector, false);
        }
    }

}

modifier_orb_hero = registerModifier("modifier_orb_hero", ModifierOrbHero);
