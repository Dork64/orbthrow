import type { FxSpring, FxThunderball } from "../core/fxtypes";
import { fxModifierName } from "../core/fxtypes";
import { OrbBonuses, overrideValue } from "../core/orbstore";

const RING = "particles/ui_mouseactions/range_display.vpcf";
const BOLT = "particles/units/heroes/hero_zuus/zuus_lightning_bolt.vpcf";
const ARC = "particles/items_fx/chain_lightning.vpcf";
const ZAP = "Hero_Zuus.LightningBolt";

type Strike = (victim: CDOTA_BaseNPC, amount: number, effect: FxSpring | FxThunderball, flags?: number) => void;

interface Spring {
    f: FxSpring;
    pos: Vector;
    marker: ParticleID;
    until: number;
    armedAt: number;
    ownerLeft: boolean;
    ownerOnly: boolean;
}

interface Ball {
    f: FxThunderball;
    carrier: CDOTA_BaseNPC;
    marker: ParticleID;
    ability: CDOTABaseAbility;
    buff?: CDOTA_Buff;
    until: number;
    passAt: number;
    amount: number;
}

function atMost(a: Vector, b: Vector, range: number): boolean {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy <= range * range && Math.abs(a.z - b.z) < 170;
}

function livingHero(unit: CDOTA_BaseNPC | undefined): unit is CDOTA_BaseNPC {
    return unit !== undefined && IsValidEntity(unit) && unit.IsAlive() && unit.IsRealHero();
}

function realFighter(unit: CDOTA_BaseNPC | undefined): unit is CDOTA_BaseNPC {
    return livingHero(unit) && !unit.IsOutOfGame() && !unit.IsInvulnerable();
}

function ring(pos: Vector, radius: number, color: Vector): ParticleID {
    const fx = ParticleManager.CreateParticle(RING, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(fx, 0, pos);
    ParticleManager.SetParticleControl(fx, 1, Vector(radius, 0, 0));
    ParticleManager.SetParticleControl(fx, 2, color);
    return fx;
}

function clearParticle(fx: ParticleID) {
    ParticleManager.DestroyParticle(fx, true);
    ParticleManager.ReleaseParticleIndex(fx);
}

function flash(from: Vector, to: Vector, pfx: string, carrier: CDOTA_BaseNPC) {
    const fx = ParticleManager.CreateParticle(pfx, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(fx, 0, Vector(from.x, from.y, from.z + 65));
    ParticleManager.SetParticleControl(fx, 1, Vector(to.x, to.y, to.z + 65));
    ParticleManager.ReleaseParticleIndex(fx);
    EmitSoundOn(ZAP, carrier);
}

export class ZeusLegends {
    private spring?: Spring;
    private landing?: { f: FxSpring; at: number; amount: number };
    private ball?: Ball;
    private ballReadyAt = 0;

    constructor(private readonly owner: CDOTA_BaseNPC, private readonly strike: Strike) {}

    castSpring(f: FxSpring, now: number) {
        // Дополнительные заряды родного E не размножают площадки и не продлевают активную.
        if (this.spring !== undefined && now < this.spring.until) return;
        this.clearSpring();
        const pos = this.owner.GetAbsOrigin();
        this.spring = { f, pos, marker: ring(pos, f.radius, Vector(90, 190, 255)), until: now + f.dur,
            armedAt: now + f.arm, ownerLeft: false, ownerOnly: false };
    }

    castBall(f: FxThunderball, ability: CDOTABaseAbility, b: OrbBonuses, now: number) {
        if (this.ball !== undefined || now < this.ballReadyAt) return;
        const pos = this.owner.GetAbsOrigin();
        const candidates = FindUnitsInRadius(this.owner.GetTeamNumber(), pos, undefined, f.range,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
        const carrier = candidates.find(unit => realFighter(unit)) ?? this.owner;
        const base = ability.GetLevelSpecialValueNoOverride("damage", Math.max(0, ability.GetLevel() - 1));
        const amount = (overrideValue(b, f.ab, "damage", base) ?? base) * f.pct / 100;
        const to = carrier.GetAbsOrigin();
        const ball: Ball = { f, carrier, marker: ring(to, 120, Vector(255, 194, 75)), ability, until: now + f.dur,
            passAt: now + f.delay, amount };
        this.ball = ball;
        this.ballReadyAt = ball.until;
        this.showBall(ball, now);
        flash(pos, to, ARC, carrier);
    }

    attack(e: ModifierAttackEvent, now: number) {
        const ball = this.ball;
        if (ball === undefined || e.attacker !== ball.carrier || !realFighter(e.target) || (e.no_attack_cooldown ?? false)) return;
        if (!atMost(e.attacker.GetAbsOrigin(), e.target.GetAbsOrigin(), ball.f.dist)) return;
        this.passBall(ball, e.target, now);
    }

    bolt(target: CDOTA_BaseNPC, now: number) {
        const ball = this.ball;
        if (ball !== undefined && ball.f.bolt && ball.carrier === this.owner && realFighter(target)) this.passBall(ball, target, now);
    }

    private passBall(ball: Ball, target: CDOTA_BaseNPC, now: number) {
        if (!realFighter(ball.carrier) || now < ball.passAt || now >= ball.until || ball.carrier.GetTeamNumber() === target.GetTeamNumber()) return;
        const from = ball.carrier.GetAbsOrigin();
        this.clearBallBuff(ball);
        ball.carrier = target;
        ball.passAt = now + ball.f.delay;
        this.showBall(ball, now);
        flash(from, target.GetAbsOrigin(), ARC, target);
    }

    private showBall(ball: Ball, now: number) {
        ParticleManager.SetParticleControl(ball.marker, 0, ball.carrier.GetAbsOrigin());
        ball.buff = ball.carrier.AddNewModifier(this.owner, ball.ability, fxModifierName(ball.f.key), { duration: ball.until - now });
    }

    private clearBallBuff(ball: Ball) {
        if (ball.buff !== undefined && !ball.buff.IsNull()) ball.buff.Destroy();
        ball.buff = undefined;
    }

    private clearBall() {
        if (this.ball === undefined) return;
        this.clearBallBuff(this.ball);
        clearParticle(this.ball.marker);
        this.ball = undefined;
    }

    private clearSpring() {
        if (this.spring === undefined) return;
        clearParticle(this.spring.marker);
        this.spring = undefined;
    }

    clear() {
        this.clearSpring();
        this.landing = undefined;
        this.clearBall();
    }

    tick(now: number) {
        this.tickSpring(now);
        const ball = this.ball;
        if (ball === undefined) return;
        if (!livingHero(ball.carrier)) { this.clearBall(); return; }
        const pos = ball.carrier.GetAbsOrigin();
        if (now < ball.until) {
            ParticleManager.SetParticleControl(ball.marker, 0, pos);
            ParticleManager.SetParticleControl(ball.marker, 1, Vector(55 + 65 * (ball.until - now) / ball.f.dur, 0, 0));
            return;
        }
        this.clearBall();
        if (!realFighter(ball.carrier)) return;
        flash(Vector(pos.x, pos.y, pos.z + 850), pos, BOLT, ball.carrier);
        const self = ball.carrier === this.owner;
        const amount = self ? Math.min(ball.amount, this.owner.GetMaxHealth() * 0.25) : ball.amount;
        this.strike(ball.carrier, amount, ball.f, self ? DamageFlag.NON_LETHAL : 0);
    }

    private tickSpring(now: number) {
        const landing = this.landing;
        if (landing !== undefined && now >= landing.at) {
            this.landing = undefined;
            if (realFighter(this.owner)) {
                const pos = this.owner.GetAbsOrigin();
                const foes = FindUnitsInRadius(this.owner.GetTeamNumber(), pos, undefined, landing.f.range,
                    UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
                for (const foe of foes) {
                    if (!realFighter(foe)) continue;
                    const to = foe.GetAbsOrigin();
                    flash(Vector(to.x, to.y, to.z + 850), to, BOLT, foe);
                    this.strike(foe, landing.amount, landing.f);
                    break;
                }
            }
        }

        const s = this.spring;
        if (s === undefined) return;
        if (now >= s.until) { this.clearSpring(); return; }
        if (!atMost(this.owner.GetAbsOrigin(), s.pos, s.f.radius + 25)) s.ownerLeft = true;
        if (now < s.armedAt) return;
        const near = FindUnitsInRadius(this.owner.GetTeamNumber(), s.pos, undefined, s.f.radius,
            UnitTargetTeam.BOTH, UnitTargetType.HERO, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
        for (const unit of near) {
            if (!realFighter(unit) || !atMost(unit.GetAbsOrigin(), s.pos, s.f.radius) ||
                unit.IsRooted() || unit.IsStunned() || unit.IsCurrentlyHorizontalMotionControlled()) continue;
            if (unit === this.owner ? !s.ownerLeft : s.ownerOnly || unit.IsDebuffImmune()) continue;

            const pos = unit.GetAbsOrigin(), facing = unit.GetForwardVector();
            unit.AddNewModifier(this.owner, undefined, "modifier_knockback",
                { center_x: pos.x - facing.x * 50, center_y: pos.y - facing.y * 50, center_z: pos.z,
                    duration: s.f.delay, knockback_duration: s.f.delay, knockback_distance: s.f.dist, knockback_height: 170, should_stun: 0 });
            EmitSoundOn("Hero_Zuus.HeavenlyJump", unit);
            if (unit === this.owner) {
                const ability = this.owner.FindAbilityByName(s.f.ab);
                if (ability !== undefined) this.landing = { f: s.f, at: now + s.f.delay, amount: ability.GetSpecialValueFor("damage") };
            }
            if (s.f.ownerReturn && unit !== this.owner) {
                s.ownerOnly = true;
                s.armedAt = now + s.f.arm;
                ParticleManager.SetParticleControl(s.marker, 2, Vector(180, 120, 255));
            } else this.clearSpring();
            return;
        }
    }
}
