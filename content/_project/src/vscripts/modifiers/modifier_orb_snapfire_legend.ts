
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { direction, distance, flash, legal, LegendField, now, offset, opponent, prop, removeProp, ring } from "../lib/legendfield";

declare global {
    var modifier_orb_snapfire_legend: unknown;
    var modifier_orb_snapfire_scored: unknown;
}

const Q = "snapfire_scatterblast", W = "snapfire_firesnap_cookie", E = "snapfire_lil_shredder", R = "snapfire_mortimer_kisses";
const BANK = "orb_snapfire_bank", SPRING = "orb_snapfire_spring";
const BLAST = "particles/units/heroes/hero_snapfire/snapfire_flaming_creep_impact.vpcf";
const WEAPON = "models/heroes/snapfire/snapfire_weapon.vmdl";
const LANE = "models/orbthrow/legend_props/firing_lane.vmdl";
const COOKIE = "models/heroes/snapfire/fx/snapfire_cookie.vmdl";
const SHELL = "models/heroes/snapfire/snapfire_magma_projectile.vmdl";
const SCORE = "modifier_orb_snapfire_scored";
const orange = () => Vector(255, 125, 50);

export class SnapfireLegends extends LegendField {
    private barrel?: Vector;
    private turret?: { ability: CDOTABaseAbility; point: Vector; until: number; shots: number; hits: number; last: number; model?: CBaseEntity };
    private flight?: { ability: CDOTABaseAbility; from: Vector; lands: number; expires: number };
    private spring?: CDOTABaseAbility;
    private scored: { target: EntityIndex; icon: CDOTA_Buff; ability: CDOTABaseAbility }[] = [];
    private rounds = new Set<number>();

    DeclareFunctions() {
        return [ModifierFunction.ON_ABILITY_FULLY_CAST, ModifierFunction.ON_ATTACK_RECORD, ModifierFunction.ON_ATTACK_LANDED,
            ModifierFunction.ON_ATTACK_RECORD_DESTROY, ModifierFunction.ON_DEATH];
    }

    OnAbilityFullyCast(event: ModifierAbilityEvent) {
        const hero = this.hero();
        if (!IsServer() || event.unit !== hero) return;
        const ability = event.ability;
        const point = hero.GetAbsOrigin();
        switch (ability.GetAbilityName()) {
            case Q: {
                if (!this.owns("snap_l_scatter")) return;
                const muzzle = Vector(point.x, point.y, point.z + 44);
                const model = prop(WEAPON, muzzle, 1.15, direction(point, ability.GetCursorPosition(), hero.GetForwardVector()));
                const clear = () => { removeProp(model); this.barrel = undefined; };
                if (this.open(ability, BANK, 3, clear)) this.barrel = point;
                else clear();
                break;
            }
            case W:
                if (this.owns("snap_l_cookie") && (event.target ?? ability.GetCursorTarget()) === hero) {
                    const lands = now() + Math.max(0.2, ability.GetSpecialValueFor("jump_duration"));
                    this.flight = { ability, from: point, lands, expires: lands + 0.55 };
                }
                break;
            case E:
                if (!this.owns("snap_l_shredder")) return;
                this.clearTurret();
                flash(BLAST, point);
                this.turret = { ability, point, until: now() + ability.GetSpecialValueFor("AbilityDuration"),
                    shots: 0, hits: 0, last: -1,
                    model: prop(WEAPON, Vector(point.x, point.y, point.z + 76), 1.55, hero.GetForwardVector()) };
                break;
            case R:
                if (this.owns("snap_l_mortimer")) this.barrage(ability, point);
                break;
        }
    }

    Bank(point: Vector) {
        const from = this.barrel;
        const cast = this.consume(BANK);
        if (!from || !cast) return;
        const aim = direction(from, point, this.hero().GetForwardVector());
        const to = offset(from, aim, this.awake() ? 1150 : 900);
        const width = this.owns("snap_p_grit") ? 180 : 135;
        const damage = 385 + (this.owns("snap_p_buckshot") ? 65 : 0);
        const cleanup = this.tiles(LANE, from, to, width / 124);
        const muzzle = prop(WEAPON, Vector(from.x, from.y, from.z + 50), 1.35, aim);
        this.after(0.5, [], () => {
            for (const node of [from, offset(from, aim, distance(from, to) / 2), to]) flash(BLAST, node);
            for (const target of this.line(from, to, width)) {
                const close = distance(from, target.GetAbsOrigin()) <= 340;
                this.hit(cast.native, target, damage + (close ? 155 : 0));
            }
        }, () => { cleanup(); removeProp(muzzle); });
    }

    Spring(point: Vector) {
        const ability = this.spring;
        const hero = this.hero();
        if (!ability || hero.IsRooted() || hero.IsCurrentlyHorizontalMotionControlled() || hero.IsCurrentlyVerticalMotionControlled()) return;
        const from = hero.GetAbsOrigin(), aim = direction(from, point, hero.GetForwardVector());
        const length = Math.min(distance(from, point), this.owns("snap_p_fullbelly") ? 495 : 430);
        const to = GetGroundPosition(offset(from, aim, length), hero);
        if (length < 80 || !legal(to) || !GridNav.CanFindPath(from, to)) return;
        this.consume(SPRING);
        const radius = this.awake() ? 310 : 255;
        const damage = 345 + (this.owns("snap_p_shockwave") ? 55 : 0);
        const center = offset(from, aim, -100);
        const hop = hero.AddNewModifier(hero, ability, "modifier_knockback", { center_x: center.x, center_y: center.y,
            center_z: center.z, duration: 0.42, knockback_duration: 0.42, knockback_distance: length,
            knockback_height: 185, should_stun: 0 });
        if (!hop) return;
        const crumb = prop(COOKIE, Vector(to.x, to.y, to.z + 35), 1.55, aim);
        this.after(0.45, [ring(to, radius, orange())], () => {
            if (distance(hero.GetAbsOrigin(), to) > 110) return;
            flash(BLAST, to);
            this.clearScored();
            for (const target of this.area(to, radius)) {
                this.hit(ability, target, damage);
                if (!opponent(hero, target)) continue;
                const icon = target.AddNewModifier(hero, ability, SCORE, { duration: 3 });
                if (icon) this.scored.push({ target: target.entindex(), icon, ability });
            }
        }, () => removeProp(crumb));
    }

    OnAttackRecord(event: ModifierAttackEvent) {
        const hero = this.hero();
        if (!IsServer() || !this.turret || event.attacker !== hero || event.no_attack_cooldown
            || !hero.HasModifier("modifier_snapfire_lil_shredder_buff")) return;
        this.rounds.add(event.record);
    }

    OnAttackRecordDestroy(event: ModifierAttackEvent) {
        if (IsServer() && event.attacker === this.hero()) this.rounds.delete(event.record);
    }

    OnAttackLanded(event: ModifierAttackEvent) {
        const turret = this.turret, hero = this.hero();
        if (!IsServer() || event.attacker !== hero || event.no_attack_cooldown || !opponent(hero, event.target)) return;
        const scored = this.scored.find(mark => mark.target === event.target.entindex() && !mark.icon.IsNull());
        if (scored) {
            this.clearScored();
            this.hit(scored.ability, event.target, 185, DamageTypes.PHYSICAL);
        }
        if (!turret || now() >= turret.until || now() - turret.last < 0.075 || distance(turret.point, event.target.GetAbsOrigin()) > 1150
            || !this.rounds.delete(event.record)) return;
        turret.last = now();
        if (++turret.hits % 2 !== 0) return;
        if (turret.shots >= (this.owns("snap_p_hotlead") ? 4 : 3)) return;
        turret.shots++;
        const aim = direction(turret.point, event.target.GetAbsOrigin(), hero.GetForwardVector());
        const to = offset(turret.point, aim, Math.min(1150, distance(turret.point, event.target.GetAbsOrigin()) + 115));
        if (turret.model && IsValidEntity(turret.model)) turret.model.SetForwardVector(aim);
        const cleanup = this.tiles(LANE, turret.point, to, 0.84);
        const damage = this.awake() ? 235 : 180;
        this.after(this.owns("snap_p_shred") ? 0.45 : 0.6, [], () => {
            flash(BLAST, turret.point);
            flash(BLAST, to);
            for (const target of this.line(turret.point, to, 100)) this.hit(turret.ability, target, damage, DamageTypes.PHYSICAL);
        }, cleanup);
    }

    private barrage(ability: CDOTABaseAbility, from: Vector) {
        const cursor = ability.GetCursorPosition();
        const aim = direction(from, cursor, this.hero().GetForwardVector());
        const side = Vector(-aim.y, aim.x, 0);
        const middle = offset(from, aim, Math.min(2400, Math.max(600, distance(from, cursor))));
        const radius = this.owns("snap_p_shelter") ? 290 : 250;
        const damage = 325 + (this.owns("snap_p_napalm") ? 60 : 0);
        const spots = [offset(offset(middle, aim, -360), side, -230), offset(middle, side, 230)];
        if (this.awake()) spots.push(offset(offset(middle, aim, 350), side, -150));
        const hit = new Set<EntityIndex>();
        spots.forEach((position, index) => {
            const point = GetGroundPosition(position, undefined);
            const duration = 1.15 + 0.55 * index;
            const approach = offset(point, side, index % 2 === 0 ? -620 : 620);
            const shell = prop(SHELL, Vector(approach.x, approach.y, point.z + 780), 1.15, direction(approach, point, aim));
            this.animate(duration, progress => {
                if (!shell || !IsValidEntity(shell)) return;
                shell.SetAbsOrigin(Vector(approach.x + (point.x - approach.x) * progress, approach.y + (point.y - approach.y) * progress,
                    point.z + (1 - progress) * (780 + 170 * Math.sin(Math.PI * progress))));
            }, () => removeProp(shell));
            this.after(duration, [ring(point, radius, orange())], () => {
                flash(BLAST, point);
                for (const target of this.area(point, radius)) {
                    if (hit.has(target.entindex())) continue;
                    hit.add(target.entindex());
                    this.hit(ability, target, damage);
                }
            });
        });
    }

    OnIntervalThink() {
        super.OnIntervalThink();
        if (!IsServer() || !this.hero().IsAlive()) return;
        if (this.turret && this.turret.until <= now()) this.clearTurret();
        const flight = this.flight, hero = this.hero();
        if (!flight || now() < flight.lands) return;
        if (now() > flight.expires) { this.flight = undefined; return; }
        if (hero.IsCurrentlyHorizontalMotionControlled() || hero.IsCurrentlyVerticalMotionControlled()) return;
        this.flight = undefined;
        if (distance(flight.from, hero.GetAbsOrigin()) < 140) return;
        const point = hero.GetAbsOrigin();
        const crumb = prop(COOKIE, Vector(point.x, point.y, point.z + 52), 1.35, hero.GetForwardVector());
        const cleanup = () => { removeProp(crumb); this.spring = undefined; };
        if (this.open(flight.ability, SPRING, this.awake() ? 2.35 : 1.8, cleanup)) this.spring = flight.ability;
        else cleanup();
    }

    private clearTurret() {
        if (this.turret) removeProp(this.turret.model);
        this.rounds.clear();
        this.turret = undefined;
    }

    private clearScored() {
        for (const mark of this.scored) if (!mark.icon.IsNull()) mark.icon.Destroy();
        this.scored = [];
    }

    protected clear() {
        super.clear();
        this.clearTurret();
        this.clearScored();
        this.flight = undefined;
    }

    OnDeath(event: ModifierInstanceEvent) { if (IsServer() && event.unit === this.hero()) this.clear(); }
}

class Scored extends ModBase {
    IsDebuff() { return true; }
    IsPurgable() { return true; }
    GetTexture() { return "snapfire_firesnap_cookie"; }
    DeclareFunctions() { return [ModifierFunction.MOVESPEED_BONUS_PERCENTAGE]; }
    GetModifierMoveSpeedBonus_Percentage() {
        return this.GetElapsedTime() < 0.95 ? -44 : 0;
    }
}

modifier_orb_snapfire_scored = registerModifier("modifier_orb_snapfire_scored", Scored);
modifier_orb_snapfire_legend = registerModifier("modifier_orb_snapfire_legend", SnapfireLegends);
