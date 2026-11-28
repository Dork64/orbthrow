import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf, overrideValue } from "../core/orbstore";
import { MAP } from "../core/mapinfo";

declare global {
    var modifier_orb_earthshaker_legend: unknown;
    var modifier_orb_es_pivot: unknown;
    var modifier_orb_es_charged: unknown;
    var modifier_orb_es_crack: unknown;
    var modifier_orb_es_tracked: unknown;
    var modifier_orb_es_path: unknown;
}
const Q = "earthshaker_fissure", W = "earthshaker_enchant_totem", E = "earthshaker_aftershock", R = "earthshaker_echo_slam";
const PIVOT = "orb_es_pivot", STEP = "orb_es_step", SEIS = "orb_es_seismograph";
const RING = "particles/ui_mouseactions/range_display.vpcf";
const DUST = "particles/units/heroes/hero_earthshaker/earthshaker_aftershock.vpcf";
const ECHO = "particles/units/heroes/hero_earthshaker/earthshaker_echoslam_start.vpcf";
const CRACK = "particles/units/heroes/hero_earthshaker/earthshaker_echoslam_start_cracks.vpcf";
const ROCK = "models/particle/earthshaker_fissure_rocks_v1.vmdl";
const time = () => GameRules.GetGameTime();
const rad = Math.PI / 180;
function dist(a: Vector, b: Vector) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }
function ray(a: Vector, ang: number, len: number) { return Vector(a.x+Math.cos(ang)*len, a.y+Math.sin(ang)*len, a.z); }
function angle(a: Vector, b: Vector) { return Math.atan2(b.y-a.y,b.x-a.x); }
function signedTurn(a: number, b: number) { return Math.atan2(Math.sin(b-a),Math.cos(b-a)); }
function within(p: Vector) { return Math.abs(p.x)<MAP.bounds-32 && Math.abs(p.y)<MAP.bounds-32; }
function walk(p: Vector) { return within(p) && GridNav.IsTraversable(p) && !GridNav.IsBlocked(p); }
function live(u?: CDOTA_BaseNPC): u is CDOTA_BaseNPC { return u !== undefined && IsValidEntity(u) && u.IsAlive(); }
function valid(u?: CDOTA_BaseNPC): u is CDOTA_BaseNPC { return live(u) && u.IsRealHero() && !u.IsIllusion() && !u.IsInvulnerable() && !u.IsOutOfGame(); }
function magic(u: CDOTA_BaseNPC) { return !u.IsDebuffImmune() && !u.IsMagicImmune(); }
function clear(m?: CDOTA_Buff) { if (m !== undefined && !m.IsNull()) m.Destroy(); }
function remove(e?: CBaseEntity) { if (e !== undefined && IsValidEntity(e)) UTIL_Remove(e); }
function ring(p: Vector, radius: number, color: Vector) {
    const id = ParticleManager.CreateParticle(RING, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id,0,p);
    ParticleManager.SetParticleControl(id,1,Vector(radius,0,0));
    ParticleManager.SetParticleControl(id,2,color);
    return id;
}
function endFX(id: ParticleID) {
    ParticleManager.DestroyParticle(id,true);
    ParticleManager.ReleaseParticleIndex(id);
}
function burst(path: string,p: Vector,radius: number) {
    const id = ParticleManager.CreateParticle(path,ParticleAttachment.WORLDORIGIN,undefined);
    ParticleManager.SetParticleControl(id,0,p);
    ParticleManager.SetParticleControl(id,1,Vector(radius,0,0));
    ParticleManager.ReleaseParticleIndex(id);
}
function shove(h: CDOTA_BaseNPC,u: CDOTA_BaseNPC,a: CDOTABaseAbility,dir: number,len: number,dur: number,height: number,stun: boolean) {
    if (u.IsCurrentlyHorizontalMotionControlled() || u.IsCurrentlyVerticalMotionControlled()) return;
    const center = ray(u.GetAbsOrigin(),dir,-80);
    u.AddNewModifier(h,a,"modifier_knockback",{center_x:center.x,center_y:center.y,center_z:center.z,
        duration:dur,knockback_duration:dur,knockback_distance:len,knockback_height:height,should_stun:stun?1:0});
}
class Icon extends ModBase {
    IsHidden(){return false;}
    IsPurgable(){return false;}
}
class PivotIcon extends Icon { GetTexture(){return "earthshaker_fissure_alt_gold";} }
class Charged extends Icon { GetTexture(){return W;} }
class CrackIcon extends Icon { GetTexture(){return E;} }
class Tracked extends Icon { GetTexture(){return R;} IsDebuff(){return true;} IgnoreTenacity(){return true;} }
class Pathing extends PivotIcon {
    CheckState(){return {[ModifierState.FLYING_FOR_PATHING_PURPOSES_ONLY]:true};}
}
interface Ridge {
    origin: Vector; hinge: Vector; half: number; dir: number; movingDir: number; ends: number; skill: CDOTABaseAbility;
    blocks: Map<string,CBaseEntity>; rocks: CBaseEntity[]; hints: ParticleID[]; pivoted: boolean;
    start?:number; delta:number; swept:Set<CDOTA_BaseNPC>; icon?:CDOTA_Buff; nextGrid:number;
}
interface Mark {pos:Vector;ends:number;fx:ParticleID}
interface Follow {unit:CDOTA_BaseNPC;source:CDOTABaseAbility;last:Vector;still:number;remaining:number;grace:number;icon?:CDOTA_Buff;fx:ParticleID}

export class ShakerLegends extends ModBase {
    private ridge?: Ridge;
    private cracks: Mark[] = [];
    private fuse?: {marks:Mark[];ability:CDOTABaseAbility;ends:number};
    private crackIcon?:CDOTA_Buff;
    private nextCrack=0;
    private charged?:CDOTA_Buff;
    private lastBuff?:CDOTA_Buff;
    private spentStep=false;
    private records=new Set<number>();
    private trails=new Map<CDOTA_BaseNPC,Follow>();
    private lastTime=0;
    private switched=new Set<string>();
    IsHidden(){return true;}
    IsPurgable(){return false;}
    RemoveOnDeath(){return false;}
    OnCreated(){if(IsServer()){this.lastTime=time();this.StartIntervalThink(0.05);}}
    DeclareFunctions(){return [ModifierFunction.ON_ABILITY_FULLY_CAST,ModifierFunction.ON_ATTACK_RECORD,
        ModifierFunction.ON_ATTACK_RECORD_DESTROY,ModifierFunction.ON_ATTACK_LANDED,ModifierFunction.ON_TAKEDAMAGE,ModifierFunction.ON_DEATH];}
    private b(){return bonusesOf(this.GetParent().GetPlayerOwnerID(),true,time());}
    private have(id:string){return (this.b().code[id]??0)>0;}
    private enemies(p:Vector,r:number){
        return FindUnitsInRadius(this.GetParent().GetTeamNumber(),p,undefined,r,UnitTargetTeam.ENEMY,UnitTargetType.HERO,
            UnitTargetFlags.MAGIC_IMMUNE_ENEMIES,FindOrder.CLOSEST,false).filter(unit => valid(unit));
    }
    private damage(u:CDOTA_BaseNPC,a:CDOTABaseAbility,amt:number){
        if(valid(u)&&magic(u)) ApplyDamage({attacker:this.GetParent(),victim:u,ability:a,damage:amt,damage_type:DamageTypes.MAGICAL});
    }
    private swap(native:string,alt:string,on:boolean,keep=false){
        if(this.switched.has(alt)===on)return;
        const h=this.GetParent(),n=h.FindAbilityByName(native);
        if(n===undefined||n.GetLevel()<1)return;
        const x=h.FindAbilityByName(alt)??(on?h.AddAbility(alt):undefined);
        if(x===undefined)return;
        if(on){x.SetLevel(keep?n.GetLevel():1);h.SwapAbilities(native,alt,keep,true);this.switched.add(alt);}
        else {h.SwapAbilities(alt,native,false,true);this.switched.delete(alt);}
        n.SetHidden(on);x.SetHidden(!on);n.MarkAbilityButtonDirty();x.MarkAbilityButtonDirty();
    }
    private activate(name:string,on:boolean){
        const a=this.GetParent().FindAbilityByName(name);
        if(a!==undefined && a.IsActivated()!==on){a.SetActivated(on);a.MarkAbilityButtonDirty();}
    }
    OnAbilityFullyCast(e:ModifierAbilityEvent){
        const h=this.GetParent(),a=e.ability;
        if(!IsServer()||!live(h)||a===undefined||a.IsItem())return;
        if(e.unit!==h){
            if(valid(e.unit) && e.unit.GetTeamNumber()!==h.GetTeamNumber() && dist(e.unit.GetAbsOrigin(),h.GetAbsOrigin())<=550)
                this.recordCrack(e.unit);
            return;
        }
        const n=a.GetAbilityName();
        if(n===Q && this.have("es_l_rift"))this.makeWall(a);
        if(n!==Q && !n.startsWith("orb_") && this.ridge!==undefined && h.HasModifier("modifier_item_aghanims_shard") && !h.PassivesDisabled())
            this.shardShock(this.ridge);
    }
    private makeWall(skill:CDOTABaseAbility){
        this.clearRidge();
        const h=this.GetParent(),origin=h.GetAbsOrigin(),cursor=skill.GetCursorPosition();
        const dir=dist(origin,cursor)>1?angle(origin,cursor):Math.atan2(h.GetForwardVector().y,h.GetForwardVector().x);
        const base=skill.GetLevelSpecialValueNoOverride("fissure_duration",skill.GetLevel()-1);
        const duration=overrideValue(this.b(),Q,"fissure_duration",base)??base;
        const half=Math.max(150,skill.GetCastRange(origin,undefined)+h.GetCastRangeBonus())/2;
        const wall:Ridge={origin,hinge:ray(origin,dir,half),half,dir,movingDir:dir,ends:time()+duration,skill,
            blocks:new Map(),rocks:[],hints:[],delta:0,pivoted:false,swept:new Set(),nextGrid:0};
        const start=ray(origin,dir,105);
        // Separate stones follow the bent ridge; collision uses a grid-cell union, including the fixed half.
        for(let d=105;d<2*half;d+=96){
            const rock=SpawnEntityFromTableSynchronous("prop_dynamic",{model:ROCK,solid:0,disableshadows:1,origin:start});
            if(rock!==undefined)wall.rocks.push(rock);
        }
        this.ridge=wall;
        this.drawWall(wall,true);
        wall.hints.push(ring(wall.hinge,76,Vector(255,177,42)));
        wall.icon=h.AddNewModifier(h,skill,"modifier_orb_es_pivot",{duration});
        wall.icon?.SetStackCount(1);
        this.swap(Q,PIVOT,true);
    }
    private point(w:Ridge,d:number){return d<w.half?ray(w.origin,w.dir,d):ray(w.hinge,w.movingDir,d-w.half);}
    private drawWall(w:Ridge,grid:boolean){
        const h=this.GetParent();
        for(let i=0;i<w.rocks.length;i++){
            const p=GetGroundPosition(this.point(w,105+i*96),h);
            w.rocks[i].SetAbsOrigin(p);
            w.rocks[i].SetAngles(0,(105+i*96<w.half?w.dir:w.movingDir)/rad+(i%3)*20,0);
        }
        if(!grid)return;
        const cells=new Map<string,Vector>();
        for(let d=100;d<=2*w.half;d+=28){
            const p=this.point(w,d);
            if(!within(p))continue;
            const x=GridNav.WorldToGridPosX(p.x),y=GridNav.WorldToGridPosY(p.y),key=tostring(x)+":"+tostring(y);
            cells.set(key,Vector(GridNav.GridPosToWorldCenterX(x),GridNav.GridPosToWorldCenterY(y),GetGroundHeight(p,h)));
        }
        for(const [key,entity] of w.blocks)if(!cells.has(key)){remove(entity);w.blocks.delete(key);}
        for(const [key,p] of cells)if(!w.blocks.has(key)){
            const obstruction=SpawnEntityFromTableSynchronous("point_simple_obstruction",{origin:p,block_fow:0,block_nav:1});
            if(obstruction!==undefined)w.blocks.set(key,obstruction);
        }
    }
    Pivot(p:Vector){
        const w=this.ridge;
        if(w===undefined||w.pivoted||time()>=w.ends||dist(p,w.hinge)<12)return;
        const max=(this.b().awake?90:60)*rad;
        w.delta=Math.max(-max,Math.min(max,signedTurn(w.dir,angle(w.hinge,p))));
        if(Math.abs(w.delta)<3*rad)return;
        w.pivoted=true;w.start=time();clear(w.icon);
        this.swap(Q,PIVOT,false);
        for(let d=120;d<w.half;d+=180)w.hints.push(ring(ray(w.hinge,w.dir+w.delta,d),40,Vector(255,96,35)));
        EmitSoundOn("Hero_EarthShaker.Fissure",this.GetParent());
    }
    private lineDistance(p:Vector,start:Vector,dir:number,len:number){
        const projection=Math.max(0,Math.min(len,(p.x-start.x)*Math.cos(dir)+(p.y-start.y)*Math.sin(dir)));
        return dist(p,ray(start,dir,projection));
    }
    private ridgeDistance(w:Ridge,p:Vector){
        return Math.min(this.lineDistance(p,ray(w.origin,w.dir,100),w.dir,w.half-100),this.lineDistance(p,w.hinge,w.movingDir,w.half));
    }
    private shardShock(w:Ridge){
        const h=this.GetParent(),e=h.FindAbilityByName(E);
        if(!e||e.GetLevel()<1)return;
        const range=e.GetSpecialValueFor("aftershock_range");
        for(const u of this.enemies(w.hinge,w.half+range)){
            if(!magic(u)||dist(h.GetAbsOrigin(),u.GetAbsOrigin())<=range||this.ridgeDistance(w,u.GetAbsOrigin())>range)continue;
            this.damage(u,e,e.GetSpecialValueFor("aftershock_damage"));
            u.AddNewModifier(h,e,"modifier_stunned",{duration:e.GetSpecialValueFor("AbilityDuration")*w.skill.GetSpecialValueFor("shard_aftershock_stun_duration_pct")/100*(1-u.GetStatusResistance())});
        }
        burst(DUST,w.hinge,range);
    }
    private tickWall(w:Ridge,t:number){
        const h=this.GetParent();
        if(t>=w.ends){this.clearRidge();return;}
        if(w.start!==undefined){
            const frac=Math.min(1,(t-w.start)/0.8);
            w.movingDir=w.dir+w.delta*frac;
            this.drawWall(w,t>=w.nextGrid||frac>=1);
            if(t>=w.nextGrid)w.nextGrid=t+0.1;
            for(const u of this.enemies(w.hinge,w.half+90)){
                if(!magic(u)||w.swept.has(u)||this.lineDistance(u.GetAbsOrigin(),w.hinge,w.movingDir,w.half)>90)continue;
                w.swept.add(u);this.damage(u,w.skill,280);
                if(live(u))shove(h,u,w.skill,w.movingDir+(w.delta<0?-1:1)*Math.PI/2,130,0.18,20,false);
            }
            if(frac>=1){w.start=undefined;for(const fx of w.hints)endFX(fx);w.hints=[];}
        }
        if(h.HasModifier("modifier_item_aghanims_shard")&&this.ridgeDistance(w,h.GetAbsOrigin())<100)
            h.AddNewModifier(h,w.skill,"modifier_orb_es_path",{duration:0.2});
    }
    private clearRidge(){
        const w=this.ridge;if(!w)return;
        this.ridge=undefined;clear(w.icon);this.swap(Q,PIVOT,false);
        for(const [,e] of w.blocks)remove(e);
        for(const e of w.rocks)remove(e);
        for(const fx of w.hints)endFX(fx);
    }
    OnAttackRecord(e:ModifierAttackEvent){
        if(!IsServer()||e.attacker!==this.GetParent()||!this.have("es_l_faultline")||e.no_attack_cooldown||!valid(e.target))return;
        if(this.GetParent().HasModifier("modifier_earthshaker_enchant_totem"))this.records.add(e.record);
    }
    OnAttackRecordDestroy(e:ModifierAttackEvent){if(IsServer()&&e.attacker===this.GetParent())this.records.delete(e.record);}
    OnAttackLanded(e:ModifierAttackEvent){
        if(!IsServer())return;
        const h=this.GetParent();
        if(e.target===h&&valid(e.attacker)&&e.attacker.GetTeamNumber()!==h.GetTeamNumber()&&dist(h.GetAbsOrigin(),e.attacker.GetAbsOrigin())<=550)
            this.recordCrack(e.attacker);
        if(e.attacker!==h||!this.records.delete(e.record)||!valid(e.target)||!magic(e.target))return;
        const u=e.target,a=h.FindAbilityByName(W);if(!a)return;
        const pos=u.GetAbsOrigin(),dir=angle(h.GetAbsOrigin(),pos);
        let travel=0,impact=false,other:CDOTA_BaseNPC|undefined;
        const others=this.enemies(pos,445).filter(x=>x!==u);
        for(let d=14;d<=350;d+=14){
            const p=ray(pos,dir,d);
            if(!walk(p)||Math.abs(GetGroundHeight(p,h)-pos.z)>90){impact=true;break;}
            other=others.find(x=>dist(x.GetAbsOrigin(),p)<=u.GetHullRadius()+x.GetHullRadius()+12);
            if(other!==undefined){impact=true;break;}
            travel=d;
        }
        shove(h,u,a,dir,travel,0.24,32,false);
        if(impact){
            const value=Math.min(650,250+u.GetMaxHealth()*0.08);
            this.damage(u,a,value);
            if(other!==undefined)this.damage(other,a,value);
            burst(DUST,ray(pos,dir,travel),180);
        }
    }
    Step(point:Vector){
        const h=this.GetParent(),a=h.FindAbilityByName(W);
        if(this.spentStep||!a||!this.b().awake||!h.HasModifier("modifier_earthshaker_enchant_totem")||h.IsRooted()||
            h.IsStunned()||(h.HasModifier("modifier_slark_pounce_leash")||h.HasModifier("modifier_puck_dream_coil"))||h.IsCurrentlyHorizontalMotionControlled()||h.IsCurrentlyVerticalMotionControlled())return;
        const pos=h.GetAbsOrigin(),dir=angle(pos,point),limit=Math.min(180,dist(pos,point));
        let dest=pos;
        for(let d=12;d<=limit;d+=12){const p=ray(pos,dir,d);if(!walk(p)||Math.abs(GetGroundHeight(p,h)-pos.z)>80)break;dest=p;}
        if(dest===pos)return;
        this.spentStep=true;burst(DUST,pos,100);FindClearSpaceForUnit(h,dest,true);this.swap(W,STEP,false);
    }
    private recordCrack(u:CDOTA_BaseNPC){
        const h=this.GetParent(),a=h.FindAbilityByName(E);
        if(!live(h)||!a||a.GetLevel()<1||!this.have("es_l_aftershock")||h.PassivesDisabled()||this.fuse||time()<this.nextCrack)return;
        const p=u.GetAbsOrigin(),t=time();
        for(const c of this.cracks)if(dist(c.pos,p)<96){c.ends=t+2;this.crackHUD();return;}
        if(this.cracks.length>=(this.b().awake?2:1))endFX(this.cracks.shift()!.fx);
        this.cracks.push({pos:p,ends:t+2,fx:ring(p,175,Vector(255,190,72))});
        burst(CRACK,p,175);this.crackHUD();
    }
    private crackHUD(){
        const h=this.GetParent(),a=h.FindAbilityByName(E);
        if(this.cracks.length===0){clear(this.crackIcon);this.crackIcon=undefined;return;}
        if(this.crackIcon===undefined||this.crackIcon.IsNull())this.crackIcon=h.AddNewModifier(h,a,"modifier_orb_es_crack",{duration:2});
        this.crackIcon?.SetDuration(2,true);this.crackIcon?.SetStackCount(this.cracks.length);
    }
    Detonate(ability:CDOTABaseAbility){
        const h=this.GetParent();
        if(!this.have("es_l_aftershock")||h.PassivesDisabled()||this.fuse||time()<this.nextCrack)return;
        const marks=this.cracks.filter(m=>m.ends>time());
        for(const m of this.cracks)if(m.ends<=time())endFX(m.fx);
        this.cracks=[];this.crackHUD();if(!marks.length)return;
        for(const m of marks)ParticleManager.SetParticleControl(m.fx,2,Vector(255,56,16));
        this.fuse={marks,ability,ends:time()+0.5};this.nextCrack=time()+7;ability.StartCooldown(7);
    }
    private finishFuse(){
        const f=this.fuse;if(!f)return;
        this.fuse=undefined;
        const hit=new Set<CDOTA_BaseNPC>(),h=this.GetParent();
        for(const m of f.marks){
            endFX(m.fx);burst(DUST,m.pos,175);
            for(const u of this.enemies(m.pos,175)){
                if(hit.has(u)||!magic(u))continue;hit.add(u);
                this.damage(u,f.ability,300);
                if(live(u))shove(h,u,f.ability,0,0,0.7*(1-u.GetStatusResistance()),150,true);
            }
        }
        EmitSoundOn("Hero_EarthShaker.Aftershock",h);
    }
    OnTakeDamage(e:ModifierInstanceEvent){
        const h=this.GetParent();
        if(!IsServer()||e.attacker!==h||!live(h)||!e.inflictor||e.inflictor.GetAbilityName()!==R||e.damage<=0||
            !valid(e.unit)||!magic(e.unit)||e.unit.GetTeamNumber()===h.GetTeamNumber()||this.trails.has(e.unit)||!this.have("es_l_apocalypse"))return;
        const u=e.unit,pos=u.GetAbsOrigin(),icon=u.AddNewModifier(h,e.inflictor,"modifier_orb_es_tracked",{});
        this.trails.set(u,{unit:u,source:e.inflictor,last:pos,remaining:3,still:0,grace:time()+2,icon,fx:ring(pos,82,Vector(252,130,30))});
    }
    private endTrail(s:Follow){clear(s.icon);endFX(s.fx);this.trails.delete(s.unit);}
    private tickTrail(s:Follow,dt:number){
        const u=s.unit;
        if(!valid(u)||!magic(u)){this.endTrail(s);return;}
        const pos=u.GetAbsOrigin();
        ParticleManager.SetParticleControl(s.fx,0,pos);
        if(s.grace>time() && u.IsStunned()){
            s.still=0;s.last=pos;return;
        }
        s.grace=0;
        if(dist(pos,s.last)<=1.5)s.still+=dt;else s.still=0;
        s.last=pos;s.remaining-=dt;
        s.icon?.SetStackCount(Math.max(1,Math.ceil(s.remaining)));
        if(s.still>=0.7){this.endTrail(s);return;}
        if(s.remaining>0)return;
        this.endTrail(s);burst(ECHO,pos,280);
        const amt=320+0.1*(u.GetMaxHealth()-u.GetHealth());
        // Use the custom modifier (no original Echo inflictor) to avoid recursively tracking our own bonus.
        const h=this.GetParent(),victims=this.b().awake?this.enemies(pos,280):[u];
        for(const v of victims)if(magic(v))ApplyDamage({attacker:h,victim:v,damage:amt,damage_type:DamageTypes.MAGICAL});
    }
    OnIntervalThink(){
        const h=this.GetParent(),t=time(),dt=Math.max(0,Math.min(0.25,t-this.lastTime));this.lastTime=t;
        if(!live(h)||h.IsIllusion())return;
        if(this.have("es_l_aftershock")){
            this.swap(E,SEIS,true,true);
            this.activate(SEIS,!h.PassivesDisabled()&&(this.cracks.some(m=>m.ends>t)||t<this.nextCrack));
        }
        if(this.have("es_l_faultline")){
            const buff=h.FindModifierByName("modifier_earthshaker_enchant_totem");
            if(buff!==this.lastBuff){
                this.lastBuff=buff;clear(this.charged);this.spentStep=false;
                this.charged=buff?h.AddNewModifier(h,h.FindAbilityByName(W),"modifier_orb_es_charged",{duration:buff.GetRemainingTime()}):undefined;
                this.charged?.SetStackCount(1);
            }
            this.swap(W,STEP,this.b().awake && buff!==undefined && !this.spentStep &&
                (h.FindAbilityByName(W)?.GetCooldownTimeRemaining()??0)>0.06);
        }
        if(this.ridge)this.tickWall(this.ridge,t);
        const current=this.cracks.filter(m=>m.ends>t);
        if(current.length!==this.cracks.length){for(const m of this.cracks)if(m.ends<=t)endFX(m.fx);this.cracks=current;this.crackHUD();}
        if(this.fuse&&t>=this.fuse.ends)this.finishFuse();
        for(const [,s] of this.trails)this.tickTrail(s,dt);
    }
    OnDeath(e:ModifierInstanceEvent){
        if(!IsServer())return;
        if(e.unit===this.GetParent())this.cleanup();else {const s=this.trails.get(e.unit);if(s)this.endTrail(s);}
    }
    private cleanup(){
        this.clearRidge();this.swap(W,STEP,false);this.records.clear();clear(this.charged);this.charged=undefined;this.lastBuff=undefined;
        for(const c of this.cracks)endFX(c.fx);this.cracks=[];this.crackHUD();
        if(this.fuse){for(const c of this.fuse.marks)endFX(c.fx);this.fuse=undefined;}
        for(const [,s] of this.trails)this.endTrail(s);
    }
    OnDestroy(){if(IsServer()){this.cleanup();this.swap(E,SEIS,false);}}
}
modifier_orb_earthshaker_legend=registerModifier("modifier_orb_earthshaker_legend",ShakerLegends);
modifier_orb_es_pivot=registerModifier("modifier_orb_es_pivot",PivotIcon);
modifier_orb_es_charged=registerModifier("modifier_orb_es_charged",Charged);
modifier_orb_es_crack=registerModifier("modifier_orb_es_crack",CrackIcon);
modifier_orb_es_tracked=registerModifier("modifier_orb_es_tracked",Tracked);
modifier_orb_es_path=registerModifier("modifier_orb_es_path",Pathing);
