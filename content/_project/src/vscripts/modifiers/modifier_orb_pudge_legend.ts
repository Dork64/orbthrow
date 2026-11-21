import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf } from "../core/orbstore";
import { MAP } from "../core/mapinfo";

declare global {
    var modifier_orb_pudge_chew_mark: unknown;
    var modifier_orb_pudge_clutch: unknown;
    var modifier_orb_pudge_locked_jaws: unknown;
    var modifier_orb_pudge_legend: unknown;
    var modifier_orb_pudge_rot_mark: unknown;
    var modifier_orb_pudge_rot_ready: unknown;
    var modifier_orb_pudge_rot_fuse: unknown;
    var modifier_orb_pudge_rot_recovery: unknown;
    var modifier_orb_pudge_counter_store: unknown;
    var modifier_orb_pudge_counter_hit: unknown;
    var modifier_orb_pudge_dragging: unknown;
    var modifier_orb_pudge_drag_victim: unknown;
}

const ROT = "pudge_rot", HEAP = "pudge_flesh_heap", ULT = "pudge_dismember";
const HEAP_BUFF = "modifier_pudge_flesh_heap_block", ULT_DEBUFF = "modifier_pudge_dismember";
const COUNTER = "orb_pudge_counter";
const ROT_MARK = "modifier_orb_pudge_rot_mark";
const ROT_READY = "modifier_orb_pudge_rot_ready", ROT_FUSE = "modifier_orb_pudge_rot_fuse";
const ROT_RECOVERY = "modifier_orb_pudge_rot_recovery", STORE = "modifier_orb_pudge_counter_store";
const BITE = "modifier_orb_pudge_counter_hit", DRAG = "modifier_orb_pudge_dragging";
const VICTIM = "modifier_orb_pudge_drag_victim";
const CHEW_MARK = "modifier_orb_pudge_chew_mark";
const CLUTCH = "modifier_orb_pudge_clutch";
const LOCKED_JAWS = "modifier_orb_pudge_locked_jaws";
const GLOB = "models/events/dark_carnival/crate_drop_minigame/crate_drop_hazard_goop.vmdl";
const RING = "particles/ui_mouseactions/range_display.vpcf";
const FUMES = "particles/units/heroes/hero_pudge/pudge_rot_radius.vpcf";
const BURST = "particles/units/heroes/hero_pudge/pudge_swallow_release.vpcf";
const BITE_FX = "particles/units/heroes/hero_pudge/pudge_fleshheap_block_activation.vpcf";
const HOOK_FX = "particles/units/heroes/hero_pudge/pudge_meathook_impact.vpcf";
const CHAIN = "particles/units/heroes/hero_pudge/pudge_meathook_chain.vpcf";
const TICK = 0.05, FUSE = 0.65, BURST_RADIUS = 290, BURST_RECOVERY = 6;
const COUNTER_TIME = 4;

function now() { return GameRules.GetGameTime(); }
function live(u?: CDOTA_BaseNPC): u is CDOTA_BaseNPC {
    return u !== undefined && IsValidEntity(u) && u.IsAlive();
}
function distance(a: Vector, b: Vector) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function height(p: Vector) { return Vector(p.x, p.y, p.z + 70); }
function clear(mod?: CDOTA_Buff) { if (mod !== undefined && !mod.IsNull()) mod.Destroy(); }
function cleanup(p: ParticleID) {
    ParticleManager.DestroyParticle(p, true);
    ParticleManager.ReleaseParticleIndex(p);
}
function particle(path: string, p: Vector) {
    const id = ParticleManager.CreateParticle(path, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id, 0, p);
    return id;
}
function flash(path: string, p: Vector) { ParticleManager.ReleaseParticleIndex(particle(path, p)); }

class RotReady extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return ROT; }
}
class RotMark extends RotReady {
    IsDebuff() { return true; }
    GetEffectName() { return "particles/units/heroes/hero_pudge/pudge_rot_recipient.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
}
class RotFuse extends RotReady { GetTexture() { return "item_blight_stone"; } }
class RotRecovery extends RotReady {}
class CounterStore extends RotReady { GetTexture() { return HEAP; } }
class CounterHit extends CounterStore {
    GetTexture() { return "pudge_eject"; }
    GetEffectName() { return "particles/units/heroes/hero_pudge/pudge_fleshheap_block_body_blob.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
}
class Dragging extends RotReady { GetTexture() { return ULT; } }
class DragVictim extends Dragging { IsDebuff() { return true; } }
class LockedJaws extends CounterStore {}
class ChewMark extends DragVictim { IsPurgable() { return true; } }
class Clutch extends CounterStore {
    IsDebuff() { return true; }
    IsPurgable() { return true; }
    DeclareFunctions() { return [ModifierFunction.MOVESPEED_BONUS_PERCENTAGE]; }
    GetModifierMoveSpeedBonus_Percentage() { return -25; }
}

interface Pressure { unit: CDOTA_BaseNPC; since: number; mark?: CDOTA_Buff; }
interface Boiler {
    pos: Vector;
    blowsAt: number;
    ability: CDOTABaseAbility;
    model?: CBaseEntity;
    ring: ParticleID;
    fumes: ParticleID;
    icon?: CDOTA_Buff;
}
interface Guard {
    ability: CDOTABaseAbility;
    until: number;
    amount: number;
    spent: boolean;
    clutched: boolean;
    shown: boolean;
    icon?: CDOTA_Buff;
}
interface Counter { ability: CDOTABaseAbility; amount: number; expires: number; icon?: CDOTA_Buff; }
interface Drag {
    ability: CDOTABaseAbility;
    victim: CDOTA_BaseNPC;
    ends: number;
    acquiredBy: number;
    last: number;
    maxGap: number;
    latched: boolean;
    canDrag: boolean;
    goal?: Vector;
    stoppedAt?: number;
    casterIcon?: CDOTA_Buff;
    guardIcon?: CDOTA_Buff;
    victimIcon?: CDOTA_Buff;
    chain?: ParticleID;
}
type ChannelEnd = ModifierAbilityEvent & { interrupted?: boolean | number };

export class PudgeLegends extends ModBase {
    private pressure = new Map<EntityIndex, Pressure>();
    private rotReady?: CDOTA_Buff;
    private rotRecovery?: CDOTA_Buff;
    private readyAt = 0;
    private boiler?: Boiler;
    private guard?: Guard;
    private counter?: Counter;
    private drag?: Drag;
    private chewMark?: { victim: CDOTA_BaseNPC; ability: CDOTABaseAbility; icon: CDOTA_Buff; until: number };

    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    OnCreated() { if (IsServer()) this.StartIntervalThink(TICK); }
    DeclareFunctions() {
        return [ModifierFunction.ON_ABILITY_EXECUTED, ModifierFunction.ON_ABILITY_FULLY_CAST, ModifierFunction.ON_ABILITY_END_CHANNEL,
            ModifierFunction.ON_TAKEDAMAGE, ModifierFunction.ON_ATTACK_LANDED, ModifierFunction.ON_DEATH,
            ModifierFunction.INCOMING_DAMAGE_PERCENTAGE];
    }
    private bonuses() { return bonusesOf(this.GetParent().GetPlayerOwnerID(), true, now()); }
    private has(id: string) { return (this.bonuses().code[id] ?? 0) > 0; }
    private tracksDismember() {
        const b = this.bonuses().code;
        return (b["pudge_l_dismember"] ?? 0) > 0 || (b["pudge_p_bulk"] ?? 0) > 0 || (b["pudge_p_chew"] ?? 0) > 0;
    }

    private enemy(unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
        return live(unit) && unit.IsRealHero() && !unit.IsIllusion() && !unit.IsInvulnerable() &&
            !unit.IsOutOfGame() && unit.GetTeamNumber() !== this.GetParent().GetTeamNumber();
    }

    private nearby(p: Vector, r: number) {
        const h = this.GetParent();
        return FindUnitsInRadius(h.GetTeamNumber(), p, undefined, r, UnitTargetTeam.ENEMY,
            UnitTargetType.HERO, UnitTargetFlags.MAGIC_IMMUNE_ENEMIES, FindOrder.CLOSEST, false)
            .filter(u => this.enemy(u) && Math.abs(u.GetAbsOrigin().z - p.z) <= 160);
    }

    private resetPressure() {
        for (const entry of this.pressure.values()) clear(entry.mark);
        this.pressure.clear();
        clear(this.rotReady);
        this.rotReady = undefined;
    }

    private tickRot(ability: CDOTABaseAbility, at: number, awake: boolean) {
        const hero = this.GetParent();
        const required = (awake ? 1.1 : 1.5) - (this.has("pudge_p_stench") ? 0.2 : 0);
        if (ability.GetLevel() <= 0 || at < this.readyAt) { this.resetPressure(); return; }
        if (ability.GetToggleState()) {
            const nearby = this.nearby(hero.GetAbsOrigin(), ability.GetSpecialValueFor("rot_radius"))
                .filter(u => !u.IsDebuffImmune());
            const inside = new Set(nearby.map(u => u.entindex()));
            for (const [id, entry] of this.pressure) {
                if (inside.has(id)) continue;
                clear(entry.mark);
                this.pressure.delete(id);
            }
            let ready = 0;
            for (const u of nearby) {
                const id = u.entindex(), entry = this.pressure.get(id);
                if (entry === undefined) this.pressure.set(id, { unit: u, since: at });
                else if (at - entry.since >= required) {
                    ready++;
                    entry.mark ??= u.AddNewModifier(hero, ability, ROT_MARK, {});
                }
            }
            if (ready > 0) {
                this.rotReady ??= hero.AddNewModifier(hero, ability, ROT_READY, {});
                this.rotReady?.SetStackCount(ready);
            } else if (this.rotReady !== undefined) {
                clear(this.rotReady);
                this.rotReady = undefined;
            }
            return;
        }
        if (this.pressure.size === 0) return;
        let target: Pressure | undefined;
        const point = hero.GetAbsOrigin(), radius = ability.GetSpecialValueFor("rot_radius");
        for (const entry of this.pressure.values()) {
            if (at - entry.since < required || !this.enemy(entry.unit) || entry.unit.IsDebuffImmune()) continue;
            const pos = entry.unit.GetAbsOrigin();
            if (distance(point, pos) > radius || Math.abs(point.z - pos.z) > 160) continue;
            if (target === undefined || entry.since < target.since ||
                (entry.since === target.since && distance(point, pos) < distance(point, target.unit.GetAbsOrigin()))) target = entry;
        }
        this.resetPressure();
        if (target !== undefined) this.plantBoiler(target.unit.GetAbsOrigin(), ability, at);
    }

    private plantBoiler(pos: Vector, ability: CDOTABaseAbility, at: number) {
        const hero = this.GetParent();
        const point = GetGroundPosition(pos, hero);
        const model = SpawnEntityFromTableSynchronous("prop_dynamic", { model: GLOB, solid: 0, disableshadows: 1 });
        model?.SetAbsOrigin(point);
        model?.SetLocalScale(0.6);
        const ring = particle(RING, point);
        ParticleManager.SetParticleControl(ring, 1, Vector(BURST_RADIUS, 0, 0));
        ParticleManager.SetParticleControl(ring, 2, Vector(238, 164, 46));
        const fumes = particle(FUMES, point);
        this.readyAt = at + BURST_RECOVERY;
        this.boiler = { pos: point, ability, model, ring, fumes, blowsAt: at + FUSE,
            icon: hero.AddNewModifier(hero, ability, ROT_FUSE, { duration: FUSE }) };
    }

    private clearBoiler() {
        const b = this.boiler;
        this.boiler = undefined;
        if (b === undefined) return;
        cleanup(b.ring);
        cleanup(b.fumes);
        clear(b.icon);
        if (b.model !== undefined && IsValidEntity(b.model)) UTIL_Remove(b.model);
    }

    private tickBoiler(at: number) {
        const b = this.boiler;
        if (b === undefined) return;
        if (at < b.blowsAt) {
            if (b.model !== undefined && IsValidEntity(b.model)) b.model.SetLocalScale(1.45 - (b.blowsAt - at) / FUSE * 0.85);
            ParticleManager.SetParticleControl(b.fumes, 1, Vector(130 + (1 - (b.blowsAt - at) / FUSE) * 105, 0, 0));
            return;
        }
        this.clearBoiler();
        const h = this.GetParent();
        flash(BURST, b.pos);
        StartSoundEventFromPosition("Hero_Pudge.Dismember", b.pos);
        this.rotRecovery = h.AddNewModifier(h, b.ability, ROT_RECOVERY, { duration: Math.max(0.1, this.readyAt - at) });
        for (const foe of this.nearby(b.pos, BURST_RADIUS)) {
            if (foe.IsDebuffImmune()) continue;
            ApplyDamage({ victim: foe, attacker: h, ability: b.ability, damage_type: DamageTypes.MAGICAL,
                damage: Math.min(650, 180 + 0.1 * foe.GetMaxHealth()) });
        }
    }

    private swapCounter(show: boolean) {
        const h = this.GetParent(), alt = h.FindAbilityByName(COUNTER) ?? (show ? h.AddAbility(COUNTER) : undefined);
        const base = h.FindAbilityByName(HEAP);
        if (base === undefined || alt === undefined) return false;
        if (show) {
            alt.SetLevel(1);
            h.SwapAbilities(HEAP, COUNTER, false, true);
        } else {
            h.SwapAbilities(COUNTER, HEAP, false, true);
        }
        alt.SetHidden(!show);
        base.SetHidden(show);
        base.MarkAbilityButtonDirty();
        alt.MarkAbilityButtonDirty();
        return show;
    }

    private clearGuard() {
        const g = this.guard;
        this.guard = undefined;
        if (g === undefined) return;
        clear(g.icon);
        if (g.shown) this.swapCounter(false);
    }

    private clearCounter() {
        clear(this.counter?.icon);
        this.counter = undefined;
    }

    OnAbilityFullyCast(e: ModifierAbilityEvent) {
        if (!IsServer() || e.unit !== this.GetParent() || e.ability === undefined) return;
        const name = e.ability.GetAbilityName();
        if (name === ULT && this.drag === undefined && e.ability.IsChanneling()) this.OnAbilityExecuted(e);
        if (name !== HEAP || (!this.has("pudge_l_heap") && !this.has("pudge_p_glutton"))) return;
        this.clearGuard();
        this.clearCounter();
        this.guard = { ability: e.ability, until: now() + 0.2, amount: 0, spent: false, clutched: false, shown: false };
        this.tickGuard(now());
    }

    private tickGuard(at: number) {
        const g = this.guard, hero = this.GetParent();
        if (g === undefined) return;
        const native = hero.FindModifierByName(HEAP_BUFF);
        if (native === undefined) {
            if (at >= g.until || g.icon !== undefined || g.shown) this.clearGuard();
            return;
        }
        if (g.spent || !this.has("pudge_l_heap")) return;
        if (g.icon === undefined) {
            g.icon = hero.AddNewModifier(hero, g.ability, STORE, { duration: native.GetRemainingTime() });
            g.icon?.SetStackCount(Math.floor(g.amount));
        }
        if (!g.shown && g.amount >= 1) g.shown = this.swapCounter(true);
    }

    OnTakeDamage(e: ModifierInstanceEvent) {
        const g = this.guard, hero = this.GetParent();
        if (!IsServer() || g === undefined || g.spent || e.unit !== hero || !this.enemy(e.attacker) ||
            !this.has("pudge_l_heap") || !hero.HasModifier(HEAP_BUFF) || (e.damage_flags & (DamageFlag.HPLOSS | DamageFlag.REFLECTION)) !== 0) return;
        const cap = this.bonuses().awake ? 750 : 600;
        g.amount = Math.min(cap, g.amount + e.damage * 0.55);
        g.icon?.SetStackCount(Math.floor(g.amount));
    }

    CanCounter(): boolean {
        const g = this.guard;
        return g !== undefined && !g.spent && g.amount >= 1 && this.has("pudge_l_heap") && this.GetParent().HasModifier(HEAP_BUFF);
    }

    ArmCounter(ability: CDOTABaseAbility) {
        const g = this.guard, hero = this.GetParent();
        if (g === undefined || !this.CanCounter()) return;
        g.spent = true;
        clear(g.icon);
        g.icon = undefined;
        if (g.shown) g.shown = this.swapCounter(false);
        this.clearCounter();
        const amount = Math.floor(g.amount);
        const duration = COUNTER_TIME + (this.has("pudge_p_lard") ? 1 : 0);
        const icon = hero.AddNewModifier(hero, ability, BITE, { duration });
        icon?.SetStackCount(amount);
        this.counter = { ability, amount, expires: now() + duration, icon };
        flash(BITE_FX, hero.GetAbsOrigin());
    }

    private clutch(target: CDOTA_BaseNPC, ability: CDOTABaseAbility) {
        const hero = this.GetParent();
        if (!target.IsDebuffImmune()) target.AddNewModifier(hero, ability, CLUTCH, { duration: 1.4 });
    }

    private chew(target: CDOTA_BaseNPC, ability: CDOTABaseAbility) {
        if (target.IsAttackImmune()) return;
        const hero = this.GetParent() as CDOTA_BaseNPC_Hero;
        const dealt = ApplyDamage({ victim: target, attacker: hero, ability, damage_type: DamageTypes.PHYSICAL,
            damage_flags: DamageFlag.NO_SPELL_AMPLIFICATION | DamageFlag.NO_SPELL_LIFESTEAL,
            damage: Math.min(350, 120 + hero.GetStrength() * 0.4) });
        if (dealt > 0) hero.Heal(dealt * 0.5, ability);
        flash(HOOK_FX, height(target.GetAbsOrigin()));
    }

    private clearChewMark() {
        clear(this.chewMark?.icon);
        this.chewMark = undefined;
    }

    OnAttackLanded(e: ModifierAttackEvent) {
        const h = this.GetParent(), target = e.target;
        if (!IsServer() || e.attacker !== h || e.no_attack_cooldown || e.damage <= 0 ||
            !this.enemy(target) || target.IsAttackImmune()) return;
        const g = this.guard;
        const clutch = this.has("pudge_p_glutton");
        let slowed = false;
        if (clutch && g !== undefined && !g.clutched && h.HasModifier(HEAP_BUFF)) {
            slowed = true;
            g.clutched = true;
            this.clutch(target, g.ability);
        }
        const mark = this.chewMark;
        if (mark?.victim === target && !mark.icon.IsNull() && now() < mark.until) {
            this.clearChewMark();
            this.chew(target, mark.ability);
        }
        const c = this.counter;
        if (c === undefined || now() >= c.expires || !this.enemy(target)) return;
        this.clearCounter();
        if (clutch && !slowed) this.clutch(target, c.ability);
        const dealt = ApplyDamage({ victim: target, attacker: h, ability: c.ability,
            damage: c.amount, damage_type: DamageTypes.PHYSICAL,
            damage_flags: DamageFlag.NO_SPELL_AMPLIFICATION | DamageFlag.NO_SPELL_LIFESTEAL });
        if (dealt > 0) h.Heal(dealt * 0.45, c.ability);
        flash(HOOK_FX, height(target.GetAbsOrigin()));
    }

    GetModifierIncomingDamage_Percentage(e: ModifierAttackEvent) {
        const d = this.drag;
        if (!IsServer() || !d?.latched || !this.enemy(e?.attacker) ||
            !d.ability.IsChanneling() || !this.has("pudge_p_bulk")) return 0;
        return -25;
    }

    OnAbilityExecuted(e: ModifierAbilityEvent) {
        const hero = this.GetParent();
        if (!IsServer() || e.unit !== hero || e.ability?.GetAbilityName() !== ULT ||
            !this.tracksDismember()) return;
        this.clearDrag();
        this.clearChewMark();
        const victim = e.target ?? e.ability.GetCursorTarget();
        if (!this.enemy(victim)) return; // Поглощение союзника от Shard остаётся штатным.
        const at = now();
        this.drag = { ability: e.ability, victim, ends: at + e.ability.GetChannelTime(), acquiredBy: at + 0.25,
            last: at, maxGap: 320, latched: false, canDrag: this.has("pudge_l_dismember") };
    }

    order(e: ExecuteOrderFilterEvent): boolean {
        const d = this.drag;
        if (d === undefined || !d.canDrag || !d.latched || !d.ability.IsChanneling() || e.order_type !== UnitOrder.MOVE_TO_POSITION || e.queue === 1) return true;
        d.goal = Vector(e.position_x, e.position_y, e.position_z);
        return false;
    }

    private clearDrag() {
        const d = this.drag;
        this.drag = undefined;
        if (d === undefined) return;
        clear(d.casterIcon);
        clear(d.guardIcon);
        clear(d.victimIcon);
        if (d.chain !== undefined) cleanup(d.chain);
    }

    private finishDrag(d: Drag, finished: boolean) {
        this.clearDrag();
        if (!finished || !d.latched || !this.enemy(d.victim) || !live(this.GetParent())) return;
        const hero = this.GetParent(), chew = this.has("pudge_p_chew");
        if (!d.canDrag) {
            if (!chew || d.victim.IsDebuffImmune()) return;
            const icon = d.victim.AddNewModifier(hero, d.ability, CHEW_MARK, { duration: 4 });
            if (icon !== undefined) this.chewMark = { victim: d.victim, ability: d.ability, icon, until: now() + 4 };
            return;
        }
        const damage = 0.12 * Math.max(0, d.victim.GetMaxHealth() - d.victim.GetHealth());
        if (damage > 0) {
            flash(HOOK_FX, height(d.victim.GetAbsOrigin()));
            ApplyDamage({ victim: d.victim, attacker: hero, ability: d.ability, damage_type: DamageTypes.MAGICAL, damage });
        }
        if (chew && this.enemy(d.victim)) this.chew(d.victim, d.ability);
    }

    OnAbilityEndChannel(e: ChannelEnd) {
        const d = this.drag;
        if (!IsServer() || d === undefined || e.unit !== this.GetParent() || e.ability !== d.ability) return;
        const interrupted = e.interrupted === true || e.interrupted === 1;
        this.finishDrag(d, !interrupted && now() >= d.ends - TICK);
    }

    private tickDrag(at: number, awake: boolean) {
        const d = this.drag, hero = this.GetParent();
        if (d === undefined) return;
        if (!this.enemy(d.victim)) { this.clearDrag(); return; }
        const channeling = d.ability.IsChanneling();
        const bite = d.victim.FindModifierByName(ULT_DEBUFF);
        const held = bite !== undefined && bite.GetCaster() === hero && bite.GetAbility() === d.ability;
        if (!d.latched) {
            if (at > d.acquiredBy) { this.clearDrag(); return; }
            if (!channeling || !held) return;
            d.latched = true;
            d.maxGap = Math.min(750, Math.max(320, distance(hero.GetAbsOrigin(), d.victim.GetAbsOrigin()) + 30));
            const started = d.ability.GetChannelStartTime();
            if (started >= d.acquiredBy - 0.4 && started <= at) d.ends = started + d.ability.GetChannelTime();
            const duration = Math.max(TICK, d.ends - at);
            if (this.has("pudge_p_bulk")) d.guardIcon = hero.AddNewModifier(hero, d.ability, LOCKED_JAWS, { duration });
            if (d.canDrag) {
                d.casterIcon = hero.AddNewModifier(hero, d.ability, DRAG, { duration });
                d.victimIcon = d.victim.AddNewModifier(hero, d.ability, VICTIM, { duration });
                d.chain = particle(CHAIN, height(hero.GetAbsOrigin()));
                ParticleManager.SetParticleControl(d.chain, 1, height(d.victim.GetAbsOrigin()));
            }
        }
        if (!channeling || !held) {
            if (at < d.ends - TICK) { this.clearDrag(); return; }
            d.stoppedAt ??= at;
            if (at > d.stoppedAt + 0.08) this.finishDrag(d, !channeling && at >= d.ends && !hero.IsStunned());
            return;
        }
        const dt = Math.min(0.1, at - d.last);
        d.last = at;
        if (d.canDrag) this.stepDrag(d, dt, awake);
        if (d.chain !== undefined) {
            ParticleManager.SetParticleControl(d.chain, 0, height(hero.GetAbsOrigin()));
            ParticleManager.SetParticleControl(d.chain, 1, height(d.victim.GetAbsOrigin()));
        }
    }

    private stepDrag(d: Drag, dt: number, awake: boolean) {
        const hero = this.GetParent(), pos = hero.GetAbsOrigin(), victim = d.victim.GetAbsOrigin();
        if (d.goal === undefined || hero.IsRooted() || hero.IsStunned() || hero.IsCurrentlyHorizontalMotionControlled() ||
            hero.HasModifier("modifier_slark_pounce_leash") || hero.HasModifier("modifier_puck_dream_coil") ||
            distance(pos, victim) > d.maxGap || Math.abs(pos.z - victim.z) > 125) return;
        const gap = distance(d.goal, pos);
        if (gap <= 8) { d.goal = undefined; return; }
        const speed = (awake ? 0.7 : 0.55) + (this.has("pudge_p_bulk") ? 0.05 : 0);
        const step = Math.min(gap, hero.GetIdealSpeed() * speed * dt);
        const x = (d.goal.x - pos.x) * step / gap, y = (d.goal.y - pos.y) * step / gap;
        const next = (u: CDOTA_BaseNPC, from: Vector) => GetGroundPosition(Vector(from.x + x, from.y + y, from.z), u);
        const p = next(hero, pos), v = next(d.victim, victim);
        const free = (q: Vector, from: Vector) => Math.abs(q.x) < MAP.bounds - 36 && Math.abs(q.y) < MAP.bounds - 36 &&
            Math.abs(q.z - from.z) <= 32 && GridNav.IsTraversable(q) && !GridNav.IsBlocked(q) && GridNav.CanFindPath(from, q);
        if (!free(p, pos) || !free(v, victim)) { d.goal = undefined; return; }
        hero.SetAbsOrigin(p);
        d.victim.SetAbsOrigin(v);
    }

    OnIntervalThink() {
        const h = this.GetParent();
        if (!IsServer() || !live(h)) return;
        const b = this.bonuses(), at = now();
        const rot = (b.code["pudge_l_mire"] ?? 0) > 0 ? h.FindAbilityByName(ROT) : undefined;
        if (rot !== undefined) {
            this.tickBoiler(at);
            this.tickRot(rot, at, b.awake);
        } else {
            this.resetPressure();
            this.clearBoiler();
            clear(this.rotRecovery);
            this.rotRecovery = undefined;
        }
        if ((b.code["pudge_l_heap"] ?? 0) > 0 || (b.code["pudge_p_glutton"] ?? 0) > 0) {
            this.tickGuard(at);
            if (this.counter !== undefined && at >= this.counter.expires) this.clearCounter();
        } else {
            this.clearGuard();
            this.clearCounter();
        }
        if (this.tracksDismember()) this.tickDrag(at, b.awake);
        else this.clearDrag();
        if (this.chewMark !== undefined && (at >= this.chewMark.until || !this.enemy(this.chewMark.victim)))
            this.clearChewMark();
    }

    private clearCombat() {
        this.resetPressure();
        this.clearBoiler();
        clear(this.rotRecovery);
        this.rotRecovery = undefined;
        this.clearGuard();
        this.clearCounter();
        this.clearDrag();
        this.clearChewMark();
    }

    OnDeath(e: ModifierInstanceEvent) { if (IsServer() && e.unit === this.GetParent()) this.clearCombat(); }
    OnDestroy() { if (IsServer()) this.clearCombat(); }
}

modifier_orb_pudge_chew_mark = registerModifier("modifier_orb_pudge_chew_mark", ChewMark);
modifier_orb_pudge_clutch = registerModifier("modifier_orb_pudge_clutch", Clutch);
modifier_orb_pudge_locked_jaws = registerModifier("modifier_orb_pudge_locked_jaws", LockedJaws);
modifier_orb_pudge_legend = registerModifier("modifier_orb_pudge_legend", PudgeLegends);
modifier_orb_pudge_rot_ready = registerModifier("modifier_orb_pudge_rot_ready", RotReady);
modifier_orb_pudge_rot_mark = registerModifier("modifier_orb_pudge_rot_mark", RotMark);
modifier_orb_pudge_rot_fuse = registerModifier("modifier_orb_pudge_rot_fuse", RotFuse);
modifier_orb_pudge_rot_recovery = registerModifier("modifier_orb_pudge_rot_recovery", RotRecovery);
modifier_orb_pudge_counter_store = registerModifier("modifier_orb_pudge_counter_store", CounterStore);
modifier_orb_pudge_counter_hit = registerModifier("modifier_orb_pudge_counter_hit", CounterHit);
modifier_orb_pudge_dragging = registerModifier("modifier_orb_pudge_dragging", Dragging);
modifier_orb_pudge_drag_victim = registerModifier("modifier_orb_pudge_drag_victim", DragVictim);
