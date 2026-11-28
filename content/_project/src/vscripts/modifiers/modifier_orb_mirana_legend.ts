import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf } from "../core/orbstore";
import { MAP } from "../core/mapinfo";
declare global {
    var modifier_orb_mirana_legend: unknown;
    var modifier_orb_mirana_star: unknown;
    var modifier_orb_mirana_arrow: unknown;
    var modifier_orb_mirana_turn: unknown;
    var modifier_orb_mirana_moons: unknown;
    var modifier_orb_mirana_decoy: unknown;
    var modifier_orb_mirana_shot: unknown;
    var modifier_orb_mirana_reach: unknown;
}

const Q = "mirana_starfall", W = "mirana_arrow", E = "mirana_leap", R = "mirana_invis";
const THROW = "orb_mirana_star", BANK = "orb_mirana_arrow", TURN = "orb_mirana_turn", SWAP = "orb_mirana_swap";
const STAR = "particles/units/heroes/hero_mirana/mirana_starfall_ground_glow.vpcf";
const MOON = "particles/units/heroes/hero_mirana/mirana_moonlight_ray.vpcf";
const SHINE = "particles/units/heroes/hero_mirana/mirana_starfall_moonray.vpcf";
const BURST = "particles/units/heroes/hero_mirana/mirana_shard_impact.vpcf";
const ARROW = "particles/units/heroes/hero_mirana/mirana_spell_arrow.vpcf";
const STAR_SHOT = "particles/units/heroes/hero_mirana/mirana_base_attack.vpcf";
const STAR_MODEL = "models/events/crownfall/match3/gems/gem_fragments.vmdl";
const LEAP_WINDOW = 1.45;
const ARROW_MODEL = "models/projectiles/mirana_arrow.vmdl";
const RING = "particles/ui_mouseactions/range_display.vpcf";
const clock = () => GameRules.GetGameTime();
const color = () => Vector(165, 210, 255);

function dist(a: Vector, b: Vector) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }
function aim(a: Vector, b: Vector, fallback: Vector) {
    const n = dist(a,b);
    return n < 1 ? fallback : Vector((b.x-a.x)/n, (b.y-a.y)/n, 0);
}
function step(p: Vector, dir: Vector, n: number) { return Vector(p.x+dir.x*n, p.y+dir.y*n, p.z); }
function spin(v: Vector, a: number) { return Vector(v.x*Math.cos(a)-v.y*Math.sin(a),v.x*Math.sin(a)+v.y*Math.cos(a),0); }
function legal(p: Vector) { return Math.abs(p.x) < MAP.bounds-32 && Math.abs(p.y) < MAP.bounds-32 && GridNav.IsTraversable(p) && !GridNav.IsBlocked(p); }
function alive(unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
    return unit !== undefined && IsValidEntity(unit) && unit.IsAlive();
}
function enemy(hero: CDOTA_BaseNPC, unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
    return alive(unit) && unit.GetTeamNumber() !== hero.GetTeamNumber() && !unit.IsOutOfGame() && !unit.IsInvulnerable();
}
function real(unit: CDOTA_BaseNPC) { return unit.IsRealHero() && !unit.IsIllusion(); }
function effect(path: string, p: Vector) {
    const fx = ParticleManager.CreateParticle(path, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(fx,0,p);
    return fx;
}
function ring(p: Vector,r: number) {
    const id = effect(RING,p);
    ParticleManager.SetParticleControl(id,1,Vector(r,0,0)); ParticleManager.SetParticleControl(id,2,color());
    return id;
}
function burst(path: string, p: Vector) { ParticleManager.ReleaseParticleIndex(effect(path,p)); }
function stop(id?: ParticleID) {
    if (id === undefined) return;
    ParticleManager.DestroyParticle(id, true); ParticleManager.ReleaseParticleIndex(id);
}
function remove(mod?: CDOTA_Buff) { if (mod !== undefined && !mod.IsNull()) mod.Destroy(); }
function validTree(tree: CDOTA_MapTree) { return IsValidEntity(tree) && tree.IsStanding(); }
function treeOnLine(p: Vector, dir: Vector, length: number, ignore?: CDOTA_MapTree) {
    const trees = GridNav.GetAllTreesAroundPoint(step(p, dir, length/2),length/2+40,true);
    let best: {tree: CDOTA_MapTree; distance: number} | undefined;
    for (const tree of trees) {
        if (tree === ignore || !validTree(tree)) continue;
        const c = tree.GetAbsOrigin(), dx=c.x-p.x, dy=c.y-p.y;
        const along=dx*dir.x+dy*dir.y, side=Math.abs(dx*dir.y-dy*dir.x);
        if (along <= 0 || along > length || side > 36) continue;
        const reach=Math.max(1,along-Math.sqrt(36*36-side*side));
        if (best===undefined || reach<best.distance) best={tree,distance:reach};
    }
    return best;
}
class Status extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
}
class StarStatus extends Status { GetTexture() { return "mirana/pulsar_remnant/mirana_starfall"; } }
class ArrowStatus extends Status { GetTexture() { return "mirana/meoth/meoth_sacred_arrow"; } }
class TurnStatus extends Status { GetTexture() { return "mirana_leap_secondary"; } }
class MoonStatus extends Status { GetTexture() { return "mirana_nightveil"; } }
class Decoy extends MoonStatus {
    GetPriority(){return ModifierPriority.SUPER_ULTRA;}
    CheckState() { return { [ModifierState.NO_UNIT_COLLISION]: true, [ModifierState.INVISIBLE]: false, [ModifierState.DISARMED]: true,
        [ModifierState.SILENCED]:true, [ModifierState.MUTED]:true }; }
    DeclareFunctions() { return [ModifierFunction.ON_ATTACK_LANDED]; }
    OnAttackLanded(e: ModifierAttackEvent) {
        if (IsServer() && e.target===this.GetParent() && alive(e.attacker) &&
            e.attacker.IsHero() && e.attacker.GetTeamNumber()!==this.GetParent().GetTeamNumber()) this.GetParent().ForceKill(false);
    }
}
class Moonshot extends Status {
    GetTexture() { return "mirana_celestial_quiver"; }
    DeclareFunctions() { return [ModifierFunction.PREATTACK_CRITICALSTRIKE,ModifierFunction.ON_ATTACK]; }
    GetModifierPreAttack_CriticalStrike(e: ModifierAttackEvent) {
        if (IsServer() && !e.no_attack_cooldown && enemy(this.GetParent(),e.target) && real(e.target)) return 180;
        return 0;
    }
    OnAttack(e: ModifierAttackEvent) {
        if (IsServer() && e.attacker===this.GetParent() && !e.no_attack_cooldown && enemy(e.attacker,e.target) && real(e.target)) this.Destroy();
    }
}
class MoonReach extends Status {
    GetTexture() { return "mirana_invis"; }
    DeclareFunctions() { return [ModifierFunction.ATTACK_RANGE_BONUS]; }
    GetModifierAttackRangeBonus() { return 90; }
}
type Pickup = {point:Vector; ends:number; ring:ParticleID; beam:ParticleID; model?:CBaseEntity};
type Held = {ends:number; icon?:CDOTA_Buff};
type Path = { tree:CDOTA_MapTree; origin:Vector; dir:Vector; distance:number; budget:number; expires:number; skill:CDOTABaseAbility };
type Pin = {tree:CDOTA_MapTree; point:Vector; travelled:number; left:number; turns:number; deadline:number;
    skill:CDOTABaseAbility; model?:CBaseEntity; glow:ParticleID; icon?:CDOTA_Buff};
type Flight = {id:number; projectile:ProjectileID; from:Vector; travelled:number; dir:Vector; left:number;
    turns:number; previous:CDOTA_MapTree; skill:CDOTABaseAbility; last:Vector};
type Leap = {start:Vector; direction:Vector; ends:number; skill:CDOTABaseAbility; icon?:CDOTA_Buff; shadow:ParticleID;
    turn?:{at:number; from:Vector; to:Vector; last:Vector; height:number}};
type Stars = {damage:number; hits:number; until:number; hit:Set<EntityIndex>};
type Fan = {hits:Map<EntityIndex,number>; until:number; skill:CDOTABaseAbility; damage:number; awake:boolean; refunded:boolean};

export class MiranaLegends extends ModBase {
    private seq=0;
    private qPending=0;
    private qCastAt=-5;
    private pickup?:Pickup;
    private held?:Held;
    private stars=new Map<number,Stars>();
    private arrowPlan?:Path;
    private nativeArrow?:Path;
    private pin?:Pin;
    private arrowFlight?:Flight;
    private leap?:Leap;
    private fans=new Map<number,Fan>();
    private clones:CDOTA_BaseNPC[]=[];
    private moons?:Held;
    // Native charge abilities do not expose the running charge timer on all Dota builds.
    // Track the start of a missing charge so the three-arrow reward still works above zero charges.
    private recharge?: { skill:CDOTABaseAbility; count:number; since:number; accelerated?:number };
    private armedMoon=0;
    private swapped=new Set<string>();
    IsHidden(){return true;}
    IsPurgable(){return false;}
    RemoveOnDeath(){return false;}
    OnCreated(){if(IsServer())this.StartIntervalThink(0.03);}
    private owned(id:string){return (bonusesOf(this.GetParent().GetPlayerOwnerID(),true,clock()).code[id]??0)>0;}
    private awake(){return bonusesOf(this.GetParent().GetPlayerOwnerID(),true,clock()).awake;}
    GetPriority(){return ModifierPriority.SUPER_ULTRA;}
    DeclareFunctions(){return [ModifierFunction.ON_ABILITY_START,ModifierFunction.ON_ABILITY_EXECUTED,ModifierFunction.ON_ABILITY_FULLY_CAST,
        ModifierFunction.OVERRIDE_ABILITY_SPECIAL,ModifierFunction.OVERRIDE_ABILITY_SPECIAL_VALUE,
        ModifierFunction.ON_TAKEDAMAGE,ModifierFunction.ON_DEATH];}
    private swap(native:string, alt:string, show:boolean) {
        if(this.swapped.has(alt)===show)return;
        const h=this.GetParent(), a=h.FindAbilityByName(native), b=h.FindAbilityByName(alt)??(show?h.AddAbility(alt):undefined);
        if(!a||!b)return;
        if(show){b.SetLevel(1);h.SwapAbilities(native,alt,false,true);this.swapped.add(alt);}
        else {h.SwapAbilities(alt,native,false,true);this.swapped.delete(alt);}
        a.SetHidden(show);b.SetHidden(!show);a.MarkAbilityButtonDirty();b.MarkAbilityButtonDirty();
    }
    private icon(name:string,skill:CDOTABaseAbility, duration:number, count=1) {
        const h=this.GetParent(), m=h.AddNewModifier(h,skill,"modifier_orb_mirana_"+name,{duration});
        m?.SetStackCount(count);return m;
    }
    private projectile(ability:CDOTABaseAbility, from:Vector, dir:Vector, speed:number, range:number,
        radius:number, fx:string, id:number, creeps=false) {
        return ProjectileManager.CreateLinearProjectile({Ability:ability, Source:this.GetParent(),vSpawnOrigin:from,
            vVelocity:Vector(dir.x*speed,dir.y*speed,0), fDistance:range,fStartRadius:radius,fEndRadius:radius,
            EffectName:fx, iUnitTargetTeam:UnitTargetTeam.ENEMY,iUnitTargetType:creeps ? UnitTargetType.HERO | UnitTargetType.BASIC : UnitTargetType.HERO,
            iUnitTargetFlags:UnitTargetFlags.MAGIC_IMMUNE_ENEMIES,bIgnoreSource:true,bVisibleToEnemies:true,
            bProvidesVision:true,iVisionRadius:150,iVisionTeamNumber:this.GetParent().GetTeamNumber(),ExtraData:{id}});
    }
    OnAbilityStart(e:ModifierAbilityEvent) {
        if(!IsServer()||e.unit!==this.GetParent()||e.ability.GetAbilityName()!==W||!this.owned("mir_l_arrow"))return;
        this.arrowPlan=undefined;
        const a=e.ability, origin=e.unit.GetAbsOrigin(), dir=aim(origin,a.GetCursorPosition(),e.unit.GetForwardVector());
        const budget=a.GetSpecialValueFor("arrow_range"), hit=treeOnLine(origin,dir,budget);
        if(hit)this.arrowPlan={...hit,origin,dir,budget,expires:clock()+a.GetCastPoint()+0.25,skill:a};
    }
    GetModifierOverrideAbilitySpecial(e:ModifierOverrideAbilitySpecialEvent):0|1 {
        if(!IsServer()||e.ability===undefined)return 0;
        if(e.ability_special_value==="leap_speed" && e.ability.GetAbilityName()===E && this.owned("mir_l_starhunt"))return 1;
        return this.arrowPlan!==undefined && this.arrowPlan.expires>=clock() &&
            validTree(this.arrowPlan.tree) && e.ability===this.arrowPlan.skill && e.ability_special_value==="arrow_range" ? 1:0;
    }
    GetModifierOverrideAbilitySpecialValue(e?:ModifierOverrideAbilitySpecialEvent){
        if(e?.ability_special_value==="leap_speed")return e.ability.GetSpecialValueFor("leap_distance")/LEAP_WINDOW;
        return this.arrowPlan?.distance??0;
    }
    private watchStarfall(e:ModifierAbilityEvent) {
        if(e.ability.GetAbilityName()!==Q || !this.owned("mir_l_starstorm") || this.held || this.pickup ||
            clock()-this.qCastAt<0.05)return;
        this.qCastAt=clock();
        this.qPending=clock()+1.6;
    }
    OnAbilityExecuted(e:ModifierAbilityEvent) {
        if(IsServer() && e.unit===this.GetParent() && alive(e.unit) && real(e.unit))this.watchStarfall(e);
    }
    OnAbilityFullyCast(e:ModifierAbilityEvent) {
        if(!IsServer()||e.unit!==this.GetParent()||!alive(e.unit)||!real(e.unit))return;
        const a=e.ability, n=a.GetAbilityName();
        if(n===Q)this.watchStarfall(e);
        if(n===W && this.arrowPlan && validTree(this.arrowPlan.tree)) {
            const plan=this.arrowPlan;
            this.nativeArrow={...plan,expires:clock()+plan.distance/Math.max(1,a.GetSpecialValueFor("arrow_speed"))};
            // The engine may query arrow_range again in this frame.
            plan.expires=clock()+0.022;
        }
        if(n===E && this.owned("mir_l_starhunt"))this.beginLeap(a);
        if(n===R && this.owned("mir_l_moon")){this.clearMoons();this.armedMoon=clock()+a.GetSpecialValueFor("fade_delay")+2;}
    }
    OnTakeDamage(e:ModifierInstanceEvent) {
        const h=this.GetParent();
        if(!IsServer()||e.attacker!==h||!alive(h)||!e.inflictor)return;
        const n=e.inflictor.GetAbilityName();
        if(n===W && this.nativeArrow) this.nativeArrow=undefined;
        if(n!==Q || this.qPending<=clock()||this.pickup||this.held||!e.unit.IsHero()||!real(e.unit)||e.unit.GetTeamNumber()===h.GetTeamNumber())return;
        this.qPending=0;
        const pos=e.unit.GetAbsOrigin(), back=aim(pos,h.GetAbsOrigin(),h.GetForwardVector());
        let point=step(pos,back,145);if(!legal(point))point=pos;
        point=GetGroundPosition(point,h);
        const model=SpawnEntityFromTableSynchronous("prop_dynamic",{model:STAR_MODEL,solid:0,disableshadows:1,modelscale:1.65});
        model?.SetAbsOrigin(Vector(point.x,point.y,point.z+70));
        this.pickup={point, ends:clock()+6, ring:ring(point,84),beam:effect(MOON,point),model};
        burst(SHINE,point);
    }
    private clearPickup(){stop(this.pickup?.ring);stop(this.pickup?.beam);const model=this.pickup?.model;if(model!==undefined && IsValidEntity(model))UTIL_Remove(model);this.pickup=undefined;}
    private clearHeld(){remove(this.held?.icon);this.held=undefined;this.swap(Q,THROW,false);}
    ThrowStar(a:CDOTABaseAbility,point:Vector) {
        const h=this.GetParent();if(!this.held||this.held.ends<clock()||!alive(h))return;
        const base=h.FindAbilityByName(Q);this.clearHeld();if(!base)return;
        const id=++this.seq;this.stars.set(id,{damage:2*base.GetSpecialValueFor("damage")+(this.owned("mir_p_starlight")?70:0),hits:this.awake()?2:1,until:clock()+3,hit:new Set()});
        this.projectile(a,h.GetAbsOrigin(),aim(h.GetAbsOrigin(),point,h.GetForwardVector()),1150,this.owned("mir_p_meteor")?1350:1150,90,STAR_SHOT,id);
        EmitSoundOn("Ability.Starfall",h);
    }
    StarHit(target:CDOTA_BaseNPC|undefined,id:number) {
        const s=this.stars.get(id),h=this.GetParent();
        if(!s||!target){this.stars.delete(id);return true;}
        if(!enemy(h,target)||!real(target)||s.hit.has(target.entindex()))return false;
        s.hit.add(target.entindex());
        if(!target.IsDebuffImmune()){
            ApplyDamage({attacker:h,victim:target,damage:s.damage,damage_type:DamageTypes.MAGICAL,ability:h.FindAbilityByName(THROW)});
            burst(SHINE,target.GetAbsOrigin());
        }
        if(--s.hits<=0){this.stars.delete(id);return true;}return false;
    }
    private lodge(tree:CDOTA_MapTree,dir:Vector,travelled:number,left:number,turns:number,skill:CDOTABaseAbility) {
        this.clearPin();
        if(left<50||!validTree(tree))return;
        const h=this.GetParent(),p=tree.GetAbsOrigin();
        const model=SpawnEntityFromTableSynchronous("prop_dynamic",{model:ARROW_MODEL,solid:0,disableshadows:1,modelscale:1.25});
        if(model!==undefined){model.SetAbsOrigin(Vector(p.x-dir.x*20,p.y-dir.y*20,p.z+100));model.SetForwardVector(dir);}
        const window=this.owned("mir_p_quiver")?4.8:4;
        this.pin={tree,point:p,travelled,left,turns,skill,model,deadline:clock()+window,glow:effect(MOON,p),icon:this.icon("arrow",skill,window,turns)};
        this.swap(W,BANK,true);AddFOWViewer(h.GetTeamNumber(),p,190,window,false);
    }
    private clearPin(){const p=this.pin;if(!p)return;
        stop(p.glow);remove(p.icon);if(p.model&&IsValidEntity(p.model))UTIL_Remove(p.model);
        this.pin=undefined;this.swap(W,BANK,false);}
    Redirect(a:CDOTABaseAbility,point:Vector){
        const pin=this.pin,h=this.GetParent();
        if(!pin||pin.deadline<clock()||!validTree(pin.tree)||!alive(h)){this.clearPin();return;}
        const dir=aim(pin.point,point,h.GetForwardVector()),from=step(pin.point,dir,38);
        const id=++this.seq;this.clearPin();
        const projectile=this.projectile(a,from,dir,pin.skill.GetSpecialValueFor("arrow_speed"),pin.left,
            pin.skill.GetSpecialValueFor("arrow_width"),ARROW,id,true);
        this.arrowFlight={projectile,id,from,dir,left:pin.left,travelled:pin.travelled,turns:pin.turns-1,
            previous:pin.tree,skill:pin.skill,last:from};
        StartSoundEventFromPosition("Hero_Mirana.ArrowCast",pin.point);
    }
    ArrowThink(point:Vector,id:number){
        const f=this.arrowFlight;if(!f||f.id!==id||f.turns<=0)return;
        const hit=treeOnLine(f.last,f.dir,dist(f.last,point),f.previous);
        const old=f.last;f.last=point;if(!hit)return;
        const delta=dist(f.from,old)+hit.distance;this.arrowFlight=undefined;
        ProjectileManager.DestroyLinearProjectile(f.projectile);
        this.lodge(hit.tree,f.dir,f.travelled+delta,f.left-delta,f.turns,f.skill);
    }
    ArrowHit(target:CDOTA_BaseNPC|undefined,point:Vector,id:number){
        const f=this.arrowFlight,h=this.GetParent();if(!f||f.id!==id)return true;
        if(!target){this.arrowFlight=undefined;return true;}
        if(!enemy(h,target))return false;
        this.arrowFlight=undefined;if(target.IsDebuffImmune())return true;
        if(target.IsCreep()&&!target.IsAncient()&&!target.IsConsideredHero()){
            target.Kill(f.skill,h);return true;
        }
        const a=f.skill,pct=Math.min(1,(f.travelled+dist(point,f.from))/Math.max(1,a.GetSpecialValueFor("arrow_max_stunrange")));
        const min=a.GetSpecialValueFor("arrow_min_stun"),max=a.GetSpecialValueFor("arrow_max_stun");
        target.AddNewModifier(h,a,"modifier_stunned",{duration:(min+(max-min)*pct+1.1)*(1-target.GetStatusResistance())});
        const baseDamage=a.GetSpecialValueFor("AbilityDamage");
        const damage=baseDamage>0 ? baseDamage : a.GetAbilityDamage();
        ApplyDamage({attacker:h,victim:target,ability:a,damage_type:DamageTypes.MAGICAL,
            damage:1.5*(damage+a.GetSpecialValueFor("arrow_bonus_damage")*pct)+140});
        if(h.HasScepter()){
            const q=h.FindAbilityByName(Q);
            if(q&&q.GetLevel()>0){
                ApplyDamage({attacker:h,victim:target,ability:a,damage_type:DamageTypes.MAGICAL,
                    damage:q.GetSpecialValueFor("damage")*a.GetSpecialValueFor("scepter_starstorm_target_pct")/100});
                burst(SHINE,point);
            }
        }
        return true;
    }
    private beginLeap(skill:CDOTABaseAbility){
        this.clearLeap();const h=this.GetParent(),start=h.GetAbsOrigin(),direction=h.GetForwardVector();
        const range=skill.GetSpecialValueFor("leap_distance");
        const life=LEAP_WINDOW;
        this.leap={start,direction,skill,ends:clock()+life,icon:this.icon("turn",skill,life),shadow:ring(step(start,direction,range),90)};
        this.swap(E,TURN,true);
    }
    private clearLeap(){
        const jump=this.leap;if(!jump)return;
        this.leap=undefined;stop(jump.shadow);remove(jump.icon);this.swap(E,TURN,false);
        if(jump.turn && alive(this.GetParent()))FindClearSpaceForUnit(this.GetParent(),this.GetParent().GetAbsOrigin(),true);
    }
    Turn(_ability:CDOTABaseAbility,point:Vector){
        const j=this.leap,h=this.GetParent();if(!j||j.turn||j.ends<=clock()||h.IsStunned()||h.IsRooted())return;
        const pos=h.GetAbsOrigin(),dir=aim(pos,point,j.direction),left=Math.max(120,Math.min(360,j.skill.GetSpecialValueFor("leap_distance")-dist(pos,j.start)));
        let to=step(pos,dir,Math.min(left,Math.max(100,dist(pos,point))));
        if(!legal(to))return;
        to=GetGroundPosition(to,h);
        const height=Math.max(0,pos.z-GetGroundPosition(pos,h).z);
        h.InterruptMotionControllers(false);
        // End only the native travel modifier; its attack/move speed buff stays.
        for(const m of h.FindAllModifiers()){
            if(m.GetName()==="modifier_mirana_leap" && m.GetAbility()===j.skill)m.Destroy();
        }
        j.turn={from:pos,to,at:clock(),height,last:pos};j.direction=dir;
        j.ends=clock()+Math.max(0.4,dist(pos,to)/800);
        ParticleManager.SetParticleControl(j.shadow,0,to);this.swap(E,TURN,false);
        remove(j.icon);j.icon=undefined;
    }
    private trackLeapCharges() {
        const skill=this.GetParent().FindAbilityByName(E);
        if(!skill || skill.GetLevel()<=0 || !this.owned("mir_l_starhunt"))return;
        const count=skill.GetCurrentAbilityCharges(), max=skill.GetMaxAbilityCharges(skill.GetLevel()-1);
        if(max<=0 || count>=max){this.recharge=undefined;return;}
        const r=this.recharge;
        if(!r || r.skill!==skill || count>r.count){
            this.recharge={skill,count,since:clock()};return;
        }
        r.count=count;
        if(r.accelerated!==undefined && clock()>=r.accelerated){
            // Reset the stock timer at the credited boundary. Subsequent charges use native timing.
            skill.SetCurrentAbilityCharges(max);
            skill.SetCurrentAbilityCharges(Math.min(max,count+1));
            this.recharge=count+1<max ? {skill,count:count+1,since:clock()} : undefined;
            skill.MarkAbilityButtonDirty();
        }
    }
    private land(){
        const j=this.leap,h=this.GetParent();if(!j)return;
        const dir=j.direction,skill=j.skill,point=h.GetAbsOrigin();this.clearLeap();
        const a=h.FindAbilityByName(TURN);if(!a)return;
        burst(BURST,point);
        const id=++this.seq;
        this.fans.set(id,{hits:new Map(),until:clock()+1.4,skill,damage:60+(this.owned("mir_p_pounce")?24:0)+0.5*h.GetAverageTrueAttackDamage(h),awake:this.awake(),refunded:false});
        for(const angle of [-0.22,0,0.22])this.projectile(a,point,spin(dir,angle),1200,this.owned("mir_p_blur")?660:550,46,ARROW,id);
    }
    FanHit(target:CDOTA_BaseNPC|undefined,id:number){
        const f=this.fans.get(id),h=this.GetParent();if(!f||!target)return true;
        if(!enemy(h,target)||!real(target))return false;
        if(target.IsAttackImmune())return true;
        const hits=(f.hits.get(target.entindex())??0)+1;f.hits.set(target.entindex(),hits);
        ApplyDamage({attacker:h,victim:target,ability:h.FindAbilityByName(TURN),damage:f.damage,damage_type:DamageTypes.PHYSICAL});
        if(hits===3 && f.awake && !f.refunded){
            f.refunded=true;
            const recharge=h.FindAllModifiers().find(m=>m.GetAbility()===f.skill&&m.GetName()==="modifier_charges");
            if(recharge && recharge.GetRemainingTime()>0){
                const remaining=recharge.GetRemainingTime();
                const half=f.skill.GetAbilityChargeRestoreTime(Math.max(0,f.skill.GetLevel()-1))/2;
                recharge.SetDuration(Math.max(0.03,remaining-half),true);
                recharge.StartIntervalThink(Math.max(0.03,remaining-half));
            } else if(f.skill.GetCooldownTimeRemaining()>0){
                const remaining=f.skill.GetCooldownTimeRemaining();
                const half=f.skill.GetAbilityChargeRestoreTime(Math.max(0,f.skill.GetLevel()-1))/2;
                f.skill.EndCooldown();if(remaining>half)f.skill.StartCooldown(remaining-half);
                else if(f.skill.GetCurrentAbilityCharges()===0) f.skill.SetCurrentAbilityCharges(1);
            } else {
                this.trackLeapCharges();
                const timer=this.recharge;
                if(timer && timer.skill===f.skill){
                    const seconds=f.skill.GetAbilityChargeRestoreTime(Math.max(0,f.skill.GetLevel()-1)) *
                        this.GetParent().GetCooldownReduction();
                    timer.accelerated=Math.max(clock(),(timer.accelerated ?? timer.since+seconds)-seconds/2);
                    this.trackLeapCharges();
                }
            }
        }
        return true;
    }
    private createMoons(){
        const h=this.GetParent(),r=h.FindAbilityByName(R);if(!r)return;
        this.clearMoons();const duration=this.owned("mir_p_shadow")?11:10;
        const keys={outgoing_damage:-100,incoming_damage:0,bounty_base:0,bounty_growth:0,duration};
        const clones=CreateIllusions(h,h as CDOTA_BaseNPC_Hero,keys,2,36,false,true);
        for(let i=0;i<clones.length;i++){
            const clone=clones[i];if(!alive(clone))continue;
            const dir=spin(h.GetForwardVector(),i===0?0.9:-0.9);
            clone.AddNewModifier(h,r,"modifier_orb_mirana_decoy",{duration});
            for(const mod of clone.FindAllModifiers()){
                if(mod.GetName().startsWith("modifier_mirana_moonlight_shadow"))mod.Destroy();
            }
            clone.SetControllableByPlayer(-1,false);
            const goal=step(h.GetAbsOrigin(),dir,1050);
            clone.MoveToPosition(goal);this.clones.push(clone);
        }
        if(this.clones.length>0){
            this.moons={ends:clock()+duration,icon:this.icon("moons",r,duration,this.clones.length)};
            this.swap(R,SWAP,true);
        }
    }
    private clearMoons(){
        const old=this.clones;this.clones=[];
        remove(this.moons?.icon);this.moons=undefined;this.swap(R,SWAP,false);
        for(const clone of old)if(alive(clone))clone.ForceKill(false);
    }
    SwapMoon(point:Vector){
        const h=this.GetParent();
        if(!this.moons||this.moons.ends<clock()||!alive(h)||h.IsRooted()||h.IsStunned()||(h.HasModifier("modifier_slark_pounce_leash") || h.HasModifier("modifier_puck_dream_coil")))return;
        const origin=h.GetAbsOrigin(),dir=aim(origin,point,h.GetForwardVector());
        let best:CDOTA_BaseNPC|undefined,score=-2;
        for(const c of this.clones){
            if(!alive(c)||!legal(c.GetAbsOrigin()))continue;
            const towards=aim(origin,c.GetAbsOrigin(),dir),dot=towards.x*dir.x+towards.y*dir.y;
            if(dot>score){best=c;score=dot;}
        }
        if(!best||score<0)return;
        const dest=best.GetAbsOrigin();FindClearSpaceForUnit(h,dest,true);FindClearSpaceForUnit(best,origin,true);
        burst(STAR,origin);burst(STAR,dest);this.clearMoons();
        const ultimate=h.FindAbilityByName(R);
        if(this.awake())h.AddNewModifier(h,ultimate,"modifier_orb_mirana_shot",{duration:4});
        if(this.owned("mir_p_ambush"))h.AddNewModifier(h,ultimate,"modifier_orb_mirana_reach",{duration:2});
    }
    OnIntervalThink(){
        const h=this.GetParent(),t=clock();if(!alive(h)||!real(h))return;
        this.trackLeapCharges();
        if(this.arrowPlan && this.arrowPlan.expires<t)this.arrowPlan=undefined;
        const path=this.nativeArrow;
        if(path){
            const speed=Math.max(1,path.skill.GetSpecialValueFor("arrow_speed"));
            const tip=step(path.origin,path.dir,Math.min(path.distance,Math.max(0,path.distance-(path.expires-t)*speed)));
            const blockers=FindUnitsInRadius(h.GetTeamNumber(),tip,undefined,path.skill.GetSpecialValueFor("arrow_width"),
                UnitTargetTeam.ENEMY,UnitTargetType.HERO | UnitTargetType.BASIC,UnitTargetFlags.MAGIC_IMMUNE_ENEMIES,FindOrder.ANY,false);
            if(blockers.some(u=>enemy(h,u)))this.nativeArrow=undefined;
            else if(t>=path.expires){
                this.nativeArrow=undefined;this.lodge(path.tree,path.dir,path.distance,path.budget-path.distance,this.awake()?2:1,path.skill);
            }
        }
        if(this.pin&&(!validTree(this.pin.tree)||t>=this.pin.deadline))this.clearPin();
        const pick=this.pickup;
        if(pick){
            const near=FindUnitsInRadius(h.GetTeamNumber(),pick.point,undefined,84,UnitTargetTeam.BOTH,UnitTargetType.HERO,
                UnitTargetFlags.MAGIC_IMMUNE_ENEMIES,FindOrder.CLOSEST,false)
                .find(u=>alive(u)&&real(u)&&(u===h||u.GetTeamNumber()!==h.GetTeamNumber())&&!u.IsOutOfGame());
            if(t>=pick.ends || near)this.clearPickup();
            if(near===h&&t<pick.ends){
                const q=h.FindAbilityByName(Q);if(q){this.held={ends:t+4,icon:this.icon("star",q,4)};this.swap(Q,THROW,true);}
            }
        }
        if(this.held&&this.held.ends<=t)this.clearHeld();
        for(const [id,s] of this.stars)if(s.until<t)this.stars.delete(id);
        for(const [id,f] of this.fans)if(f.until<t)this.fans.delete(id);
        const j=this.leap;
        if(j){
            if(h.IsStunned()||h.IsRooted()||h.IsHexed())this.clearLeap();
            else if(j.turn){
                const move=j.turn;
                if(dist(h.GetAbsOrigin(),move.last)>130 || h.IsCurrentlyHorizontalMotionControlled()){this.clearLeap();}
                else{
                    const k=Math.min(1,(t-move.at)/(j.ends-move.at));
                    const ground=GetGroundPosition(step(move.from,j.direction,dist(move.from,move.to)*k),h);
                    move.last=Vector(ground.x,ground.y,ground.z+move.height*(1-k)+80*4*k*(1-k));
                    h.SetAbsOrigin(move.last);if(k>=1)this.land();
                }
            }else if(t>=j.ends && (!h.IsCurrentlyHorizontalMotionControlled()||t>j.ends+0.3))this.land();
        }
        if(this.armedMoon>0){
            const skill=h.FindAbilityByName(R);
            const gained=h.IsInvisible() && h.FindAllModifiers().some(m=>
                m.GetName().startsWith("modifier_mirana_moonlight_shadow") ||
                (m.GetName().startsWith("modifier_mirana_") && skill!==undefined && m.GetAbility()===skill));
            if(gained||t>=this.armedMoon){this.armedMoon=0;if(gained)this.createMoons();}
        }
        if(this.moons){
            this.clones=this.clones.filter(c=>alive(c));if(this.moons.icon && !this.moons.icon.IsNull())this.moons.icon.SetStackCount(this.clones.length);
            if(this.clones.length===0||t>=this.moons.ends)this.clearMoons();
        }
    }
    private reset(){
        this.recharge=undefined;this.armedMoon=0;this.qPending=0;this.arrowPlan=undefined;this.nativeArrow=undefined;
        this.clearPickup();this.clearHeld();this.clearPin();this.clearLeap();this.clearMoons();
        if(this.arrowFlight){ProjectileManager.DestroyLinearProjectile(this.arrowFlight.projectile);this.arrowFlight=undefined;}
        this.stars.clear();this.fans.clear();
    }
    OnDeath(e:ModifierInstanceEvent){if(IsServer()&&e.unit===this.GetParent())this.reset();}
    OnDestroy(){if(IsServer())this.reset();}
}
modifier_orb_mirana_legend=registerModifier("modifier_orb_mirana_legend",MiranaLegends);
modifier_orb_mirana_star=registerModifier("modifier_orb_mirana_star",StarStatus);
modifier_orb_mirana_arrow=registerModifier("modifier_orb_mirana_arrow",ArrowStatus);
modifier_orb_mirana_turn=registerModifier("modifier_orb_mirana_turn",TurnStatus);
modifier_orb_mirana_moons=registerModifier("modifier_orb_mirana_moons",MoonStatus);
modifier_orb_mirana_decoy=registerModifier("modifier_orb_mirana_decoy",Decoy);
modifier_orb_mirana_shot=registerModifier("modifier_orb_mirana_shot",Moonshot);
modifier_orb_mirana_reach=registerModifier("modifier_orb_mirana_reach",MoonReach);
