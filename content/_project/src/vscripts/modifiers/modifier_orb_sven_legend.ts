import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";
import { bonusesOf } from "../core/orbstore";
import { MAP } from "../core/mapinfo";

declare global {
    var modifier_orb_sven_armor_cut: unknown;
    var modifier_orb_sven_legend: unknown;
    var modifier_orb_sven_blade_ready: unknown;
    var modifier_orb_sven_ram_build: unknown;
    var modifier_orb_sven_ram_ready: unknown;
    var modifier_orb_sven_weight_ready: unknown;
    var modifier_orb_sven_weight_windup: unknown;
}

const CLEAVE = "sven_great_cleave";
const WARCRY = "sven_warcry";
const GOD = "sven_gods_strength";
const REDIRECT = "orb_sven_redirect";
const WEIGHT = "orb_sven_weight";
const BLADE_ICON = "modifier_orb_sven_blade_ready";
const RAM_BUILD = "modifier_orb_sven_ram_build";
const RAM_READY = "modifier_orb_sven_ram_ready";
const WEIGHT_ICON = "modifier_orb_sven_weight_ready";
const WINDUP = "modifier_orb_sven_weight_windup";
const RAM_BUFF = "modifier_sven_warcry";
const GOD_BUFF = "modifier_sven_gods_strength";
const ARMOR_CUT = "modifier_orb_sven_armor_cut";
const CLEAVE_FX = "particles/units/heroes/hero_sven/sven_spell_great_cleave.vpcf";
const HEAVY_FX = "particles/units/heroes/hero_sven/sven_spell_great_cleave_gods_strength_crit.vpcf";
const WAR_FX = "particles/units/heroes/hero_sven/sven_spell_warcry_wave.vpcf";
const EDGE_FX = "particles/units/heroes/hero_juggernaut/juggernaut_omni_dash.vpcf";
const SWORD_MODEL = "models/heroes/sven/sven_sword_alt.vmdl";
const THINK = 0.05;
const LAUNCH_LIFE = 1.6;
const CATCH = 450;
const RAM_TIME = 0.28;
const HALF_CONE = 42 * Math.PI / 180;
const WINDUP_TIME = 0.6;

const now = () => GameRules.GetGameTime();
function delta(a: Vector, b: Vector): Vector { return Vector(a.x - b.x, a.y - b.y, 0); }
function length(v: Vector): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
function normal(v: Vector): Vector {
    const d = Math.max(0.01, length(v));
    return Vector(v.x / d, v.y / d, 0);
}
function dot(a: Vector, b: Vector): number { return a.x * b.x + a.y * b.y; }
function shift(a: Vector, dir: Vector, d: number, height = 0): Vector {
    return Vector(a.x + dir.x * d, a.y + dir.y * d, a.z + height);
}
function rotate(a: Vector, angle: number): Vector {
    return Vector(a.x * Math.cos(angle) - a.y * Math.sin(angle), a.x * Math.sin(angle) + a.y * Math.cos(angle), 0);
}
function alive(u?: CDOTA_BaseNPC): u is CDOTA_BaseNPC { return u !== undefined && IsValidEntity(u) && u.IsAlive(); }
function clear(m?: CDOTA_Buff) { if (m !== undefined && !m.IsNull()) m.Destroy(); }
function clearFX(id: ParticleID) {
    ParticleManager.DestroyParticle(id, true);
    ParticleManager.ReleaseParticleIndex(id);
}
function flash(path: string, from: Vector, dir: Vector, length: number): ParticleID {
    const p = ParticleManager.CreateParticle(path, ParticleAttachment.WORLDORIGIN, undefined);
    ParticleManager.SetParticleControl(p, 0, from);
    ParticleManager.SetParticleControl(p, 1, shift(from, dir, length));
    ParticleManager.SetParticleControlForward(p, 0, dir);
    return p;
}
function free(p: Vector): boolean {
    return Math.abs(p.x) < MAP.bounds - 40 && Math.abs(p.y) < MAP.bounds - 40 &&
        GridNav.IsTraversable(p) && !GridNav.IsBlocked(p);
}
function canMove(u: CDOTA_BaseNPC): boolean {
    return !u.IsStunned() && !u.IsRooted() && !u.IsCurrentlyHorizontalMotionControlled() &&
        !u.HasModifier("modifier_slark_pounce_leash") && !u.HasModifier("modifier_puck_dream_coil");
}

class ArmorCut extends ModBase {
    IsHidden() { return false; }
    IsDebuff() { return true; }
    IsPurgable() { return true; }
    GetTexture() { return GOD; }
    DeclareFunctions() { return [ModifierFunction.PHYSICAL_ARMOR_BONUS]; }
    GetModifierPhysicalArmorBonus() { return -2.5 * this.GetStackCount(); }
}

class BladeReady extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return CLEAVE; }
}
class RamBuild extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return WARCRY; }
}
class RamReady extends RamBuild {
    GetTexture() { return "sven_storm_bolt_secondary"; }
    GetEffectName() { return "particles/units/heroes/hero_sven/sven_warcry_buff.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
}
class WeightReady extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    GetTexture() { return "sven_wrath_of_god"; }
}
class WeightWindup extends WeightReady {
    GetEffectName() { return "particles/units/heroes/hero_sven/sven_spell_gods_strength_glow.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
}

interface Blade {
    pos: Vector;
    dir: Vector;
    last: number;
    ends: number;
    nextFlash: number;
    redirected: boolean;
    struck: Set<EntityIndex>;
    model?: CBaseEntity;
    icon?: CDOTA_Buff;
    ability: CDOTABaseAbility;
}
interface Run {
    ability: CDOTABaseAbility;
    grace: number;
    last: Vector;
    dir?: Vector;
    stride: number;
    armed: boolean;
    icon?: CDOTA_Buff;
}
interface Swing {
    ability: CDOTABaseAbility;
    dir: Vector;
    range: number;
    cost: number;
    icon?: CDOTA_Buff;
    marks: ParticleID[];
}

export class SvenLegends extends ModBase {
    private blade?: Blade;
    private run?: Run;
    private swing?: Swing;
    private bladeCooldown = 0;
    private cleaveShown = false;
    private weightShown = false;
    private weightSpent = false;
    private god?: CDOTA_Buff;
    private weightIcon?: CDOTA_Buff;
    private godHits = new Map<EntityIndex, number>();
    private godAdded = 0;

    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    OnCreated() { if (IsServer()) this.StartIntervalThink(THINK); }
    DeclareFunctions() { return [ModifierFunction.ON_ATTACK_LANDED, ModifierFunction.ON_ABILITY_FULLY_CAST, ModifierFunction.ON_DEATH]; }

    private bonuses() { return bonusesOf(this.GetParent().GetPlayerOwnerID(), true, now()); }

    private swap(native: string, alt: string, show: boolean): boolean {
        const hero = this.GetParent();
        const original = hero.FindAbilityByName(native);
        const extra = hero.FindAbilityByName(alt) ?? (show ? hero.AddAbility(alt) : undefined);
        if (original === undefined || extra === undefined) return false;
        if (show) {
            extra.SetLevel(native === CLEAVE ? original.GetLevel() : 1);
            hero.SwapAbilities(native, alt, native === CLEAVE, true);
        } else {
            hero.SwapAbilities(alt, native, false, true);
        }
        original.SetHidden(show);
        extra.SetHidden(!show);
        original.MarkAbilityButtonDirty();
        extra.MarkAbilityButtonDirty();
        return show;
    }

    private enemies(point: Vector, radius: number): CDOTA_BaseNPC[] {
        const hero = this.GetParent();
        return FindUnitsInRadius(hero.GetTeamNumber(), point, undefined, radius,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.MAGIC_IMMUNE_ENEMIES, FindOrder.CLOSEST, false)
            .filter(unit => this.enemy(unit));
    }

    private enemy(u?: CDOTA_BaseNPC): u is CDOTA_BaseNPC {
        return alive(u) && u.IsRealHero() && !u.IsIllusion() && !u.IsOutOfGame() && !u.IsInvulnerable() &&
            u.GetTeamNumber() !== this.GetParent().GetTeamNumber();
    }

    private hit(u: CDOTA_BaseNPC, ability: CDOTABaseAbility, amount: number) {
        if (u.IsAttackImmune()) return;
        ApplyDamage({ victim: u, attacker: this.GetParent(), ability, damage: amount,
            damage_type: DamageTypes.PHYSICAL, damage_flags: DamageFlag.NO_SPELL_AMPLIFICATION });
    }

    private godAttack(target: CDOTA_BaseNPC) {
        const hero = this.GetParent(), b = this.bonuses();
        const shred = (b.code["sven_p_untamed"] ?? 0) > 0;
        const extend = (b.code["sven_p_eternal"] ?? 0) > 0;
        if (!shred && !extend) return;
        const god = this.syncGod();
        if (god === undefined || god.GetRemainingTime() <= 0) return;
        const ability = hero.FindAbilityByName(GOD);
        const id = target.entindex(), hits = this.godHits.get(id) ?? 0;
        if (shred && hits < 2 && !target.IsDebuffImmune()) {
            this.godHits.set(id, hits + 1);
            target.AddNewModifier(hero, ability, ARMOR_CUT, { duration: 5 })?.SetStackCount(hits + 1);
        }
        if (extend && this.godAdded < 3) {
            this.godAdded += 0.5;
            god.SetDuration(god.GetRemainingTime() + 0.5, true);
        }
    }

    OnAttackLanded(e: ModifierAttackEvent) {
        const hero = this.GetParent(), at = now();
        if (!IsServer() || e.attacker !== hero || e.no_attack_cooldown || e.damage <= 0 || !this.enemy(e.target)) return;
        this.godAttack(e.target);
        if (!this.cleaveShown || hero.PassivesDisabled() || this.blade !== undefined || at < this.bladeCooldown) return;
        const ability = hero.FindAbilityByName(CLEAVE);
        if (ability === undefined || ability.GetLevel() === 0) return;
        const target = e.target.GetAbsOrigin();
        const offset = delta(target, hero.GetAbsOrigin());
        const dir = length(offset) > 5 ? normal(offset) : hero.GetForwardVector();
        const pos = GetGroundPosition(shift(target, dir, 125), hero);
        if (Math.abs(pos.x) >= MAP.bounds || Math.abs(pos.y) >= MAP.bounds) return;
        const model = SpawnEntityFromTableSynchronous("prop_dynamic", { model: SWORD_MODEL, solid: 0, disableshadows: 1 });
        this.blade = { pos, dir, last: at, ends: at + LAUNCH_LIFE, nextFlash: at, redirected: false,
            struck: new Set([e.target.entindex()]), model, ability,
            icon: hero.AddNewModifier(hero, ability, BLADE_ICON, { duration: LAUNCH_LIFE }) };
        this.bladeCooldown = at + 7;
        this.drawBlade(this.blade, at);
    }

    CanRedirect(point: Vector): boolean {
        const blade = this.blade, hero = this.GetParent();
        return blade !== undefined && !blade.redirected && now() < blade.ends && !hero.PassivesDisabled() &&
            length(delta(blade.pos, hero.GetAbsOrigin())) <= CATCH &&
            Math.abs(blade.pos.z - hero.GetAbsOrigin().z) <= 160 && length(delta(point, blade.pos)) > 35;
    }

    Redirect(point: Vector) {
        const blade = this.blade;
        if (blade === undefined || !this.CanRedirect(point)) return;
        const at = now();
        blade.redirected = true;
        blade.dir = normal(delta(point, blade.pos));
        blade.ends = at + (this.bonuses().awake ? 1.25 : 1.05);
        blade.last = at;
        blade.nextFlash = at;
        blade.struck.clear();
        clear(blade.icon);
        blade.icon = undefined;
        this.drawBlade(blade, at);
        EmitSoundOn("Hero_Sven.Attack", this.GetParent());
    }

    private drawBlade(blade: Blade, at: number) {
        if (blade.model !== undefined && IsValidEntity(blade.model)) {
            blade.model.SetAbsOrigin(shift(blade.pos, blade.dir, 0, 64));
            blade.model.SetAngles(0, Math.atan2(blade.dir.y, blade.dir.x) * 180 / Math.PI, 85);
        }
        if (at >= blade.nextFlash) {
            blade.nextFlash = at + 0.14;
            const p = flash(blade.redirected ? HEAVY_FX : CLEAVE_FX, shift(blade.pos, blade.dir, 0, 48), blade.dir, 130);
            ParticleManager.ReleaseParticleIndex(p);
        }
    }

    private clearBlade() {
        clear(this.blade?.icon);
        const model = this.blade?.model;
        if (model !== undefined && IsValidEntity(model)) UTIL_Remove(model);
        this.blade = undefined;
    }

    private tickBlade(at: number) {
        const blade = this.blade;
        if (blade === undefined) return;
        const hero = this.GetParent();
        const pos = GetGroundPosition(shift(blade.pos, blade.dir, (blade.redirected ? 700 : 260) *
            (Math.min(at, blade.ends) - blade.last)), hero);
        if (Math.abs(pos.x) >= MAP.bounds || Math.abs(pos.y) >= MAP.bounds) { this.clearBlade(); return; }
        const foes = FindUnitsInLine(hero.GetTeamNumber(), blade.pos, pos, undefined, blade.redirected ? 135 : 105,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.MAGIC_IMMUNE_ENEMIES);
        for (const foe of foes) {
            if (!this.enemy(foe) || blade.struck.has(foe.entindex()) || Math.abs(foe.GetAbsOrigin().z - pos.z) > 160) continue;
            blade.struck.add(foe.entindex());
            const damage = hero.GetAverageTrueAttackDamage(foe);
            this.hit(foe, blade.ability, blade.redirected ? Math.min(950, 1.55 * damage + 110) : Math.min(500, 0.72 * damage + 80));
        }
        blade.pos = pos;
        blade.last = at;
        if (at >= blade.ends) this.clearBlade();
        else this.drawBlade(blade, at);
    }

    OnAbilityFullyCast(e: ModifierAbilityEvent) {
        const hero = this.GetParent();
        if (!IsServer() || e.unit !== hero || e.ability === undefined) return;
        const name = e.ability.GetAbilityName(), b = this.bonuses();
        if (name === WARCRY && (b.code["sven_l_steeltempo"] ?? 0) > 0) {
            this.clearRun();
            this.run = { ability: e.ability, grace: now() + 0.15, last: hero.GetAbsOrigin(), stride: 0, armed: false };
        }
        if (name === GOD) {
            this.weightSpent = false;
            this.godHits.clear();
            this.godAdded = 0;
        }
    }

    private clearRun() {
        clear(this.run?.icon);
        this.run = undefined;
    }

    private tickRun(at: number, awakened: boolean) {
        const s = this.run, hero = this.GetParent();
        if (s === undefined) return;
        const buff = hero.FindModifierByName(RAM_BUFF);
        if (buff === undefined) { if (at > s.grace) this.clearRun(); return; }
        if (s.icon === undefined) s.icon = hero.AddNewModifier(hero, s.ability, RAM_BUILD, { duration: buff.GetRemainingTime() });
        const p = hero.GetAbsOrigin(), motion = delta(p, s.last), step = length(motion);
        s.last = p;
        const running = step >= 3 && step <= 100 && hero.IsMoving() && canMove(hero);
        const dir = normal(motion);
        if (!running || (s.dir !== undefined && dot(dir, s.dir) < 0.86)) {
            if (s.armed) {
                clear(s.icon);
                s.icon = hero.AddNewModifier(hero, s.ability, RAM_BUILD, { duration: buff.GetRemainingTime() });
            }
            s.stride = 0;
            s.dir = undefined;
            s.armed = false;
        }
        if (!running) return;
        s.dir ??= dir;
        s.stride += step;
        if (s.stride < (awakened ? 150 : 220)) return;
        if (!s.armed) {
            s.armed = true;
            clear(s.icon);
            s.icon = hero.AddNewModifier(hero, s.ability, RAM_READY, { duration: buff.GetRemainingTime() });
            ParticleManager.ReleaseParticleIndex(flash(WAR_FX, p, dir, 135));
        }
        const victim = this.enemies(p, 175).find(foe => !foe.IsDebuffImmune() && !foe.IsAttackImmune() &&
            !foe.IsCurrentlyHorizontalMotionControlled() && dot(dir, normal(delta(foe.GetAbsOrigin(), p))) > 0.66 &&
            Math.abs(foe.GetAbsOrigin().z - p.z) < 120);
        if (victim !== undefined) this.ram(victim, s.ability, dir);
    }

    private ram(victim: CDOTA_BaseNPC, ability: CDOTABaseAbility, dir: Vector) {
        const hero = this.GetParent(), start = victim.GetAbsOrigin(), origin = hero.GetAbsOrigin();
        let room = 0, wall = false;
        for (let d = 40; d <= 360; d += 40) {
            const p = GetGroundPosition(shift(start, dir, d + 36), victim);
            if (!free(p) || Math.abs(p.z - start.z) > 100) { wall = true; break; }
            room = d;
        }
        this.clearRun();
        const push = (unit: CDOTA_BaseNPC, amount: number) => {
            if (amount <= 0) return;
            const p = shift(unit.GetAbsOrigin(), dir, -60);
            unit.AddNewModifier(hero, ability, "modifier_knockback", { duration: RAM_TIME, knockback_duration: RAM_TIME,
                center_x: p.x, center_y: p.y, center_z: p.z, knockback_distance: amount, knockback_height: 0, should_stun: 0 });
        };
        push(victim, room);
        const gap = Math.max(0, Math.min(55, dot(delta(start, origin), dir) - 105));
        const follow = room + gap;
        const end = GetGroundPosition(shift(origin, dir, follow), hero);
        if (free(end) && GridNav.CanFindPath(origin, end)) push(hero, follow);
        ParticleManager.ReleaseParticleIndex(flash(WAR_FX, start, dir, Math.max(70, room)));
        this.hit(victim, ability, wall ? Math.min(1100, 2.1 * hero.GetAverageTrueAttackDamage(victim) + 180)
            : Math.min(540, hero.GetAverageTrueAttackDamage(victim) + 75));
        if (wall && alive(victim)) {
            victim.AddNewModifier(hero, ability, "modifier_stunned", { duration: 0.9 + (room > 0 ? RAM_TIME : 0) });
            ParticleManager.ReleaseParticleIndex(flash(HEAVY_FX, shift(start, dir, room), dir, 160));
        }
        EmitSoundOn("Hero_Sven.StormBoltImpact", victim);
    }

    private weightCost(): number { return this.bonuses().awake ? 5 : 7; }

    CanSwing(): boolean {
        const hero = this.GetParent();
        return this.weightShown && !this.weightSpent && !hero.IsDisarmed() &&
            (this.god?.GetRemainingTime() ?? 0) >= this.weightCost() + WINDUP_TIME;
    }

    BeginSwing(point: Vector, ability: CDOTABaseAbility): boolean {
        if (!IsServer() || !this.CanSwing()) return false;
        this.CancelSwing();
        const hero = this.GetParent(), origin = hero.GetAbsOrigin(), offset = delta(point, origin);
        const dir = length(offset) > 10 ? normal(offset) : hero.GetForwardVector();
        const range = this.bonuses().awake ? 725 : 625;
        const marks: ParticleID[] = [];
        for (const angle of [-HALF_CONE, 0, HALF_CONE]) {
            marks.push(flash(EDGE_FX, shift(origin, dir, 0, 35), rotate(dir, angle), range));
        }
        this.swing = { dir, range, marks, ability, cost: this.weightCost(),
            icon: hero.AddNewModifier(hero, ability, WINDUP, { duration: WINDUP_TIME }) };
        return true;
    }

    CancelSwing() {
        if (this.swing === undefined) return;
        for (const p of this.swing.marks) clearFX(p);
        clear(this.swing.icon);
        this.swing = undefined;
    }

    Swing() {
        const s = this.swing, hero = this.GetParent(), god = this.god;
        this.CancelSwing();
        if (s === undefined || god === undefined || god.IsNull() || hero.IsDisarmed() || this.weightSpent ||
            god.GetRemainingTime() < s.cost || hero.FindModifierByName(GOD_BUFF) !== god) return;
        this.weightSpent = true;
        god.SetDuration(god.GetRemainingTime() - s.cost, true);
        this.hideWeight();
        const origin = hero.GetAbsOrigin();
        for (const angle of [-HALF_CONE / 2, 0, HALF_CONE / 2]) {
            ParticleManager.ReleaseParticleIndex(flash(HEAVY_FX, origin, rotate(s.dir, angle), s.range));
        }
        EmitSoundOn("Hero_Sven.Attack", hero);
        let main = true;
        for (const foe of this.enemies(origin, s.range)) {
            const p = foe.GetAbsOrigin(), gap = delta(p, origin);
            if (foe.IsAttackImmune() || Math.abs(p.z - origin.z) > 160 ||
                (length(gap) > 18 && dot(s.dir, normal(gap)) < Math.cos(HALF_CONE))) continue;
            this.hit(foe, s.ability, Math.min(1550, 2.6 * hero.GetAverageTrueAttackDamage(foe) + 100) * (main ? 1 : 0.55));
            main = false;
        }
    }

    private hideWeight() {
        this.CancelSwing();
        clear(this.weightIcon);
        this.weightIcon = undefined;
        if (this.weightShown) this.weightShown = this.swap(GOD, WEIGHT, false);
    }

    private syncGod() {
        const god = this.GetParent().FindModifierByName(GOD_BUFF);
        if (this.god !== god) {
            this.hideWeight();
            this.god = god;
            this.weightSpent = false;
            this.godHits.clear();
            this.godAdded = 0;
        }
        return god;
    }

    private tickWeight(enabled: boolean) {
        const hero = this.GetParent(), god = this.syncGod();
        const time = (god?.GetRemainingTime() ?? 0) - this.weightCost();
        if (!enabled || this.weightSpent || time < (this.swing === undefined ? WINDUP_TIME : 0)) {
            this.hideWeight();
        } else if (!this.weightShown) {
            this.weightShown = this.swap(GOD, WEIGHT, true);
            if (this.weightShown) this.weightIcon = hero.AddNewModifier(hero, hero.FindAbilityByName(GOD), WEIGHT_ICON, { duration: time - WINDUP_TIME });
        } else if (this.swing === undefined && this.weightIcon !== undefined && !this.weightIcon.IsNull()) {
            const remaining = time - WINDUP_TIME;
            if (Math.abs(this.weightIcon.GetRemainingTime() - remaining) > 0.2) this.weightIcon.SetDuration(remaining, true);
        }
    }

    OnIntervalThink() {
        if (!IsServer() || !alive(this.GetParent())) return;
        const b = this.bonuses(), at = now();
        const w = (b.code["sven_l_cleave"] ?? 0) > 0;
        if (w !== this.cleaveShown) this.cleaveShown = this.swap(CLEAVE, REDIRECT, w);
        if (w) this.tickBlade(at); else this.clearBlade();
        if ((b.code["sven_l_steeltempo"] ?? 0) > 0) this.tickRun(at, b.awake); else this.clearRun();
        this.tickWeight((b.code["sven_l_avatar"] ?? 0) > 0);
    }

    private clearCombat() {
        this.clearBlade();
        this.clearRun();
        this.hideWeight();
        this.god = undefined;
        this.weightSpent = false;
        this.godHits.clear();
        this.godAdded = 0;
    }

    OnDeath(e: ModifierInstanceEvent) { if (IsServer() && e.unit === this.GetParent()) this.clearCombat(); }
    OnDestroy() {
        if (!IsServer()) return;
        this.clearCombat();
        if (this.cleaveShown) this.cleaveShown = this.swap(CLEAVE, REDIRECT, false);
    }
}

modifier_orb_sven_armor_cut = registerModifier("modifier_orb_sven_armor_cut", ArmorCut);
modifier_orb_sven_legend = registerModifier("modifier_orb_sven_legend", SvenLegends);
modifier_orb_sven_blade_ready = registerModifier("modifier_orb_sven_blade_ready", BladeReady);
modifier_orb_sven_ram_build = registerModifier("modifier_orb_sven_ram_build", RamBuild);
modifier_orb_sven_ram_ready = registerModifier("modifier_orb_sven_ram_ready", RamReady);
modifier_orb_sven_weight_ready = registerModifier("modifier_orb_sven_weight_ready", WeightReady);
modifier_orb_sven_weight_windup = registerModifier("modifier_orb_sven_weight_windup", WeightWindup);
