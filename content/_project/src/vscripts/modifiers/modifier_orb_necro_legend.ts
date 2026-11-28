import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf } from "../core/orbstore";
import { MAP } from "../core/mapinfo";

declare global {
    var modifier_orb_necro_legend: unknown;
    var modifier_orb_necro_pulse_ready: unknown;
    var modifier_orb_necro_pulse_windup: unknown;
    var modifier_orb_necro_anchor: unknown;
    var modifier_orb_necro_beacon: unknown;
    var modifier_orb_necro_exposed: unknown;
    var modifier_orb_necro_plague: unknown;
    var modifier_orb_necro_sentence: unknown;
    var modifier_orb_necro_verdict: unknown;
}

export const PULSE = "necrolyte_death_pulse";
export const SHROUD = "necrolyte_ghost_shroud";
export const AURA = "necrolyte_heartstopper_aura";
export const SCYTHE = "necrolyte_reapers_scythe";
const Q = "orb_necro_pulse";
const W = "orb_necro_return";
const E = "orb_necro_beacon";
const SHIFT = "orb_necro_move_beacon";
const R = "orb_necro_verdict";
const Q_READY = "modifier_orb_necro_pulse_ready";
const Q_WIND = "modifier_orb_necro_pulse_windup";
const W_ANCHOR = "modifier_orb_necro_anchor";
export const E_ACTIVE = "modifier_orb_necro_beacon";
const E_BUILD = "modifier_orb_necro_exposed";
const E_PLAGUE = "modifier_orb_necro_plague";
const R_MARK = "modifier_orb_necro_sentence";
const R_READY = "modifier_orb_necro_verdict";
const HERO_MODEL = "models/heroes/necrolyte/necrolyte.vmdl";
const RING = "particles/ui_mouseactions/range_display.vpcf";
const PULSE_FX = "particles/units/heroes/hero_necrolyte/necrolyte_pulse_launch.vpcf";
const IMPACT = "particles/units/heroes/hero_necrolyte/necrolyte_pulse_enemy_explosion.vpcf";
const GHOST_FX = "particles/units/heroes/hero_necrolyte/necrolyte_spirit_ground.vpcf";
const PLAGUE_FX = "particles/units/heroes/hero_necrolyte/necrolyte_spirit_debuff.vpcf";
const MARK_FX = "particles/units/heroes/hero_necrolyte/necrolyte_scythe_model_static.vpcf";
const SCYTHE_FX = "particles/units/heroes/hero_necrolyte/necrolyte_scythe.vpcf";
const PULSE_RADIUS = 300;
const VERDICT_RANGE = 650;
const BEACON_RANGE = 650;
const BEACON_SHIFT = 300;
const STEP = 0.05;

const now = () => GameRules.GetGameTime();
function distance(a: Vector, b: Vector): number {
    const x = a.x - b.x;
    const y = a.y - b.y;
    return Math.sqrt(x * x + y * y);
}
function alive(unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
    return unit !== undefined && IsValidEntity(unit) && unit.IsAlive() && unit.GetHealth() > 0;
}
function clear(mod?: CDOTA_Buff) {
    if (mod !== undefined && !mod.IsNull()) mod.Destroy();
}
function clearParticle(id?: ParticleID) {
    if (id === undefined) return;
    ParticleManager.DestroyParticle(id, true);
    ParticleManager.ReleaseParticleIndex(id);
}
function worldParticle(path: string, point: Vector): ParticleID {
    const id = ParticleManager.CreateParticle(path, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id, 0, point);
    return id;
}
function flash(path: string, point: Vector) {
    ParticleManager.ReleaseParticleIndex(worldParticle(path, point));
}
function ring(point: Vector, radius: number, color: Vector): ParticleID {
    const id = worldParticle(RING, point);
    ParticleManager.SetParticleControl(id, 1, Vector(radius, 0, 0));
    ParticleManager.SetParticleControl(id, 2, color);
    return id;
}

class Visible extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
}
class PulseReady extends Visible { GetTexture() { return PULSE; } }
class PulseWindup extends PulseReady {}
class AnchorIcon extends Visible { GetTexture() { return SHROUD; } }
class BeaconIcon extends Visible { GetTexture() { return AURA; } }
class Exposed extends BeaconIcon {
    IsDebuff() { return true; }
    IgnoreTenacity() { return true; }
    DeclareFunctions() {
        return [ModifierFunction.HEAL_AMPLIFY_PERCENTAGE_TARGET, ModifierFunction.HP_REGEN_AMPLIFY_PERCENTAGE,
            ModifierFunction.LIFESTEAL_AMPLIFY_PERCENTAGE, ModifierFunction.SPELL_LIFESTEAL_AMPLIFY_PERCENTAGE];
    }
    private reduction() { return -this.GetStackCount(); }
    GetModifierHealAmplify_PercentageTarget() { return this.reduction(); }
    GetModifierHPRegenAmplify_Percentage() { return this.reduction(); }
    GetModifierLifestealRegenAmplify_Percentage() { return this.reduction(); }
    GetModifierSpellLifestealRegenAmplify_Percentage() { return this.reduction(); }
}
class Plague extends Exposed {
    GetEffectName() { return PLAGUE_FX; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
}
class VerdictIcon extends Visible { GetTexture() { return SCYTHE; } }
class Sentence extends VerdictIcon {
    IsDebuff() { return true; }
    IgnoreTenacity() { return true; }
    GetEffectName() { return MARK_FX; }
    GetEffectAttachType() { return ParticleAttachment.OVERHEAD_FOLLOW; }
}

interface PulseWindow { ability: CDOTABaseAbility; ends: number; icon?: CDOTA_Buff }
interface Anchor {
    ability: CDOTABaseAbility;
    pos: Vector;
    health: number;
    ring: ParticleID;
    mist: ParticleID;
    model?: CBaseEntity;
    icon?: CDOTA_Buff;
}
interface Exposure { since: number; icon?: CDOTA_Buff; active: boolean }
interface Beacon {
    ability: CDOTABaseAbility;
    pos: Vector;
    radius: number;
    ends: number;
    lastTick: number;
    moved: boolean;
    ring: ParticleID;
    mist: ParticleID;
    icon?: CDOTA_Buff;
    victims: Map<CDOTA_BaseNPC, Exposure>;
}
interface Verdict {
    target: CDOTA_BaseNPC;
    ends: number;
    threshold: number;
    targetIcon?: CDOTA_Buff;
    ownerIcon?: CDOTA_Buff;
}

export class NecroLegends extends ModBase {
    private qCastUntil = 0;
    private qNext = 0;
    private pulse?: PulseWindow;
    private qWind?: { ring: ParticleID; icon?: CDOTA_Buff };
    private anchor?: Anchor;
    private beacon?: Beacon;
    private scytheUntil = 0;
    private scytheTarget?: CDOTA_BaseNPC;
    private verdict?: Verdict;
    private swapped = new Set<string>();

    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    OnCreated() { if (IsServer()) this.StartIntervalThink(STEP); }
    DeclareFunctions() {
        return [ModifierFunction.ON_ABILITY_FULLY_CAST, ModifierFunction.ON_TAKEDAMAGE, ModifierFunction.ON_DEATH];
    }

    private bonuses() { return bonusesOf(this.GetParent().GetPlayerOwnerID(), IsServer(), now()); }
    private owns(id: string) { return (this.bonuses().code[id] ?? 0) > 0; }
    IsAwake() { return this.bonuses().awake; }
    private swap(stock: string, extra: string, show: boolean, keepPassive = false) {
        if (this.swapped.has(extra) === show) return;
        const caster = this.GetParent();
        const native = caster.FindAbilityByName(stock);
        if (native === undefined || native.GetLevel() < 1) return;
        const alternate = caster.FindAbilityByName(extra) ?? (show ? caster.AddAbility(extra) : undefined);
        if (alternate === undefined) return;
        if (show) {
            alternate.SetLevel(keepPassive ? native.GetLevel() : 1);
            caster.SwapAbilities(stock, extra, keepPassive, true);
            this.swapped.add(extra);
        } else {
            caster.SwapAbilities(extra, stock, false, true);
            this.swapped.delete(extra);
        }
        native.SetHidden(show);
        alternate.SetHidden(!show);
        native.MarkAbilityButtonDirty();
        alternate.MarkAbilityButtonDirty();
    }

    private enemy(unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
        return alive(unit) && unit.IsRealHero() && !unit.IsIllusion() && !unit.IsOutOfGame() &&
            !unit.IsInvulnerable() && unit.GetTeamNumber() !== this.GetParent().GetTeamNumber();
    }
    private protected(unit: CDOTA_BaseNPC) { return unit.IsDebuffImmune() || unit.IsMagicImmune(); }
    private enemies(point: Vector, radius: number) {
        const hero = this.GetParent();
        return FindUnitsInRadius(hero.GetTeamNumber(), point, undefined, radius, UnitTargetTeam.ENEMY,
            UnitTargetType.HERO, UnitTargetFlags.MAGIC_IMMUNE_ENEMIES, FindOrder.CLOSEST, false)
            .filter(unit => this.enemy(unit));
    }

    OnAbilityFullyCast(event: ModifierAbilityEvent) {
        const hero = this.GetParent();
        const ability = event.ability;
        if (!IsServer() || event.unit !== hero || !alive(hero) || ability === undefined) return;
        const name = ability.GetAbilityName();
        if (name === PULSE && this.owns("necro_l_garden") && now() >= this.qNext && this.pulse === undefined) {
            this.qCastUntil = now() + 2.5;
        } else if (name === SHROUD && this.owns("necro_l_breathcycle")) {
            this.createAnchor(ability);
        } else if (name === SCYTHE && this.owns("necro_l_testament")) {
            this.clearVerdict();
            const target = ability.GetCursorTarget();
            this.scytheTarget = this.enemy(target) ? target : undefined;
            this.scytheUntil = now() + 2.5;
        }
    }

    OnTakeDamage(event: ModifierInstanceEvent) {
        const hero = this.GetParent();
        if (!IsServer() || !alive(hero) || event.attacker !== hero || !this.enemy(event.unit) ||
            event.inflictor === undefined || event.damage <= 0) return;
        const name = event.inflictor.GetAbilityName();
        if (name === PULSE && this.qCastUntil > now() && this.pulse === undefined && !this.protected(event.unit)) {
            this.qCastUntil = 0;
            const icon = hero.AddNewModifier(hero, event.inflictor, Q_READY, { duration: 2 });
            icon?.SetStackCount(1);
            this.pulse = { ability: event.inflictor, ends: now() + 2, icon };
            this.swap(PULSE, Q, true);
        } else if (name === SCYTHE && this.scytheUntil > now() &&
            (this.scytheTarget === undefined || this.scytheTarget === event.unit)) {
            this.scytheUntil = 0;
            if (!this.protected(event.unit)) this.markVerdict(event.unit, event.inflictor);
        }
    }

    BeginPulse(): boolean {
        if (this.pulse === undefined || this.pulse.ends <= now() || this.qWind !== undefined) return false;
        const hero = this.GetParent();
        const time = this.IsAwake() ? 0.4 : 0.6;
        this.qWind = {
            ring: ring(hero.GetAbsOrigin(), PULSE_RADIUS, Vector(125, 255, 124)),
            icon: hero.AddNewModifier(hero, this.pulse.ability, Q_WIND, { duration: time }),
        };
        EmitSoundOn("Hero_Necrolyte.DeathPulse", hero);
        return true;
    }
    InterruptPulse() {
        clearParticle(this.qWind?.ring);
        clear(this.qWind?.icon);
        this.qWind = undefined;
    }
    private clearPulse() {
        this.InterruptPulse();
        clear(this.pulse?.icon);
        this.pulse = undefined;
        this.swap(PULSE, Q, false);
    }
    FinishPulse(ability: CDOTABaseAbility) {
        const pulse = this.pulse;
        const woundUp = this.qWind !== undefined;
        this.clearPulse();
        const hero = this.GetParent();
        if (!woundUp || pulse === undefined || !alive(hero)) return;
        this.qNext = now() + 8;
        flash(PULSE_FX, hero.GetAbsOrigin());
        const target = this.enemies(hero.GetAbsOrigin(), PULSE_RADIUS)[0];
        if (target === undefined || this.protected(target)) return;
        flash(IMPACT, target.GetAbsOrigin());
        const special = pulse.ability.GetSpecialValueFor("AbilityDamage");
        const base = special > 0 ? special : pulse.ability.GetAbilityDamage();
        const dealt = ApplyDamage({ victim: target, attacker: hero, ability, damage: base * 1.6,
            damage_type: DamageTypes.MAGICAL });
        if (dealt > 0 && alive(hero)) hero.Heal(dealt * 0.35, ability);
    }

    private shroud(ability: CDOTABaseAbility): CDOTA_Buff | undefined {
        const hero = this.GetParent();
        return hero.FindAllModifiers().find(mod => mod.GetRemainingTime() > 0 && !mod.IsDebuff() &&
            ((mod.GetAbility() === ability && mod.GetName().startsWith("modifier_necrolyte_")) || mod.GetName() === "modifier_necrolyte_ghost_shroud_active" ||
                mod.GetName() === "modifier_necrolyte_sadist_active"));
    }
    private createAnchor(ability: CDOTABaseAbility) {
        this.clearAnchor();
        const hero = this.GetParent();
        const pos = GetGroundPosition(hero.GetAbsOrigin(), hero);
        const model = SpawnEntityFromTableSynchronous("prop_dynamic", {
            model: HERO_MODEL, solid: 0, disableshadows: 1, modelscale: 0.79,
            rendermode: 1, renderamt: 138, rendercolor: "108 243 167",
        });
        if (model !== undefined) {
            model.SetAbsOrigin(pos);
            model.SetForwardVector(hero.GetForwardVector());
        }
        const duration = this.shroud(ability)?.GetRemainingTime() ?? ability.GetSpecialValueFor("duration");
        const icon = hero.AddNewModifier(hero, ability, W_ANCHOR, { duration });
        icon?.SetStackCount(1);
        this.anchor = { ability, pos, health: hero.GetHealth(), model, icon,
            ring: ring(pos, 105, Vector(109, 243, 190)), mist: worldParticle(GHOST_FX, pos) };
        this.swap(SHROUD, W, true);
    }
    private clearAnchor() {
        const anchor = this.anchor;
        if (anchor === undefined) return;
        this.anchor = undefined;
        clear(anchor.icon);
        clearParticle(anchor.ring);
        clearParticle(anchor.mist);
        if (anchor.model !== undefined && IsValidEntity(anchor.model)) UTIL_Remove(anchor.model);
        this.swap(SHROUD, W, false);
    }
    CanReturn(): boolean {
        const hero = this.GetParent();
        const anchor = this.anchor;
        return anchor !== undefined && alive(hero) && !hero.IsRooted() && !hero.IsCurrentlyHorizontalMotionControlled() &&
            !hero.HasModifier("modifier_slark_pounce_leash") && !hero.HasModifier("modifier_puck_dream_coil") &&
            distance(hero.GetAbsOrigin(), anchor.pos) <= (this.IsAwake() ? 1100 : 750) &&
            this.shroud(anchor.ability) !== undefined && GridNav.IsTraversable(anchor.pos) && !GridNav.IsBlocked(anchor.pos);
    }
    ReturnToAnchor(ability: CDOTABaseAbility) {
        const anchor = this.anchor;
        if (anchor === undefined || !this.CanReturn()) return;
        const hero = this.GetParent();
        const heal = Math.min(Math.max(0, anchor.health - hero.GetHealth()), hero.GetMaxHealth() * (this.IsAwake() ? 0.45 : 0.35));
        flash(PULSE_FX, hero.GetAbsOrigin());
        this.clearAnchor();
        clear(this.shroud(anchor.ability));
        FindClearSpaceForUnit(hero, anchor.pos, true);
        flash(PULSE_FX, hero.GetAbsOrigin());
        EmitSoundOn("Hero_Necrolyte.DeathPulse", hero);
        if (heal > 0) hero.Heal(heal, ability);
    }

    CanPlace(point: Vector, shift: boolean): boolean {
        const hero = this.GetParent(), beacon = this.beacon;
        if (!alive(hero) || hero.PassivesDisabled() || Math.abs(point.x) > MAP.bounds - 40 || Math.abs(point.y) > MAP.bounds - 40 ||
            !GridNav.IsTraversable(point) || GridNav.IsBlocked(point)) return false;
        if (shift) return beacon !== undefined && !beacon.moved && this.IsAwake() &&
            distance(beacon.pos, point) <= BEACON_SHIFT && distance(hero.GetAbsOrigin(), point) <= BEACON_RANGE + BEACON_SHIFT;
        return beacon === undefined && distance(hero.GetAbsOrigin(), point) <= BEACON_RANGE;
    }
    PlaceBeacon(point: Vector) {
        if (!this.CanPlace(point, false)) return;
        const hero = this.GetParent();
        const ability = hero.FindAbilityByName(AURA);
        if (ability === undefined || ability.GetLevel() < 1) return;
        const pos = GetGroundPosition(point, hero);
        const radius = Math.max(500, 500 + ability.GetSpecialValueFor("aura_radius") - 700);
        const placed = now();
        this.beacon = {
            ability, pos, radius, ends: placed + 6, lastTick: placed, moved: false, victims: new Map(),
            ring: ring(pos, radius, Vector(100, 219, 97)), mist: worldParticle(GHOST_FX, pos),
            icon: hero.AddNewModifier(hero, ability, E_ACTIVE, { duration: 6 }),
        };
        this.beacon.icon?.SetStackCount(radius);
        this.refreshAura(ability);
        EmitSoundOn("Hero_Necrolyte.DeathPulse", hero);
        if (this.IsAwake()) this.swap(E, SHIFT, true);
    }
    ShiftBeacon(point: Vector) {
        const beacon = this.beacon;
        if (beacon === undefined || !this.CanPlace(point, true)) return;
        beacon.moved = true;
        beacon.pos = GetGroundPosition(point, this.GetParent());
        ParticleManager.SetParticleControl(beacon.ring, 0, beacon.pos);
        ParticleManager.SetParticleControl(beacon.mist, 0, beacon.pos);
        flash(PULSE_FX, beacon.pos);
        this.swap(E, SHIFT, false);
        this.updateBeacon(now());
    }
    private clearBeacon() {
        const beacon = this.beacon;
        if (beacon === undefined) return;
        this.beacon = undefined;
        clear(beacon.icon);
        clearParticle(beacon.ring);
        clearParticle(beacon.mist);
        for (const [, v] of beacon.victims) clear(v.icon);
        this.swap(E, SHIFT, false);
        this.refreshAura(beacon.ability);
    }
    private refreshAura(ability: CDOTABaseAbility) {
        const intrinsic = ability.GetIntrinsicModifierName();
        if (intrinsic !== "") this.GetParent().FindModifierByName(intrinsic)?.ForceRefresh();
        ability.MarkAbilityButtonDirty();
    }
    private updateBeacon(time: number) {
        const beacon = this.beacon;
        if (beacon === undefined) return;
        const hero = this.GetParent(), ability = beacon.ability;
        if (time >= beacon.ends || hero.PassivesDisabled()) { this.clearBeacon(); return; }

        const targets = new Set(this.enemies(beacon.pos, beacon.radius));
        for (const [target, exposure] of beacon.victims) {
            if (!targets.has(target) || this.protected(target)) {
                clear(exposure.icon);
                beacon.victims.delete(target);
            }
        }
        const tick = time - beacon.lastTick;
        const damageTick = tick >= 0.249;
        if (damageTick) beacon.lastTick = time;
        const baseReduction = Math.max(0, ability.GetSpecialValueFor("heal_reduction_pct"));
        const baseDamage = ability.GetSpecialValueFor("aura_damage") / 100;
        const regenDamage = hero.HasScepter() ? hero.GetHealthRegen() * ability.GetSpecialValueFor("heal_regen_to_damage") / 100 : 0;
        for (const target of targets) {
            let exposure = beacon.victims.get(target);
            if (!this.protected(target)) {
                if (exposure === undefined) {
                    exposure = { since: time, active: false, icon: target.AddNewModifier(hero, ability, E_BUILD, { duration: -1 }) };
                    exposure.icon?.SetDuration(1.25, true);
                    exposure.icon?.SetStackCount(baseReduction);
                    beacon.victims.set(target, exposure);
                }
                if (!exposure.active && time - exposure.since + 0.001 >= 1.25) {
                    clear(exposure.icon);
                    exposure.icon = target.AddNewModifier(hero, ability, E_PLAGUE, {});
                    exposure.icon?.SetStackCount(Math.max(60, baseReduction));
                    exposure.active = true;
                }
            }
            if (damageTick) {
                const extra = exposure?.active ? 0.03 : 0;
                const amount = ((baseDamage + extra) * target.GetMaxHealth() + regenDamage) * tick;
                if (amount <= 0) continue;
                ApplyDamage({ victim: target, attacker: hero, ability,
                    damage: amount,
                    damage_type: DamageTypes.MAGICAL,
                    damage_flags: DamageFlag.NO_SPELL_AMPLIFICATION | DamageFlag.NO_SPELL_LIFESTEAL });
            }
        }
    }

    private markVerdict(target: CDOTA_BaseNPC, ability: CDOTABaseAbility) {
        const hero = this.GetParent();
        const awake = this.IsAwake();
        const duration = awake ? 4 : 3, threshold = awake ? 30 : 25;
        const targetIcon = target.AddNewModifier(hero, ability, R_MARK, { duration });
        const ownerIcon = hero.AddNewModifier(hero, ability, R_READY, { duration });
        targetIcon?.SetStackCount(threshold);
        ownerIcon?.SetStackCount(1);
        this.verdict = { target, ends: now() + duration, threshold, targetIcon, ownerIcon };
        this.swap(SCYTHE, R, true);
        this.refreshVerdict();
    }
    private clearVerdict() {
        if (this.verdict === undefined) return;
        clear(this.verdict.targetIcon);
        clear(this.verdict.ownerIcon);
        this.verdict = undefined;
        this.swap(SCYTHE, R, false);
    }
    CanVerdict(): boolean {
        const verdict = this.verdict;
        return verdict !== undefined && verdict.ends > now() && this.enemy(verdict.target) &&
            !this.protected(verdict.target) && verdict.target.GetHealth() * 100 <= verdict.threshold * verdict.target.GetMaxHealth() &&
            distance(this.GetParent().GetAbsOrigin(), verdict.target.GetAbsOrigin()) <= VERDICT_RANGE;
    }
    private refreshVerdict() {
        const ability = this.GetParent().FindAbilityByName(R);
        if (ability === undefined) return;
        const ready = this.CanVerdict();
        if (ability.IsActivated() !== ready) {
            ability.SetActivated(ready);
            ability.MarkAbilityButtonDirty();
        }
    }
    FinishVerdict(ability: CDOTABaseAbility) {
        const verdict = this.verdict;
        if (verdict === undefined) return;
        const valid = this.CanVerdict();
        this.clearVerdict();
        if (!valid) return;
        const target = verdict.target;
        flash(SCYTHE_FX, target.GetAbsOrigin());
        EmitSoundOn("Hero_Necrolyte.ReapersScythe.Target", target);
        ApplyDamage({ victim: target, attacker: this.GetParent(), ability, damage_type: DamageTypes.MAGICAL,
            damage: Math.min(1050, target.GetMaxHealth() * 0.35), damage_flags: DamageFlag.NO_SPELL_AMPLIFICATION });
    }

    OnIntervalThink() {
        const hero = this.GetParent();
        if (!alive(hero)) { this.reset(); return; }
        if (this.owns("necro_l_lastcircle")) this.swap(AURA, E, true, true);
        const time = now();
        if (this.pulse !== undefined && this.qWind === undefined && this.pulse.ends <= time) this.clearPulse();
        if (this.anchor !== undefined) {
            if (this.shroud(this.anchor.ability) === undefined) this.clearAnchor();
            else {
                const ability = hero.FindAbilityByName(W);
                const ready = this.CanReturn();
                if (ability !== undefined && ability.IsActivated() !== ready) ability.SetActivated(ready);
            }
        }
        this.updateBeacon(time);
        if (this.verdict !== undefined) {
            if (this.verdict.ends <= time || !this.enemy(this.verdict.target)) this.clearVerdict();
            else this.refreshVerdict();
        }
    }
    OnDeath(event: ModifierInstanceEvent) {
        if (event.unit === this.GetParent()) this.reset();
        else if (event.unit === this.verdict?.target) this.clearVerdict();
    }
    private reset() {
        this.qCastUntil = 0;
        this.scytheUntil = 0;
        this.scytheTarget = undefined;
        this.clearPulse();
        this.clearAnchor();
        this.clearBeacon();
        this.clearVerdict();
    }
    OnDestroy() {
        if (!IsServer()) return;
        this.reset();
        this.swap(AURA, E, false);
    }
}

modifier_orb_necro_legend = registerModifier("modifier_orb_necro_legend", NecroLegends);
modifier_orb_necro_pulse_ready = registerModifier("modifier_orb_necro_pulse_ready", PulseReady);
modifier_orb_necro_pulse_windup = registerModifier("modifier_orb_necro_pulse_windup", PulseWindup);
modifier_orb_necro_anchor = registerModifier("modifier_orb_necro_anchor", AnchorIcon);
modifier_orb_necro_beacon = registerModifier("modifier_orb_necro_beacon", BeaconIcon);
modifier_orb_necro_exposed = registerModifier("modifier_orb_necro_exposed", Exposed);
modifier_orb_necro_plague = registerModifier("modifier_orb_necro_plague", Plague);
modifier_orb_necro_sentence = registerModifier("modifier_orb_necro_sentence", Sentence);
modifier_orb_necro_verdict = registerModifier("modifier_orb_necro_verdict", VerdictIcon);
