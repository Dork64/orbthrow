
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { direction, distance, effect, flash, LegendField, now, offset, opponent, ring, stop } from "../lib/legendfield";

declare global {
    var modifier_orb_lich_legend: unknown;
    var modifier_orb_lich_satellite: unknown;
}

const Q = "lich_frost_nova", W = "lich_frost_shield", E = "lich_sinister_gaze", R = "lich_chain_frost";
const NOVA = "particles/units/heroes/hero_lich/lich_frost_nova.vpcf";
const ICE = "particles/units/heroes/hero_lich/lich_chain_frost_explode.vpcf";
const SATELLITE = "particles/units/heroes/hero_lich/lich_chain_frost_frostbound_marker_glow.vpcf";
const BEAM = "particles/units/heroes/hero_lich/lich_chain_frost_explode_beam.vpcf";
const SHIELD = "modifier_lich_frost_shield";
const blue = () => Vector(110, 205, 255);

type Orbit = { carrier: CDOTA_BaseNPC; ability: CDOTABaseAbility; since: number; ends: number; radius: number;
    damage: number; icon: CDOTA_Buff; orbs: ParticleID[]; hit: Set<EntityIndex> };

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
        const until = now() + ability.GetCastPoint() + 0.55;
        if (ability.GetAbilityName() === Q && this.owns("lich_l_nova")) {
            this.nova = { target: ability.GetCursorTarget(), until };
        }
    }

    OnAbilityExecuted(event: ModifierAbilityEvent) {
        if (!IsServer() || event.unit !== this.hero() || event.ability.GetAbilityName() !== E || !this.owns("lich_l_trance")) return;
        const ability = event.ability, target = ability.GetCursorTarget();
        this.gaze = { start: now(), target, aim: target?.GetAbsOrigin() ?? ability.GetCursorPosition() };
    }

    OnAbilityFullyCast(event: ModifierAbilityEvent) {
        if (!IsServer() || event.unit !== this.hero()) return;
        const ability = event.ability;
        switch (ability.GetAbilityName()) {
            case W:
                if (this.owns("lich_l_shield") && ability.GetCursorTarget() === this.hero()) {
                    this.shell = { ability, until: now() + ability.GetSpecialValueFor("duration"), hits: 0 };
                }
                break;
            case E:
                if (!this.gaze && ability.IsChanneling()) this.OnAbilityExecuted(event);
                break;
            case R:
                if (this.owns("lich_l_chain")) this.chainUntil = now() + 5;
                break;
        }
    }

    OnTakeDamage(event: ModifierInstanceEvent) {
        if (!IsServer() || !this.isNativeDamage(event) || !event.inflictor) return;
        const ability = event.inflictor;
        const name = ability.GetAbilityName();
        if (name === Q && this.nova && this.nova.until >= now() && this.nova.target === event.unit) {
            this.nova = undefined;
            const point = event.unit.GetAbsOrigin();
            const radius = 255 + (this.awake() ? 45 : 0);
            const damage = 230 + (this.owns("lich_p_blast") ? 65 : 0);
            const delay = this.owns("lich_p_cold") ? 0.8 : 1;
            this.after(delay, [ring(point, radius, blue())], () => {
                flash(NOVA, point);
                for (const target of this.area(point, radius)) this.hit(ability, target, damage);
            });
        }
        if (name === R && this.chainUntil > now()) {
            this.chainUntil = 0;
            this.startOrbit(ability, event.unit);
        }
    }

    private startOrbit(ability: CDOTABaseAbility, carrier: CDOTA_BaseNPC) {
        if (this.orbit) this.clearOrbit(this.orbit);
        const hero = this.hero(), since = now();
        const duration = this.owns("lich_p_frostbound") ? 4.2 : 3.5;
        const icon = carrier.AddNewModifier(hero, ability, "modifier_orb_lich_satellite", { duration });
        if (!icon) return;
        const radius = 290;
        const point = carrier.GetAbsOrigin();
        const orb = effect(SATELLITE, Vector(point.x + radius, point.y, point.z + 80));
        const orbs = [orb];
        if (this.awake()) orbs.push(effect(SATELLITE, Vector(point.x - radius, point.y, point.z + 80)));
        this.orbit = { carrier, ability, since, ends: since + duration, radius, icon, orbs,
            damage: 290 + (this.owns("lich_p_soul") ? 65 : 0), hit: new Set() };
    }

    OnIntervalThink() {
        super.OnIntervalThink();
        if (!IsServer()) return;
        const orbit = this.orbit;
        if (!orbit) return;
        const time = now();
        if (time >= orbit.ends || !opponent(this.hero(), orbit.carrier) || orbit.icon.IsNull()) {
            this.clearOrbit(orbit);
            return;
        }
        const origin = orbit.carrier.GetAbsOrigin();
        orbit.orbs.forEach((orb, index) => {
            const angle = (time - orbit.since) * 2.75 + Math.PI * index;
            const point = Vector(origin.x + orbit.radius * Math.cos(angle), origin.y + orbit.radius * Math.sin(angle), origin.z + 80);
            ParticleManager.SetParticleControl(orb, 0, point);
            if (time - orbit.since < 0.45) return;
            for (const target of this.area(point, 110)) {
                const id = target.entindex();
                if (orbit.hit.has(id)) continue;
                orbit.hit.add(id);
                flash(ICE, target.GetAbsOrigin());
                this.hit(orbit.ability, target, orbit.damage);
            }
        });
    }

    private clearOrbit(orbit: Orbit) {
        for (const orb of orbit.orbs) stop(orb);
        if (!orbit.icon.IsNull()) orbit.icon.Destroy();
        this.orbit = undefined;
    }

    protected clear() {
        super.clear();
        if (this.orbit) this.clearOrbit(this.orbit);
    }

    OnAttackLanded(event: ModifierAttackEvent) {
        const shell = this.shell, hero = this.hero();
        if (!IsServer() || event.target !== hero || !shell || now() > shell.until
            || !hero.HasModifier(SHIELD) || event.no_attack_cooldown || !opponent(hero, event.attacker)) return;
        if (++shell.hits < 3) return;
        this.shell = undefined;
        const from = hero.GetAbsOrigin();
        const aim = direction(from, event.attacker.GetAbsOrigin(), hero.GetForwardVector());
        const length = 710 + (this.owns("lich_p_icy") ? 140 : 0);
        const damage = (this.awake() ? 270 : 215) + (this.owns("lich_p_thorns") ? 45 : 0);
        const lanes = [-0.38, 0, 0.38].map(angle => offset(from,
            Vector(aim.x * Math.cos(angle) - aim.y * Math.sin(angle), aim.y * Math.cos(angle) + aim.x * Math.sin(angle), 0), length));
        this.after(0.65, lanes.flatMap(end => this.lane(from, end, 85, blue())), () => {
            const hit = new Set<EntityIndex>();
            for (const end of lanes) {
                flash(BEAM, from, end);
                for (const target of this.line(from, end, 85)) {
                    if (hit.has(target.entindex())) continue;
                    hit.add(target.entindex());
                    this.hit(shell.ability, target, damage);
                }
            }
        });
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
        const width = this.owns("lich_p_focus") ? 155 : 115;
        const damage = (this.awake() ? 315 : 245) + (this.owns("lich_p_drain") ? 55 : 0);
        this.after(0.8, this.lane(from, to, width, blue()), () => {
            flash(BEAM, from, to);
            for (const target of this.line(from, to, width)) this.hit(ability, target, damage);
        });
    }

    OnDeath(event: ModifierInstanceEvent) {
        if (!IsServer() || event.unit !== this.hero()) return;
        this.nova = this.shell = this.gaze = undefined;
        this.chainUntil = 0;
        this.clear();
    }
}

modifier_orb_lich_legend = registerModifier("modifier_orb_lich_legend", LichLegends);

class Satellite extends ModBase {
    IsDebuff() { return true; }
    IsPurgable() { return false; }
    IsPurgeException() { return true; }
    GetTexture() { return "lich_chain_frost"; }
}

modifier_orb_lich_satellite = registerModifier("modifier_orb_lich_satellite", Satellite);
