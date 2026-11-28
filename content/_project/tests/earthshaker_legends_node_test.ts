import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("../src/vscripts/lib/registry", () => ({ registerModifier: (_: string, cls: unknown) => cls }));
let Controller:any;
let now=10;
const vec=(x=0,y=0,z=0)=>({x,y,z});
beforeAll(async()=>{
    for(const key of ["modifier_orb_earthshaker_legend","modifier_orb_es_pivot","modifier_orb_es_charged","modifier_orb_es_crack","modifier_orb_es_tracked","modifier_orb_es_path"])
        vi.stubGlobal(key,null);
    Controller=(await import("../src/vscripts/modifiers/modifier_orb_earthshaker_legend")).ShakerLegends;
});
afterAll(()=>vi.unstubAllGlobals());
function fixture(){
    now=10;
    const blocked=new Set<string>();
    const entity=()=>({SetAbsOrigin:vi.fn(),SetAngles:vi.fn(),key:""});
    const removals=vi.fn((e:ReturnType<typeof entity>)=>blocked.delete(e.key));
    const spawn=vi.fn((type:string,kv:any)=>{
        const ent=entity();
        if(type==="point_simple_obstruction"){ent.key=kv.origin.x+":"+kv.origin.y;blocked.add(ent.key);}
        return ent;
    });
    const unit=(team:number,x:number,y=0)=>({
        team,pos:vec(x,y),stunned:false,immune:false,
        GetAbsOrigin(){return this.pos;},GetTeamNumber(){return this.team;},GetForwardVector:()=>vec(1),IsAlive:()=>true,
        IsRealHero:()=>true,IsIllusion:()=>false,IsInvulnerable:()=>false,IsOutOfGame:()=>false,
        IsMagicImmune(){return this.immune;},IsDebuffImmune(){return this.immune;},IsStunned(){return this.stunned;},
        IsCurrentlyHorizontalMotionControlled:()=>false,IsCurrentlyVerticalMotionControlled:()=>false,GetStatusResistance:()=>0,
        GetMaxHealth:()=>2000,GetHealth:()=>1000,GetHullRadius:()=>24,
        AddNewModifier:vi.fn(()=>({Destroy:vi.fn(),IsNull:()=>false,SetStackCount:vi.fn(),SetDuration:vi.fn()})),
    });
    const make=(name:string)=>({GetAbilityName:()=>name,GetLevel:()=>4,GetLevelSpecialValueNoOverride:()=>8,
        GetCastRange:()=>800,GetCursorPosition:()=>vec(1000,0),GetSpecialValueFor:()=>0,IsItem:()=>false,
        SetLevel:vi.fn(),SetHidden:vi.fn(),MarkAbilityButtonDirty:vi.fn(),StartCooldown:vi.fn(),IsActivated:()=>true,SetActivated:vi.fn()});
    const skills=Object.fromEntries(["earthshaker_fissure","earthshaker_enchant_totem","earthshaker_aftershock",
        "earthshaker_echo_slam","orb_es_pivot","orb_es_seismograph","orb_es_step"].map(n=>[n,make(n)]));
    const hero={...unit(2,0),FindAbilityByName:(n:string)=>skills[n],FindModifierByName:()=>undefined,
        HasModifier:(n:string)=>n==="modifier_earthshaker_enchant_totem",GetCastRangeBonus:()=>0,
        PassivesDisabled:()=>false,SwapAbilities:vi.fn()};
    const victim=unit(3,600),other=unit(4,1600),units=[victim,other];
    const damage=vi.fn();
    const particle={CreateParticle:vi.fn(()=>100),SetParticleControl:vi.fn(),DestroyParticle:vi.fn(),ReleaseParticleIndex:vi.fn()};
    Object.entries({IsServer:()=>true,IsValidEntity:()=>true,GameRules:{GetGameTime:()=>now},Vector:vec,tostring:String,
        ParticleManager:particle,ParticleAttachment:{WORLDORIGIN:1},GetGroundHeight:()=>0,GetGroundPosition:(p:unknown)=>p,
        GridNav:{WorldToGridPosX:Math.floor,WorldToGridPosY:Math.floor,GridPosToWorldCenterX:(x:number)=>x,
            GridPosToWorldCenterY:(y:number)=>y,IsTraversable:()=>true,IsBlocked:()=>false},
        SpawnEntityFromTableSynchronous:spawn,UTIL_Remove:removals,ApplyDamage:damage,DamageTypes:{MAGICAL:2},
        UnitTargetTeam:{},UnitTargetType:{},UnitTargetFlags:{},FindOrder:{},EmitSoundOn:vi.fn(),
        FindUnitsInRadius:(_:number,p:ReturnType<typeof vec>,_c:unknown,r:number)=>
            units.filter(u=>Math.hypot(p.x-u.pos.x,p.y-u.pos.y)<=r),
    }).forEach(([key,val])=>vi.stubGlobal(key,val));
    const mod=new Controller();
    mod.GetParent=()=>hero;
    mod.b=()=>({awake:true,code:{es_l_rift:1,es_l_aftershock:1,es_l_faultline:1,es_l_apocalypse:1},
        specials:{},specialsSet:{},specialsMul:{}});
    return {mod,hero,victim,other,skills,damage,blocked};
}
describe("легендарные сферы Шейкера",()=>{
    it("Q сохраняет ближнюю половину и убирает блоки со старого направления",()=>{
        const f=fixture();
        f.mod.OnAbilityFullyCast({ability:f.skills.earthshaker_fissure,unit:f.hero});
        const before=[...f.blocked];
        expect(before.length).toBeGreaterThan(4);
        f.mod.Pivot(vec(400,700));now+=0.85;
        f.mod.tickWall(f.mod.ridge,now);
        expect(f.mod.ridge.movingDir).toBeCloseTo(Math.PI/2);
        const after=[...f.blocked];
        expect(before.filter(k=>Number(k.split(":")[0])<395).every(k=>f.blocked.has(k))).toBe(true);
        expect(after.some(k=>Number(k.split(":")[1])>250)).toBe(true);
        expect(after.some(k=>Number(k.split(":")[0])>465)).toBe(false);
        f.mod.clearRidge();expect(f.blocked.size).toBe(0);
    });
    it("W требует усиленной атаки и поражает обоих при столкновении",()=>{
        const f=fixture(); f.victim.pos=vec(60);f.other.pos=vec(240);
        const ev={attacker:f.hero,target:f.victim,record:3};
        f.mod.OnAttackLanded(ev);expect(f.damage).not.toHaveBeenCalled();
        f.mod.OnAttackRecord(ev); f.mod.OnAttackLanded(ev); f.mod.OnAttackLanded(ev);
        expect(f.damage.mock.calls.map(c=>[c[0].victim,c[0].damage])).toEqual([[f.victim,410],[f.other,410]]);
    });
    it("E взрывает две разные точки один раз по цели, даже на пересечении",()=>{
        const f=fixture(); f.victim.pos=vec(150);f.mod.recordCrack(f.victim);
        f.victim.pos=vec(280);f.mod.recordCrack(f.victim);
        f.mod.Detonate(f.skills.orb_es_seismograph);
        expect(f.mod.fuse.marks).toHaveLength(2);
        f.mod.finishFuse();expect(f.damage).toHaveBeenCalledTimes(1);
        expect(f.damage.mock.calls[0][0].damage).toBe(300);
        f.mod.recordCrack(f.victim);expect(f.mod.cracks).toHaveLength(0);
    });
    it("R даёт остановиться после стана, один бегущий герой подрывается и задевает соседнего",()=>{
        const f=fixture(),a=f.skills.earthshaker_echo_slam;
        const mark=()=>f.mod.OnTakeDamage({attacker:f.hero,unit:f.victim,inflictor:a,damage:100});
        const tick=(move:boolean,n:number)=>{for(let i=0;i<n;i++){
            now+=0.1;if(move)f.victim.pos=vec(f.victim.pos.x+4);
            const s=f.mod.trails.get(f.victim);if(s)f.mod.tickTrail(s,0.1);
        }};
        mark();f.victim.stunned=true;tick(false,12);expect(f.mod.trails.size).toBe(1);
        f.victim.stunned=false;tick(false,8);expect(f.mod.trails.size).toBe(0);expect(f.damage).not.toHaveBeenCalled();
        mark();f.other.pos=vec(730);tick(true,31);
        expect(f.damage.mock.calls.map(c=>c[0].damage)).toEqual([420,420]);
        expect(f.mod.trails.size).toBe(0);
    });
});
