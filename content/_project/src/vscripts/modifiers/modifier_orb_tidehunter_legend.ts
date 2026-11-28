
import { registerModifier } from "../lib/registry";
import { ModBase } from "../lib/modbase";
import { direction, distance, legal, LegendField, now, offset, opponent, prop, removeProp, resizeRing, ring, stop } from "../lib/legendfield";

declare global {
    var modifier_orb_tidehunter_legend: unknown;
    var modifier_orb_tide_pressure: unknown;
}

const Q = "tidehunter_gush", W = "tidehunter_kraken_shell", E = "tidehunter_anchor_smash", R = "tidehunter_ravage";
const RETURN = "orb_tide_anchor_return", RELEASE = "orb_tide_shell_release";
const SPLASH = "particles/units/heroes/hero_tidehunter/tidehunter_gush_splash.vpcf";
const CREST = "models/orbthrow/legend_props/undertow_crest.vmdl";
const TRACK = "models/orbthrow/legend_props/undertow_track.vmdl";
const CARAPACE = "models/heroes/tidehunter/tidehunter_kraken_shell.vmdl";
const WAVE_SPEED = 1450;
const ANCHOR = "models/heroes/tidehunter/tidehunter_anchor.vmdl";
const teal = () => Vector(75, 240, 185);
const EYE = 295;
const MIN_SURGE_DELAY = 3.2;
const SURGE_TIME = 1.2;

type Shell = { ability: CDOTABaseAbility; models: CBaseEntity[]; icon?: CDOTA_Buff; start: number; until: number; radius: number; stored: number };
type Whirlpool = { ability: CDOTABaseAbility; from: Vector; starts: number; radius: number; last: number;
    outer: ParticleID; eye: ParticleID; crests: { angle: number; model: CBaseEntity }[]; damage: number; hit: Set<EntityIndex> };

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
                const radius = this.owns("tide_p_brine") ? 525 : 460;
                const models: CBaseEntity[] = [];
                for (let i = 0; i < 3; i++) {
                    const model = prop(CARAPACE, point, 1.15, hero.GetForwardVector());
                    if (model) models.push(model);
                }
                const shell: Shell = { ability, models, radius, start: now(), until: now() + duration, stored: 0,
                    icon: hero.AddNewModifier(hero, ability, "modifier_orb_tide_pressure", { duration }) };
                this.shell = shell;
                this.open(ability, RELEASE, duration);
                this.tickShell(shell);
                break;
            }
            case E: {
                if (!this.owns("tide_l_anchor")) return;
                const model = prop(ANCHOR, Vector(point.x, point.y, point.z + 42), 0.9, hero.GetForwardVector());
                const clear = () => { removeProp(model); this.anchor = undefined; };
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
                    outer: ring(point, radius, teal()), eye: ring(point, EYE, teal()), crests: [], hit: new Set(),
                    damage: 345 + (this.owns("tide_p_maelstrom") ? 65 : 0) };
                for (let i = 0; i < 6; i++) {
                    const angle = Math.PI * i / 3;
                    const along = Vector(Math.cos(angle), Math.sin(angle), 0);
                    const model = prop(CREST, GetGroundPosition(offset(point, along, radius), undefined), 0.78,
                        Vector(-along.x, -along.y, 0));
                    if (model) this.whirl.crests.push({ angle, model });
                }
                break;
            }
        }
    }

    OnTakeDamage(event: ModifierInstanceEvent) {
        const hero = this.hero();
        if (!IsServer() || ((event.damage_flags ?? 0) & (DamageFlag.REFLECTION | DamageFlag.HPLOSS)) !== 0) return;
        const shell = this.shell;
        if (shell && event.unit === hero && opponent(hero, event.attacker) && !hero.PassivesDisabled() && now() < shell.until) {
            const cap = (this.awake() ? 530 : 410) + (this.owns("tide_p_spikes") ? 65 : 0);
            shell.stored = Math.min(cap, shell.stored + Math.max(event.original_damage ?? 0, event.damage) * 0.6);
            if (shell.icon && !shell.icon.IsNull()) shell.icon.SetStackCount(Math.floor(shell.stored));
        }
        const tide = this.tide;
        const ability = event.inflictor;
        if (!tide || !ability || ability.GetAbilityName() !== Q || now() > tide.until || !this.isNativeDamage(event)) return;
        this.tide = undefined;
        const from = event.unit.GetAbsOrigin();
        const width = 145;
        const length = Math.min(1300, Math.max(400, distance(from, tide.from)));
        const aim = direction(from, tide.from, hero.GetForwardVector());
        const to = offset(from, aim, length);
        const damage = (this.awake() ? 380 : 315) + (this.owns("tide_p_corrode") ? 50 : 0);
        const cleanup = this.tiles(TRACK, from, to, 1.25);
        this.after(this.owns("tide_p_tide") ? 0.56 : 0.74, [], () => {
            const crest = prop(CREST, GetGroundPosition(from, undefined), 1, aim);
            const hit = new Set<EntityIndex>();
            let last = from, sprayAt = -150;
            this.animate(length / WAVE_SPEED, progress => {
                const point = GetGroundPosition(offset(from, aim, length * progress), undefined);
                if (crest && IsValidEntity(crest)) crest.SetAbsOrigin(point);
                const travelled = length * progress;
                if (travelled - sprayAt >= 145) {
                    sprayAt = travelled;
                    this.transient(SPLASH, point, 0.75);
                }
                const targets = distance(last, point) < 1 ? this.area(point, width) : this.line(last, point, width);
                for (const target of targets) {
                    if (hit.has(target.entindex())) continue;
                    hit.add(target.entindex());
                    this.hit(ability, target, damage);
                }
                last = point;
            }, () => removeProp(crest));
        }, cleanup);
    }

    ReleaseShell() {
        const shell = this.shell;
        if (shell && now() - shell.start >= 0.45) this.burstShell(shell);
    }

    private burstShell(shell: Shell) {
        this.clearShell(shell);
        if (this.hero().PassivesDisabled()) return;
        const point = GetGroundPosition(this.hero().GetAbsOrigin(), undefined);
        const marker = ring(point, shell.radius, teal());
        const vents: CBaseEntity[] = [];
        for (let i = 0; i < 4; i++) {
            const angle = Math.PI * i / 2;
            const aim = Vector(Math.cos(angle), Math.sin(angle), 0);
            const model = prop(CREST, GetGroundPosition(offset(point, aim, 95), undefined), 0.6, aim);
            if (model) vents.push(model);
        }
        this.after(0.42, [marker], () => {
            if (this.hero().PassivesDisabled()) return;
            this.transient(SPLASH, point, 0.8);
            for (const target of this.area(point, shell.radius)) this.hit(shell.ability, target, shell.stored + 225);
        }, () => { for (const vent of vents) removeProp(vent); });
    }

    ReturnToAnchor() {
        const from = this.anchor, hero = this.hero();
        if (!from || !this.movable(from)) return;
        const cast = this.consume(RETURN);
        if (!cast) return;
        const radius = this.owns("tide_p_weaken") ? 310 : 265;
        const damage = 180 + hero.GetAverageTrueAttackDamage(undefined) * 0.45 + (this.owns("tide_p_heavy") ? 55 : 0);
        const model = prop(ANCHOR, Vector(from.x, from.y, from.z + 42), 1, hero.GetForwardVector());
        this.after(0.35, [], () => {
            if (!this.movable(from) || hero.IsStunned() || hero.IsHexed()) return;
            FindClearSpaceForUnit(hero, from, true);
            const point = hero.GetAbsOrigin();
            if (distance(point, from) > 110) return;
            this.transient(SPLASH, point, 0.75);
            for (const target of this.area(point, radius)) this.hit(cast.native, target, damage, DamageTypes.PHYSICAL);
        }, () => removeProp(model));
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
        if (now() >= shell.until) { this.burstShell(shell); return; }
        shell.models.forEach((model, index) => {
            if (!IsValidEntity(model)) return;
            const angle = now() * 2.45 + index * 2 * Math.PI / 3;
            const aim = Vector(Math.cos(angle), Math.sin(angle), 0);
            const radius = 112 + Math.min(35, shell.stored / 14);
            model.SetAbsOrigin(offset(Vector(point.x, point.y, point.z + 92 + 16 * Math.sin(angle)), aim, radius));
            model.SetForwardVector(aim);
        });
    }

    private tickWhirl(whirl: Whirlpool) {
        const progress = (now() - whirl.starts) / SURGE_TIME;
        const radius = Math.max(EYE, whirl.radius - (whirl.radius - EYE) * Math.max(0, progress));
        resizeRing(whirl.outer, radius);
        for (const crest of whirl.crests) {
            if (!IsValidEntity(crest.model)) continue;
            const angle = crest.angle + now() * 0.72;
            const aim = Vector(Math.cos(angle), Math.sin(angle), 0);
            crest.model.SetAbsOrigin(GetGroundPosition(offset(whirl.from, aim, radius), undefined));
            crest.model.SetForwardVector(Vector(-aim.x, -aim.y, 0));
        }
        if (progress < 0) return;
        for (const target of this.area(whirl.from, whirl.last + 38)) {
            const id = target.entindex(), length = distance(whirl.from, target.GetAbsOrigin());
            if (length < EYE || length < radius - 38 || whirl.hit.has(id)) continue;
            whirl.hit.add(id);
            this.transient(SPLASH, target.GetAbsOrigin(), 0.7);
            this.hit(whirl.ability, target, whirl.damage);
        }
        whirl.last = radius;
        if (progress >= 1) this.clearWhirl(whirl);
    }

    private clearShell(shell: Shell) {
        this.shell = undefined;
        this.consume(RELEASE);
        for (const model of shell.models) removeProp(model);
        if (shell.icon && !shell.icon.IsNull()) shell.icon.Destroy();
    }

    private clearWhirl(whirl: Whirlpool) {
        stop(whirl.outer);
        stop(whirl.eye);
        for (const { model } of whirl.crests) removeProp(model);
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
