import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf } from "../core/orbstore";

declare global {
    var modifier_orb_tusk: unknown;
    var modifier_orb_tusk_stance: unknown;
}

const Q = "tusk_ice_shards";
const W = "tusk_snowball";
const E = "tusk_tag_team";
const R = "tusk_walrus_punch";
const STANCE = "modifier_orb_tusk_stance";
const STEP = 0.05;
const ROLL = 1, READY = 2, GUARD = 3, WINDUP = 4;
const now = () => GameRules.GetGameTime();
function distance(a: Vector, b: Vector) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }
function enemy(hero: CDOTA_BaseNPC, unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
    return unit !== undefined && IsValidEntity(unit) && unit.IsRealHero() && unit.IsAlive() &&
        !unit.IsIllusion() && unit.GetTeamNumber() !== hero.GetTeamNumber() && !unit.IsInvulnerable();
}
function hit(hero: CDOTA_BaseNPC, victim: CDOTA_BaseNPC, ability: CDOTABaseAbility, damage: number, type: DamageTypes) {
    ApplyDamage({attacker:hero, victim, ability, damage, damage_type:type});
}
interface Post { pos: Vector; arm: number; expires: number; particle: ParticleID; }
interface Cast { target: CDOTA_BaseNPC; at: number; }
interface Roll { ends: number; heading: number; goal: Vector; inside: Set<EntityIndex>; hits: number; }

class TuskStance extends ModBase {
    IsPurgable() { return false; }
    GetTexture() { return ["", W, E, E, R][this.GetStackCount()] ?? E; }
    DeclareFunctions() { return [ModifierFunction.MODEL_CHANGE]; }
    CheckState() {
        return this.GetStackCount() === ROLL ? { [ModifierState.DISARMED]: true, [ModifierState.SILENCED]: true } : {};
    }
    GetModifierModelChange() { return this.GetStackCount() === ROLL ? "models/particle/snowball.vmdl" : ""; }
}

export class TuskOrbs extends ModBase {
    private posts: Post[] = [];
    private flight?: {from:Vector; dir:Vector; at:number; post:Post; speed:number};
    private rolling?: Roll;
    private rollUntil = 0;
    private launchFrom?: Vector;
    private tagEnd = 0;
    private swings = 0;
    private ready = 0;
    private guard = 0;
    private windup?: Cast;
    private releasing = false;
    private charged?: Cast;
    private landings: Cast[] = [];
    private lastStep = 0;
    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    private bonuses() { return bonusesOf(this.GetParent().GetPlayerOwnerID(), true, now()); }
    private owns(id: string) { return (this.bonuses().code["tusk_l_" + id] ?? 0) > 0; }
    private stance(mode: number, duration: number) {
        const hero = this.GetParent();
        hero.RemoveModifierByName(STANCE);
        if (duration > 0) hero.AddNewModifier(hero, undefined, STANCE, {duration})?.SetStackCount(mode);
    }
    OnCreated() { if (IsServer()) { this.lastStep = now(); this.StartIntervalThink(STEP); } }
    DeclareFunctions() { return [ModifierFunction.ON_ABILITY_FULLY_CAST, ModifierFunction.ON_ATTACK_LANDED,
        ModifierFunction.ON_TAKEDAMAGE, ModifierFunction.ABSORB_SPELL, ModifierFunction.AVOID_DAMAGE, ModifierFunction.ON_DEATH]; }
    private removePost(p: Post) {
        ParticleManager.DestroyParticle(p.particle, false);
        ParticleManager.ReleaseParticleIndex(p.particle);
        const index = this.posts.indexOf(p);
        if (index >= 0) this.posts.splice(index, 1);
        if (this.flight?.post === p) this.flight = undefined;
    }
    private clear() {
        for (const p of [...this.posts]) this.removePost(p);
        this.endRoll();
        this.windup = undefined; this.charged = undefined; this.landings = []; this.rollUntil = 0;
        this.tagEnd = this.ready = this.guard = this.swings = 0;
        this.stance(0,0);
    }
    OnDestroy() { if (IsServer()) this.clear(); }
    OnDeath(e: ModifierInstanceEvent) { if (IsServer() && e.unit === this.GetParent()) this.clear(); }
    OnAbilityFullyCast(e: ModifierAbilityEvent) {
        const hero = this.GetParent();
        if (!IsServer() || e.unit !== hero || !e.ability) return;
        const ab = e.ability, name = ab.GetAbilityName();
        if (name === Q && this.owns("wall")) {
            const pos = ab.GetCursorPosition(), from = hero.GetAbsOrigin();
            const d = Math.max(1, distance(pos, from)), speed = Math.max(1,ab.GetSpecialValueFor("shard_speed"));
            const arm = now() + d / speed;
            const particle = ParticleManager.CreateParticle("particles/ui_mouseactions/range_display.vpcf", ParticleAttachment.WORLDORIGIN, hero);
            ParticleManager.SetParticleControl(particle,0,pos);
            ParticleManager.SetParticleControl(particle,1,Vector(85,0,0));
            const post = {pos, arm, expires:arm+ab.GetSpecialValueFor("shard_duration"),particle};
            if (this.posts.length >= 2) this.removePost(this.posts[0]);
            this.posts.push(post);
            this.flight = {from, dir:Vector((pos.x-from.x)/d,(pos.y-from.y)/d,0), at:now(), post,speed};
        } else if (name === "tusk_ice_shards_stop" && this.flight && now() < this.flight.post.arm) {
            const f = this.flight, travel = (now()-f.at)*f.speed;
            f.post.pos = Vector(f.from.x+travel*f.dir.x, f.from.y+travel*f.dir.y, f.from.z);
            f.post.expires -= f.post.arm-now(); f.post.arm = now();
            ParticleManager.SetParticleControl(f.post.particle,0,f.post.pos);
        } else if (name === W) {
            this.launchFrom = hero.GetAbsOrigin();
            this.rollUntil = this.owns("roll") ? now()+ab.GetSpecialValueFor("snowball_windup")+ab.GetSpecialValueFor("snowball_duration")+1 : 0;
        }
        else if (name === E && this.owns("counter")) {
            this.tagEnd = now()+ab.GetSpecialValueFor("debuff_duration"); this.swings = 0;
        }
    }
    private wall(target: CDOTA_BaseNPC, from?: Vector) {
        const h = this.GetParent(), ab = h.FindAbilityByName(Q);
        if (!ab || target.IsDebuffImmune()) return;
        const origin = from ?? h.GetAbsOrigin(), pos = target.GetAbsOrigin(), d = Math.max(1,distance(origin,pos));
        const dx = (pos.x-origin.x)/d, dy = (pos.y-origin.y)/d;
        for (const p of this.posts) {
            const x = p.pos.x-pos.x, y = p.pos.y-pos.y, along = x*dx+y*dy;
            if (now()<p.arm || now()>p.expires || along<0 || along>(this.bonuses().awake?300:220) || Math.abs(x*dy-y*dx)>85) continue;
            this.removePost(p);
            target.AddNewModifier(h,ab,"modifier_knockback",{center_x:origin.x,center_y:origin.y,center_z:origin.z,
                duration:0.2,knockback_duration:0.2,knockback_distance:along,knockback_height:30,should_stun:0});
            hit(h,target,ab,2*h.GetAverageTrueAttackDamage(target),DamageTypes.PHYSICAL);
            if (target.IsAlive()) hit(h,target,ab,ab.GetSpecialValueFor("shard_damage"),DamageTypes.MAGICAL);
            break;
        }
    }
    OnAttackLanded(e: ModifierAttackEvent) {
        const h = this.GetParent(), t = e.target;
        if (!IsServer() || e.attacker !== h || !enemy(h,t)) return;
        if (this.posts.length > 0) this.wall(t);
        if (this.charged?.target === t && this.charged.at >= now()) {
            this.charged = undefined;
            const ab = h.FindAbilityByName(R);
            if (ab && t.IsAlive()) {
                hit(h,t,ab,(h.GetAverageTrueAttackDamage(t)+ab.GetSpecialValueFor("bonus_damage"))*ab.GetSpecialValueFor("crit_multiplier")/100,DamageTypes.PHYSICAL);
                this.landings.push({target:t, at:now()+ab.GetSpecialValueFor("air_time")});
            }
        }
        if (this.tagEnd > now() && ++this.swings >= (this.bonuses().awake?2:3)) {
            this.swings = 0; this.ready = now()+1.5; this.stance(READY,1.5);
        }
    }
    private parry(attacker?: CDOTA_BaseNPC) {
        const h = this.GetParent();
        if (!IsServer() || this.guard <= now() || !enemy(h,attacker)) return false;
        this.guard = 0; this.stance(0,0);
        const ab = h.FindAbilityByName(E);
        if (ab && distance(h.GetAbsOrigin(),attacker.GetAbsOrigin()) <= ab.GetSpecialValueFor("radius")*2) {
            const p = attacker.GetAbsOrigin(), origin = h.GetAbsOrigin(), d = Math.max(1,distance(p,origin));
            FindClearSpaceForUnit(h,Vector(p.x+75*(origin.x-p.x)/d,p.y+75*(origin.y-p.y)/d,p.z),true);
            hit(h,attacker,ab,2*h.GetAverageTrueAttackDamage(attacker)+ab.GetSpecialValueFor("bonus_damage"),DamageTypes.PHYSICAL);
        }
        return true;
    }
    GetAbsorbSpell(e: ModifierAbilityEvent) { return e.ability && this.parry(e.ability.GetCaster()) ? 1 : 0; }
    GetModifierAvoidDamage(e: ModifierAttackEvent) { return !e.inflictor && this.parry(e.attacker) ? 1 : 0; }
    OnTakeDamage(e: ModifierInstanceEvent) {
        const h = this.GetParent();
        if (!IsServer() || e.attacker !== h || !enemy(h,e.unit) || e.inflictor?.GetAbilityName() !== W) return;
        if (this.posts.length > 0 && this.launchFrom && !this.rolling) this.wall(e.unit,this.launchFrom);
        if (this.rollUntil <= now()) return;
        this.rollUntil = 0;
        const p = h.GetAbsOrigin(), f = h.GetForwardVector(), duration = this.bonuses().awake ? 5 : 4;
        this.rolling = {ends:now()+duration,heading:Math.atan2(f.y,f.x),goal:Vector(p.x+500*f.x,p.y+500*f.y,p.z),inside:new Set([e.unit.entindex()]),hits:1};
        this.stance(ROLL,duration);
    }
    private endRoll() {
        if (!this.rolling) return;
        this.rolling = undefined;
        const h = this.GetParent();
        FindClearSpaceForUnit(h,h.GetAbsOrigin(),true); this.stance(0,0);
    }
    private stepRoll(r: Roll, dt: number) {
        const h = this.GetParent(), ab = h.FindAbilityByName(W);
        if (!ab || r.ends <= now() || h.IsStunned() || h.IsRooted() || h.IsHexed()) { this.endRoll(); return; }
        if (h.IsOutOfGame() || h.IsInvulnerable()) return;
        const p = h.GetAbsOrigin();
        const desired = Math.atan2(r.goal.y-p.y,r.goal.x-p.x), angle = desired-r.heading;
        const maxTurn = dt*(this.bonuses().awake ? 5 : 3.8);
        r.heading += Math.max(-maxTurn,Math.min(maxTurn,Math.atan2(Math.sin(angle),Math.cos(angle))));
        const dx = Math.cos(r.heading), dy = Math.sin(r.heading);
        const step = dt*ab.GetSpecialValueFor("snowball_speed");
        const dest = Vector(p.x+dx*step,p.y+dy*step,p.z);
        if (GridNav.IsBlocked(dest) || !GridNav.IsTraversable(dest)) { this.endRoll(); return; }
        h.SetAbsOrigin(GetGroundPosition(dest,h)); h.SetForwardVector(Vector(dx,dy,0));
        const units = FindUnitsInRadius(h.GetTeamNumber(),dest,undefined,ab.GetSpecialValueFor("snowball_radius"),UnitTargetTeam.ENEMY,UnitTargetType.HERO,UnitTargetFlags.NONE,FindOrder.CLOSEST,false);
        const inside = new Set<EntityIndex>();
        for (const t of units) {
            if (!enemy(h,t)) continue;
            inside.add(t.entindex());
            if (r.inside.has(t.entindex())) continue;
            r.hits++;
            hit(h,t,ab,ab.GetSpecialValueFor("snowball_damage")*(0.5+r.hits*0.5),DamageTypes.MAGICAL);
            if (r.hits >= 3) { this.endRoll(); return; }
        }
        r.inside = inside;
    }
    order(e: ExecuteOrderFilterEvent) {
        const h = this.GetParent(), kind = e.order_type;
        if (this.rolling) {
            if (kind === UnitOrder.STOP || kind === UnitOrder.HOLD_POSITION) { this.endRoll(); return false; }
            const target = e.entindex_target > 0 ? EntIndexToHScript(e.entindex_target) : undefined;
            if (kind === UnitOrder.MOVE_TO_POSITION || kind === UnitOrder.ATTACK_MOVE)
                this.rolling.goal = Vector(e.position_x,e.position_y,e.position_z);
            else if (target && (kind === UnitOrder.ATTACK_TARGET || kind === UnitOrder.MOVE_TO_TARGET)) this.rolling.goal = target.GetAbsOrigin();
            return false;
        }
        if ((kind === UnitOrder.STOP || kind === UnitOrder.HOLD_POSITION) && this.ready > now()) {
            this.ready = 0; this.guard = now()+1; this.stance(GUARD,1); return true;
        }
        if (this.releasing || kind !== UnitOrder.CAST_TARGET || !this.owns("ko") || e.entindex_ability <= 0) return true;
        const ab = h.FindAbilityByName(R);
        if (!ab || e.entindex_ability !== ab.entindex() || !ab.IsFullyCastable()) return true;
        const target = EntIndexToHScript(e.entindex_target) as CDOTA_BaseNPC;
        if (!enemy(h,target)) return true;
        if (this.windup) { this.windup = undefined; this.stance(0,0); return true; }
        if (h.IsStunned() || h.IsHexed() || h.IsSilenced()) return false;
        this.windup = {target,at:now()}; this.stance(WINDUP,3);
        h.EmitSound("Hero_Tusk.WalrusPunch.Cast");
        return false;
    }
    OnIntervalThink() {
        const h = this.GetParent(), time = now(), dt = Math.min(0.12,time-this.lastStep);
        this.lastStep = time;
        if (!h.IsAlive()) return;
        for (const p of [...this.posts]) if (p.expires <= time) this.removePost(p);
        if (this.rolling) this.stepRoll(this.rolling,dt);
        const w = this.windup;
        if (w) {
            const ab = h.FindAbilityByName(R);
            if (!enemy(h,w.target) || !ab?.IsFullyCastable() || h.IsStunned() || h.IsHexed() || h.IsSilenced() || h.IsDisarmed() || time-w.at>3) {
                this.windup = undefined; this.stance(0,0);
            } else if (time-w.at >= (this.bonuses().awake?1.1:1.5) && distance(h.GetAbsOrigin(),w.target.GetAbsOrigin()) <= h.Script_GetAttackRange()+55) {
                this.windup = undefined; this.stance(0,0); this.charged = {target:w.target,at:time+0.8};
                this.releasing = true; h.CastAbilityOnTarget(w.target,ab,h.GetPlayerOwnerID()); this.releasing = false;
            }
        }
        if (this.charged && this.charged.at < time) this.charged = undefined;
        for (const l of [...this.landings]) {
            if (l.at > time) continue;
            this.landings.splice(this.landings.indexOf(l),1);
            const ab = h.FindAbilityByName(R);
            if (ab && enemy(h,l.target)) hit(h,l.target,ab,0.15*(l.target.GetMaxHealth()-l.target.GetHealth()),DamageTypes.PHYSICAL);
        }
    }
}

modifier_orb_tusk = registerModifier("modifier_orb_tusk",TuskOrbs);
modifier_orb_tusk_stance = registerModifier("modifier_orb_tusk_stance",TuskStance);
