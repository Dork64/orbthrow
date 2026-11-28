import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf } from "../core/orbstore";

declare global {
    var modifier_orb_ogre_magi_legend: unknown;
    var modifier_orb_ogre_club_ready: unknown;
    var modifier_orb_ogre_potato: unknown;
    var modifier_orb_ogre_duel: unknown;
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
const DUEL = "modifier_orb_ogre_duel";
const DIE_READY = "modifier_orb_ogre_die_ready";
const DIE_BET = "modifier_orb_ogre_die_bet";
const NATIVE_STUN = "modifier_ogre_magi_fireblast";
const NATIVE_IGNITE = "modifier_ogre_magi_ignite";
const NATIVE_LUST = "modifier_ogre_magi_bloodlust";

const FIRE_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_fireblast.vpcf";
const IGNITE_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_ignite.vpcf";
const LUST_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_bloodlust_buff.vpcf";
const RING_FX = "particles/ui_mouseactions/drag_selected_ring.vpcf";
const THINK = 0.04;
const CLUB_WINDOW = 3;
const CLUB_RANGE = 825;
const CLUB_RADIUS = 290;
const CLUB_CENTER = 150;
const CLUB_FLIGHT = 0.42;
const CLUB_BOUNCE = 400;
const POTATO_FUSE = 3;
const POTATO_RADIUS = 325;
const DUEL_WINDOW = 4;
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
    ParticleManager.SetParticleControl(p, 2, Vector(255, 100, 30));
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
class DuelScore extends ClubReady {
    GetTexture() { return BLOODLUST; }
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
    icon?: CDOTA_Buff;
}
interface Duel {
    target: CDOTA_BaseNPC;
    ends: number;
    ours: number;
    theirs: number;
    scoreOgre?: CDOTA_Buff;
    scoreEnemy?: CDOTA_Buff;
    record?: number;
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
    private bloodlustEnds?: number;
    private lastDuelTarget?: CDOTA_BaseNPC;
    private duelsUsed = 0;
    private canDuelAgain = false;
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
            ModifierFunction.PREATTACK_CRITICALSTRIKE, ModifierFunction.ON_ATTACK_RECORD_DESTROY, ModifierFunction.ON_DEATH,
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
        if (this.landing !== undefined) clearParticle(this.landing.marker);
        this.landing = {
            point, ability, centerDamage: (stunEnded ? 500 : 380) + (this.owns("ogre_p_bigblast") ? 65 : 0), lands: time() + CLUB_FLIGHT,
            marker: warning(point, CLUB_RADIUS), hit: new Set<EntityIndex>(),
            bounce: this.bonuses().awake ? GetGroundPosition(
                Vector(point.x + direction.x * CLUB_BOUNCE, point.y + direction.y * CLUB_BOUNCE, point.z), caster) : undefined,
        };
        const trace = atPoint(IGNITE_FX, origin);
        ParticleManager.SetParticleControl(trace, 1, point);
        ParticleManager.ReleaseParticleIndex(trace);
        EmitSoundOn("Hero_OgreMagi.Ignite.Cast", caster);
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
        this.landing = drop.bounce === undefined ? undefined : {
            ...drop, point: drop.bounce, bounce: undefined, lands: time() + CLUB_FLIGHT,
            marker: warning(drop.bounce, CLUB_RADIUS),
        };
    }

    private placePotato(spell: Cast, unit: CDOTA_BaseNPC) {
        if (spell.potUsed || this.potato !== undefined || time() > spell.ignitionEnds || !this.enemy(unit) ||
            unit.IsDebuffImmune() || !this.owns("ogre_l_ignite")) return;
        spell.potUsed = true;
        const potato = { owner: unit, last: unit.GetAbsOrigin(), ability: spell.ability,
            ends: time() + POTATO_FUSE, transfers: 0, awake: this.bonuses().awake };
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
    }
    private burstPotato() {
        const potato = this.potato;
        if (potato === undefined) return;
        this.potato = undefined;
        clear(potato.icon);
        const point = alive(potato.owner) ? potato.owner.GetAbsOrigin() : potato.last;
        const damage = 400 + (this.owns("ogre_p_napalm") ? 65 : 0) + (potato.awake ? 80 * Math.min(2, potato.transfers) : 0);
        ParticleManager.ReleaseParticleIndex(atPoint(FIRE_FX, point));
        EmitSoundOnLocationWithCaster(point, "Hero_OgreMagi.Fireblast.Target", this.GetParent());
        for (const victim of this.enemies(point, POTATO_RADIUS + (this.owns("ogre_p_wildfire") ? 65 : 0))) this.magic(victim, potato.ability, damage);
        const caster = this.GetParent();
        if (potato.owner === caster && alive(caster) && !caster.IsDebuffImmune() && !caster.IsInvulnerable())
            this.magic(caster, potato.ability, damage);
    }

    private clearDuel() {
        clear(this.duel?.scoreOgre);
        clear(this.duel?.scoreEnemy);
        this.duel = undefined;
    }
    private syncBloodlust() {
        const caster = this.GetParent();
        const lust = caster.FindModifierByNameAndCaster(NATIVE_LUST, caster);
        if (lust === undefined) {
            this.clearDuel();
            this.bloodlustEnds = undefined;
            return;
        }
        const ends = lust.GetDieTime();
        if (this.bloodlustEnds !== undefined && Math.abs(this.bloodlustEnds - ends) < 0.1) return;
        this.clearDuel();
        this.bloodlustEnds = ends;
        this.duelsUsed = 0;
        this.canDuelAgain = true;
        this.lastDuelTarget = undefined;
    }
    private startDuel(target: CDOTA_BaseNPC) {
        const caster = this.GetParent(), ability = caster.FindAbilityByName(BLOODLUST);
        const window = DUEL_WINDOW + (this.owns("ogre_p_hide") ? 0.8 : 0);
        const s: Duel = { target, ends: time() + window, ours: 1, theirs: 0,
            scoreOgre: caster.AddNewModifier(caster, ability, DUEL, { duration: window }),
            scoreEnemy: target.AddNewModifier(caster, ability, DUEL, { duration: window }) };
        this.duel = s;
        this.duelsUsed++;
        this.canDuelAgain = false;
        this.lastDuelTarget = target;
        this.duelScore(s);
    }
    private duelScore(s: Duel) {
        const score = s.ours * 10 + s.theirs;
        s.scoreOgre?.SetStackCount(score);
        s.scoreEnemy?.SetStackCount(score);
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
        if (!this.owns("ogre_l_bloodlust")) return;
        this.syncBloodlust();
        const duel = this.duel;
        if (duel !== undefined && time() >= duel.ends) { this.clearDuel(); return; }
        if (duel !== undefined && e.attacker === duel.target && e.target === caster) {
            if (++duel.theirs >= 2) this.clearDuel();
            else this.duelScore(duel);
        } else if (e.attacker === caster && this.enemy(e.target) && this.bloodlustEnds !== undefined) {
            if (duel === undefined) {
                if (this.canDuelAgain && this.duelsUsed < (this.bonuses().awake ? 2 : 1) && e.target !== this.lastDuelTarget)
                    this.startDuel(e.target);
            } else if (e.target === duel.target && duel.ours < 2) {
                duel.ours++;
                this.duelScore(duel);
            }
        }
    }
    GetModifierPreAttack_CriticalStrike(e: ModifierAttackEvent): number {
        const duel = this.duel;
        if (!IsServer() || duel === undefined || duel.ours !== 2 || e.attacker !== this.GetParent() ||
            e.target !== duel.target || !this.ordinary(e) || !this.enemy(e.target) ||
            time() >= duel.ends || !e.attacker.FindModifierByNameAndCaster(NATIVE_LUST, e.attacker)) return 0;
        if (duel.record !== undefined && e.record !== duel.record) return 0;
        duel.record = e.record;
        return 250;
    }
    OnAttackRecordDestroy(e: ModifierAttackEvent) {
        if (IsServer() && e.attacker === this.GetParent() && this.duel?.record === e.record && this.duel !== undefined)
            this.duel.record = undefined;
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
        const duel = this.duel;
        if (duel !== undefined && duel.record !== undefined && e.record === duel.record &&
            e.unit === duel.target && e.inflictor === undefined && e.damage > 0) {
            this.clearDuel();
            this.canDuelAgain = this.bonuses().awake;
            e.attacker.Heal(e.damage * (this.owns("ogre_p_thirst") ? 0.6 : 0.5), e.attacker.FindAbilityByName(BLOODLUST));
            attached(LUST_FX, e.attacker);
            return;
        }
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
        if (this.landing !== undefined && at >= this.landing.lands) this.landClub();
        if (this.potato !== undefined) {
            if (alive(this.potato.owner)) this.potato.last = this.potato.owner.GetAbsOrigin();
            if (at >= this.potato.ends) this.burstPotato();
        }
        if (this.duel !== undefined) {
            this.syncBloodlust();
            if (this.duel !== undefined && (at >= this.duel.ends || !this.enemy(this.duel.target))) this.clearDuel();
        }
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
        if (e.unit === this.duel?.target) this.clearDuel();
        if (e.unit !== caster) return;
        this.clearClub();
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
modifier_orb_ogre_die_ready = registerModifier("modifier_orb_ogre_die_ready", DieReady);
modifier_orb_ogre_die_bet = registerModifier("modifier_orb_ogre_die_bet", DieBet);
