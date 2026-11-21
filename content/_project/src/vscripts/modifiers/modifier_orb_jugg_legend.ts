import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf, OrbBonuses } from "../core/orbstore";
import { MAP } from "../core/mapinfo";
import { ModifierOrbBattleShield } from "./modifier_orb_battle_shield";

declare global {
    var modifier_orb_jugg_legend: unknown;
    var modifier_orb_jugg_guardcut: unknown;
    var modifier_orb_jugg_open_wound: unknown;
    var modifier_orb_jugg_intermission: unknown;
    var modifier_orb_jugg_ward_charge: unknown;
    var modifier_orb_jugg_ward_fuse: unknown;
    var modifier_orb_jugg_encore_pause: unknown;
    var modifier_orb_jugg_ward_bind: unknown;
    var modifier_orb_jugg_cuts: unknown;
    var modifier_orb_jugg_encore_ready: unknown;
    var modifier_orb_jugg_encore_slash: unknown;
}

const WARD = "juggernaut_healing_ward";
const WARD_UNIT = "npc_dota_juggernaut_healing_ward";
const DANCE = "juggernaut_blade_dance";
const OMNI = "juggernaut_omni_slash";
const OMNI_STATE = "modifier_juggernaut_omnislash";
const CUTS = "orb_jugg_three_cuts";
const ENCORE = "orb_jugg_encore";
const CHARGE = "modifier_orb_jugg_ward_charge";
const FUSE = "modifier_orb_jugg_ward_fuse";
const R_DELAY = "modifier_orb_jugg_encore_pause";
const BIND = "modifier_orb_jugg_ward_bind";
const CUT_STATE = "modifier_orb_jugg_cuts";
const R_READY = "modifier_orb_jugg_encore_ready";
const R_SLASH = "modifier_orb_jugg_encore_slash";
const WOUND = "modifier_orb_jugg_open_wound";
const INTERMISSION = "modifier_orb_jugg_intermission";
const W_RADIUS = 475;
const W_FUSE = 0.65;
const W_CLOSE = 0.38;
const R_PAUSE = 0.9;
const R_RANGE = 450;
const W_RING = "particles/ui_mouseactions/range_display.vpcf";
const W_FIRE = "particles/units/heroes/hero_juggernaut/juggernaut_healingward_flame.vpcf";
const W_BURST = "particles/units/heroes/hero_juggernaut/juggernaut_healing_ward_eruption.vpcf";
const W_BLADE = "particles/units/heroes/hero_juggernaut/juggernaut_omni_dash.vpcf";
const HIT = "particles/units/heroes/hero_juggernaut/juggernaut_omni_slash_tgt.vpcf";
const GLOW = "particles/units/heroes/hero_juggernaut/juggernaut_omnislash_light.vpcf";

const time = () => GameRules.GetGameTime();
function live(u?: CDOTA_BaseNPC): u is CDOTA_BaseNPC { return u !== undefined && IsValidEntity(u) && u.IsAlive(); }
function clearParticle(p?: ParticleID) {
    if (p === undefined) return;
    ParticleManager.DestroyParticle(p, true);
    ParticleManager.ReleaseParticleIndex(p);
}
function burst(path: string, point: Vector) {
    const id = ParticleManager.CreateParticle(path, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id, 0, point);
    ParticleManager.ReleaseParticleIndex(id);
}
function attached(path: string, target: CDOTA_BaseNPC) {
    const id = ParticleManager.CreateParticle(path, ParticleAttachment.ABSORIGIN_FOLLOW, target);
    ParticleManager.ReleaseParticleIndex(id);
}
function distance(a: Vector, b: Vector): number {
    return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
}
function dashFlash(from: Vector, to: Vector) {
    const id = ParticleManager.CreateParticle(W_BLADE, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id, 0, Vector(from.x, from.y, from.z + 57));
    ParticleManager.SetParticleControl(id, 1, Vector(to.x, to.y, to.z + 57));
    ParticleManager.ReleaseParticleIndex(id);
}
function clearMod(mod?: CDOTA_Buff) { if (mod !== undefined && !mod.IsNull()) mod.Destroy(); }

interface WardState {
    ability: CDOTABaseAbility;
    ward?: CDOTA_BaseNPC;
    target?: CDOTA_BaseNPC;
    stacks: number;
    findUntil: number;
    point: Vector;
    after?: EntityIndex;
    icon?: CDOTA_Buff;
    fire?: ParticleID;
    ownerIcon?: CDOTA_Buff;
    sweep?: ParticleID[];
    burstPlayed?: boolean;
    center?: Vector;
    ring?: ParticleID;
    arm?: number;
    hit: Set<EntityIndex>;
    leaveWard: boolean;
}
interface CutState {
    until: number;
    target?: CDOTA_BaseNPC;
    hits: number;
    record?: number;
    icon?: CDOTA_Buff;
    critical: number;
}
interface EncoreWindow { opens: number; closes: number; icon?: CDOTA_Buff; }
interface EncoreAttack { victim: CDOTA_BaseNPC; hits: number; next: number; mod?: CDOTA_Buff; }

class GuardCut extends ModBase {
    IsHidden() { return false; }
    IsDebuff() { return true; }
    IsPurgable() { return true; }
    GetTexture() { return WARD; }
    DeclareFunctions() { return [ModifierFunction.MOVESPEED_BONUS_PERCENTAGE]; }
    GetModifierMoveSpeedBonus_Percentage() { return -25; }
}

class OpenWound extends ModBase {
    IsHidden() { return false; }
    IsDebuff() { return true; }
    IsPurgable() { return true; }
    GetTexture() { return OMNI; }
}

class Intermission extends ModifierOrbBattleShield {
    GetTexture() { return "juggernaut_swift_slash"; }
}

class WardIcon extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return WARD; }
}

class WardFuse extends WardIcon {
    GetTexture() { return "juggernaut_blade_fury"; }
}

class WardBind extends ModBase {
    IsHidden() { return false; }
    IsDebuff() { return true; }
    IsPurgable() { return true; }
    GetTexture() { return WARD; }
    CheckState() { return { [ModifierState.ROOTED]: true }; }
}

class CutIcon extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return "juggernaut_blade_dance_arcana"; }
}

class EncoreIcon extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return OMNI; }
}

class EncoreReady extends EncoreIcon {
    GetTexture() { return "juggernaut_swift_slash"; }
}

class EncoreSlash extends EncoreIcon {
    CheckState() {
        return { [ModifierState.COMMAND_RESTRICTED]: true, [ModifierState.INVULNERABLE]: true,
            [ModifierState.NO_UNIT_COLLISION]: true, [ModifierState.NO_HEALTH_BAR]: true };
    }
    GetEffectName() { return GLOW; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
}

export class JuggernautLegends extends ModBase {
    private ward?: WardState;
    private cuts?: CutState;
    private trackingOmni = false;
    private pendingOmniUntil = 0;
    private encore?: EncoreWindow;
    private omniWounds = new Map<EntityIndex, { hits: number; icon?: CDOTA_Buff; victim: CDOTA_BaseNPC }>();
    private rhythm?: { target: CDOTA_BaseNPC; hits: number; until: number };
    private rhythmReadyAt = 0;
    private slashing?: EncoreAttack;
    private cutsShown = false;
    private encoreShown = false;
    private lastWard?: EntityIndex;
    private bonuses(): OrbBonuses { return bonusesOf(this.GetParent().GetPlayerOwnerID(), true, time()); }
    private owns(id: string): boolean { return (this.bonuses().code[id] ?? 0) > 0; }

    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    OnCreated() { if (IsServer()) this.StartIntervalThink(0.05); }
    DeclareFunctions() { return [
        ModifierFunction.ON_ABILITY_FULLY_CAST, ModifierFunction.ON_ATTACK_LANDED,
        ModifierFunction.ON_ATTACK_FAIL, ModifierFunction.PREATTACK_CRITICALSTRIKE, ModifierFunction.ON_DEATH,
    ]; }

    private enemy(target?: CDOTA_BaseNPC): target is CDOTA_BaseNPC {
        return live(target) && target.IsRealHero() && !target.IsIllusion() && !target.IsOutOfGame() &&
            !target.IsInvulnerable() && target.GetTeamNumber() !== this.GetParent().GetTeamNumber();
    }

    private flip(original: string, name: string, show: boolean): boolean {
        const hero = this.GetParent();
        const base = hero.FindAbilityByName(original);
        if (base === undefined) return false;
        const alt = hero.FindAbilityByName(name) ?? (show ? hero.AddAbility(name) : undefined);
        if (alt === undefined) return false;
        if (show) {
            alt.SetLevel(name === CUTS ? base.GetLevel() : 1);
            hero.SwapAbilities(original, name, name === CUTS, true);
            base.SetHidden(true);
            alt.SetHidden(false);
        } else {
            hero.SwapAbilities(name, original, false, true);
            alt.SetHidden(true);
            base.SetHidden(false);
        }
        base.MarkAbilityButtonDirty();
        alt.MarkAbilityButtonDirty();
        return show;
    }

    private clearWard() {
        const s = this.ward;
        this.ward = undefined;
        if (s === undefined) return;
        clearParticle(s.ring);
        clearParticle(s.fire);
        for (const blade of s.sweep ?? []) clearParticle(blade);
        clearMod(s.icon);
        clearMod(s.ownerIcon);
    }

    private clearCuts() {
        clearMod(this.cuts?.icon);
        this.cuts = undefined;
    }

    private clearEncore() {
        clearMod(this.encore?.icon);
        this.encore = undefined;
        if (this.encoreShown) this.encoreShown = this.flip(OMNI, ENCORE, false);
    }

    private clearSlashes() {
        const previous = this.slashing;
        this.slashing = undefined;
        clearMod(previous?.mod);
    }

    private clearCombat() {
        this.clearWard();
        this.clearCuts();
        this.clearEncore();
        this.clearSlashes();
        this.trackingOmni = false;
        this.pendingOmniUntil = 0;
        this.clearWounds();
        this.rhythm = undefined;
    }

    OnDestroy() {
        if (!IsServer()) return;
        this.clearCombat();
        if (this.cutsShown) this.cutsShown = this.flip(DANCE, CUTS, false);
    }
    OnDeath(e: ModifierInstanceEvent) { if (IsServer() && e.unit === this.GetParent()) this.clearCombat(); }

    OnAbilityFullyCast(e: ModifierAbilityEvent) {
        const hero = this.GetParent();
        if (!IsServer() || e.unit !== hero || e.ability === undefined) return;
        const a = e.ability;
        if (a.GetAbilityName() === WARD && this.owns("jugg_l_sanctuary")) {
            this.clearWard();
            this.ward = { ability: a, findUntil: time() + 0.85, point: a.GetCursorPosition(), after: this.lastWard,
                hit: new Set(), stacks: 0, leaveWard: this.bonuses().awake };
        }
        if (a.GetAbilityName() === OMNI && (this.owns("jugg_l_endless") ||
            this.owns("jugg_p_bloody_omni") || this.owns("jugg_p_dispel"))) {
            this.clearWounds();
            this.clearEncore();
            this.trackingOmni = hero.HasModifier(OMNI_STATE);
            this.pendingOmniUntil = this.trackingOmni ? 0 : time() + 0.28;
        }
    }

    StartCuts(ability: CDOTABaseAbility) {
        if (!this.owns("jugg_l_cuts")) return;
        this.clearCuts();
        const hero = this.GetParent();
        const icon = hero.AddNewModifier(hero, ability, CUT_STATE, { duration: 5 });
        icon?.SetStackCount(1);
        this.cuts = { until: time() + 5, hits: 0, icon, critical: this.bonuses().awake ? 350 : 300 };
        attached(HIT, hero);
    }

    CanEncore(): boolean {
        const w = this.encore;
        return w !== undefined && time() >= w.opens && time() < w.closes && this.owns("jugg_l_endless");
    }

    StartEncore(ability: CDOTABaseAbility, victim?: CDOTA_BaseNPC) {
        if (!this.CanEncore()) return;
        this.clearEncore();
        if (!this.enemy(victim) || victim.TriggerSpellAbsorb(ability) || victim.IsAttackImmune()) return;
        const hero = this.GetParent();
        const mod = hero.AddNewModifier(hero, ability, R_SLASH, {duration: 1.25});
        if (mod === undefined) return;
        this.slashing = { victim, hits: 0, next: time(), mod };
        this.tickEncoreSlashes(time(), R_RANGE + 65);
    }

    private ordinary(e: ModifierAttackEvent): boolean {
        const hero = this.GetParent();
        return e.attacker === hero && !e.no_attack_cooldown && live(hero) &&
            this.slashing === undefined && !hero.HasModifier(OMNI_STATE) && !hero.HasModifier("modifier_juggernaut_swift_slash") &&
            !hero.HasModifier("modifier_juggernaut_blade_fury") && !hero.HasModifier("modifier_juggernaut_trinity") &&
            !hero.HasModifier("modifier_juggernaut_vaulted_strike");
    }

    GetModifierPreAttack_CriticalStrike(e: ModifierAttackEvent): number {
        const s = this.cuts;
        if (!IsServer() || s === undefined || s.hits !== 2 || e.target !== s.target || time() >= s.until ||
            !this.ordinary(e) || !this.enemy(e.target)) return 0;
        if (s.record !== undefined && s.record !== e.record) return 0;
        s.record = e.record;
        const wounded = this.owns("jugg_p_finisher") && e.target.GetHealthPercent() < 40;
        return s.critical + (wounded ? 35 : 0);
    }

    OnAttackFail(e: ModifierAttackEvent) {
        if (IsServer() && this.cuts?.record !== undefined && this.cuts.record === e.record && e.attacker === this.GetParent())
            this.clearCuts();
    }

    private clearWounds() {
        for (const w of this.omniWounds.values()) clearMod(w.icon);
        this.omniWounds.clear();
    }

    private wound(target: CDOTA_BaseNPC, attack: boolean, nativeOmni: boolean) {
        const hero = this.GetParent(), ability = hero.FindAbilityByName(OMNI), id = target.entindex();
        let entry = this.omniWounds.get(id);
        if (nativeOmni) {
            if (entry === undefined) {
                entry = { hits: 0, victim: target };
                this.omniWounds.set(id, entry);
            }
            entry.hits++;
            if (entry.hits === 2 && !target.IsDebuffImmune())
                entry.icon = target.AddNewModifier(hero, ability, WOUND, { duration: 5 });
            return;
        }
        if (!attack || entry?.icon === undefined || entry.icon.IsNull() || target.IsAttackImmune()) return;
        clearMod(entry.icon);
        entry.icon = undefined;
        attached(HIT, target);
        ApplyDamage({ victim: target, attacker: hero, ability, damage_type: DamageTypes.PHYSICAL,
            damage_flags: DamageFlag.NO_SPELL_AMPLIFICATION | DamageFlag.NO_SPELL_LIFESTEAL,
            damage: Math.min(400, 140 + 0.08 * (target.GetMaxHealth() - target.GetHealth())) });
    }

    private countRhythm(target: CDOTA_BaseNPC) {
        const now = time(), hero = this.GetParent();
        if (now < this.rhythmReadyAt) return;
        if (this.rhythm === undefined || this.rhythm.target !== target || now >= this.rhythm.until)
            this.rhythm = { target, hits: 0, until: now + 5 };
        if (++this.rhythm.hits < 3) return;
        this.rhythm = undefined;
        this.rhythmReadyAt = now + 5;
        for (const name of ["juggernaut_blade_fury", OMNI]) {
            const a = hero.FindAbilityByName(name);
            if (a === undefined || a.GetMaxAbilityCharges(Math.max(0, a.GetLevel() - 1)) > 0) continue;
            const left = a.GetCooldownTimeRemaining();
            if (left <= 0) continue;
            a.EndCooldown();
            if (left > 1) a.StartCooldown(left - 1);
        }
    }

    OnAttackLanded(e: ModifierAttackEvent) {
        if (!IsServer() || e.attacker !== this.GetParent()) return;
        const ordinary = this.ordinary(e);
        if (this.enemy(e.target) && e.damage > 0 && this.owns("jugg_p_bloody_omni"))
            this.wound(e.target, ordinary || this.slashing !== undefined, this.GetParent().HasModifier(OMNI_STATE));
        if (!ordinary) return;
        if (!this.enemy(e.target) || e.damage <= 0) {
            if (this.cuts?.record !== undefined && this.cuts.record === e.record) this.clearCuts();
            return;
        }
        this.chargeWard(e.target);
        if (this.owns("jugg_p_death_dance")) this.countRhythm(e.target);
        const s = this.cuts;
        if (s === undefined || time() >= s.until) return;
        if (s.target !== undefined && s.target !== e.target) { this.clearCuts(); return; }
        s.target = e.target;
        s.hits++;
        if (s.hits === 3) {
            attached(HIT, e.target);
            this.clearCuts();
            return;
        }
        s.icon?.SetStackCount(s.hits + 1);
        if (s.hits === 2) this.stepAcross(e.target);
    }

    private stepAcross(target: CDOTA_BaseNPC) {
        const hero = this.GetParent();
        if (hero.IsRooted() || hero.IsCurrentlyHorizontalMotionControlled() ||
            hero.HasModifier("modifier_slark_pounce_leash") || hero.HasModifier("modifier_puck_dream_coil")) return;
        const from = hero.GetAbsOrigin(), center = target.GetAbsOrigin();
        const dx = center.x-from.x, dy = center.y-from.y, span = distance(from, center);
        if (span < 20 || span > 185) return;
        const to = GetGroundPosition(Vector(center.x+dx/span*105, center.y+dy/span*105, center.z), hero);
        if (Math.abs(to.z-from.z) > 90 || Math.abs(to.x) >= MAP.bounds || Math.abs(to.y) >= MAP.bounds ||
            !GridNav.CanFindPath(from, to) || !GridNav.IsTraversable(to) || GridNav.IsBlocked(to)) return;
        dashFlash(from, to);
        FindClearSpaceForUnit(hero, to, true);
    }

    private chargeWard(target: CDOTA_BaseNPC) {
        const s = this.ward, hero = this.GetParent();
        if (s === undefined || !live(s.ward) || s.arm !== undefined) return;
        const pos = s.ward.GetAbsOrigin();
        if (distance(hero.GetAbsOrigin(), pos) > W_RADIUS || distance(target.GetAbsOrigin(), pos) > W_RADIUS) return;
        s.stacks = s.target === target ? s.stacks + 1 : 1;
        s.target = target;
        s.icon?.SetStackCount(s.stacks);
        s.ownerIcon?.SetStackCount(s.stacks);
        if (s.stacks < 2) {
            dashFlash(target.GetAbsOrigin(), pos);
            return;
        }
        s.center = pos;
        s.arm = time() + W_FUSE;
        clearMod(s.icon);
        clearMod(s.ownerIcon);
        s.icon = s.ward.AddNewModifier(hero, s.ability, FUSE, { duration: W_FUSE + W_CLOSE });
        s.ownerIcon = hero.AddNewModifier(hero, s.ability, FUSE, { duration: W_FUSE + W_CLOSE });
        s.ring = ParticleManager.CreateParticle(W_RING, ParticleAttachment.WORLDORIGIN, undefined);
        ParticleManager.SetParticleControl(s.ring, 0, pos);
        ParticleManager.SetParticleControl(s.ring, 1, Vector(W_RADIUS, 0, 0));
        ParticleManager.SetParticleControl(s.ring, 2, Vector(255, 154, 75));
        s.fire = ParticleManager.CreateParticle(W_FIRE, ParticleAttachment.ABSORIGIN_FOLLOW, s.ward);
        EmitSoundOn("Hero_Juggernaut.BladeFuryStart", s.ward);
        s.sweep = [];
        // Six inward blade trails show which way the attack will travel.
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            const x = Math.cos(angle), y = Math.sin(angle);
            const blade = ParticleManager.CreateParticle(W_BLADE, ParticleAttachment.WORLDORIGIN, undefined);
            ParticleManager.SetParticleControl(blade, 0, Vector(pos.x+x*W_RADIUS, pos.y+y*W_RADIUS, pos.z+57));
            ParticleManager.SetParticleControl(blade, 1, Vector(pos.x+x*300, pos.y+y*300, pos.z+57));
            s.sweep.push(blade);
        }
    }

    private tickWard(now: number) {
        const s = this.ward;
        if (s === undefined) return;
        const hero = this.GetParent();
        if (s.ward === undefined) {
            if (now >= s.findUntil) { this.clearWard(); return; }
            const found = FindUnitsInRadius(hero.GetTeamNumber(), s.point, undefined, 425,
                UnitTargetTeam.FRIENDLY, UnitTargetType.ALL, UnitTargetFlags.INVULNERABLE, FindOrder.CLOSEST, false)
                .find(u => live(u) && u.GetUnitName() === WARD_UNIT && u.GetPlayerOwnerID() === hero.GetPlayerOwnerID() && u.entindex() !== s.after);
            if (found !== undefined) {
                s.ward = found;
                this.lastWard = found.entindex();
                s.icon = found.AddNewModifier(hero, s.ability, CHARGE, {});
                s.ownerIcon = hero.AddNewModifier(hero, s.ability, CHARGE, {});
            }
            return;
        }
        if (!live(s.ward)) { this.clearWard(); return; }
        if (s.arm === undefined || s.center === undefined || s.ring === undefined || now < s.arm) return;
        const center = s.center;
        const t = Math.min(1, (now-s.arm)/W_CLOSE);
        const radius = W_RADIUS * (1-t);
        ParticleManager.SetParticleControl(s.ring, 1, Vector(radius, 0, 0));
        if (!s.burstPlayed) { burst(W_BURST, center); s.burstPlayed = true; }
        // The accents follow the same contraction as the hit radius.
        for (const [i, blade] of (s.sweep ?? []).entries()) {
            const angle = i * Math.PI / 3 + t * 1.9;
            const x = Math.cos(angle), y = Math.sin(angle);
            ParticleManager.SetParticleControl(blade, 0, Vector(center.x+x*(radius+90), center.y+y*(radius+90), center.z+57));
            ParticleManager.SetParticleControl(blade, 1, Vector(center.x+x*radius, center.y+y*radius, center.z+57));
        }
        const foes = FindUnitsInRadius(hero.GetTeamNumber(), center, undefined, W_RADIUS,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.MAGIC_IMMUNE_ENEMIES, FindOrder.ANY, false);
        for (const foe of foes) {
            if (!this.enemy(foe) || s.hit.has(foe.entindex())) continue;
            const pos = foe.GetAbsOrigin();
            const r = distance(pos, center);
            if (Math.abs(center.z-pos.z) > 160 || r < radius) continue;
            s.hit.add(foe.entindex());
            attached(HIT, foe);
            ApplyDamage({ victim: foe, attacker: hero, ability: s.ability, damage_type: DamageTypes.MAGICAL,
                damage: Math.min(700, 380 + 0.1 * foe.GetMaxHealth()) });
            if (live(foe) && !foe.IsDebuffImmune()) {
                if (r > 15 && !foe.IsCurrentlyHorizontalMotionControlled()) {
                    foe.AddNewModifier(hero, s.ability, "modifier_knockback", { duration: 0.24, knockback_duration: 0.24,
                        center_x: pos.x+(pos.x-center.x)/r*50, center_y: pos.y+(pos.y-center.y)/r*50,
                        center_z: pos.z, knockback_distance: Math.min(r, 300), knockback_height: 0, should_stun: 0 });
                }
                foe.AddNewModifier(hero, s.ability, BIND, {duration: 0.9});
            }
        }
        if (t >= 1) {
            this.clearWard();
            if (!s.leaveWard && live(s.ward)) s.ward.ForceKill(false);
        }
    }

    private tickEncoreSlashes(now: number, reach = 550) {
        const s = this.slashing;
        const hero = this.GetParent();
        if (s === undefined || now < s.next) return;
        const u = s.victim;
        if (!this.enemy(u) || u.IsAttackImmune() || s.mod === undefined || s.mod.IsNull() ||
            !hero.CanEntityBeSeenByMyTeam(u) || distance(hero.GetAbsOrigin(), u.GetAbsOrigin()) > reach) {
            this.clearSlashes();
            return;
        }
        const from = hero.GetAbsOrigin(), to = u.GetAbsOrigin();
        const angle = s.hits * 2.4;
        const end = Vector(to.x+Math.cos(angle)*110, to.y+Math.sin(angle)*110, to.z);
        dashFlash(from, end);
        if (Math.abs(end.x) < MAP.bounds && Math.abs(end.y) < MAP.bounds) FindClearSpaceForUnit(hero, end, true);
        hero.FaceTowards(to);
        attached(HIT, u);
        EmitSoundOn("Hero_Juggernaut.OmniSlash", u);
        s.hits++;
        s.next = now + 0.36;
        hero.PerformAttack(u, false, true, true, false, false, false, false);
        if (s.hits >= 3) this.clearSlashes();
    }

    OnIntervalThink() {
        if (!IsServer()) return;
        const hero = this.GetParent();
        if (!live(hero)) return;
        const b = this.bonuses(), now = time();
        const showCuts = (b.code["jugg_l_cuts"] ?? 0) > 0 && hero.FindAbilityByName(DANCE) !== undefined;
        if (showCuts !== this.cutsShown) {
            this.clearCuts();
            this.cutsShown = this.flip(DANCE, CUTS, showCuts);
        }
        if (this.cuts !== undefined && (now >= this.cuts.until || (this.cuts.target !== undefined && !this.enemy(this.cuts.target))))
            this.clearCuts();
        if ((b.code["jugg_l_sanctuary"] ?? 0) > 0) this.tickWard(now);
        else this.clearWard();
        const encore = (b.code["jugg_l_endless"] ?? 0) > 0;
        if (!encore) { this.clearEncore(); this.clearSlashes(); }
        for (const [id, w] of this.omniWounds) {
            if (!this.enemy(w.victim)) { clearMod(w.icon); this.omniWounds.delete(id); }
        }
        if (this.pendingOmniUntil > 0) {
            if (now >= this.pendingOmniUntil) this.pendingOmniUntil = 0;
            else if (hero.HasModifier(OMNI_STATE)) { this.trackingOmni = true; this.pendingOmniUntil = 0; }
        }
        if (this.trackingOmni && !hero.HasModifier(OMNI_STATE)) {
            this.trackingOmni = false;
            const native = hero.FindAbilityByName(OMNI);
            if ((b.code["jugg_p_dispel"] ?? 0) > 0) {
                hero.AddNewModifier(hero, native, INTERMISSION, { duration: encore ? 2.2 : 1.5,
                    amount: 170 + 30 * (native?.GetLevel() ?? 1) });
            }
            if (encore) {
                const wnd = b.awake ? 6 : 5;
                this.encore = { opens: now + R_PAUSE, closes: now + wnd,
                    icon: hero.AddNewModifier(hero, native, R_DELAY, { duration: R_PAUSE }) };
            }
        }
        const w = this.encore;
        if (w !== undefined) {
            const native = hero.FindAbilityByName(OMNI);
            if (native === undefined || native.IsCooldownReady() || now >= w.closes) this.clearEncore();
            else if (now >= w.opens && !this.encoreShown) {
                this.encoreShown = this.flip(OMNI, ENCORE, true);
                if (this.encoreShown) {
                    clearMod(w.icon);
                    w.icon = hero.AddNewModifier(hero, native, R_READY, { duration: w.closes - now });
                }
            }
        }
        this.tickEncoreSlashes(now);
    }
}

modifier_orb_jugg_guardcut = registerModifier("modifier_orb_jugg_guardcut", GuardCut);
modifier_orb_jugg_open_wound = registerModifier("modifier_orb_jugg_open_wound", OpenWound);
modifier_orb_jugg_intermission = registerModifier("modifier_orb_jugg_intermission", Intermission);
modifier_orb_jugg_legend = registerModifier("modifier_orb_jugg_legend", JuggernautLegends);
modifier_orb_jugg_ward_charge = registerModifier("modifier_orb_jugg_ward_charge", WardIcon);
modifier_orb_jugg_ward_bind = registerModifier("modifier_orb_jugg_ward_bind", WardBind);
modifier_orb_jugg_cuts = registerModifier("modifier_orb_jugg_cuts", CutIcon);
modifier_orb_jugg_ward_fuse = registerModifier("modifier_orb_jugg_ward_fuse", WardFuse);
modifier_orb_jugg_encore_pause = registerModifier("modifier_orb_jugg_encore_pause", EncoreIcon);
modifier_orb_jugg_encore_ready = registerModifier("modifier_orb_jugg_encore_ready", EncoreReady);
modifier_orb_jugg_encore_slash = registerModifier("modifier_orb_jugg_encore_slash", EncoreSlash);
