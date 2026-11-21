import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computeBonuses, overrideValue } from "../src/vscripts/core/orbstore";
import { fxOfOrb } from "../src/vscripts/core/fxutil";
vi.mock("../src/vscripts/lib/registry", () => ({registerModifier: (_: string, cls: unknown) => cls}));

let Tusk: any, time = 10;
const vector = (x=0,y=0,z=0) => ({x,y,z});
const specials: Record<string,number> = {shard_duration:5, shard_speed:1000, shard_damage:180, debuff_duration:6, radius:350, bonus_damage:90, crit_multiplier:300, air_time:1, snowball_windup:3,snowball_duration:3,snowball_damage:260,snowball_speed:600,snowball_radius:100};
const ids = ["wall","roll","counter","ko"];
function fixture(awake = false) {
    const origin = vector(), victimPos = vector(100);
    const spell = (name:string) => ({GetAbilityName:()=>name, GetSpecialValueFor:(k:string)=>specials[k], GetCursorPosition:()=>vector(240),entindex:()=>42,IsFullyCastable:()=>true});
    const q=spell("tusk_ice_shards"), w=spell("tusk_snowball"), e=spell("tusk_tag_team"), r=spell("tusk_walrus_punch");
    const skills: Record<string,typeof q> = {tusk_ice_shards:q,tusk_snowball:w,tusk_tag_team:e,tusk_walrus_punch:r};
    const unit = (team:number, pos:typeof origin) => ({GetTeamNumber:()=>team,GetAbsOrigin:()=>pos,IsRealHero:()=>true,IsAlive:()=>true,IsIllusion:()=>false,IsInvulnerable:()=>false,IsDebuffImmune:()=>false,IsOutOfGame:()=>false,IsStunned:()=>false,IsSilenced:()=>false,IsRooted:()=>false,IsHexed:()=>false,IsDisarmed:()=>false,GetMaxHealth:()=>1000,GetHealth:()=>600,SetForwardVector:vi.fn(),SetAbsOrigin:vi.fn(),entindex:()=>team,AddNewModifier:vi.fn(()=>({SetStackCount:vi.fn()}))});
    const h={...unit(2,origin),FindAbilityByName:(s:string)=>skills[s],GetForwardVector:()=>vector(1),GetAverageTrueAttackDamage:()=>100,GetPlayerOwnerID:()=>0,EmitSound:vi.fn(),RemoveModifierByName:vi.fn(),Script_GetAttackRange:()=>150,CastAbilityOnTarget:vi.fn()};
    const target=unit(3,victimPos), m=new Tusk();
    m.GetParent=()=>h;
    m.bonuses=()=>({awake,code:Object.fromEntries(ids.map(id=>["tusk_l_"+id,1]))});
    vi.stubGlobal("EntIndexToHScript",()=>target);
    return {h,target,victimPos,m,q,w,e,r};
}
beforeAll(async()=>{
    for(const n of ["modifier_orb_tusk","modifier_orb_tusk_stance"]) vi.stubGlobal(n,null);
    Tusk=(await import("../src/vscripts/modifiers/modifier_orb_tusk")).TuskOrbs;
});
beforeEach(()=>{
    time=10;
    for(const [k,v] of Object.entries({IsServer:()=>true, IsValidEntity:()=>true, GameRules:{GetGameTime:()=>time}, Vector:vector,
        ParticleAttachment:{},DamageTypes:{PHYSICAL:1,MAGICAL:2},ApplyDamage:vi.fn(),FindClearSpaceForUnit:vi.fn(),
        ParticleManager:{CreateParticle:()=>7,SetParticleControl:vi.fn(),DestroyParticle:vi.fn(),ReleaseParticleIndex:vi.fn()},
        UnitOrder:{STOP:1,HOLD_POSITION:2,CAST_TARGET:3},GridNav:{IsBlocked:()=>false,IsTraversable:()=>true},GetGroundPosition:(v:any)=>v,
        UnitTargetTeam:{},UnitTargetType:{},UnitTargetFlags:{},FindOrder:{}})) vi.stubGlobal(k,v);
});
afterAll(()=>vi.unstubAllGlobals());
describe("Tusk duel spheres",()=>{
    it("requires an armed post in the direction of the attack and consumes it once",()=>{
        const {h,target,victimPos,m,q}=fixture();
        m.OnAbilityFullyCast({unit:h,ability:q}); m.OnAttackLanded({attacker:h,target});
        expect(ApplyDamage).not.toHaveBeenCalled();
        time++; victimPos.y=200; m.OnAttackLanded({attacker:h,target});
        expect(ApplyDamage).not.toHaveBeenCalled();
        victimPos.y=0; m.OnAttackLanded({attacker:h,target}); m.OnAttackLanded({attacker:h,target});
        expect(vi.mocked(ApplyDamage).mock.calls.map(([v])=>v.damage)).toEqual([200,180]);
        expect(target.AddNewModifier).toHaveBeenCalledTimes(1);
    });
    it("counts a second roll impact only after exiting and caps the entire run at three",()=>{
        const {h,target,m,w}=fixture(); m.OnAbilityFullyCast({unit:h,ability:w});
        m.OnTakeDamage({attacker:h,unit:target,inflictor:w});
        for(const units of [[target],[],[target],[target],[],[target]]){
            vi.stubGlobal("FindUnitsInRadius",()=>units); time+=0.05; m.OnIntervalThink();
        }
        expect(m.rolling).toBeUndefined();
        expect(vi.mocked(ApplyDamage).mock.calls.map(([v])=>v.damage)).toEqual([specials.snowball_damage*1.5,specials.snowball_damage*2]);
    });
    it("awakening opens parry on attack two and consumes just one directed spell",()=>{
        const {h,target,m,e}=fixture(true);m.OnAbilityFullyCast({unit:h,ability:e});
        m.OnAttackLanded({attacker:h,target}); expect(m.ready).toBe(0);
        m.OnAttackLanded({attacker:h,target});m.order({order_type:1});
        const event={ability:{GetCaster:()=>target}};
        expect(m.GetAbsorbSpell(event)).toBe(1);expect(m.GetAbsorbSpell(event)).toBe(0);
    });
    it("separates manual early release, interrupted wind-up and full punch with landing damage",()=>{
        const {h,target,m}=fixture();const order={order_type:3,entindex_ability:42,entindex_target:3};
        expect(m.order(order)).toBe(false);expect(m.order(order)).toBe(true);expect(m.charged).toBeUndefined();
        m.order(order);h.IsStunned=()=>true;m.OnIntervalThink();expect(m.windup).toBeUndefined();
        h.IsStunned=()=>false;m.order(order);time+=1.5;m.OnIntervalThink();expect(h.CastAbilityOnTarget).toHaveBeenCalledOnce();
        m.OnAttackLanded({attacker:h,target});time+=1;m.OnIntervalThink();expect(vi.mocked(ApplyDamage).mock.calls.map(([v])=>v.damage)).toEqual([570,60]);
    });
    it("uses native sphere stacks and stock charges together",()=>{
        const b=computeBonuses({tusk_l_wall:1,tusk_b_00:2,tusk_b_20:2},0);
        expect(fxOfOrb("tusk_l_wall")[0]).toMatchObject({t:"charges",n:1});
        expect(b.specials.tusk_tag_team.bonus_damage).toBe(28);
        expect(overrideValue(b,"tusk_ice_shards","shard_damage",300)).toBeGreaterThan(300);
    });
});
