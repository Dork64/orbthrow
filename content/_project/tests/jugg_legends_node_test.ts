import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/vscripts/lib/registry", () => ({registerModifier: (_: string, cls: unknown) => cls}));

let Jugg: any, now = 10;
const v = (x = 0, y = 0, z = 0) => ({x,y,z});
let foes: any[], friends: any[];
function fixture(awake = false) {
    const states = new Set<string>();
    const skill = (name:string) => ({
        GetAbilityName:()=>name, GetLevel:()=>name==="juggernaut_omni_slash"?3:4, GetMaxAbilityCharges:()=>0,
        GetCooldownTimeRemaining:()=>8, EndCooldown:vi.fn(), StartCooldown:vi.fn(), SetLevel: vi.fn(), GetCursorPosition:()=>v(),
        IsCooldownReady:()=>false, SetHidden:vi.fn(), MarkAbilityButtonDirty:vi.fn(),
    });
    const effects: Record<string,ReturnType<typeof skill>> = {};
    for(const n of ["juggernaut_blade_fury","juggernaut_healing_ward","juggernaut_blade_dance","juggernaut_omni_slash","orb_jugg_three_cuts","orb_jugg_encore"])
        effects[n]=skill(n);
    const unit = (id: number, team: number, pos: ReturnType<typeof v>) => ({
        id, pos, active: true, immune: false, block: false, ghost: false,
        GetPlayerOwnerID:()=>0, GetAbsOrigin:()=>pos, IsOutOfGame:()=>false, IsInvulnerable:()=>false,
        IsAlive() { return this.active; }, IsAttackImmune() { return this.ghost; }, IsDebuffImmune() { return this.immune; },
        TriggerSpellAbsorb:vi.fn(function(this:{block:boolean}) { return this.block; }),
        IsRealHero:()=>true, IsIllusion:()=>false, GetTeamNumber:()=>team, GetMaxHealth:()=>2000, GetHealth:()=>1000, GetHealthPercent:()=>35, entindex:()=>id,
        IsRooted:()=>false, IsCurrentlyHorizontalMotionControlled:()=>false,
        AddNewModifier:vi.fn(()=>({SetStackCount:vi.fn(),IsNull:()=>false,Destroy:vi.fn()})),
    });
    const hero = {...unit(1,2,v()), FindAbilityByName:(name:string)=>effects[name], SwapAbilities:vi.fn(),
        HasModifier:(name:string)=>states.has(name), CanEntityBeSeenByMyTeam:()=>true, PerformAttack:vi.fn(), FaceTowards:vi.fn()};
    const ward = {...unit(2,2,v()), GetUnitName:()=>"npc_dota_juggernaut_healing_ward", ForceKill:vi.fn()};
    const enemy = unit(3,3,v(140)), third = unit(4,4,v(260));
    foes = [enemy, third]; friends = [ward];
    const m = new Jugg();
    m.GetParent=()=>hero;
    const code: Record<string, number> = {jugg_l_sanctuary:1,jugg_l_cuts:1,jugg_l_endless:1};
    m.bonuses=()=>({awake,code});
    const hit = (target = enemy, record = 1) => ({attacker:hero,target,damage:100,record});
    const cast = (name:string) => m.OnAbilityFullyCast({unit:hero,ability:effects[name]});
    const tick = (at:number) => {now=at;m.OnIntervalThink();};
    return {m,hero,ward,enemy,third,states,effects,hit,cast,tick,code};
}
beforeAll(async()=>{
    vi.stubGlobal("modifier_orb_battle_shield", null);
    for(const n of ["legend","guardcut","intermission","open_wound","ward_charge","ward_fuse","ward_bind","cuts","encore_pause","encore_ready","encore_slash"]) vi.stubGlobal("modifier_orb_jugg_"+n,null);
    Jugg=(await import("../src/vscripts/modifiers/modifier_orb_jugg_legend")).JuggernautLegends;
});
beforeEach(()=>{
    now=10;
    for(const [k,val] of Object.entries({
        IsServer:()=>true, IsValidEntity:()=>true, GameRules:{GetGameTime:()=>now}, Vector:v, EmitSoundOn:vi.fn(),
        DamageTypes:{MAGICAL:2,PHYSICAL:1}, DamageFlag:{NO_SPELL_AMPLIFICATION:1024,NO_SPELL_LIFESTEAL:4096}, ParticleAttachment:{WORLDORIGIN:0,ABSORIGIN_FOLLOW:1}, ApplyDamage:vi.fn(),
        ParticleManager:{CreateParticle:()=>9,SetParticleControl:vi.fn(),DestroyParticle:vi.fn(),ReleaseParticleIndex:vi.fn()},
        FindClearSpaceForUnit:vi.fn(), GetGroundPosition:(p:unknown)=>p,
        GridNav:{CanFindPath:()=>true,IsTraversable:()=>true,IsBlocked:()=>false},
        UnitTargetTeam:{FRIENDLY:1,ENEMY:2}, UnitTargetType:{}, UnitTargetFlags:{}, FindOrder:{},
        FindUnitsInRadius:(_a:unknown,_b:unknown,_c:unknown,_d:unknown,team:number)=>team===1?friends:foes,
    })) vi.stubGlobal(k,val);
});
afterAll(()=>vi.unstubAllGlobals());

describe("легендарки Джаггернаута",()=>{
    it("два удара по одной цели взводят тотем; волна уходит внутрь, каждый герой страдает один раз",()=>{
        const f = fixture();
        f.cast("juggernaut_healing_ward"); f.tick(10);
        f.m.OnAttackLanded(f.hit(f.enemy)); f.m.OnAttackLanded(f.hit(f.third));
        f.tick(10.1);
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.m.OnAttackLanded({...f.hit(f.third),no_attack_cooldown:true});
        f.m.OnAttackLanded(f.hit(f.third));
        f.tick(10.74);
        expect(ApplyDamage).not.toHaveBeenCalled();
        f.third.immune=true;
        f.tick(11); f.tick(11.2); f.tick(12);
        expect(vi.mocked(ApplyDamage).mock.calls.map(([arg])=>arg.damage)).toEqual([580,580]);
        expect(f.enemy.AddNewModifier.mock.calls.some((c:any[])=>c[2]==="modifier_orb_jugg_ward_bind")).toBe(true);
        expect(f.third.AddNewModifier).not.toHaveBeenCalled();
        expect(f.ward.ForceKill).toHaveBeenCalledExactlyOnceWith(false);
    });

    it("соперник может сбить взвод, а пробуждение сохраняет тотем без повторной волны",()=>{
        for (const awake of [false,true]) {
            const f = fixture(awake);
            f.cast("juggernaut_healing_ward"); f.tick(10);
            f.m.OnAttackLanded(f.hit()); f.m.OnAttackLanded(f.hit());
            if (!awake) f.ward.active=false;
            vi.mocked(ApplyDamage).mockClear();
            f.tick(11.1);
            expect(ApplyDamage).toHaveBeenCalledTimes(awake?2:0);
            vi.mocked(ApplyDamage).mockClear();
            f.m.OnAttackLanded(f.hit()); f.m.OnAttackLanded(f.hit()); f.tick(12);
            expect(ApplyDamage).not.toHaveBeenCalled();
            expect(f.ward.ForceKill).not.toHaveBeenCalled();
        }
    });

    it("у E остаётся пассивная способность, а гарантированный крит привязан к третьей атаке и её записи",()=>{
        const f = fixture();
        f.tick(10);
        expect(f.hero.SwapAbilities).toHaveBeenCalledWith("juggernaut_blade_dance","orb_jugg_three_cuts",true,true);
        f.m.StartCuts(f.effects.orb_jugg_three_cuts);
        f.m.OnAttackLanded(f.hit());
        expect(f.m.GetModifierPreAttack_CriticalStrike(f.hit())).toBe(0);
        f.m.OnAttackLanded(f.hit(f.enemy,2));
        expect(FindClearSpaceForUnit).toHaveBeenCalledTimes(1);
        expect(f.m.GetModifierPreAttack_CriticalStrike(f.hit(f.third,3))).toBe(0);
        expect(f.m.GetModifierPreAttack_CriticalStrike(f.hit(f.enemy,3))).toBe(300);
        expect(f.m.GetModifierPreAttack_CriticalStrike(f.hit(f.enemy,4))).toBe(0);
        f.m.OnAttackFail(f.hit(f.enemy,3));
        expect(f.m.GetModifierPreAttack_CriticalStrike(f.hit(f.enemy,4))).toBe(0);
    });

    it("R соблюдает паузу, даёт сменить цель и заканчивает повтор после трёх ударов",()=>{
        const f = fixture();
        f.states.add("modifier_juggernaut_omnislash");
        f.cast("juggernaut_omni_slash"); f.tick(11);
        f.states.clear(); f.tick(12);
        f.tick(12.8);
        expect(f.m.CanEncore()).toBe(false);
        f.tick(12.95);
        expect(f.m.CanEncore()).toBe(true);
        expect(f.hero.SwapAbilities).toHaveBeenCalledWith("juggernaut_omni_slash","orb_jugg_encore",false,true);
        f.m.StartEncore(f.effects.orb_jugg_encore,f.third);
        f.tick(13.35); f.tick(13.75); f.tick(14.15);
        expect(f.hero.PerformAttack.mock.calls.map(c=>c[0])).toEqual([f.third,f.third,f.third]);
        expect(f.m.CanEncore()).toBe(false);
    });

    it("Linken тратит повтор без ударов; Refresher закрывает старое окно",()=>{
        for(const refresher of [false,true]) {
            const f = fixture();
            f.states.add("modifier_juggernaut_omnislash");
            f.cast("juggernaut_omni_slash"); f.states.clear();
            f.tick(11); f.tick(12);
            expect(f.m.CanEncore()).toBe(true);
            if(refresher) {f.effects.juggernaut_omni_slash.IsCooldownReady=()=>true;f.tick(12.1);}
            else {f.enemy.block=true;f.m.StartEncore(f.effects.orb_jugg_encore,f.enemy);}
            expect(f.m.CanEncore()).toBe(false);
            expect(f.hero.PerformAttack).not.toHaveBeenCalled();
        }
    });
});

it("метка R срабатывает один раз со штатной атаки или первого удара «На бис»", () => {
    for (const encore of [false, true]) {
        const f = fixture();
        Object.assign(f.code, { jugg_l_endless: Number(encore), jugg_p_bloody_omni: 1, jugg_p_dispel: 1 });
        f.states.add("modifier_juggernaut_omnislash");
        f.cast("juggernaut_omni_slash");
        f.m.OnAttackLanded({ ...f.hit(), no_attack_cooldown: true });
        f.m.OnAttackLanded({ ...f.hit(), no_attack_cooldown: true });
        f.m.OnAttackLanded({ ...f.hit(), no_attack_cooldown: true });
        expect(ApplyDamage).not.toHaveBeenCalled();
        expect(f.enemy.AddNewModifier.mock.calls.filter(c => c[2] === "modifier_orb_jugg_open_wound")).toHaveLength(1);
        f.states.delete("modifier_juggernaut_omnislash");
        f.tick(10.2);
        expect(f.hero.AddNewModifier).toHaveBeenCalledWith(f.hero, f.effects.juggernaut_omni_slash,
            "modifier_orb_jugg_intermission", { duration: encore ? 2.2 : 1.5, amount: 260 });
        if (encore) {
            f.tick(11.2);
            f.hero.PerformAttack.mockImplementation(() => f.m.OnAttackLanded({ ...f.hit(), no_attack_cooldown: true }));
            f.m.StartEncore(f.effects.orb_jugg_encore, f.enemy);
        } else {
            f.m.OnAttackLanded(f.hit(f.third));
            f.m.OnAttackLanded(f.hit());
        }
        f.m.OnAttackLanded(f.hit());
        expect(ApplyDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ victim: f.enemy, damage: 220 }));
        vi.mocked(ApplyDamage).mockClear();
        now = 10;
    }
});

it("третий рез получает усиление добивания, а три попадания сокращают КД ровно один раз", () => {
    const f = fixture();
    Object.assign(f.code, { jugg_p_finisher: 1, jugg_p_death_dance: 1 });
    f.tick(10);
    f.m.StartCuts(f.effects.orb_jugg_three_cuts);
    f.m.OnAttackLanded(f.hit(f.enemy, 1));
    f.m.OnAttackLanded(f.hit(f.enemy, 2));
    expect(f.m.GetModifierPreAttack_CriticalStrike(f.hit(f.enemy, 3))).toBe(335);
    f.m.OnAttackLanded(f.hit(f.enemy, 3));
    expect(f.effects.juggernaut_blade_fury.StartCooldown).toHaveBeenCalledExactlyOnceWith(7);
    expect(f.effects.juggernaut_omni_slash.StartCooldown).toHaveBeenCalledExactlyOnceWith(7);
});
