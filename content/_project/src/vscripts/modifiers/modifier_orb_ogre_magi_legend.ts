import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf } from "../core/orbstore";

declare global {
    var modifier_orb_ogre_magi_legend: unknown;
    var modifier_orb_ogre_club_ready: unknown;
    var modifier_orb_ogre_potato: unknown;
    var modifier_orb_ogre_duel: unknown;
    var modifier_orb_ogre_duel_ready: unknown;
    var modifier_orb_ogre_die_ready: unknown;
    var modifier_orb_ogre_die_bet: unknown;
}

const FIREBLAST = "ogre_magi_fireblast";
const IGNITE = "ogre_magi_ignite";
const BLOODLUST = "ogre_magi_bloodlust";
const MULTICAST = "ogre_magi_multicast";
const CLUB = "orb_ogre_club";
const LOADED_DIE = "orb_ogre_loaded_die";
const CLUB_READY = "modifier_orb_ogre_club_ready";
const POTATO = "modifier_orb_ogre_potato";
const CHALLENGE = "orb_ogre_challenge";
const DUEL_READY = "modifier_orb_ogre_duel_ready";
const DUEL = "modifier_orb_ogre_duel";
const DIE_READY = "modifier_orb_ogre_die_ready";
const DIE_BET = "modifier_orb_ogre_die_bet";
const NATIVE_STUN = "modifier_ogre_magi_fireblast";
const NATIVE_IGNITE = "modifier_ogre_magi_ignite";
const NATIVE_LUST = "modifier_ogre_magi_bloodlust";

const FIRE_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_fireblast.vpcf";
const IGNITE_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_ignite.vpcf";
const LUST_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_bloodlust_buff.vpcf";
const RING_FX = "particles/ui_mouseactions/range_display.vpcf";
const THINK = 0.04;
const CLUB_MODEL = "models/heroes/ogre_magi/ogre_magi_weapon.vmdl";
const POT_MODEL = "models/items/wards/fall20_cauldron_ward/fall20_cauldron_ward.vmdl";
const DUEL_FX = "particles/units/heroes/hero_legion_commander/legion_commander_duel_ring.vpcf";
const CLUB_WINDOW = 6;
const CLUB_RANGE = 825;
const CLUB_RADIUS = 290;
const CLUB_CENTER = 150;
const CLUB_FLIGHT = 0.65;
const CLUB_BOUNCE = 400;
const POTATO_FUSE = 4;
const POTATO_RADIUS = 325;
const DUEL_WINDOW = 2.4;
const CHALLENGE_WINDOW = 5;
const CHALLENGE_RANGE = 375;
const BET_WINDOW = 4;
const ROLLED_AT = 0.75; // первый штатный повтор приходит через 0.6 с.

const time = () => GameRules.GetGameTime();
function alive(unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
    return unit !== undefined && IsValidEntity(unit) && unit.IsAlive();
}
function hero(unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
    return alive(unit) && unit.IsRealHero() && !unit.IsIllusion() && !unit.IsOutOfGame();
}
function distance(a: Vector, b: Vector): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function clear(icon?: CDOTA_Buff) { if (icon !== undefined && !icon.IsNull()) icon.Destroy(); }
function clearParticle(particle: ParticleID) {
    ParticleManager.DestroyParticle(particle, true);
    ParticleManager.ReleaseParticleIndex(particle);
}
function atPoint(path: string, point: Vector) {
    const id = ParticleManager.CreateParticle(path, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id, 0, point);
    ParticleManager.SetParticleControl(id, 1, point);
    return id;
}
function attached(path: string, unit: CDOTA_BaseNPC) {
    ParticleManager.ReleaseParticleIndex(ParticleManager.CreateParticle(path, ParticleAttachment.ABSORIGIN_FOLLOW, unit));
}
function warning(point: Vector, radius: number) {
    const p = atPoint(RING_FX, point);
    ParticleManager.SetParticleControl(p, 1, Vector(radius, 0, 0));
    ParticleManager.SetParticleControl(p, 2, Vector(255, 178, 87));
    return p;
}

class ClubReady extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return FIREBLAST; }
}
class HotPotato extends ClubReady {
    IsDebuff() { return true; }
    GetTexture() { return IGNITE; }
    GetEffectName() { return IGNITE_FX; }
    GetEffectAttachType() { return ParticleAttachment.OVERHEAD_FOLLOW; }
}
class DuelReady extends ClubReady { GetTexture() { return BLOODLUST; } }
class DuelScore extends DuelReady {
    IsDebuff() { return this.GetParent() !== this.GetCaster(); }
    IgnoreTenacity() { return true; }
    CheckState() {
        return { [ModifierState.TAUNTED]: true, [ModifierState.SILENCED]: true, [ModifierState.MUTED]: true };
    }
    GetEffectName() { return LUST_FX; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
}
class DieReady extends ClubReady {
    GetTexture() { return MULTICAST; }
}
class DieBet extends DieReady {
    IsDebuff() { return this.GetParent() !== this.GetCaster(); }
    GetEffectName() { return IGNITE_FX; }
    GetEffectAttachType() { return ParticleAttachment.OVERHEAD_FOLLOW; }
}

interface ClubWindow {
    ability: CDOTABaseAbility;
    target: CDOTA_BaseNPC;
    ends: number;
    icon?: CDOTA_Buff;
}
interface ClubLanding {
    point: Vector;
    centerDamage: number;
    origin: Vector;
    launched: number;
    model?: CBaseEntity;
    lands: number;
    marker: ParticleID;
    ability: CDOTABaseAbility;
    hit: Set<EntityIndex>;
    bounce?: Vector;
}
interface Potato {
    owner?: CDOTA_BaseNPC;
    last: Vector;
    ability: CDOTABaseAbility;
    ends: number;
    transfers: number;
    awake: boolean;
    model?: CBaseEntity;
    icon?: CDOTA_Buff;
}
interface Duel {
    target: CDOTA_BaseNPC;
    ends: number;
    ring: ParticleID;
    scoreOgre?: CDOTA_Buff;
    scoreEnemy?: CDOTA_Buff;
}
interface Cast {
    ability: CDOTABaseAbility;
    target: CDOTA_BaseNPC;
    starts: number;
    at?: number;
    repeated: boolean;
    eligible: boolean;
    committed: boolean;
    ignitionEnds: number;
    igniteCandidates: Set<CDOTA_BaseNPC>;
    potUsed: boolean;
    nativeObserved: boolean;
    multiplier?: number;
}

export class OgreMagiLegends extends ModBase {
    private club?: ClubWindow;
    private landing?: ClubLanding;
    private clubShown = false;
    private dieShown = false;
    private potato?: Potato;
    private duel?: Duel;
    private challenge?: { ends: number; icon?: CDOTA_Buff };
    private challengeShown = false;
    private dieProgress = 0;
    private dieIcon?: CDOTA_Buff;
    private dieBet?: { ends: number; multiplier: number; icon?: CDOTA_Buff };
    private targetBet?: CDOTA_Buff;
    private pending?: Cast;
    private casts: Cast[] = [];
    private orbFreeCast = false;
    private suppressFloor = false;

    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    OnCreated() { if (IsServer()) this.StartIntervalThink(THINK); }
    DeclareFunctions() {
        return [
            ModifierFunction.ON_ABILITY_START, ModifierFunction.ON_ABILITY_EXECUTED, ModifierFunction.ON_ABILITY_FULLY_CAST,
            ModifierFunction.ON_MODIFIER_ADDED, ModifierFunction.ON_TAKEDAMAGE, ModifierFunction.ON_ATTACK_LANDED,
            ModifierFunction.ON_DEATH,
        ];
    }
    private bonuses() { return bonusesOf(this.GetParent().GetPlayerOwnerID(), true, time()); }
    private owns(id: string) { return (this.bonuses().code[id] ?? 0) > 0; }
    private enemy(unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
        return hero(unit) && !unit.IsInvulnerable() && unit.GetTeamNumber() !== this.GetParent().GetTeamNumber();
    }
    private swap(native: string, alt: string, show: boolean): boolean {
        const caster = this.GetParent();
        const original = caster.FindAbilityByName(native);
        const extra = caster.FindAbilityByName(alt) ?? (show ? caster.AddAbility(alt) : undefined);
        if (original === undefined || extra === undefined) return false;
        if (show) extra.SetLevel(1);
        // Штатную кнопку скрываем, но оставляем активной для её пассивки и нативных повторов.
        if (show) caster.SwapAbilities(native, alt, true, true);
        else caster.SwapAbilities(alt, native, false, true);
        original.SetHidden(show);
        extra.SetHidden(!show);
        original.MarkAbilityButtonDirty();
        extra.MarkAbilityButtonDirty();
        return show;
    }
    private enemies(point: Vector, radius: number) {
        const caster = this.GetParent();
        return FindUnitsInRadius(caster.GetTeamNumber(), point, undefined, radius, UnitTargetTeam.ENEMY,
            UnitTargetType.HERO, UnitTargetFlags.NONE, FindOrder.CLOSEST, false)
            .filter(u => this.enemy(u) && !u.IsDebuffImmune());
    }
    private magic(victim: CDOTA_BaseNPC, ability: CDOTABaseAbility, damage: number) {
        ApplyDamage({ attacker: this.GetParent(), victim, ability, damage, damage_type: DamageTypes.MAGICAL });
    }

    private clearClub() {
        clear(this.club?.icon);
        this.club = undefined;
        if (this.clubShown) this.clubShown = this.swap(FIREBLAST, CLUB, false);
    }
    private armClub(ability: CDOTABaseAbility, target: CDOTA_BaseNPC) {
        this.clearClub();
        const caster = this.GetParent();
        this.clubShown = this.swap(FIREBLAST, CLUB, true);
        if (!this.clubShown) return;
        const window = CLUB_WINDOW + (this.owns("ogre_p_dizzy") ? 0.75 : 0);
        this.club = { ability, target, ends: time() + window,
            icon: caster.AddNewModifier(caster, ability, CLUB_READY, { duration: window }) };
    }
    CanThrowClub(point: Vector) {
        return this.club !== undefined && time() < this.club.ends &&
            distance(point, this.GetParent().GetAbsOrigin()) <= CLUB_RANGE + this.GetParent().GetCastRangeBonus() + 32;
    }
    ThrowClub(point: Vector, ability: CDOTABaseAbility) {
        const window = this.club, caster = this.GetParent();
        if (window === undefined || !this.CanThrowClub(point)) return;
        const origin = caster.GetAbsOrigin();
        const direction = distance(point, origin) > 1
            ? Vector((point.x - origin.x) / distance(point, origin), (point.y - origin.y) / distance(point, origin), 0)
            : caster.GetForwardVector();
        const target = window.target;
        const stunEnded = !alive(target) || (!target.FindModifierByNameAndCaster(NATIVE_STUN, caster) && !target.IsStunned());
        this.clearClub();
        this.clearLanding();
        this.landing = {
            point, ability, origin, launched: time(), model: this.spawnModel(CLUB_MODEL, 1.6), centerDamage: (stunEnded ? 500 : 380) + (this.owns("ogre_p_bigblast") ? 65 : 0), lands: time() + CLUB_FLIGHT,
            marker: warning(point, CLUB_RADIUS), hit: new Set<EntityIndex>(),
            bounce: this.bonuses().awake ? GetGroundPosition(
                Vector(point.x + direction.x * CLUB_BOUNCE, point.y + direction.y * CLUB_BOUNCE, point.z), caster) : undefined,
        };
        this.moveClub(this.landing, time());
        const trace = atPoint(IGNITE_FX, origin);
        ParticleManager.SetParticleControl(trace, 1, point);
        ParticleManager.ReleaseParticleIndex(trace);
        EmitSoundOn("Hero_OgreMagi.Ignite.Cast", caster);
    }
    private spawnModel(path: string, scale: number) {
        return SpawnEntityFromTableSynchronous("prop_dynamic", { model: path, modelscale: scale, solid: 0, disableshadows: 1 });
    }
    private dropModel(model?: CBaseEntity) {
        if (model !== undefined && IsValidEntity(model)) UTIL_Remove(model);
    }
    private clearLanding() {
        if (this.landing === undefined) return;
        clearParticle(this.landing.marker);
        this.dropModel(this.landing.model);
        this.landing = undefined;
    }
    private moveClub(drop: ClubLanding, at: number) {
        if (drop.model===undefined) return;
        const t = Math.max(0, Math.min(1, (at - drop.launched) / CLUB_FLIGHT));
        const a=drop.origin, b=drop.point;
        drop.model.SetAbsOrigin(Vector(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t+55*(1-t)+220*4*t*(1-t)));
        drop.model.SetAngles(45 + t*500, 360*t, 0);
    }
    private landClub() {
        const drop = this.landing;
        if (drop === undefined) return;
        clearParticle(drop.marker);
        ParticleManager.ReleaseParticleIndex(atPoint(FIRE_FX, drop.point));
        EmitSoundOnLocationWithCaster(drop.point, "Hero_OgreMagi.Fireblast.Target", this.GetParent());
        for (const victim of this.enemies(drop.point, CLUB_RADIUS)) {
            if (drop.hit.has(victim.entindex())) continue;
            drop.hit.add(victim.entindex());
            this.magic(victim, drop.ability, distance(victim.GetAbsOrigin(), drop.point) <= CLUB_CENTER
                ? drop.centerDamage : drop.centerDamage * 0.5);
        }
        if (drop.bounce === undefined) {
            this.dropModel(drop.model);
            this.landing = undefined;
        } else {
            this.landing = { ...drop, origin: drop.point, point: drop.bounce, bounce: undefined,
                launched: time(), lands: time()+CLUB_FLIGHT, marker: warning(drop.bounce, CLUB_RADIUS) };
            this.moveClub(this.landing,time());
        }
    }

    private placePotato(spell: Cast, unit: CDOTA_BaseNPC) {
        if (spell.potUsed || this.potato !== undefined || time() > spell.ignitionEnds || !this.enemy(unit) ||
            unit.IsDebuffImmune() || !this.owns("ogre_l_ignite")) return;
        spell.potUsed = true;
        const potato: Potato = { owner: unit, last: unit.GetAbsOrigin(), ability: spell.ability,
            ends: time() + POTATO_FUSE, transfers: 0, awake: this.bonuses().awake, model: this.spawnModel(POT_MODEL, 0.72) };
        this.potato = potato;
        this.potatoMark(potato, unit);
    }
    private potatoMark(potato: Potato, unit: CDOTA_BaseNPC) {
        clear(potato.icon);
        potato.owner = unit;
        potato.last = unit.GetAbsOrigin();
        potato.icon = unit.AddNewModifier(this.GetParent(), potato.ability, POTATO,
            { duration: Math.max(0.01, potato.ends - time()) });
        potato.icon?.SetStackCount(1 + potato.transfers);
        this.movePotato(potato);
    }
    private movePotato(potato: Potato) {
        const p=potato.last;
        potato.model?.SetAbsOrigin(Vector(p.x,p.y,p.z+145));
    }
    private burstPotato() {
        const potato = this.potato;
        if (potato === undefined) return;
        this.potato = undefined;
        clear(potato.icon);
        this.dropModel(potato.model);
        const point = alive(potato.owner) ? potato.owner.GetAbsOrigin() : potato.last;
        const damage = 400 + (this.owns("ogre_p_napalm") ? 65 : 0) + (potato.awake ? 80 * Math.min(2, potato.transfers) : 0);
        ParticleManager.ReleaseParticleIndex(atPoint(FIRE_FX, point));
        EmitSoundOnLocationWithCaster(point, "Hero_OgreMagi.Fireblast.Target", this.GetParent());
        for (const victim of this.enemies(point, POTATO_RADIUS + (this.owns("ogre_p_wildfire") ? 65 : 0))) this.magic(victim, potato.ability, damage);
        const caster = this.GetParent();
        if (potato.owner === caster && alive(caster) && !caster.IsDebuffImmune() && !caster.IsInvulnerable())
            this.magic(caster, potato.ability, damage);
    }

    private clearChallenge() {
        clear(this.challenge?.icon);
        this.challenge=undefined;
        if (this.challengeShown) this.challengeShown=this.swap(BLOODLUST, CHALLENGE, false);
    }
    private armChallenge(ability: CDOTABaseAbility) {
        if(this.duel!==undefined) return;
        this.clearChallenge();
        const caster=this.GetParent();
        this.challengeShown=this.swap(BLOODLUST,CHALLENGE,true);
        if(this.challengeShown) this.challenge={ends:time()+CHALLENGE_WINDOW,
            icon:caster.AddNewModifier(caster,ability,DUEL_READY,{duration:CHALLENGE_WINDOW})};
    }
    CanChallenge(target?: CDOTA_BaseNPC): boolean {
        const caster=this.GetParent();
        return this.challenge!==undefined && time()<this.challenge.ends && this.duel===undefined &&
            alive(caster) && this.enemy(target) && !target.IsDebuffImmune() &&
            distance(caster.GetAbsOrigin(),target.GetAbsOrigin())<=CHALLENGE_RANGE+caster.GetCastRangeBonus()+32 &&
            caster.FindModifierByNameAndCaster(NATIVE_LUST,caster)!==undefined;
    }
    StartChallenge(target: CDOTA_BaseNPC | undefined, ability: CDOTABaseAbility) {
        if(target===undefined || !this.CanChallenge(target))return;
        this.clearChallenge();
        if(target.TriggerSpellAbsorb(ability))return;
        const caster=this.GetParent();
        const window=DUEL_WINDOW+(this.bonuses().awake?0.55:0)+(this.owns("ogre_p_hide")?0.6:0);
        const center=GetGroundPosition(target.GetAbsOrigin(),caster);
        this.duel={target,ends:time()+window,ring:atPoint(DUEL_FX,center),
            scoreOgre:caster.AddNewModifier(caster,ability,DUEL,{duration:window}),
            scoreEnemy:target.AddNewModifier(caster,ability,DUEL,{duration:window})};
        caster.SetForceAttackTarget(target);
        target.SetForceAttackTarget(caster);
        caster.MoveToTargetToAttack(target);
        target.MoveToTargetToAttack(caster);
    }
    private clearDuel() {
        const duel=this.duel;
        if(duel===undefined)return;
        this.duel=undefined;
        clear(duel.scoreOgre);
        clear(duel.scoreEnemy);
        clearParticle(duel.ring);
        const caster=this.GetParent();
        if(caster.GetForceAttackTarget()===duel.target)caster.SetForceAttackTarget(undefined);
        if(IsValidEntity(duel.target) && duel.target.GetForceAttackTarget()===caster)duel.target.SetForceAttackTarget(undefined);
    }
    private ordinary(e: ModifierAttackEvent) {
        return !e.no_attack_cooldown && e.inflictor === undefined &&
            e.attacker.GetTeamNumber() !== e.target.GetTeamNumber();
    }
    OnAttackLanded(e: ModifierAttackEvent) {
        if (!IsServer() || !hero(e.attacker) || !hero(e.target) || !this.ordinary(e)) return;
        const caster = this.GetParent(), potato = this.potato;
        if (potato !== undefined && potato.owner === e.attacker && time() < potato.ends && !e.target.IsInvulnerable()) {
            potato.transfers++;
            this.potatoMark(potato, e.target);
        }
    }

    private targetOf(e: ModifierAbilityEvent) { return e.target ?? e.ability.GetCursorTarget(); }
    private isTracked(ability: CDOTABaseAbility) {
        const name = ability.GetAbilityName();
        return name === FIREBLAST || name === IGNITE;
    }
    SetOrbFreeCast(active: boolean) { this.orbFreeCast = active; }
    OnAbilityStart(e: ModifierAbilityEvent) {
        if (!IsServer() || e.unit !== this.GetParent() || e.ability === undefined || this.orbFreeCast) return;
        this.suppressFloor = true;
        if (this.pending?.at === undefined) clear(this.targetBet);
        this.pending = undefined;
        if (!this.isTracked(e.ability)) return;
        const target = this.targetOf(e);
        if (!alive(target) || target.GetTeamNumber() === this.GetParent().GetTeamNumber()) return;
        const bet = this.dieBet;
        const multiplier = bet !== undefined && this.enemy(target) && time() < bet.ends && !this.GetParent().PassivesDisabled()
            ? bet.multiplier : undefined;
        this.suppressFloor = false;
        this.pending = { ability: e.ability, target, starts: time(), repeated: false, eligible: false,
            committed: false, ignitionEnds: time() + 3.6, igniteCandidates: new Set<CDOTA_BaseNPC>(),
            potUsed: false, nativeObserved: false, multiplier };
        if (multiplier !== undefined) {
            clear(this.targetBet);
            this.targetBet = target.AddNewModifier(this.GetParent(), e.ability, DIE_BET, { duration: 2.4 });
            this.targetBet?.SetStackCount(multiplier);
        }
    }
    private nativeCast(e: ModifierAbilityEvent) {
        const cast = this.pending;
        if (cast === undefined || e.ability !== cast.ability) return;
        if (!cast.committed) {
            cast.committed = true;
            cast.at ??= time();
            if (cast.multiplier !== undefined && (this.dieBet === undefined || cast.at >= this.dieBet.ends)) {
                cast.multiplier = undefined;
                clear(this.targetBet);
            }
            cast.eligible = this.owns("ogre_l_multicast") && cast.multiplier === undefined &&
                this.enemy(cast.target) && this.dieProgress < 2 && this.dieBet === undefined &&
                !this.GetParent().PassivesDisabled() && (this.GetParent().FindAbilityByName(MULTICAST)?.GetLevel() ?? 0) > 0;
            this.casts.push(cast);
        }
        return cast;
    }
    OnAbilityExecuted(e: ModifierAbilityEvent) {
        if (!IsServer() || e.unit !== this.GetParent() || e.ability === undefined || this.orbFreeCast) return;
        this.nativeCast(e);
    }
    OnAbilityFullyCast(e: ModifierAbilityEvent) {
        if (!IsServer() || e.unit !== this.GetParent() || e.ability === undefined || this.orbFreeCast) return;
        if(e.ability.GetAbilityName()===BLOODLUST && this.targetOf(e)===this.GetParent() && this.owns("ogre_l_bloodlust"))
            this.armChallenge(e.ability);
        const cast = this.nativeCast(e);
        if (cast === undefined) return;
        if (cast.ability.GetAbilityName() === FIREBLAST && this.owns("ogre_l_fireblast") && this.enemy(cast.target))
            this.armClub(cast.ability, cast.target);
        if (cast.multiplier !== undefined && this.dieBet !== undefined) {
            clear(this.dieBet.icon);
            this.dieBet = undefined;
            clear(this.targetBet);
            this.targetBet = this.enemy(cast.target) ? cast.target.AddNewModifier(this.GetParent(), cast.ability, DIE_BET, { duration: 1.8 }) : undefined;
            this.targetBet?.SetStackCount(cast.multiplier);
        }
    }
    private currentCast(ability: CDOTABaseAbility) {
        const pending = this.pending;
        if (pending !== undefined && pending.ability === ability && (pending.at !== undefined || time() - pending.starts < 0.8))
            return pending;
        for (let i = this.casts.length - 1; i >= 0; i--)
            if (this.casts[i].ability === ability) return this.casts[i];
        return undefined;
    }
    private observeRepeat(cast: Cast, min: number) {
        if (cast.at === undefined) return;
        const elapsed = time() - cast.at;
        if (elapsed >= min && elapsed <= ROLLED_AT) cast.repeated = true;
    }
    ObserveIgniteProjectile(ability: CDOTABaseAbility, target?: CDOTA_BaseNPC) {
        if (this.orbFreeCast || ability.GetAbilityName() !== IGNITE) return;
        const cast = this.currentCast(ability);
        if (cast === undefined) return;
        cast.at ??= time();
        cast.nativeObserved = true;
        this.observeRepeat(cast, 0.54);
        if (this.enemy(target)) cast.igniteCandidates.add(target);
    }
    OnModifierAdded(e: ModifierAddedEvent) {
        if (!IsServer() || this.orbFreeCast || e.added_buff === undefined || e.added_buff.GetCaster() !== this.GetParent()) return;
        const name = e.added_buff.GetName();
        if (name !== NATIVE_IGNITE && name !== NATIVE_STUN) return;
        const ability = e.added_buff.GetAbility();
        if (ability === undefined) return;
        const cast = this.currentCast(ability);
        if (cast === undefined) return;
        if (name === NATIVE_IGNITE) this.placePotato(cast, e.unit);
        else if (e.unit === cast.target) this.observeFireblast(cast);
    }
    OnTakeDamage(e: ModifierInstanceEvent) {
        if (!IsServer() || e.attacker !== this.GetParent()) return;
        if (this.orbFreeCast || e.inflictor?.GetAbilityName() !== FIREBLAST) return;
        const cast = this.currentCast(e.inflictor);
        if (cast !== undefined && e.unit === cast.target) this.observeFireblast(cast);
    }
    private observeFireblast(cast: Cast) {
        cast.at ??= time();
        cast.nativeObserved = true;
        this.observeRepeat(cast, 0.54);
    }

    CanLoadDie() {
        return this.dieProgress === 2 && this.dieBet === undefined && !this.GetParent().PassivesDisabled();
    }
    LoadDie() {
        if (!this.CanLoadDie()) return;
        this.dieProgress = 0;
        for (const cast of this.casts) cast.eligible = false;
        this.syncDie();
        const caster = this.GetParent();
        const multiplier = this.bonuses().awake ? 4 : 3;
        const window = BET_WINDOW + (this.owns("ogre_p_doublehit") ? 1.5 : 0);
        if (this.owns("ogre_p_jackpot")) caster.GiveMana(caster.GetMaxMana() * 0.12);
        const icon = caster.AddNewModifier(caster, caster.FindAbilityByName(MULTICAST), DIE_BET, { duration: window });
        icon?.SetStackCount(multiplier);
        this.dieBet = { ends: time() + window, multiplier, icon };
    }
    GetMulticastChanceFloor(key: string): number | undefined {
        const cast = this.pending;
        if (cast?.multiplier === undefined || this.orbFreeCast || this.suppressFloor ||
            this.GetParent().PassivesDisabled() || !alive(this.GetParent())) return undefined;
        const at = time();
        if (cast.at === undefined && (at >= cast.starts + 0.8 || this.dieBet === undefined || at >= this.dieBet.ends ||
            (at >= cast.starts + 0.08 && !cast.ability.IsInAbilityPhase()))) return undefined;
        if (cast.at !== undefined && at > cast.at + 0.06) return undefined;
        if (key === "multicast_2_times" || key === "multicast_3_times" || (key === "multicast_4_times" && cast.multiplier === 4))
            return 100;
        return undefined;
    }
    private syncDie() {
        const caster = this.GetParent(), native = caster.FindAbilityByName(MULTICAST);
        const show = this.dieProgress >= 2 && native !== undefined && native.GetLevel() > 0 &&
            !caster.PassivesDisabled() && alive(caster);
        if (show !== this.dieShown) this.dieShown = this.swap(MULTICAST, LOADED_DIE, show);
        if (this.dieProgress <= 0) {
            clear(this.dieIcon);
            this.dieIcon = undefined;
        } else {
            this.dieIcon ??= caster.AddNewModifier(caster, native, DIE_READY, {});
            this.dieIcon?.SetStackCount(this.dieProgress);
        }
    }
    private settleRolls(at: number) {
        const caster = this.GetParent();
        for (let i = 0; i < this.casts.length; i++) {
            const cast = this.casts[i], started = cast.at ?? at;
            if (cast.eligible && at - started >= ROLLED_AT) {
                cast.eligible = false;
                if (this.dieProgress < 2 && cast.repeated) this.dieProgress = 0;
                else if (this.dieProgress < 2 && cast.nativeObserved && (cast.ability.GetAbilityName() !== FIREBLAST ||
                    this.enemy(cast.target) && !cast.target.IsDebuffImmune())) this.dieProgress = Math.min(2, this.dieProgress + 1);
                this.syncDie();
            }
            if (at >= cast.ignitionEnds) { this.casts.splice(i--, 1); continue; }
            if (!cast.potUsed && this.potato === undefined && cast.ability.GetAbilityName() === IGNITE) {
                // Рефреш Ignite может не вызвать OnModifierAdded. Следим только за жертвами наблюдавшегося снаряда.
                for (const target of cast.igniteCandidates) {
                    if (!this.enemy(target)) continue;
                    const burn = target.FindModifierByNameAndCaster(NATIVE_IGNITE, caster);
                    if (burn !== undefined && burn.GetElapsedTime() < THINK * 2) this.placePotato(cast, target);
                    if (cast.potUsed) break;
                }
            }
        }
    }

    OnIntervalThink() {
        if (!IsServer()) return;
        const at = time(), caster = this.GetParent(), cast = this.pending;
        if (this.club !== undefined && at >= this.club.ends) this.clearClub();
        if (this.landing !== undefined) {
            if (at >= this.landing.lands) this.landClub();
            else this.moveClub(this.landing,at);
        }
        if (this.potato !== undefined) {
            if (alive(this.potato.owner)) this.potato.last = this.potato.owner.GetAbsOrigin();
            if (at >= this.potato.ends) this.burstPotato();
            else this.movePotato(this.potato);
        }
        if (this.challenge!==undefined && at>=this.challenge.ends) this.clearChallenge();
        const duel=this.duel;
        if(duel!==undefined && (at>=duel.ends || !this.enemy(duel.target) || duel.target.IsDebuffImmune() ||
            distance(caster.GetAbsOrigin(),duel.target.GetAbsOrigin())>600)) this.clearDuel();
        if (this.dieBet !== undefined && at >= this.dieBet.ends) {
            clear(this.dieBet.icon);
            this.dieBet = undefined;
        }
        if (cast !== undefined && (cast.at !== undefined ? at > cast.at + 0.1 :
            at > cast.starts + 0.8 || (at > cast.starts + 0.08 && !cast.ability.IsInAbilityPhase()))) {
            if (cast.at === undefined) clear(this.targetBet);
            this.pending = undefined;
        }
        this.settleRolls(at);
        if (this.dieProgress >= 2 && this.dieShown === caster.PassivesDisabled()) this.syncDie();
    }
    OnDeath(e: ModifierInstanceEvent) {
        if (!IsServer()) return;
        const caster = this.GetParent(), potato = this.potato;
        if (potato !== undefined && e.unit === potato.owner) {
            potato.last = e.unit.GetAbsOrigin();
            clear(potato.icon);
            potato.owner = undefined;
        }
        if (e.unit === this.duel?.target) {
            if(e.attacker===caster && alive(caster)) {
                const reward=(this.bonuses().awake?18:12)+(this.owns("ogre_p_thirst")?8:0);
                caster.Heal(caster.GetMaxHealth()*reward/100,caster.FindAbilityByName(BLOODLUST));
                attached(LUST_FX,caster);
            }
            this.clearDuel();
        }
        if (e.unit !== caster) return;
        this.clearClub();
        this.clearLanding();
        this.clearChallenge();
        this.clearDuel();
        clear(this.dieBet?.icon);
        clear(this.targetBet);
        this.dieBet = undefined;
        this.pending = undefined;
        this.casts = [];
        this.dieProgress = 0;
        this.syncDie();
    }
}

modifier_orb_ogre_magi_legend = registerModifier("modifier_orb_ogre_magi_legend", OgreMagiLegends);
modifier_orb_ogre_club_ready = registerModifier("modifier_orb_ogre_club_ready", ClubReady);
modifier_orb_ogre_potato = registerModifier("modifier_orb_ogre_potato", HotPotato);
modifier_orb_ogre_duel = registerModifier("modifier_orb_ogre_duel", DuelScore);
modifier_orb_ogre_duel_ready = registerModifier("modifier_orb_ogre_duel_ready", DuelReady);
modifier_orb_ogre_die_ready = registerModifier("modifier_orb_ogre_die_ready", DieReady);
modifier_orb_ogre_die_bet = registerModifier("modifier_orb_ogre_die_bet", DieBet);
