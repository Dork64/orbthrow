
import { registerModifier } from "../lib/registry";
import { ModBase } from "../lib/modbase";
import { direction, distance, flash, legal, LegendField, now, offset, opponent, prop, removeProp, resizeRing, ring, stop } from "../lib/legendfield";

declare global {
    var modifier_orb_tidehunter_legend: unknown;
    var modifier_orb_tide_pressure: unknown;
}

const Q = "tidehunter_gush", W = "tidehunter_kraken_shell", E = "tidehunter_anchor_smash", R = "tidehunter_ravage";
const RETURN = "orb_tide_anchor_return";
const SPLASH = "particles/units/heroes/hero_tidehunter/tidehunter_gush_splash.vpcf";
const GUSH = "particles/units/heroes/hero_tidehunter/tidehunter_gush.vpcf";
const ANCHOR = "models/heroes/tidehunter/tidehunter_anchor.vmdl";
const teal = () => Vector(75, 240, 185);
const EYE = 295;
const MIN_SURGE_DELAY = 3.2;
const SURGE_TIME = 1.2;

type Shell = { ability: CDOTABaseAbility; mark: ParticleID; icon?: CDOTA_Buff; until: number; radius: number; stored: number };
type Whirlpool = { ability: CDOTABaseAbility; from: Vector; starts: number; radius: number; last: number;
    outer: ParticleID; eye: ParticleID; damage: number; hit: Set<EntityIndex> };

export class TidehunterLegends extends LegendField {
    private tide?: { from: Vector; until: number };
    private shell?: Shell;
    private anchor?: Vector;
    private whirl?: Whirlpool;

    DeclareFunctions() {
        return [ModifierFunction.ON_ABILITY_FULLY_CAST, ModifierFunction.ON_TAKEDAMAGE, ModifierFunction.ON_DEATH];
    }

    OnAbilityFullyCast(event: ModifierAbilityEvent) {
        const hero = this.hero();
        if (!IsServer() || event.unit !== hero) return;
        const ability = event.ability, point = hero.GetAbsOrigin();
        switch (ability.GetAbilityName()) {
            case Q:
                if (this.owns("tide_l_gush")) this.tide = { from: point, until: now() + (hero.HasScepter() ? 2.1 : 1) };
                break;
            case W: {
                if (!this.owns("tide_l_shell")) return;
                if (this.shell) this.clearShell(this.shell);
                const duration = Math.max(1, ability.GetSpecialValueFor("active_duration"));
                const radius = this.owns("tide_p_brine") ? 485 : 420;
                this.shell = { ability, mark: ring(point, radius, teal()), radius, until: now() + duration, stored: 0,
                    icon: hero.AddNewModifier(hero, ability, "modifier_orb_tide_pressure", { duration }) };
                break;
            }
            case E: {
                if (!this.owns("tide_l_anchor")) return;
                const mark = ring(point, this.owns("tide_p_weaken") ? 310 : 265, teal());
                const model = prop(ANCHOR, Vector(point.x, point.y, point.z + 42), 0.9, hero.GetForwardVector());
                const clear = () => { stop(mark); removeProp(model); this.anchor = undefined; };
                if (this.open(ability, RETURN, this.awake() ? 2.7 : 2.1, clear)) this.anchor = point;
                else clear();
                break;
            }
            case R: {
                if (!this.owns("tide_l_ravage")) return;
                if (this.whirl) this.clearWhirl(this.whirl);
                const radius = (this.awake() ? 950 : 820) + (this.owns("tide_p_bulwark") ? 85 : 0);
                const speed = Math.max(1, ability.GetSpecialValueFor("speed"));
                const stun = ability.GetSpecialValueFor("duration");
                const windup = Math.max(MIN_SURGE_DELAY, stun + (radius + 38) / speed + 0.45);
                this.whirl = { ability, from: point, starts: now() + windup, radius, last: radius,
                    outer: ring(point, radius, teal()), eye: ring(point, EYE, teal()), hit: new Set(),
                    damage: 285 + (this.owns("tide_p_maelstrom") ? 65 : 0) };
                break;
            }
        }
    }

    OnTakeDamage(event: ModifierInstanceEvent) {
        const hero = this.hero();
        if (!IsServer() || ((event.damage_flags ?? 0) & DamageFlag.REFLECTION) !== 0 || event.damage <= 0) return;
        const shell = this.shell;
        if (shell && event.unit === hero && opponent(hero, event.attacker) && !hero.PassivesDisabled() && now() < shell.until) {
            const cap = (this.awake() ? 430 : 330) + (this.owns("tide_p_spikes") ? 65 : 0);
            shell.stored = Math.min(cap, shell.stored + event.damage * 0.45);
            if (shell.icon && !shell.icon.IsNull()) shell.icon.SetStackCount(Math.floor(shell.stored));
        }
        const tide = this.tide;
        const ability = event.inflictor;
        if (!tide || !ability || ability.GetAbilityName() !== Q || now() > tide.until || !this.isNativeDamage(event)) return;
        this.tide = undefined;
        const from = event.unit.GetAbsOrigin();
        const width = 115;
        const length = Math.min(1150, Math.max(310, distance(from, tide.from)));
        const aim = direction(from, tide.from, hero.GetForwardVector());
        const to = offset(from, aim, length);
        const damage = (this.awake() ? 275 : 215) + (this.owns("tide_p_corrode") ? 50 : 0);
        this.after(this.owns("tide_p_tide") ? 0.8 : 1, this.lane(from, to, width, teal()), () => {
            const hit = new Set<EntityIndex>();
            const steps = Math.ceil(length / 220);
            for (let index = 0; index < steps; index++) {
                const start = offset(from, aim, length * index / steps);
                const end = offset(from, aim, length * (index + 1) / steps);
                this.after(index * 0.09, [], () => {
                    flash(GUSH, start, end);
                    for (const target of this.line(start, end, width)) {
                        if (hit.has(target.entindex())) continue;
                        hit.add(target.entindex());
                        this.hit(ability, target, damage);
                    }
                });
            }
        });
    }

    ReturnToAnchor() {
        const from = this.anchor, hero = this.hero();
        if (!from || !this.movable(from)) return;
        const cast = this.consume(RETURN);
        if (!cast) return;
        const radius = this.owns("tide_p_weaken") ? 310 : 265;
        const damage = 135 + hero.GetAverageTrueAttackDamage(undefined) * 0.35 + (this.owns("tide_p_heavy") ? 55 : 0);
        this.after(0.35, [ring(from, radius, teal())], () => {
            if (!this.movable(from) || hero.IsStunned() || hero.IsHexed()) return;
            FindClearSpaceForUnit(hero, from, true);
            const point = hero.GetAbsOrigin();
            if (distance(point, from) > 110) return;
            flash(SPLASH, point);
            for (const target of this.area(point, radius)) this.hit(cast.native, target, damage, DamageTypes.PHYSICAL);
        });
    }

    private movable(to: Vector) {
        const hero = this.hero(), from = hero.GetAbsOrigin();
        return !hero.IsRooted() && !hero.IsCurrentlyHorizontalMotionControlled() && distance(from, to) <= 720
            && legal(to) && GridNav.CanFindPath(from, to);
    }

    OnIntervalThink() {
        super.OnIntervalThink();
        if (!IsServer() || !this.hero().IsAlive()) return;
        if (this.shell) this.tickShell(this.shell);
        if (this.whirl) this.tickWhirl(this.whirl);
    }

    private tickShell(shell: Shell) {
        const hero = this.hero(), point = hero.GetAbsOrigin();
        ParticleManager.SetParticleControl(shell.mark, 0, GetGroundPosition(point, hero));
        if (now() < shell.until) return;
        this.clearShell(shell);
        if (shell.stored < 90 || hero.PassivesDisabled()) return;
        flash(SPLASH, point);
        for (const target of this.area(point, shell.radius)) this.hit(shell.ability, target, shell.stored + 65);
    }

    private tickWhirl(whirl: Whirlpool) {
        const progress = (now() - whirl.starts) / SURGE_TIME;
        if (progress < 0) return;
        const radius = Math.max(EYE, whirl.radius - (whirl.radius - EYE) * progress);
        resizeRing(whirl.outer, radius);
        for (const target of this.area(whirl.from, whirl.last + 38)) {
            const id = target.entindex(), length = distance(whirl.from, target.GetAbsOrigin());
            if (length < EYE || length < radius - 38 || whirl.hit.has(id)) continue;
            whirl.hit.add(id);
            flash(SPLASH, target.GetAbsOrigin());
            this.hit(whirl.ability, target, whirl.damage);
        }
        whirl.last = radius;
        if (progress >= 1) this.clearWhirl(whirl);
    }

    private clearShell(shell: Shell) {
        stop(shell.mark);
        if (shell.icon && !shell.icon.IsNull()) shell.icon.Destroy();
        this.shell = undefined;
    }

    private clearWhirl(whirl: Whirlpool) {
        stop(whirl.outer);
        stop(whirl.eye);
        this.whirl = undefined;
    }

    protected clear() {
        super.clear();
        if (this.shell) this.clearShell(this.shell);
        if (this.whirl) this.clearWhirl(this.whirl);
        this.tide = undefined;
    }

    OnDeath(event: ModifierInstanceEvent) { if (IsServer() && event.unit === this.hero()) this.clear(); }
}

class Pressure extends ModBase {
    IsPurgable() { return false; }
    GetTexture() { return "tidehunter_kraken_shell"; }
}

modifier_orb_tidehunter_legend = registerModifier("modifier_orb_tidehunter_legend", TidehunterLegends);
modifier_orb_tide_pressure = registerModifier("modifier_orb_tide_pressure", Pressure);
