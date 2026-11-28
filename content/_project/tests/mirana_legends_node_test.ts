import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
vi.mock("../src/vscripts/lib/registry",()=>({registerModifier:(_name:string, cls:unknown)=>cls}));

const Q="mirana_starfall",W="mirana_arrow",E="mirana_leap",R="mirana_invis";
const pos=(x=0,y=0,z=0)=>({x,y,z});
let time=1;
let ctor:any;
const special:Record<string,number>={damage:300,arrow_range:2000,arrow_speed:900,arrow_width:115,arrow_max_stunrange:1500,
    arrow_min_stun:0.01,arrow_max_stun:5,arrow_bonus_damage:180,AbilityDamage:360,leap_distance:650,leap_speed:1300,fade_delay:1.5};
function unit(team:number,x:number) {
    return {p:pos(x),alive:true,root:false,GetAbsOrigin(){return this.p;},SetAbsOrigin(point:any){this.p=point;},
        GetTeamNumber:()=>team,IsRealHero:()=>true,IsHero:()=>true,IsIllusion:()=>false,IsAlive(){return this.alive;},
        IsInvulnerable:()=>false,IsOutOfGame:()=>false,IsDebuffImmune:()=>false,IsAttackImmune:()=>false,
        IsRooted(){return this.root;},IsStunned:()=>false,IsHexed:()=>false,IsCreep:()=>false,GetStatusResistance:()=>0,
        IsCurrentlyHorizontalMotionControlled:()=>false,InterruptMotionControllers:vi.fn(),HasScepter:()=>false,
        GetPlayerOwnerID:()=>0,GetForwardVector:()=>pos(1),SetForwardVector:vi.fn(),GetAverageTrueAttackDamage:()=>220,
        IsInvisible:()=>true,FindAllModifiers:()=>[],HasModifier:()=>false,SetControllableByPlayer:vi.fn(),MoveToPosition:vi.fn(),
        entindex:()=>x+1,ForceKill(){this.alive=false;},AddNewModifier:vi.fn(()=>({Destroy:vi.fn(),IsNull:()=>false,SetStackCount:vi.fn()}))};
}
function fixture(awake=false) {
    const h=Object.assign(unit(2,0),{SwapAbilities:vi.fn(),FindAbilityByName:(n:string)=>skills.get(n),AddAbility:(n:string)=>skills.get(n)});
    const enemy=unit(3,350), enemy2=unit(4,760),tree={standing:true,IsStanding(){return this.standing;},GetAbsOrigin:()=>pos(440)};
    const c1=unit(2,180),c2=unit(2,-120);
    const skills=new Map([Q,W,E,R,"orb_mirana_star","orb_mirana_arrow","orb_mirana_turn","orb_mirana_swap"].map(n=>[n,{
        GetAbilityName:()=>n,GetSpecialValueFor:(key:string)=>special[key]??0,GetCastPoint:()=>0.5,
        GetCursorPosition:()=>pos(1700),GetLevel:()=>4,SetLevel:vi.fn(),SetHidden:vi.fn(),MarkAbilityButtonDirty:vi.fn(),
        GetCooldownTimeRemaining:()=>14,GetAbilityChargeRestoreTime:()=>15,GetMaxAbilityCharges:()=>2,
        GetCurrentAbilityCharges:()=>0,StartCooldown:vi.fn(),EndCooldown:vi.fn(),SetCurrentAbilityCharges:vi.fn()}]));
    vi.stubGlobal("GridNav",{GetAllTreesAroundPoint:()=>[tree],IsTraversable:()=>true,IsBlocked:()=>false});
    vi.stubGlobal("FindUnitsInRadius",(_:number,p:any,_c:any,r:number,team:number)=>[h,enemy,enemy2]
        .filter(u=>(team===3||u!==h)&&Math.hypot(p.x-u.p.x,p.y-u.p.y)<=r));
    vi.stubGlobal("CreateIllusions",vi.fn(()=>[c1,c2]));
    const m=new ctor();m.GetParent=()=>h;m.owned=(id:string)=>id.startsWith("mir_l_");m.awake=()=>awake;
    return {h,enemy,enemy2,c1,c2,tree,m,skills,tick(t:number){time=t;m.OnIntervalThink();},
        cast(n:string){m.OnAbilityFullyCast({unit:h,ability:skills.get(n)});},
        hit(n:string,u=enemy){m.OnTakeDamage({attacker:h,unit:u,inflictor:skills.get(n)});}};
}
beforeAll(async()=>{
    for(const n of ["legend","star","arrow","turn","moons","decoy","shot","reach"])vi.stubGlobal("modifier_orb_mirana_"+n,null);
    ctor=(await import("../src/vscripts/modifiers/modifier_orb_mirana_legend")).MiranaLegends;
});
beforeEach(()=>{
    time=1;
    for(const [k,v] of Object.entries({IsServer:()=>true,IsValidEntity:()=>true,Vector:pos,GameRules:{GetGameTime:()=>time},
        ParticleManager:{CreateParticle:vi.fn(()=>1),SetParticleControl:vi.fn(),DestroyParticle:vi.fn(),ReleaseParticleIndex:vi.fn()},
        ProjectileManager:{CreateLinearProjectile:vi.fn(()=>10),DestroyLinearProjectile:vi.fn()},
        EmitSoundOn:vi.fn(),ApplyDamage:vi.fn(),GetGroundPosition:(p:any)=>pos(p.x,p.y,0),FindClearSpaceForUnit:vi.fn((u:any,p:any)=>{u.p=p;}),
        StartSoundEventFromPosition:vi.fn(),AddFOWViewer:vi.fn(),UTIL_Remove:vi.fn(),SpawnEntityFromTableSynchronous:vi.fn(()=>({SetAbsOrigin:vi.fn(),SetForwardVector:vi.fn()})),
        DamageTypes:{MAGICAL:2,PHYSICAL:1},UnitTargetTeam:{BOTH:3,ENEMY:2},UnitTargetType:{HERO:1,BASIC:2},
        UnitTargetFlags:{MAGIC_IMMUNE_ENEMIES:16},ParticleAttachment:{WORLDORIGIN:1},FindOrder:{CLOSEST:0,ANY:1}})) vi.stubGlobal(k,v);
});
afterAll(()=>vi.unstubAllGlobals());

describe("легендарки Мираны",()=>{
    it("ручной Starstorm роняет одну звезду; соперник может раздавить её до подбора",()=>{
        const f=fixture();
        f.hit(Q);expect(f.m.pickup).toBeUndefined();
        f.cast(Q);f.hit(Q);const pickup=f.m.pickup;expect(pickup.model).toBeDefined();f.hit(Q);expect(f.m.pickup).toBe(pickup);
        f.enemy.p=pickup.point;f.tick(1.2);expect(f.m.pickup).toBeUndefined();expect(f.m.held).toBeUndefined();
    });
    it("подобранная звезда в пробуждении проходит через первого и поражает второго один раз",()=>{
        const f=fixture(true);
        f.cast(Q);f.hit(Q);f.h.p=f.m.pickup.point;f.tick(1.2);
        f.m.owned=(id:string)=>id.startsWith("mir_l_")||id==="mir_p_starlight"||id==="mir_p_meteor";
        f.m.ThrowStar(f.skills.get("orb_mirana_star"),pos(900));
        const projectile=vi.mocked(ProjectileManager.CreateLinearProjectile).mock.calls[0][0] as any;
        expect(projectile.fDistance).toBe(1350);
        expect(f.m.StarHit(f.enemy,projectile.ExtraData.id)).toBe(false);
        expect(f.m.StarHit(f.enemy,projectile.ExtraData.id)).toBe(false);
        expect(f.m.StarHit(f.enemy2,projectile.ExtraData.id)).toBe(true);
        expect(ApplyDamage).toHaveBeenCalledTimes(2);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({damage:670}));
    });
    it("W останавливает нативный полёт у дерева, переносит пройденную дистанцию, исчезает если дерево срубили",()=>{
        const f=fixture();f.enemy.p=pos(1400);const a=f.skills.get(W);
        f.m.OnAbilityStart({unit:f.h,ability:a});expect(f.m.GetModifierOverrideAbilitySpecialValue()).toBe(404);
        f.cast(W);f.tick(1.5);expect(f.m.pin.tree).toBe(f.tree);
        f.m.Redirect(f.skills.get("orb_mirana_arrow"),pos(440,1000));
        const id=f.m.arrowFlight.id;
        expect(f.m.ArrowHit(f.enemy,pos(440,450),id)).toBe(true);
        expect(ApplyDamage).toHaveBeenCalledWith(expect.objectContaining({damage:1.5*(360+180*(404+412)/1500)+140}));
        f.m.OnAbilityStart({unit:f.h,ability:a});f.cast(W);f.tick(2);f.tree.standing=false;f.tick(2.1);
        expect(f.m.pin).toBeUndefined();
    });
    it("прыжок даёт ровно один поворот и веер, три попадания учитываются отдельно по каждому герою",()=>{
        const f=fixture(true);f.cast(E);f.m.Turn(f.skills.get("orb_mirana_turn"),pos(150,160));
        const to=f.m.leap.turn.to;f.m.Turn(f.skills.get("orb_mirana_turn"),pos(-150,-160));expect(f.m.leap.turn.to).toBe(to);
        f.tick(1.42);expect(ProjectileManager.CreateLinearProjectile).toHaveBeenCalledTimes(3);
        const proj=vi.mocked(ProjectileManager.CreateLinearProjectile).mock.calls[0][0] as any;
        f.m.FanHit(f.enemy,proj.ExtraData.id);f.m.FanHit(f.enemy2,proj.ExtraData.id);f.m.FanHit(f.enemy,proj.ExtraData.id);
        expect(f.skills.get(E)?.StartCooldown).not.toHaveBeenCalled();
        f.m.FanHit(f.enemy,proj.ExtraData.id);expect(f.skills.get(E)?.StartCooldown).toHaveBeenCalledWith(6.5);
    });
    it("луны расходятся только когда Мирана исчезла; после уничтожения одной можно поменяться с оставшейся",()=>{
        const f=fixture(true);f.cast(R);f.tick(1.2);expect(CreateIllusions).not.toHaveBeenCalled();
        f.h.FindAllModifiers=()=>[{GetName:()=>"modifier_mirana_moonlight_shadow"}] as any;
        f.tick(2.5);expect(CreateIllusions).toHaveBeenCalledWith(f.h,f.h,expect.objectContaining({duration:10}),2,36,false,true);f.c1.alive=false;f.tick(2.6);
        f.h.root=true;f.m.SwapMoon(pos(-600));expect(f.h.p.x).toBe(0);
        f.h.root=false;f.m.SwapMoon(pos(-600));expect(f.h.p.x).toBe(-120);expect(f.m.moons).toBeUndefined();
        expect(f.h.AddNewModifier).toHaveBeenCalledWith(f.h,f.skills.get(R),"modifier_orb_mirana_shot",{duration:4});
    });
});
