
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { direction, distance, flash, LegendField, now, offset, opponent, prop, removeProp, ring, stop, vulnerable } from "../lib/legendfield";

declare global {
    var modifier_orb_lich_legend: unknown;
    var modifier_orb_lich_satellite: unknown;
}

const Q = "lich_frost_nova", W = "lich_frost_shield", E = "lich_sinister_gaze", R = "lich_chain_frost";
const NOVA = "particles/units/heroes/hero_lich/lich_frost_nova.vpcf";
const ICE = "particles/units/heroes/hero_lich/lich_chain_frost_explode.vpcf";
const BEAM = "particles/units/heroes/hero_lich/lich_chain_frost_explode_beam.vpcf";
const FRACTURE = "models/orbthrow/legend_props/ice_fracture.vmdl";
const SATELLITE = "models/orbthrow/legend_props/ice_satellite.vmdl";
const MIRROR = "models/orbthrow/legend_props/ice_mirror.vmdl";
const SHIELD = "modifier_lich_frost_shield";
const PALE = () => Vector(145, 220, 255);
const TRACK_TIME = 1.65;
const DIVE_TIME = 0.85;

type IceOrb = { model?: CBaseEntity; point: Vector };
type Dive = { point: Vector; starts: number; ring: ParticleID; sources: Vector[] };
type Orbit = { carrier: CDOTA_BaseNPC; ability: CDOTABaseAbility; since: number; icon: CDOTA_Buff;
    orbs: IceOrb[]; hit: Set<EntityIndex>; dive?: Dive; radius: number; blast: number };

export class LichLegends extends LegendField {
    private nova?: { target?: CDOTA_BaseNPC; until: number };
    private shell?: { ability: CDOTABaseAbility; until: number; hits: number };
    private gaze?: { start: number; target?: CDOTA_BaseNPC; aim: Vector };
    private chainUntil = 0;
    private orbit?: Orbit;

    DeclareFunctions() {
        return [ModifierFunction.ON_ABILITY_START, ModifierFunction.ON_ABILITY_EXECUTED, ModifierFunction.ON_ABILITY_FULLY_CAST,
            ModifierFunction.ON_ABILITY_END_CHANNEL, ModifierFunction.ON_TAKEDAMAGE,
            ModifierFunction.ON_ATTACK_LANDED, ModifierFunction.ON_DEATH];
    }

    OnAbilityStart(event: ModifierAbilityEvent) {
        if (!IsServer() || event.unit !== this.hero()) return;
        const ability = event.ability;
        if (ability.GetAbilityName() === Q && this.owns("lich_l_nova")) {
            this.nova = { target: event.target ?? ability.GetCursorTarget(), until: now() + ability.GetCastPoint() + 0.4 };
        }
    }

    OnAbilityExecuted(event: ModifierAbilityEvent) {
        if (!IsServer() || event.unit !== this.hero()) return;
        const ability = event.ability;
        const name = ability.GetAbilityName();
        if (name === R && this.owns("lich_l_chain")) this.chainUntil = now() + 6;
        if (name !== E || !this.owns("lich_l_trance")) return;
        const target = event.target ?? ability.GetCursorTarget();
        const aim = opponent(this.hero(), target) ? target.GetAbsOrigin() : ability.GetCursorPosition();
        this.gaze = { start: now(), target, aim };
    }

    OnAbilityFullyCast(event: ModifierAbilityEvent) {
        if (!IsServer() || event.unit !== this.hero()) return;
        const ability = event.ability;
        switch (ability.GetAbilityName()) {
            case W:
                if (this.owns("lich_l_shield") && (event.target ?? ability.GetCursorTarget()) === this.hero()) {
                    this.shell = { ability, until: now() + ability.GetSpecialValueFor("duration"), hits: 0 };
                }
                break;
            case E:
                if (!this.gaze && ability.IsChanneling()) this.OnAbilityExecuted(event);
                break;
        }
    }

    OnTakeDamage(event: ModifierInstanceEvent) {
        if (!IsServer() || !this.isNativeDamage(event) || !event.inflictor) return;
        const ability = event.inflictor;
        const name = ability.GetAbilityName();
        if (name === Q && this.nova && this.nova.until >= now()
            && (!opponent(this.hero(), this.nova.target) || this.nova.target === event.unit)) {
            this.nova = undefined;
            this.fracture(ability, event.unit.GetAbsOrigin());
        }
        if (name === R && this.chainUntil > now() && vulnerable(event.unit)) {
            this.chainUntil = 0;
            this.startOrbit(ability, event.unit);
        }
    }

    private fracture(ability: CDOTABaseAbility, target: Vector) {
        const hero = this.hero();
        const point = GetGroundPosition(target, hero);
        const aim = direction(hero.GetAbsOrigin(), point, hero.GetForwardVector());
        const scale = this.awake() ? 1.2 : 1;
        const from = offset(point, aim, -210 * scale), to = offset(point, aim, 210 * scale);
        const damage = 320 + (this.owns("lich_p_blast") ? 65 : 0);
        const delay = this.owns("lich_p_cold") ? 0.55 : 0.75;
        const model = prop(FRACTURE, Vector(point.x, point.y, point.z + 2), scale, aim);
        this.after(delay, [], () => {
            for (const node of [from, point, to]) flash(NOVA, node);
            for (const target of this.line(from, to, 105 * scale)) {
                this.hit(ability, target, damage + Math.min(220, target.GetMaxHealth() * 0.08));
            }
        }, () => removeProp(model));
    }

    private startOrbit(ability: CDOTABaseAbility, carrier: CDOTA_BaseNPC) {
        if (this.orbit) this.clearOrbit(this.orbit);
        const hero = this.hero(), since = now();
        const icon = carrier.AddNewModifier(hero, ability, "modifier_orb_lich_satellite", { duration: TRACK_TIME + DIVE_TIME + 0.6 });
        if (!icon) return;
        const origin = carrier.GetAbsOrigin();
        const awake = this.awake();
        const orbs = [1, ...(awake ? [-1] : [])].map(side => {
            const point = Vector(origin.x + side * 265, origin.y, origin.z + 115);
            return { model: prop(SATELLITE, point, 1.35, hero.GetForwardVector()), point };
        });
        this.orbit = { carrier, ability, since, icon, orbs, hit: new Set(),
            radius: this.owns("lich_p_frostbound") ? 300 : 255,
            blast: (awake ? 650 : 535) + (this.owns("lich_p_soul") ? 75 : 0) };
    }

    OnIntervalThink() {
        super.OnIntervalThink();
        if (!IsServer()) return;
        const orbit = this.orbit;
        if (!orbit) return;
        if (!opponent(this.hero(), orbit.carrier) || orbit.icon.IsNull()) {
            this.clearOrbit(orbit);
            return;
        }
        const time = now();
        const origin = orbit.carrier.GetAbsOrigin();
        if (!orbit.dive && time - orbit.since >= TRACK_TIME) {
            const point = GetGroundPosition(origin, undefined);
            orbit.dive = { point, starts: time, ring: ring(point, orbit.radius, PALE()), sources: orbit.orbs.map(orb => orb.point) };
        }
        const dive = orbit.dive;
        if (dive) {
            const progress = Math.min(1, (time - dive.starts) / DIVE_TIME);
            orbit.orbs.forEach((orb, index) => {
                const from = dive.sources[index], to = dive.point;
                this.placeOrb(orb, Vector(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress,
                    from.z + (to.z + 35 - from.z) * progress + 100 * Math.sin(progress * Math.PI)), time + index);
            });
            if (progress >= 1) {
                this.clearOrbit(orbit);
                flash(ICE, dive.point);
                flash(NOVA, dive.point);
                for (const target of this.area(dive.point, orbit.radius)) this.hit(orbit.ability, target, orbit.blast);
            }
            return;
        }
        orbit.orbs.forEach((orb, index) => {
            const angle = (time - orbit.since) * 3.5 + Math.PI * index;
            const point = Vector(origin.x + 265 * Math.cos(angle), origin.y + 265 * Math.sin(angle), origin.z + 115);
            this.placeOrb(orb, point, time + index);
            if (time - orbit.since < 0.28) return;
            for (const target of this.area(point, 112)) {
                const id = target.entindex();
                if (orbit.hit.has(id)) continue;
                orbit.hit.add(id);
                flash(ICE, target.GetAbsOrigin());
                this.hit(orbit.ability, target, 220);
            }
        });
    }

    private placeOrb(orb: IceOrb, point: Vector, time: number) {
        orb.point = point;
        if (!orb.model || !IsValidEntity(orb.model)) return;
        orb.model.SetAbsOrigin(point);
        orb.model.SetAbsAngles(15 * Math.sin(time * 4), (time * 260) % 360, 20);
    }

    private clearOrbit(orbit: Orbit) {
        this.orbit = undefined;
        if (orbit.dive) stop(orbit.dive.ring);
        for (const orb of orbit.orbs) removeProp(orb.model);
        if (!orbit.icon.IsNull()) orbit.icon.Destroy();
    }

    OnAttackLanded(event: ModifierAttackEvent) {
        const shell = this.shell, hero = this.hero();
        if (!IsServer() || !shell || now() > shell.until || !hero.HasModifier(SHIELD) || event.no_attack_cooldown) return;
        const foe = event.target === hero ? event.attacker : event.attacker === hero ? event.target : undefined;
        if (!opponent(hero, foe) || ++shell.hits < 2) return;
        this.shell = undefined;
        const from = hero.GetAbsOrigin();
        const aim = direction(from, foe.GetAbsOrigin(), hero.GetForwardVector());
        const length = 710 + (this.owns("lich_p_icy") ? 140 : 0);
        const damage = (this.awake() ? 440 : 350) + (this.owns("lich_p_thorns") ? 45 : 0);
        const lanes = [-0.36, 0, 0.36].map(angle => offset(from,
            Vector(aim.x * Math.cos(angle) - aim.y * Math.sin(angle), aim.y * Math.cos(angle) + aim.x * Math.sin(angle), 0), length));
        const cleanup = lanes.map(end => this.tiles(FRACTURE, offset(from, direction(from, end, aim), 190), end, 0.55, 430));
        this.after(0.6, [], () => {
            const hit = new Set<EntityIndex>();
            for (const end of lanes) {
                this.transient(BEAM, from, 0.45, end);
                for (const target of this.line(from, end, 88)) {
                    if (hit.has(target.entindex())) continue;
                    hit.add(target.entindex());
                    this.hit(shell.ability, target, damage);
                }
            }
        }, () => { for (const clear of cleanup) clear(); });
    }

    OnAbilityEndChannel(event: ModifierAbilityEvent & { interrupted?: boolean | number }) {
        if (!IsServer() || event.unit !== this.hero() || event.ability.GetAbilityName() !== E) return;
        const gaze = this.gaze;
        this.gaze = undefined;
        if (!gaze || event.interrupted === true || event.interrupted === 1 || now() - gaze.start < 0.72) return;
        const ability = event.ability;
        const from = this.hero().GetAbsOrigin();
        const point = opponent(this.hero(), gaze.target) ? gaze.target.GetAbsOrigin() : gaze.aim;
        const aim = direction(from, point, this.hero().GetForwardVector());
        const to = offset(from, aim, Math.min(950, Math.max(430, distance(from, point) + 250)));
        const width = this.owns("lich_p_focus") ? 150 : 110;
        const damage = (this.awake() ? 485 : 390) + (this.owns("lich_p_drain") ? 65 : 0);
        const mirror = prop(MIRROR, offset(GetGroundPosition(from, undefined), aim, 48), 1.15, aim);
        const cleanup = this.tiles(FRACTURE, from, to, 0.6, 440);
        this.after(0.65, [], () => {
            this.transient(BEAM, from, 0.55, to);
            for (const target of this.line(from, to, width)) this.hit(ability, target, damage);
        }, () => { removeProp(mirror); cleanup(); });
    }

    protected clear() {
        super.clear();
        if (this.orbit) this.clearOrbit(this.orbit);
        this.nova = this.shell = this.gaze = undefined;
        this.chainUntil = 0;
    }

    OnDeath(event: ModifierInstanceEvent) { if (IsServer() && event.unit === this.hero()) this.clear(); }
}

class Satellite extends ModBase {
    IsDebuff() { return true; }
    IsPurgable() { return false; }
    IsPurgeException() { return true; }
    IgnoreTenacity() { return true; }
    GetTexture() { return "lich_chain_frost"; }
}

modifier_orb_lich_legend = registerModifier("modifier_orb_lich_legend", LichLegends);
modifier_orb_lich_satellite = registerModifier("modifier_orb_lich_satellite", Satellite);
