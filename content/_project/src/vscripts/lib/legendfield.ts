
import { bonusesOf } from "../core/orbstore";
import { MAP } from "../core/mapinfo";
import { ModBase } from "./modbase";

export const now = () => GameRules.GetGameTime();

export function distance(a: Vector, b: Vector) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function direction(from: Vector, to: Vector, fallback: Vector) {
    const length = distance(from, to);
    return length < 1 ? fallback : Vector((to.x - from.x) / length, (to.y - from.y) / length, 0);
}

export function offset(from: Vector, along: Vector, length: number) {
    return Vector(from.x + along.x * length, from.y + along.y * length, from.z);
}

export function valid(unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
    return unit !== undefined && IsValidEntity(unit) && unit.IsAlive() && !unit.IsOutOfGame();
}

export function opponent(hero: CDOTA_BaseNPC, unit?: CDOTA_BaseNPC): unit is CDOTA_BaseNPC {
    return valid(unit) && unit.IsRealHero() && !unit.IsIllusion() && !unit.IsInvulnerable()
        && unit.GetTeamNumber() !== hero.GetTeamNumber();
}

export function vulnerable(unit: CDOTA_BaseNPC) {
    return !unit.IsDebuffImmune() && !unit.IsMagicImmune();
}

export function legal(point: Vector) {
    return Math.abs(point.x) < MAP.bounds - 32 && Math.abs(point.y) < MAP.bounds - 32
        && GridNav.IsTraversable(point) && !GridNav.IsBlocked(point);
}

export function effect(name: string, point: Vector) {
    const id = ParticleManager.CreateParticle(name, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id, 0, point);
    return id;
}

export function flash(name: string, point: Vector, destination?: Vector) {
    const id = effect(name, point);
    if (destination) ParticleManager.SetParticleControl(id, 1, destination);
    ParticleManager.ReleaseParticleIndex(id);
}

export function ring(point: Vector, radius: number, tint: Vector) {
    const id = effect("particles/ui_mouseactions/range_display.vpcf", GetGroundPosition(point, undefined));
    resizeRing(id, radius);
    ParticleManager.SetParticleControl(id, 2, tint);
    return id;
}

export function resizeRing(id: ParticleID, radius: number) {
    ParticleManager.SetParticleControl(id, 1, Vector(radius, 0, 0));
}

export function stop(id: ParticleID) {
    ParticleManager.DestroyParticle(id, true);
    ParticleManager.ReleaseParticleIndex(id);
}

export function prop(model: string, point: Vector, scale: number, aim: Vector) {
    const entity = SpawnEntityFromTableSynchronous("prop_dynamic", {
        model, solid: 0, modelscale: scale, DefaultAnim: "idle",
    });
    if (entity && IsValidEntity(entity)) {
        entity.SetAbsOrigin(point);
        entity.SetForwardVector(aim);
        return entity;
    }
    return undefined;
}

export function removeProp(entity?: CBaseEntity) {
    if (entity && IsValidEntity(entity)) UTIL_Remove(entity);
}

type Cue = { time: number; marks: ParticleID[]; fire: () => void };
type Recast = { native: CDOTABaseAbility; alt: CDOTABaseAbility; time: number; close?: () => void };

export class LegendField extends ModBase {
    private cues: Cue[] = [];
    private recasts = new Map<string, Recast>();

    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    OnCreated() { if (IsServer()) this.StartIntervalThink(0.05); }

    protected owns(id: string) {
        return (bonusesOf(this.GetParent().GetPlayerOwnerID(), true, now()).code[id] ?? 0) > 0;
    }
    protected awake() { return bonusesOf(this.GetParent().GetPlayerOwnerID(), true, now()).awake; }
    protected hero() { return this.GetParent(); }

    protected after(delay: number, marks: ParticleID[], fire: () => void) {
        this.cues.push({ time: now() + delay, marks, fire });
    }

    protected area(point: Vector, radius: number) {
        const hero = this.hero();
        return FindUnitsInRadius(hero.GetTeamNumber(), point, undefined, radius, UnitTargetTeam.ENEMY,
            UnitTargetType.HERO, UnitTargetFlags.NONE, FindOrder.ANY, false).filter(unit => opponent(hero, unit) && vulnerable(unit));
    }

    protected line(from: Vector, to: Vector, width: number) {
        const hero = this.hero();
        return FindUnitsInLine(hero.GetTeamNumber(), from, to, undefined, width, UnitTargetTeam.ENEMY,
            UnitTargetType.HERO, UnitTargetFlags.NONE).filter(unit => opponent(hero, unit) && vulnerable(unit));
    }

    protected lane(from: Vector, to: Vector, width: number, color: Vector) {
        const marks: ParticleID[] = [];
        const length = distance(from, to);
        const aim = direction(from, to, this.hero().GetForwardVector());
        const pieces = Math.max(1, Math.ceil(length / (width * 1.5)));
        for (let index = 0; index <= pieces; index++) {
            marks.push(ring(offset(from, aim, length * index / pieces), width, color));
        }
        return marks;
    }

    protected hit(ability: CDOTABaseAbility, target: CDOTA_BaseNPC, damage: number, type = DamageTypes.MAGICAL) {
        if (!opponent(this.hero(), target) || !vulnerable(target)) return;
        ApplyDamage({ attacker: this.hero(), victim: target, ability, damage, damage_type: type,
            damage_flags: DamageFlag.REFLECTION | DamageFlag.NO_SPELL_AMPLIFICATION | DamageFlag.NO_SPELL_LIFESTEAL });
    }

    protected isNativeDamage(event: ModifierInstanceEvent) {
        return event.attacker === this.hero() && event.damage > 0 && opponent(this.hero(), event.unit)
            && ((event.damage_flags ?? 0) & DamageFlag.REFLECTION) === 0;
    }

    protected open(native: CDOTABaseAbility, name: string, duration: number, close?: () => void) {
        const hero = this.hero();
        const alt = hero.FindAbilityByName(name) ?? hero.AddAbility(name);
        if (!alt) return false;
        this.consume(name);
        if (alt.GetLevel() === 0) alt.SetLevel(1);
        alt.EndCooldown();
        hero.SwapAbilities(native.GetAbilityName(), name, false, true);
        native.SetHidden(true);
        alt.SetHidden(false);
        native.MarkAbilityButtonDirty();
        alt.MarkAbilityButtonDirty();
        this.recasts.set(name, { native, alt, time: now() + duration, close });
        return true;
    }

    protected consume(name: string) {
        const recast = this.recasts.get(name);
        if (!recast) return;
        this.recasts.delete(name);
        const { native, alt } = recast;
        this.hero().SwapAbilities(name, native.GetAbilityName(), false, true);
        native.SetHidden(false);
        alt.SetHidden(true);
        native.MarkAbilityButtonDirty();
        alt.MarkAbilityButtonDirty();
        recast.close?.();
        return recast;
    }

    OnIntervalThink() {
        if (!valid(this.hero())) { this.clear(); return; }
        const time = now();
        for (const [name, recast] of this.recasts) {
            if (recast.time <= time) this.consume(name);
        }
        const ready = this.cues.filter(cue => cue.time <= time);
        this.cues = this.cues.filter(cue => cue.time > time);
        for (const cue of ready) {
            for (const mark of cue.marks) stop(mark);
            if (valid(this.hero())) cue.fire();
        }
    }

    protected clear() {
        for (const cue of this.cues) for (const mark of cue.marks) stop(mark);
        this.cues = [];
        for (const [name] of this.recasts) this.consume(name);
    }

    OnDestroy() { if (IsServer()) this.clear(); }
}
