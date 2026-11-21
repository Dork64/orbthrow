import { MAP } from "../core/mapinfo";
import { FxManeuver, fxModifierName } from "../core/fxtypes";

const RING = "particles/ui_mouseactions/range_display.vpcf";
const SWING = "particles/items_fx/battlefury_cleave.vpcf";
const WIND = "particles/units/heroes/hero_windrunner/windrunner_spell_powershot.vpcf";
const JUGG_OMNI = "modifier_juggernaut_omnislash";
const SVEN_GOD = "modifier_sven_gods_strength";
const PA_BLUR = "modifier_phantom_assassin_blur_active";

type Mode = FxManeuver["mode"];
type Strike = (target: CDOTA_BaseNPC, amount: number, effect: FxManeuver, magical?: boolean) => void;
type Push = (target: CDOTA_BaseNPC, direction: Vector, distance: number, duration: number) => void;

interface Stage {
    f: FxManeuver;
    until: number;
    arm: number;
    pos: Vector;
    end?: Vector;
    unit?: CDOTA_BaseNPC;
    marker?: ParticleID;
    endMarker?: ParticleID;
    buff?: CDOTA_Buff;
    phase?: number;
    hits?: number;
    dir?: Vector;
}

function delta(a: Vector, b: Vector): Vector { return Vector(a.x - b.x, a.y - b.y, 0); }
function length(v: Vector): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
function norm(v: Vector): Vector { const d = Math.max(0.01, length(v)); return Vector(v.x / d, v.y / d, 0); }
function dot(a: Vector, b: Vector): number { return a.x * b.x + a.y * b.y; }
function shift(p: Vector, dir: Vector, n: number): Vector { return Vector(p.x + dir.x * n, p.y + dir.y * n, p.z); }
function distance(a: Vector, b: Vector): number { return length(delta(a, b)); }
function alive(unit: CDOTA_BaseNPC | undefined): unit is CDOTA_BaseNPC {
    return unit !== undefined && IsValidEntity(unit) && unit.IsAlive();
}
function fighter(unit: CDOTA_BaseNPC | undefined): unit is CDOTA_BaseNPC {
    return alive(unit) && unit.IsRealHero() && !unit.IsOutOfGame() && !unit.IsInvulnerable();
}
function movable(u: CDOTA_BaseNPC): boolean {
    return !u.IsRooted() && !u.IsStunned() && !u.IsCurrentlyHorizontalMotionControlled() &&
        !u.HasModifier("modifier_slark_pounce_leash") && !u.HasModifier("modifier_puck_dream_coil");
}
function ring(pos: Vector, radius: number, r = 178, g = 215, b = 255): ParticleID {
    const id = ParticleManager.CreateParticle(RING, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id, 0, pos);
    ParticleManager.SetParticleControl(id, 1, Vector(radius, 0, 0));
    ParticleManager.SetParticleControl(id, 2, Vector(r, g, b));
    return id;
}
function flash(pos: Vector, pfx = SWING) {
    const id = ParticleManager.CreateParticle(pfx, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(id, 0, pos);
    ParticleManager.SetParticleControl(id, 1, pos);
    ParticleManager.ReleaseParticleIndex(id);
}

/** Ветки этих героев используют штатные приказы, атаки и способности; один независимый объект на ветку. */
export class HeroManeuvers {
    private defs = new Map<Mode, FxManeuver>();
    private states = new Map<Mode, Stage>();
    private ready = new Map<Mode, number>();
    private ward?: CDOTA_BaseNPC;
    private pendingDagger?: { unit: CDOTA_BaseNPC; ability: CDOTABaseAbility; until: number };
    private lastPos?: Vector;
    private lastMove = 0;
    private movingSince?: number;
    private starts = new Map<string, { at: number; pos: Vector }>();
    private awake = false;

    constructor(private readonly owner: CDOTA_BaseNPC, private readonly strike: Strike, private readonly push: Push) {}

    configure(effects: FxManeuver[], awake: boolean) {
        this.awake = awake;
        this.defs.clear();
        for (const f of effects) this.defs.set(f.mode, f);
        for (const mode of this.states.keys()) if (!this.defs.has(mode)) this.clearMode(mode);
    }

    rememberWard(unit: CDOTA_BaseNPC) { this.ward = unit; }

    private ability(f: FxManeuver) { return this.owner.FindAbilityByName(f.ab); }
    private learned(f: FxManeuver) { return (this.ability(f)?.GetLevel() ?? 0) > 0; }
    private enemies(pos: Vector, range: number): CDOTA_BaseNPC[] {
        return FindUnitsInRadius(this.owner.GetTeamNumber(), pos, undefined, range, UnitTargetTeam.ENEMY, UnitTargetType.HERO,
            UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false).filter(u => fighter(u));
    }
    private line(a: Vector, b: Vector, width: number): CDOTA_BaseNPC[] {
        return FindUnitsInLine(this.owner.GetTeamNumber(), a, b, undefined, width, UnitTargetTeam.ENEMY, UnitTargetType.HERO,
            UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE).filter(u => fighter(u));
    }
    private stage(f: FxManeuver, now: number, dur: number, pos: Vector, radius = 0): Stage {
        this.clearMode(f.mode);
        const s: Stage = { f, until: now + dur, arm: now, pos };
        if (radius > 0) s.marker = ring(pos, radius);
        this.states.set(f.mode, s);
        return s;
    }
    private clearMode(mode: Mode) {
        const s = this.states.get(mode);
        if (s === undefined) return;
        this.states.delete(mode);
        for (const marker of [s.marker, s.endMarker]) {
            if (marker === undefined) continue;
            ParticleManager.DestroyParticle(marker, true);
            ParticleManager.ReleaseParticleIndex(marker);
        }
        if (s.buff !== undefined && !s.buff.IsNull()) s.buff.Destroy();
    }
    clear() {
        for (const mode of this.states.keys()) this.clearMode(mode);
        this.ward = undefined;
        this.pendingDagger = undefined;
        this.starts.clear();
        this.lastPos = undefined;
        this.movingSince = undefined;
    }
    private isReady(mode: Mode, now: number) { return now >= (this.ready.get(mode) ?? 0); }
    private cooldown(mode: Mode, now: number, cd: number) { this.ready.set(mode, now + cd); }
    private pin(u: CDOTA_BaseNPC, f: FxManeuver, duration: number) {
        if (u !== this.owner && u.IsDebuffImmune()) return undefined;
        return u.AddNewModifier(this.owner, this.ability(f), fxModifierName(f.key), { duration });
    }
    private nearMap(pos: Vector): boolean { return Math.abs(pos.x) < MAP.bounds - 32 && Math.abs(pos.y) < MAP.bounds - 32; }

    start(a: CDOTABaseAbility, now: number) {
        const ab = a.GetAbilityName();
        if (ab !== "juggernaut_omni_slash" && ab !== "ursa_earthshock" && ab !== "phantom_assassin_phantom_strike") return;
        this.starts.set(ab, { at: now, pos: this.owner.GetAbsOrigin() });
    }

    cast(a: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined, now: number) {
        if (!alive(this.owner)) return;
        const ab = a.GetAbilityName(), pos = this.owner.GetAbsOrigin();
        const started = this.starts.get(ab);
        this.starts.delete(ab);
        const from = started !== undefined && now - started.at < 1.5 ? started.pos : undefined;
        const blinked = from === undefined || distance(pos, from) >= 32;
        for (const f of this.defs.values()) {
            if (f.mode === "dagger" && ab === "phantom_assassin_phantom_strike" && blinked) {
                const s = this.states.get("dagger");
                if (s !== undefined && s.unit === target && fighter(target) && now < s.until && distance(pos, target.GetAbsOrigin()) <= 195 &&
                    distance(target.GetAbsOrigin(), s.pos) >= 170 && distance(target.GetAbsOrigin(), s.pos) <= 650) {
                    this.clearMode("dagger");
                    FindClearSpaceForUnit(this.owner, s.pos, true);
                }
            }
            if (f.mode === "blade" && ab === "phantom_assassin_phantom_strike" && blinked && this.learned(f) && this.isReady("blade", now) && fighter(target) &&
                target.GetTeamNumber() !== this.owner.GetTeamNumber()) {
                // W должен уже действительно доставить к цели, иначе Linken не даёт след.
                if (distance(pos, target.GetAbsOrigin()) <= 195) {
                    const s = this.stage(f, now, this.awake ? 5 : 4, pos, 90);
                    s.unit = target;
                    s.dir = norm(delta(pos, target.GetAbsOrigin()));
                    this.cooldown("blade", now, 9);
                }
            }
            if (f.ab !== ab) continue;
            if (f.mode === "dagger" && fighter(target)) this.pendingDagger = { unit: target, ability: a, until: now + 1.75 };
            switch (f.mode) {
                case "ward": this.ward = undefined; this.stage(f, now, 26, pos); break;
                case "omni": this.stage(f, now, Math.max(1, a.GetSpecialValueFor("duration")) + 0.9, from ?? pos, 115); break;
                case "ram": this.stage(f, now, 5.5, pos); break;
                case "sword": this.stage(f, now, Math.max(1, a.GetSpecialValueFor("AbilityDuration") || 30), pos); break;
                case "blindside": this.stage(f, now, f.seconds ?? 7, pos); break;
                case "burrow": {
                    const s = this.stage(f, now, 1.35, from ?? pos);
                    s.dir = this.owner.GetForwardVector();
                    s.arm = now + 0.35;
                    break;
                }
                case "sidestep": this.stage(f, now, 8, pos); break;
                case "windlane": {
                    const dir = norm(delta(a.GetCursorPosition(), pos));
                    if (length(dir) < 0.5) break;
                    const s = this.stage(f, now, 5, pos);
                    s.dir = dir;
                    s.end = shift(pos, dir, this.awake ? 1080 : 880);
                    break;
                }
                case "vault": this.stage(f, now, Math.max(1, a.GetSpecialValueFor("AbilityDuration") || 5), pos); break;
                case "reel":
                    if (fighter(target)) {
                        const s = this.stage(f, now, 2, target.GetAbsOrigin());
                        s.unit = target;
                    }
                    break;
            }
        }
    }

    spellHit(target: CDOTA_BaseNPC, ability: CDOTABaseAbility, now: number) {
        if (!alive(this.owner)) return;
        const f = this.defs.get("dagger");
        if (f === undefined || ability.GetAbilityName() !== f.ab || !fighter(target) || !this.isReady("dagger", now)) return;
        this.pendingDagger = undefined;
        const s = this.stage(f, now, this.awake ? 7 : 5, target.GetAbsOrigin(), 105);
        s.unit = target;
        this.cooldown("dagger", now, 7);
    }

    attack(e: ModifierAttackEvent, now: number) {
        const victim = e.target;
        if (!alive(this.owner) || !fighter(victim) || victim.GetTeamNumber() === this.owner.GetTeamNumber() || (e.no_attack_cooldown ?? false)) return;
        const pos = this.owner.GetAbsOrigin(), to = victim.GetAbsOrigin();
        const cleave = this.defs.get("rift");
        if (cleave !== undefined && this.learned(cleave)) {
            const s = this.states.get("rift");
            if (s !== undefined && now >= s.arm && now < s.until && s.end !== undefined && s.dir !== undefined) {
                const a = s.pos, b = s.end, dir = s.dir;
                this.clearMode("rift");
                for (const u of this.line(a, b, 115)) {
                    if (!u.IsDebuffImmune()) this.push(u, dir, this.awake ? 330 : 245, 0.31);
                    this.strike(u, this.owner.GetAverageTrueAttackDamage(u) * 0.65, cleave);
                }
                flash(a);
            } else if (s === undefined && this.isReady("rift", now)) {
                const dir = norm(delta(to, pos));
                const n = this.stage(cleave, now, 4, to, 115);
                n.arm = now + 0.35;
                n.dir = dir;
                n.end = shift(to, dir, this.awake ? 670 : 525);
                n.endMarker = ring(n.end, 95, 230, 165, 75);
                this.cooldown("rift", now, 7);
            }
        }

        const blade = this.states.get("blade");
        if (blade !== undefined && blade.unit === victim && now < blade.until && blade.dir !== undefined &&
            distance(pos, blade.pos) >= 170 && distance(pos, blade.pos) <= 660 && dot(blade.dir, norm(delta(pos, to))) < 0.25) {
            this.clearMode("blade");
            flash(blade.pos);
            this.strike(victim, this.owner.GetAverageTrueAttackDamage(victim) * 0.85, blade.f);
        }

        const track = this.defs.get("trailhunt");
        if (track !== undefined && this.learned(track) && this.isReady("trailhunt", now)) {
            let s = this.states.get("trailhunt");
            if (s === undefined || s.unit !== victim || now >= s.until) {
                s = this.stage(track, now, 4, to);
                s.unit = victim;
            }
            s.hits = (s.hits ?? 0) + 1;
            if (s.hits === 3) {
                s.pos = to;
                s.until = now + (this.awake ? 6 : 4.5);
                s.marker = ring(to, 110, 255, 150, 85);
                this.cooldown("trailhunt", now, 8);
            }
        }

        const reel = this.states.get("reel");
        if (reel !== undefined && reel.unit === victim && reel.phase === 1 && now < reel.until &&
            distance(pos, to) >= 285 && movable(this.owner)) {
            this.clearMode("reel");
            this.push(this.owner, norm(delta(to, pos)), Math.min(distance(pos, to) - 135, this.awake ? 540 : 410), 0.32);
        }
    }

    taken(e: ModifierInstanceEvent, now: number) {
        const s = this.states.get("parry");
        const foe = e.attacker;
        if (s === undefined || !fighter(this.owner) || !fighter(foe) || foe.GetTeamNumber() === this.owner.GetTeamNumber() ||
            e.damage_category !== DamageCategory.ATTACK || !movable(this.owner) || now >= s.until) return;
        const pos = this.owner.GetAbsOrigin(), to = foe.GetAbsOrigin();
        const dir = norm(delta(to, pos));
        if (distance(pos, to) > 330 || dot(dir, this.owner.GetForwardVector()) < 0.45) return;
        this.clearMode("parry");
        this.cooldown("parry", now, 8);
        const side = Vector(-dir.y, dir.x, 0);
        const landing = shift(to, side, 115);
        if (this.nearMap(landing)) FindClearSpaceForUnit(this.owner, landing, true);
        flash(to);
        this.pin(foe, s.f, this.awake ? 1.45 : 0.9);
        this.strike(foe, this.owner.GetAverageTrueAttackDamage(foe), s.f);
    }

    order(kind: UnitOrder, target: CDOTA_BaseNPC | undefined, point: Vector, now: number): boolean {
        const parent = this.owner;
        if (!alive(parent)) return false;
        const pos = parent.GetAbsOrigin();
        const ward = this.states.get("ward");
        if (kind === UnitOrder.MOVE_TO_TARGET && ward !== undefined && now < ward.until && target === this.ward &&
            alive(target) && movable(parent) && !parent.IsChanneling()) {
            const to = target.GetAbsOrigin();
            const dist = distance(pos, to);
            if (dist >= 240 && dist <= (this.awake ? 1100 : 850)) {
                this.clearMode("ward");
                FindClearSpaceForUnit(target, pos, true);
                FindClearSpaceForUnit(parent, to, true);
                flash(to);
                return true;
            }
        }

        const omni = this.states.get("omni");
        if (kind === UnitOrder.MOVE_TO_POSITION && omni !== undefined && now < omni.until && distance(point, omni.pos) <= 115) {
            const native = parent.FindModifierByName(JUGG_OMNI);
            if (native !== undefined || (this.awake && omni.phase === 2 && now < omni.arm)) {
                native?.Destroy();
                parent.RemoveModifierByName("modifier_juggernaut_omnislash_invulnerability");
                this.clearMode("omni");
                FindClearSpaceForUnit(parent, omni.pos, true);
                flash(omni.pos);
                return true;
            }
        }

        const sword = this.states.get("sword");
        if (sword !== undefined && now < sword.until && parent.HasModifier(SVEN_GOD)) {
            if (kind === UnitOrder.ATTACK_MOVE && distance(pos, point) <= 145 && sword.phase === undefined && movable(parent)) {
                sword.pos = pos;
                sword.marker = ring(pos, 155, 255, 160, 60);
                sword.phase = 1;
                sword.arm = now + 0.65;
                sword.until = Math.min(sword.until, now + 4.5);
                sword.buff = this.pin(parent, sword.f, sword.until - now);
                return true;
            }
            if (kind === UnitOrder.MOVE_TO_POSITION && sword.phase === 1 && now >= sword.arm &&
                distance(point, sword.pos) <= 155 && distance(pos, sword.pos) <= (this.awake ? 780 : 620) && movable(parent)) {
                const to = sword.pos;
                this.clearMode("sword");
                FindClearSpaceForUnit(parent, to, true);
                flash(to);
                for (const foe of this.enemies(to, 315)) {
                    if (!foe.IsDebuffImmune()) this.push(foe, norm(delta(foe.GetAbsOrigin(), to)), 250, 0.34);
                    this.strike(foe, 180, sword.f);
                }
                return true;
            }
        }
        return false;
    }

    tick(now: number) {
        const owner = this.owner, pos = owner.GetAbsOrigin();
        const motion = this.lastPos === undefined ? Vector(0, 0, 0) : delta(pos, this.lastPos);
        const speed = length(motion);
        this.lastPos = pos;
        if (speed > 13 && speed < 115) { this.lastMove = now; this.movingSince ??= now; }
        else this.movingSince = undefined;

        const dagger = this.pendingDagger;
        if (dagger !== undefined) {
            if (!fighter(dagger.unit) || now >= dagger.until) this.pendingDagger = undefined;
            else if (dagger.unit.FindAllModifiers().some(m =>
                m.GetName() === "modifier_phantom_assassin_stiflingdagger" && m.GetCaster() === owner))
                this.spellHit(dagger.unit, dagger.ability, now);
        }
        const parry = this.defs.get("parry");
        if (parry !== undefined && this.learned(parry) && !this.states.has("parry") && this.isReady("parry", now) &&
            now - this.lastMove >= 0.55 && now - this.lastMove <= 0.75 && this.enemies(pos, 360).length > 0 && movable(owner)) {
            this.stage(parry, now, 0.8, pos, 135);
            this.cooldown("parry", now, 5);
        }
        for (const [mode, s] of this.states) {
            if (now >= s.until) { this.clearMode(mode); continue; }
            switch (mode) {
                case "parry": if (speed > 16) this.clearMode(mode); break;
                case "omni":
                    if (owner.HasModifier(JUGG_OMNI)) s.phase = 1;
                    else if (s.phase === 1) {
                        if (!this.awake) this.clearMode(mode);
                        else { s.phase = 2; s.arm = Math.min(s.until, now + 0.85); }
                    } else if (s.phase === 2 && now >= s.arm) this.clearMode(mode);
                    break;
                case "ram": this.tickRam(s, pos, motion, now); break;
                case "sword":
                    if (s.phase === 1 && (!owner.HasModifier(SVEN_GOD) ||
                        (now >= s.arm + 0.65 && this.enemies(s.pos, 125).length > 0))) this.clearMode(mode);
                    break;
                case "dagger":
                    if (!fighter(s.unit)) { this.clearMode(mode); break; }
                    if (distance(s.unit.GetAbsOrigin(), s.pos) > 155) s.phase = 1;
                    if (s.phase === 1 && this.enemies(s.pos, 90).length > 0) this.clearMode(mode);
                    break;
                case "blindside":
                    if (!owner.HasModifier(PA_BLUR)) break;
                    for (const foe of this.enemies(pos, this.awake ? 385 : 460)) {
                        if (dot(foe.GetForwardVector(), norm(delta(pos, foe.GetAbsOrigin()))) > 0.52) {
                            owner.RemoveModifierByName(PA_BLUR);
                            this.clearMode(mode);
                            break;
                        }
                    }
                    break;
                case "burrow": this.tickBurrow(s, pos, now); break;
                case "sidestep": this.tickSidestep(s, pos, motion); break;
                case "trailhunt": this.tickTrail(s, pos, motion); break;
                case "reel":
                    if (s.phase === undefined && fighter(s.unit) && s.unit.FindAllModifiers().some(m =>
                        m.GetName() === "modifier_windrunner_shackle_shot" && m.GetCaster() === owner)) {
                        s.phase = 1;
                        s.until = now + (this.awake ? 4.2 : 3);
                        s.marker = ring(s.unit.GetAbsOrigin(), 115);
                    }
                    if (s.marker !== undefined && fighter(s.unit)) ParticleManager.SetParticleControl(s.marker, 0, s.unit.GetAbsOrigin());
                    break;
                case "windlane": this.tickWind(s, now); break;
                case "vault": this.tickVault(s, pos, motion); break;
            }
        }
    }

    private tickRam(s: Stage, pos: Vector, motion: Vector, now: number) {
        const running = this.movingSince !== undefined && movable(this.owner);
        const dir = norm(motion);
        if (!running || s.dir === undefined || dot(s.dir, dir) < 0.82) {
            if (s.marker !== undefined) {
                ParticleManager.DestroyParticle(s.marker, true);
                ParticleManager.ReleaseParticleIndex(s.marker);
                s.marker = undefined;
            }
            s.dir = running ? dir : undefined;
            s.arm = now + (this.awake ? 0.45 : 0.63);
            return;
        }
        if (now < s.arm) return;
        if (s.marker === undefined) s.marker = ring(pos, 105, 255, 170, 65);
        else ParticleManager.SetParticleControl(s.marker, 0, pos);
        const foe = this.enemies(pos, 170).find(u => !u.IsDebuffImmune() && dot(dir, norm(delta(u.GetAbsOrigin(), pos))) > 0.45);
        if (foe === undefined) return;
        this.clearMode("ram");
        this.push(foe, dir, 380, 0.42);
        this.push(this.owner, dir, 270, 0.42);
        flash(pos);
    }

    private tickBurrow(s: Stage, pos: Vector, now: number) {
        if (now < s.arm || s.dir === undefined) return;
        if (s.end === undefined) {
            const center = distance(s.pos, pos) >= 70 ? pos : shift(s.pos, s.dir, 205);
            s.end = center;
            s.arm = now + 0.4;
            s.marker = ring(center, 200, 225, 159, 95);
            return;
        }
        const center = s.end, dir = s.dir;
        const max = this.awake ? 2 : 1;
        this.clearMode("burrow");
        let moved = 0;
        for (const foe of this.enemies(center, 200)) {
            if (foe.IsDebuffImmune() || dot(dir, norm(delta(foe.GetAbsOrigin(), s.pos))) < 0.3) continue;
            this.push(foe, Vector(-dir.x, -dir.y, 0), 365, 0.33);
            if (++moved >= max) break;
        }
    }

    private tickSidestep(s: Stage, pos: Vector, motion: Vector) {
        if (length(motion) < 18 || length(motion) > 115 || this.owner.IsAttacking() || !movable(this.owner)) return;
        const mod = this.owner.FindModifierByName("modifier_ursa_overpower");
        if (mod === undefined || mod.GetStackCount() <= 0) return;
        const dir = norm(motion);
        const foe = this.enemies(pos, this.awake ? 255 : 205).find(u => Math.abs(dot(dir, norm(delta(u.GetAbsOrigin(), pos)))) < 0.5);
        if (foe === undefined) return;
        this.clearMode("sidestep");
        if (mod.GetStackCount() <= 1) mod.Destroy(); else mod.DecrementStackCount();
        flash(foe.GetAbsOrigin());
        this.strike(foe, this.owner.GetAverageTrueAttackDamage(foe), s.f);
    }

    private tickTrail(s: Stage, pos: Vector, motion: Vector) {
        if ((s.hits ?? 0) < 3 || !fighter(s.unit)) return;
        const to = s.unit.GetAbsOrigin();
        if (s.end === undefined && distance(s.pos, to) >= 230 && distance(s.pos, to) <= 625 &&
            this.enemies(s.pos, 650).includes(s.unit)) {
            s.end = to;
            s.endMarker = ring(to, 90, 255, 150, 85);
        }
        if (s.end === undefined || distance(pos, s.pos) > 105 || length(motion) < 12 || length(motion) > 115 || !movable(this.owner)) return;
        const dir = norm(delta(s.end, s.pos));
        if (dot(dir, norm(motion)) < 0.6) return;
        this.clearMode("trailhunt");
        this.push(this.owner, dir, Math.min(distance(pos, s.end), 500), 0.35);
    }

    private tickWind(s: Stage, now: number) {
        if (s.dir === undefined || s.end === undefined || this.owner.IsChanneling()) return;
        if (s.phase === undefined) {
            s.phase = 1;
            s.arm = now + 0.35;
            s.until = now + 3.2;
            s.marker = ring(shift(s.pos, s.dir, 265), 120, 155, 245, 180);
            s.endMarker = ring(s.end, 125, 155, 245, 180);
            const fx = ParticleManager.CreateParticle(WIND, ParticleAttachment.WORLDORIGIN, undefined);
            ParticleManager.SetParticleControl(fx, 0, s.pos);
            ParticleManager.SetParticleControl(fx, 1, s.end);
            ParticleManager.ReleaseParticleIndex(fx);
            return;
        }
        if (now < s.arm) return;
        const units = FindUnitsInLine(this.owner.GetTeamNumber(), s.pos, s.end, undefined, 125, UnitTargetTeam.BOTH, UnitTargetType.HERO,
            UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE);
        for (const u of units) {
            if (!fighter(u) || !movable(u) || !u.IsMoving() || dot(u.GetForwardVector(), s.dir) < 0.76) continue;
            const dir = s.dir;
            this.clearMode("windlane");
            this.push(u, dir, this.awake ? 535 : 420, 0.36);
            return;
        }
    }

    private tickVault(s: Stage, pos: Vector, motion: Vector) {
        if (length(motion) < 5 || length(motion) > 110 || !movable(this.owner) || !this.owner.HasModifier("modifier_windrunner_windrun")) return;
        const dir = norm(motion);
        const passable = (p: Vector) => this.nearMap(p) && GridNav.IsTraversable(p) && !GridNav.IsBlocked(p);
        const vaultTo = (to: Vector): boolean => {
            if (Math.abs(to.z - pos.z) > 150 || !passable(to) || !passable(shift(to, dir, 40))) return false;
            this.clearMode("vault");
            FindClearSpaceForUnit(this.owner, to, true);
            flash(to);
            return true;
        };
        const inWay = this.enemies(pos, 130).find(u => dot(dir, norm(delta(u.GetAbsOrigin(), pos))) > 0.87);
        if (inWay !== undefined && vaultTo(GetGroundPosition(shift(inWay.GetAbsOrigin(), dir, 165), this.owner))) return;
        if (passable(shift(pos, dir, 65))) return;
        for (let d = 155; d <= (this.awake ? 375 : 285); d += 55) {
            const to = GetGroundPosition(shift(pos, dir, d), this.owner);
            if (vaultTo(to)) return;
        }
    }
}
