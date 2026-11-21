import { bonusAbilityCharges } from "../core/orbstore";
// Исполнитель эффектов сфер-кода (core/fxdata.ts) на герое. Создается модификатором
// modifier_orb_hero и получает от него события: применение способности, урон, атака,
// смерть, тик. Работает только на сервере. Свойства баффов — modifiers/modifier_orb_fx.ts.

import { advanceCombo, insideRing, tetherBand, ComboState } from "../core/combatpatterns";
import type { FxCombo, FxZone, FxTether, FxMark, FxGuard, FxWire } from "../core/fxtypes";
import type { FxActions, FxDebuff, FxDef, FxNum, FxTrap, FxTrail } from "../core/fxtypes";
import { fxModifierName } from "../core/fxtypes";
import { fxNum, fxOfOrb, fxView } from "../core/fxutil";
import type { OrbBonuses } from "../core/orbstore";
import { ZeusLegends } from "./zeuslegends";
import { HeroManeuvers } from "./heromaneuvers";
import type { FxManeuver } from "../core/fxtypes";

const CHAIN_PFX = "particles/items_fx/chain_lightning.vpcf";
const STORM_PFX = "particles/units/heroes/hero_zuus/zuus_lightning_bolt.vpcf";
const RING_PFX = "particles/ui_mouseactions/range_display.vpcf";
const WIRE_END_RADIUS = 90;
const WIRE_PFX = "particles/units/heroes/hero_razor/razor_static_link.vpcf";
const REWIND_PFX = "particles/units/heroes/hero_weaver/weaver_timelapse.vpcf";

function length2D(x: number, y: number): number { return Math.sqrt(x * x + y * y); }

function nearWireEnd(pos: Vector, end: Vector): boolean {
    return Math.abs(pos.z - end.z) < 135 && length2D(pos.x - end.x, pos.y - end.y) <= WIRE_END_RADIUS;
}

interface Trap {
    f: FxTrap;
    pos: Vector;
    armAt: number;
    until: number;
    mark?: ParticleID;
}

interface TrailPoint {
    f: FxTrail;
    pos: Vector;
    until: number;
    fx?: ParticleID;
}

interface Pending {
    at: number;
    run: () => void;
}

interface OrbMark {
    at: number;
    castAt?: number;
    mod: CDOTA_Buff;
    spent: boolean;
}

function isEnemy(parent: CDOTA_BaseNPC, u: CDOTA_BaseNPC | undefined): u is CDOTA_BaseNPC {
    return u !== undefined && IsValidEntity(u) && u.GetTeamNumber() !== parent.GetTeamNumber() && !u.IsBuilding();
}

function damageType(t: string | undefined): DamageTypes {
    if (t === "phys") return DamageTypes.PHYSICAL;
    if (t === "pure") return DamageTypes.PURE;
    return DamageTypes.MAGICAL;
}

export class FxEngine {
    parent: CDOTA_BaseNPC;
    /** Активные эффекты (по взятым сферам) и версия бонусов, по которой они собраны. */
    private list: FxDef[] = [];
    private listFor?: OrbBonuses;
    private awake = false;
    /** Когда последний раз применена способность, ее цель и точка. */
    private lastCast = new Map<string, number>();
    private lastTarget = new Map<string, CDOTA_BaseNPC>();
    private lastPoint = new Map<string, Vector>();
    /** Сколько дополнительных зарядов уже выдано этой способности. Расход и таймер ведёт Дота. */
    private grantedCharges = new Map<CDOTABaseAbility, number>();
    /** Счетчики атак по цели (для every) и внутренние перезарядки по цели. */
    private hits = new Map<string, number>();
    private icd = new Map<string, number>();
    private pending: Pending[] = [];
    private stillSince = 0;
    private lastPos?: Vector;
    private lastAura = 0;
    /** Наш собственный урон сейчас наносится — не запускать эффекты повторно. */
    private applying = false;
    /** Механики: ловушки, следы, самоприменение. */
    private traps: Trap[] = [];
    private trail: TrailPoint[] = [];
    private lastTrailAt = 0;
    private lastTrailTick = 0;
    private autoAt = new Map<string, number>();
    private stormAt = new Map<string, number>();
    private comboStates = new Map<string, ComboState>();
    private zones: { f: FxZone; pos: Vector; until: number; next: number; rings: ParticleID[]; entered: Set<EntityIndex> }[] = [];
    private tethers = new Map<string, { f: FxTether; target: CDOTA_BaseNPC; until: number; next: number; streak: number; finished: boolean }>();
    private marks = new Map<string, Map<EntityIndex, OrbMark>>();
    private guards = new Map<string, { until: number; readyAt: number; damage: number }>();
    private wireAnchor?: { pos: Vector; until: number; marker: ParticleID };
    private wire?: { start: Vector; end: Vector; f: FxWire; armAt: number; until: number; charges: number; particles: ParticleID[]; hit: Set<EntityIndex>; leftEnds: boolean };
    private wireReadyAt = 0;
    private zeus?: ZeusLegends;
    private maneuvers?: HeroManeuvers;
    private combatEpoch = 0;

    constructor(parent: CDOTA_BaseNPC) {
        this.parent = parent;
    }

    maneuverStart(ability: CDOTABaseAbility) { this.maneuvers?.start(ability, GameRules.GetGameTime()); }

    // ---------- Активные эффекты ----------

    refresh(b: OrbBonuses) {
        if (this.listFor === b) return;
        this.listFor = b;
        this.awake = b.awake;
        const out: FxDef[] = [];
        for (const id in b.code) {
            if ((b.code[id] ?? 0) <= 0) continue;
            for (const f of fxOfOrb(id)) out.push(fxView(f, b.awake));
        }
        this.list = out;
        const plans = out.filter((f): f is FxManeuver => f.t === "maneuver");
        if (plans.length > 0) {
            this.maneuvers ??= new HeroManeuvers(this.parent,
                (victim, amount, effect, magical) => this.damage(victim, amount, magical ? DamageTypes.MAGICAL : DamageTypes.PHYSICAL, effect),
                (target, dir, dist, dur) => this.shove(target, dir, dist, dur));
            this.maneuvers.configure(plans, b.awake);
        } else if (this.maneuvers !== undefined) {
            this.maneuvers.clear();
            this.maneuvers = undefined;
        }
        if (!out.some(f => f.t === "wire")) this.clearWire();
        if (this.zeus !== undefined && !out.some(f => f.t === "spring" || f.t === "thunderball")) {
            this.zeus.clear();
            this.zeus = undefined;
        }

    }

    hasAny(): boolean {
        return this.list.length > 0;
    }

    private ab(name: string): CDOTABaseAbility | undefined {
        if (name === "") return undefined;
        return this.parent.FindAbilityByName(name);
    }

    private num(v: FxNum | undefined, f: FxDef): number {
        const ab = this.ab(f.ab);
        return fxNum(v, key => (ab !== undefined ? ab.GetSpecialValueFor(key) : 0));
    }

    private inWindow(f: FxDef, win: FxNum | undefined, now: number): boolean {
        if (win === undefined) return true;
        const at = this.lastCast.get(f.ab);
        return at !== undefined && now - at <= this.num(win, f) + 0.05;
    }

    private later(delay: number, run: () => void) {
        if (delay <= 0.01) run();
        else this.pending.push({ at: GameRules.GetGameTime() + delay, run });
    }

    private damage(victim: CDOTA_BaseNPC, amount: number, type: DamageTypes, f: FxDef, flags = 0) {
        if (amount <= 0 || !victim.IsAlive()) return 0;
        // Эти эффекты наносят собственный урон, поэтому получают усиление заклинаний один раз.
        const spell = f.t === "spring" || f.t === "thunderball" || f.t === "mark" || f.t === "guard" || f.t === "zone" || f.t === "tether";
        this.applying = true;
        try { return ApplyDamage({
            victim, attacker: this.parent, damage: amount, damage_type: type,
            damage_flags: spell ? flags : flags + DamageFlag.NO_SPELL_AMPLIFICATION, ability: this.ab(f.ab),
        });
        } finally { this.applying = false; }
    }

    // ---------- Модификаторы эффектов ----------

    private applyDebuff(f: FxDef, d: FxDebuff, victim: CDOTA_BaseNPC) {
        const name = fxModifierName(f.key);
        const dur = this.num(d.dur, f);
        const max = d.max ?? 1;
        const go = () => {
            if (!IsValidEntity(victim) || !victim.IsAlive()) return;
            const m = victim.FindModifierByName(name);
            if (m !== undefined && m.GetCaster() === this.parent) {
                if (max > 1 && m.GetStackCount() < max) m.IncrementStackCount();
                m.SetDuration(dur, true);
                return;
            }
            const nm = victim.AddNewModifier(this.parent, this.ab(f.ab), name, { duration: dur });
            if (nm !== undefined && max > 1) nm.SetStackCount(1);
        };
        this.later(this.num(d.delay, f), go);
    }

    /** Поддерживать постоянный модификатор эффекта (stacks — число стаков, 0 — без стаков). */
    private keep(f: FxDef, on: boolean, stacks = 0) {
        const name = fxModifierName(f.key);
        const m = this.parent.FindModifierByName(name);
        if (!on) {
            if (m !== undefined) m.Destroy();
            return;
        }
        const mm = m ?? this.parent.AddNewModifier(this.parent, this.ab(f.ab), name, {});
        if (mm !== undefined && stacks > 0 && mm.GetStackCount() !== stacks) mm.SetStackCount(stacks);
    }

    // ---------- Действия при попадании ----------

    private act(f: FxDef & FxActions, victim: CDOTA_BaseNPC, dealt: number) {
        const parent = this.parent;
        if (f.debuff !== undefined) this.applyDebuff(f, f.debuff, victim);
        if (f.heal !== undefined) {
            const h = dealt * this.num(f.heal, f) / 100;
            if (h > 0) parent.Heal(h, this.ab(f.ab));
        }
        if (f.mana !== undefined) parent.GiveMana(dealt * this.num(f.mana, f) / 100);
        if (f.extra !== undefined) {
            const x = f.extra;
            let amount = dealt * this.num(x.pct, f) / 100;
            amount += victim.GetMaxHealth() * this.num(x.maxhp, f) / 100;
            amount += victim.GetHealth() * this.num(x.curhp, f) / 100;
            amount += parent.GetAverageTrueAttackDamage(victim) * this.num(x.atk, f) / 100;
            amount += this.num(x.flat, f);
            this.damage(victim, amount, damageType(x.type), f);
        }
        if (f.chain !== undefined) {
            const c = f.chain;
            const pct = this.num(c.pct, f);
            let from = victim;
            const hit = new Set<CDOTA_BaseNPC>([victim]);
            for (let j = 0; j < c.jumps; j++) {
                const near = FindUnitsInRadius(parent.GetTeamNumber(), from.GetAbsOrigin(), undefined, c.radius, UnitTargetTeam.ENEMY,
                    UnitTargetType.HERO, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
                let next: CDOTA_BaseNPC | undefined;
                for (const u of near) if (!hit.has(u) && u.IsAlive() && u.IsRealHero()) { next = u; break; }
                if (next === undefined) break;
                hit.add(next);
                const p = ParticleManager.CreateParticle(CHAIN_PFX, ParticleAttachment.CUSTOMORIGIN, from);
                ParticleManager.SetParticleControl(p, 0, (from.GetAbsOrigin() + Vector(0, 0, 100)) as Vector);
                ParticleManager.SetParticleControl(p, 1, (next.GetAbsOrigin() + Vector(0, 0, 100)) as Vector);
                ParticleManager.ReleaseParticleIndex(p);
                this.damage(next, dealt * pct / 100, DamageTypes.MAGICAL, f);
                from = next;
            }
        }
        if (f.splash !== undefined) {
            const s = f.splash;
            const pct = this.num(s.pct, f);
            const near = FindUnitsInRadius(parent.GetTeamNumber(), victim.GetAbsOrigin(), undefined, s.radius, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
            for (const u of near) if (u !== victim) this.damage(u, dealt * pct / 100, DamageTypes.MAGICAL, f);
        }
        if (f.pierce !== undefined) {
            const pc = f.pierce;
            const a = parent.GetAbsOrigin();
            const b = victim.GetAbsOrigin();
            const dir = ((b - a) as Vector).Normalized();
            const end = (b + dir * pc.dist) as Vector;
            const units = FindUnitsInLine(parent.GetTeamNumber(), b, end, undefined, pc.width, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE);
            for (const u of units) if (u !== victim) this.damage(u, dealt * this.num(pc.pct, f) / 100, DamageTypes.PHYSICAL, f);
        }
        if (f.cdr !== undefined) this.reduceCooldowns(f, f.cdr.abs, this.num(f.cdr.sec, f));
        if (f.addstack !== undefined) {
            const st = f.addstack;
            const max = this.num(st.max, f);
            const dur = this.num(st.dur, f);
            for (const m of parent.FindAllModifiers()) {
                if (m.GetName().indexOf(st.mod) < 0) continue;
                if (m.GetStackCount() < max) m.IncrementStackCount();
                if (dur > 0) m.SetDuration(dur, true);
                break;
            }
        }
    }

    private reduceCooldowns(f: FxDef, names: string[], sec: number) {
        for (const n of names) {
            const a = this.ab(n === "self" ? f.ab : n);
            if (a === undefined) continue;
            const left = a.GetCooldownTimeRemaining();
            if (left <= 0) continue;
            a.EndCooldown();
            if (left > sec) a.StartCooldown(left - sec);
        }
    }

    private condOk(cond: string | undefined, lowhp: number | undefined, t: CDOTA_BaseNPC): boolean {
        if (lowhp !== undefined && t.GetHealthPercent() >= lowhp) return false;
        if (cond !== undefined && cond.indexOf("own:") === 0) {
            return this.hasOwnCombatModifier(t, cond.slice(4));
        }
        if (cond !== undefined && cond.indexOf("has:") === 0) {
            // Цель под действием модификатора (часть имени после «has:»)
            const part = cond.substring(4);
            for (const m of t.FindAllModifiers()) if (m.GetName().indexOf(part) >= 0) return true;
            return false;
        }
        if (cond === "stunned") return t.IsStunned();
        if (cond === "silenced") return t.IsSilenced();
        if (cond === "rooted") return t.IsRooted();
        if (cond === "slowed") return t.GetIdealSpeed() < t.GetBaseMoveSpeed() - 1;
        return true;
    }

    private hitAllowed(f: FxDef & { heroOnly?: number; chance?: number; win?: FxNum; cond?: string; lowhp?: number; icd?: number },
        victim: CDOTA_BaseNPC, now: number): boolean {
        if ((f.heroOnly ?? 0) > 0 && !victim.IsRealHero()) return false;
        if (!this.inWindow(f, f.win, now)) return false;
        if (!this.condOk(f.cond, f.lowhp, victim)) return false;
        if (f.icd !== undefined) {
            const k = f.key + ":" + victim.entindex();
            const until = this.icd.get(k) ?? 0;
            if (now < until) return false;
            this.icd.set(k, now + f.icd);
        }
        if (f.chance !== undefined && RandomFloat(0, 100) >= f.chance) return false;
        return true;
    }

    // ---------- События ----------

    onCast(ability: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined) {
        const parent = this.parent;
        const name = ability.GetAbilityName();
        const now = GameRules.GetGameTime();
        this.lastCast.set(name, now);
        if (target !== undefined) this.lastTarget.set(name, target);
        else this.lastTarget.delete(name);
        this.lastPoint.set(name, ability.GetCursorPosition());
        this.maneuvers?.cast(ability, target, now);
        for (const f of this.list) {
            if (f.t === "combo") { this.comboCast(f, name, now); continue; }
            if (f.ab !== name) continue;
            if (f.t === "spring" || f.t === "thunderball") {
                const zeus = this.zeus ??= new ZeusLegends(parent, (victim, amount, effect, flags) =>
                    this.damage(victim, amount, DamageTypes.MAGICAL, effect, flags));
                if (f.t === "spring") zeus.castSpring(f, now);
                else if (this.listFor !== undefined) zeus.castBall(f, ability, this.listFor, now);
                continue;
            }
            if (f.t === "wire") { this.castWire(f, now); continue; }
            if (f.t === "zone") { this.startZone(f, ability, target); continue; }
            if (f.t === "tether") { this.startTether(f, target); continue; }
            if (f.t === "mark" && f.by === "cast" && target !== undefined) {
                this.markHit(f, target, name, now, true);
                continue;
            }
            if (f.t === "guard") {
                const state = this.guards.get(f.key) ?? { until: 0, readyAt: 0, damage: 0 };
                if (now >= state.readyAt) {
                    state.damage = 0;
                    state.until = now + f.win;
                    this.guards.set(f.key, state);
                }
                continue;
            }
            if (f.t === "buff") {
                if ((f.dispel ?? 0) > 0) parent.Purge(false, true, false, false, false);
                parent.AddNewModifier(parent, ability, fxModifierName(f.key), { duration: this.num(f.dur, f) });
                if (f.shield !== undefined) {
                    const hero = parent.IsHero() ? (parent as CDOTA_BaseNPC_Hero) : undefined;
                    const str = hero !== undefined ? hero.GetStrength() : 0;
                    const amount = this.num(f.shield.base, f) + this.num(f.shield.str, f) * str;
                    parent.AddNewModifier(parent, ability, "modifier_orb_battle_shield", { duration: this.num(f.shield.dur, f), amount: Math.floor(amount) });
                }
            } else if (f.t === "refund") {
                if (RandomFloat(0, 100) < f.chance) {
                    const left = ability.GetCooldownTimeRemaining();
                    const pct = this.num(f.cdpct, f);
                    ability.EndCooldown();
                    if (pct < 100 && left > 0) ability.StartCooldown(left * (1 - pct / 100));
                    if (f.mana !== undefined) parent.GiveMana(ability.GetManaCost(Math.max(0, ability.GetLevel() - 1)) * this.num(f.mana, f) / 100);
                }
            } else if (f.t === "blast") {
                this.blast(f, ability, target);
            } else if (f.t === "multi") {
                this.multicast(f, ability, target);
            } else if (f.t === "dash") {
                this.dash(f, ability, target);
            } else if (f.t === "pull") {
                this.pull(f, ability, target);
            } else if (f.t === "illusion") {
                this.illusions(f);
            } else if (f.t === "trap") {
                this.plantTrap(f, ability, target);
            } else if (f.t === "summon") {
                this.summon(f, ability);
            } else if (f.t === "swap") {
                this.swap(target);
            } else if (f.t === "rewind") {
                this.rewind(f);
            }
        }
    }

    // ---------- Механики при применении ----------

    /** Применить способность бесплатно (без маны и перезарядки) по цели или точке. */
    private freeCast(ability: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined, point: Vector | undefined) {
        const parent = this.parent;
        if (!IsValidEntity(parent) || !parent.IsAlive() || ability.GetLevel() <= 0) return;
        const targetOk = target !== undefined && IsValidEntity(target) && target.IsAlive();
        // Способность на цель без живой цели не повторяем: цель курсора осталась бы старой
        if (!targetOk && (Number(ability.GetBehavior()) & AbilityBehavior.UNIT_TARGET) !== 0) return;
        if (targetOk) {
            parent.SetCursorCastTarget(target);
            parent.SetCursorPosition(target.GetAbsOrigin());
        } else {
            // Старая цель курсора могла умереть или исчезнуть
            parent.SetCursorCastTarget(undefined);
            if (point !== undefined) parent.SetCursorPosition(point);
        }
        ability.OnSpellStart();
    }

    private multicast(f: FxDef & { t: "multi" }, ability: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined) {
        const parent = this.parent;
        const chance = this.num(f.chance, f);
        const point = ability.GetCursorPosition();
        let times = 0;
        const max = f.times ?? 1;
        while (times < max && RandomFloat(0, 100) < chance) times++;
        for (let i = 1; i <= times; i++) {
            this.later((f.delay ?? 0.35) * i, () => {
                this.freeCast(ability, target, point);
                if (IsValidEntity(parent)) {
                    SendOverheadEventMessage(undefined, OverheadAlert.MAGICAL_BLOCK, parent, i + 1, undefined);
                    EmitSoundOn("Hero_OgreMagi.Fireblast.x" + Math.min(3, i + 1), parent);
                }
            });
        }
    }

    /** Толчок юнита: knockback с центром позади, чтобы двигать в сторону dir. */
    private shove(u: CDOTA_BaseNPC, dir: Vector, dist: number, dur: number, height = 0) {
        const o = u.GetAbsOrigin();
        const c = (o - dir * 50) as Vector;
        u.AddNewModifier(this.parent, undefined, "modifier_knockback", {
            center_x: c.x, center_y: c.y, center_z: c.z, duration: dur,
            knockback_duration: dur, knockback_distance: dist, knockback_height: height, should_stun: 0,
        });
    }

    private dash(f: FxDef & { t: "dash" }, ability: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined) {
        const parent = this.parent;
        const from = parent.GetAbsOrigin();
        const to = f.to === "target" && target !== undefined ? target.GetAbsOrigin() : ability.GetCursorPosition();
        let dir = ((to - from) as Vector);
        dir.z = 0;
        if (dir.Length2D() < 10) dir = parent.GetForwardVector();
        dir = dir.Normalized();
        if (f.to === "back") dir = (dir * -1) as Vector;
        let dist = this.num(f.dist, f);
        if (f.to !== "back") dist = Math.min(dist, Math.max(150, ((to - from) as Vector).Length2D() - 100));
        this.later(0.05, () => this.shove(parent, dir, dist, 0.25, 40));
    }

    private pull(f: FxDef & { t: "pull" }, ability: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined) {
        const parent = this.parent;
        const radius = this.num(f.radius, f);
        const dist = this.num(f.dist, f);
        const dmg = this.num(f.dmg, f);
        const center = f.at === "self" ? undefined : f.at === "target" && target !== undefined ? target.GetAbsOrigin() : ability.GetCursorPosition();
        this.later(this.num(f.delay, f), () => {
            if (!IsValidEntity(parent)) return;
            const c = center ?? parent.GetAbsOrigin();
            if (f.pfx !== undefined) {
                const p = ParticleManager.CreateParticle(f.pfx, ParticleAttachment.WORLDORIGIN, undefined);
                ParticleManager.SetParticleControl(p, 0, c);
                ParticleManager.SetParticleControl(p, 1, Vector(radius, radius, radius));
                ParticleManager.ReleaseParticleIndex(p);
            }
            const units = FindUnitsInRadius(parent.GetTeamNumber(), c, undefined, radius, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
            for (const u of units) {
                if (!u.IsAlive()) continue;
                const v = ((c - u.GetAbsOrigin()) as Vector);
                const d = v.Length2D();
                if (d > 60) this.shove(u, v.Normalized(), Math.min(dist, d - 50), 0.3, 20);
                if (dmg > 0) this.damage(u, dmg, damageType(f.type), f);
            }
        });
    }

    private illusions(f: FxDef & { t: "illusion" }) {
        const parent = this.parent;
        if (!parent.IsRealHero()) return;
        const dur = this.num(f.dur, f);
        // duration движок читает из тех же ключей (в типах его нет); на всякий случай еще modifier_kill
        const keys = { outgoing_damage: this.num(f.out, f), incoming_damage: this.num(f.inc, f), duration: dur, bounty_base: 0, bounty_growth: 0 };
        const list = CreateIllusions(parent, parent as CDOTA_BaseNPC_Hero, keys as CreateIllusionsModifierKeys, f.n, 90, true, true);
        if (list !== undefined) for (const ill of list) ill.AddNewModifier(parent, undefined, "modifier_kill", { duration: dur });
        const foes = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, 1200, UnitTargetTeam.ENEMY,
            UnitTargetType.HERO, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
        if (list !== undefined) for (const ill of list) if (foes.length > 0) ill.MoveToTargetToAttack(foes[0]);
    }

    private plantTrap(f: FxTrap, ability: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined) {
        const parent = this.parent;
        const pos = f.at === "self" ? parent.GetAbsOrigin() : f.at === "target" && target !== undefined ? target.GetAbsOrigin() : ability.GetCursorPosition();
        const now = GameRules.GetGameTime();
        const mine = this.traps.filter(t => t.f.key === f.key);
        if (mine.length >= f.max) this.removeTrap(mine[0]);
        const mark = ParticleManager.CreateParticleForTeam(RING_PFX, ParticleAttachment.WORLDORIGIN, undefined, parent.GetTeamNumber());
        ParticleManager.SetParticleControl(mark, 0, pos);
        ParticleManager.SetParticleControl(mark, 1, Vector(f.radius, 0, 0));
        this.traps.push({ f, pos, armAt: now + f.arm, until: now + f.life, mark });
    }

    private removeTrap(t: Trap) {
        if (t.mark !== undefined) {
            ParticleManager.DestroyParticle(t.mark, true);
            ParticleManager.ReleaseParticleIndex(t.mark);
        }
        const i = this.traps.indexOf(t);
        if (i >= 0) this.traps.splice(i, 1);
    }

    private summon(f: FxDef & { t: "summon" }, ability: CDOTABaseAbility) {
        const parent = this.parent;
        const pid = parent.GetPlayerOwnerID();
        const minute = Math.max(0, GameRules.GetDOTATime(false, false) / 60);
        const dur = this.num(f.dur, f);
        for (let i = 0; i < f.n; i++) {
            const a = RandomFloat(0, Math.PI * 2);
            const pos = (parent.GetAbsOrigin() + Vector(Math.cos(a) * 150, Math.sin(a) * 150, 0)) as Vector;
            const u = CreateUnitByName(f.unit, pos, true, parent, parent, parent.GetTeamNumber());
            if (u === undefined) continue;
            u.SetOwner(parent);
            if (pid >= 0) u.SetControllableByPlayer(pid, true);
            // Растет с партией: иначе к 20-й минуте призыв бесполезен
            const k = 1 + 0.07 * minute;
            u.SetBaseMaxHealth(Math.floor(u.GetMaxHealth() * k));
            u.SetMaxHealth(Math.floor(u.GetMaxHealth() * k));
            u.SetHealth(u.GetMaxHealth());
            u.SetBaseDamageMin(Math.floor(u.GetBaseDamageMin() * k));
            u.SetBaseDamageMax(Math.floor(u.GetBaseDamageMax() * k));
            u.AddNewModifier(parent, ability, "modifier_kill", { duration: dur });
            const foes = FindUnitsInRadius(parent.GetTeamNumber(), pos, undefined, 900, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
            if (foes.length > 0) u.MoveToTargetToAttack(foes[0]);
        }
    }

    private swap(target: CDOTA_BaseNPC | undefined) {
        const parent = this.parent;
        if (target === undefined || !IsValidEntity(target) || !target.IsAlive() || target === parent) return;
        const a = parent.GetAbsOrigin();
        const b = target.GetAbsOrigin();
        FindClearSpaceForUnit(parent, b, true);
        FindClearSpaceForUnit(target, a, true);
        EmitSoundOn("Hero_VengefulSpirit.NetherSwap", parent);
    }

    private rewind(f: FxDef & { t: "rewind" }) {
        const parent = this.parent;
        const pos = parent.GetAbsOrigin();
        const hp = parent.GetHealth();
        this.later(f.delay, () => {
            if (!IsValidEntity(parent) || !parent.IsAlive()) return;
            const p = ParticleManager.CreateParticle(REWIND_PFX, ParticleAttachment.ABSORIGIN, parent);
            ParticleManager.ReleaseParticleIndex(p);
            FindClearSpaceForUnit(parent, pos, true);
            const lost = hp - parent.GetHealth();
            if (lost > 0) parent.Heal(lost * this.num(f.heal, f) / 100, this.ab(f.ab));
            EmitSoundOn("Hero_Weaver.TimeLapse", parent);
        });
    }

    private blast(f: FxDef & { t: "blast" }, ability: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined) {
        const parent = this.parent;
        let center: Vector;
        if (f.at === "self") center = parent.GetAbsOrigin();
        else if (f.at === "target" && target !== undefined) center = target.GetAbsOrigin();
        else center = ability.GetCursorPosition();
        const radius = this.num(f.radius, f);
        const dmg = this.num(f.dmg, f);
        const fire = () => {
            if (!IsValidEntity(parent)) return;
            const c = f.at === "self" ? parent.GetAbsOrigin() : center;
            if (f.pfx !== undefined) {
                const p = ParticleManager.CreateParticle(f.pfx, ParticleAttachment.WORLDORIGIN, undefined);
                ParticleManager.SetParticleControl(p, 0, c);
                ParticleManager.SetParticleControl(p, 1, Vector(radius, radius, radius));
                ParticleManager.ReleaseParticleIndex(p);
            }
            const units = FindUnitsInRadius(parent.GetTeamNumber(), c, undefined, radius, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
            for (const u of units) {
                if (!u.IsAlive()) continue;
                this.damage(u, dmg, damageType(f.type), f);
                if (f.debuff !== undefined) this.applyDebuff(f, f.debuff, u);
            }
        };
        this.later(this.num(f.delay, f), fire);
    }

    /** Урон, нанесенный героем (кроме урона самих эффектов). */
    onDealt(e: ModifierInstanceEvent) {
        if (this.applying) return;
        const parent = this.parent;
        const victim = e.unit;
        if (!isEnemy(parent, victim) || e.damage <= 0) return;
        if ((e.damage_flags & DamageFlag.REFLECTION) !== 0) return;
        const inflictor = e.inflictor;
        if (inflictor === undefined || inflictor.IsItem()) return;
        const name = inflictor.GetAbilityName();
        const now = GameRules.GetGameTime();
        if (name === "zuus_lightning_bolt") this.zeus?.bolt(victim, now);
        this.maneuvers?.spellHit(victim, inflictor, now);
        for (const f of this.list) {
            if (f.t === "mark") { this.markHit(f, victim, name, now); continue; }
            if (f.ab !== name) continue;
            if (f.t === "hit" && f.by === "ab") {
                if (this.hitAllowed(f, victim, now)) this.act(f, victim, e.damage);
            } else if (f.t === "echo") {
                const pct = this.num(f.pct, f);
                const amount = e.damage * pct / 100;
                const type = e.damage_type;
                for (const d of f.delays) {
                    this.later(d, () => {
                        if (IsValidEntity(victim) && victim.IsAlive() && IsValidEntity(parent)) this.damage(victim, amount, type, f);
                    });
                }
            }
        }
    }

    onObservedAttack(e: ModifierAttackEvent) {
        if (this.zeus !== undefined) this.zeus.attack(e, GameRules.GetGameTime());
    }

    /** Атака героя попала. */
    onAttack(e: ModifierAttackEvent) {
        const parent = this.parent;
        const t = e.target;
        if (!isEnemy(parent, t)) return;
        const now = GameRules.GetGameTime();
        this.maneuvers?.attack(e, now);
        for (const f of this.list) {
            if (f.t === "mark") { this.markHit(f, t, "attack", now); continue; }
            if (f.t !== "hit" || f.by !== "attack") continue;
            // Атакой — только если способность изучена (если она указана)
            if (f.ab !== "") {
                const a = this.ab(f.ab);
                if (a === undefined || a.GetLevel() <= 0) continue;
            }
            if (f.every !== undefined && f.every > 1) {
                const k = f.key + ":" + t.entindex();
                const n = (this.hits.get(k) ?? 0) + 1;
                if (n < f.every) {
                    this.hits.set(k, n);
                    continue;
                }
                this.hits.set(k, 0);
            }
            if (this.hitAllowed(f, t, now)) this.act(f, t, e.damage);
        }
    }

    /** Урон по герою: отражение. */
    onTaken(e: ModifierInstanceEvent) {
        if (this.applying) return;
        const parent = this.parent;
        const a = e.attacker;
        if (!isEnemy(parent, a) || !a.IsRealHero() || e.damage <= 0) return;
        if ((e.damage_flags & DamageFlag.REFLECTION) !== 0) return;
        const now = GameRules.GetGameTime();
        for (const f of this.list) {
            if (f.t === "guard") { this.guardHit(f, e.damage, now); continue; }
            if (f.t !== "taken" || !this.inWindow(f, f.win, now)) continue;
            this.damage(a, e.damage * this.num(f.reflect, f) / 100, DamageTypes.PURE, f, DamageFlag.REFLECTION);
        }
    }

    /** Смерть героя-врага от нашего героя. */
    onKill(victim: CDOTA_BaseNPC, inflictor: CDOTABaseAbility | undefined) {
        const parent = this.parent;
        if (!isEnemy(parent, victim) || !victim.IsRealHero()) return;
        const now = GameRules.GetGameTime();
        const iname = inflictor !== undefined ? inflictor.GetAbilityName() : "";
        for (const f of this.list) {
            if (f.t !== "kill") continue;
            if (f.by === "ab" && iname !== f.ab) continue;
            if (f.by === "win" && !this.inWindow(f, f.win, now)) continue;
            if (f.refresh !== undefined) {
                for (const n of f.refresh) {
                    const a = this.ab(n === "self" ? f.ab : n);
                    if (a !== undefined) a.EndCooldown();
                }
            }
            if (f.cdpct !== undefined) {
                const a = this.ab(f.ab);
                if (a !== undefined) {
                    const left = a.GetCooldownTimeRemaining();
                    if (left > 0) {
                        a.EndCooldown();
                        a.StartCooldown(left * (1 - this.num(f.cdpct, f) / 100));
                    }
                }
            }
            if (f.heal !== undefined) parent.Heal(parent.GetMaxHealth() * this.num(f.heal, f) / 100, this.ab(f.ab));
            if (f.manapct !== undefined) parent.GiveMana(parent.GetMaxMana() * this.num(f.manapct, f) / 100);
            if (f.ext !== undefined) {
                const sec = this.num(f.ext.sec, f);
                for (const m of parent.FindAllModifiers()) {
                    const n = m.GetName();
                    for (const part of f.ext.parts) {
                        if (n.indexOf(part) >= 0 && m.GetDuration() > 0) {
                            m.SetDuration(m.GetRemainingTime() + sec, true);
                            break;
                        }
                    }
                }
                // Окно эффекта тоже продлевается
                const at = this.lastCast.get(f.ab);
                if (at !== undefined) this.lastCast.set(f.ab, at + sec);
            }
            if (f.stack !== undefined) {
                const name = fxModifierName(f.key);
                const m = parent.FindModifierByName(name) ?? parent.AddNewModifier(parent, this.ab(f.ab), name, {});
                if (m !== undefined && m.GetStackCount() < f.stack.max) m.IncrementStackCount();
            }
        }
    }

    /** Критический удар эффектов (наибольший множитель). */
    crit(t: CDOTA_BaseNPC | undefined): number {
        if (t === undefined || !isEnemy(this.parent, t)) return 0;
        const now = GameRules.GetGameTime();
        let best = 0;
        for (const f of this.list) {
            if (f.t !== "crit") continue;
            if ((f.heroOnly ?? 0) > 0 && !t.IsRealHero()) continue;
            if (!this.inWindow(f, f.win, now)) continue;
            if (f.lowhp !== undefined && t.GetHealthPercent() >= f.lowhp) continue;
            if (RandomFloat(0, 100) >= this.num(f.chance, f)) continue;
            best = Math.max(best, this.num(f.mult, f));
        }
        return best;
    }

    /** Больше урона по цели в нужном состоянии. */
    outgoing(t: CDOTA_BaseNPC | undefined, inflictor: CDOTABaseAbility | undefined): number {
        if (t === undefined || !isEnemy(this.parent, t)) return 0;
        let pct = 0;
        for (const f of this.list) {
            if (f.t !== "vs") continue;
            if ((f.attackOnly ?? 0) > 0 && inflictor !== undefined) continue;
            if (!this.condOk(f.cond, f.lowhp, t)) continue;
            pct += this.num(f.pct, f);
        }
        return pct;
    }

    // ---------- Каждые 0.1 с ----------

    syncCharges() {
        const b = this.listFor;
        if (b === undefined) return;
        for (let i = 0; i < this.parent.GetAbilityCount(); i++) {
            const ability = this.parent.GetAbilityByIndex(i);
            if (ability === undefined || ability.IsPassive() || ability.GetLevel() <= 0) continue;
            const extra = bonusAbilityCharges(b, ability.GetAbilityName(), ability.GetAbilityType() === 1);
            const granted = this.grantedCharges.get(ability) ?? 0;
            if (extra <= granted) continue;
            const level = ability.GetLevel() - 1;
            const nativeMax = ability.GetMaxAbilityCharges(level);
            if (nativeMax <= 0) continue;

            const converting = granted === 0 && ability.GetLevelSpecialValueNoOverride("AbilityCharges", level) <= 0;
            const oldCooldown = converting ? ability.GetCooldownTimeRemaining() : 0;
            const readyCast = converting && oldCooldown <= 0 ? 1 : 0;
            ability.SetCurrentAbilityCharges(Math.min(nativeMax, ability.GetCurrentAbilityCharges() + extra - granted + readyCast));
            // При постановке первого таймера движок ещё видит оставшийся обычный КД через модификатор.
            if (oldCooldown > 0) ability.EndCooldown();
            ability.MarkAbilityButtonDirty();
            this.grantedCharges.set(ability, extra);
        }
    }

    think() {
        const parent = this.parent;
        const now = GameRules.GetGameTime();
        // Отложенные действия (повторы, взрывы, отложенные дебаффы)
        if (this.pending.length > 0) {
            const due = this.pending.filter(p => p.at <= now);
            if (due.length > 0) {
                this.pending = this.pending.filter(p => p.at > now);
                for (const p of due) p.run();
            }
        }
        this.syncCharges();
        this.combatTick(now);
        const alive = parent.IsAlive();
        const pos = parent.GetAbsOrigin();
        if (this.lastPos === undefined || ((pos - this.lastPos) as Vector).Length2D() > 5) this.stillSince = now;
        this.lastPos = pos;
        const auraTick = now - this.lastAura >= 0.5;
        if (auraTick) this.lastAura = now;
        for (const f of this.list) {
            if (f.t === "passive") {
                const a = this.ab(f.ab);
                const lvl = a !== undefined ? a.GetLevel() : 1;
                const on = f.ab === "" || lvl > 0;
                this.keep(f, on, (f.perlvl ?? 0) > 0 ? lvl : 0);
            } else if (f.t === "lowhp") {
                this.keep(f, alive && parent.GetHealthPercent() < f.thr);
            } else if (f.t === "stacks") {
                let n = 0;
                for (const m of parent.FindAllModifiers()) if (m.GetName().indexOf(f.mod) >= 0 && m.GetName().indexOf("modifier_orb_") < 0) n = Math.max(n, m.GetStackCount());
                const on = alive && n >= this.num(f.min, f) && n > 0;
                this.keep(f, on, (f.perstack ?? 0) > 0 ? n : 0);
            } else if (f.t === "still") {
                this.keep(f, alive && now - this.stillSince >= f.delay);
            } else if (f.t === "auto" && alive) {
                this.autoTick(f, now);
            } else if (f.t === "storm" && alive && this.inWindow(f, f.win, now)) {
                this.stormTick(f, now);
            } else if (f.t === "trail" && alive && this.inWindow(f, f.win, now) && (this.ab(f.ab)?.GetLevel() ?? 1) > 0) {
                // Точка следа раз в 0.3 с, пока герой бежит
                if (now - this.lastTrailAt >= 0.3 && this.lastPos !== undefined && now - this.stillSince < 0.15) {
                    this.lastTrailAt = now;
                    let fx: ParticleID | undefined;
                    if (f.pfx !== undefined) {
                        fx = ParticleManager.CreateParticle(f.pfx, ParticleAttachment.WORLDORIGIN, undefined);
                        ParticleManager.SetParticleControl(fx, 0, pos);
                        ParticleManager.SetParticleControl(fx, 1, Vector(f.radius, f.radius, f.radius));
                    }
                    this.trail.push({ f, pos, until: now + f.life, fx });
                }
            } else if (f.t === "aura" && auraTick && alive && this.inWindow(f, f.win, now)) {
                const r = this.num(f.radius, f);
                const units = FindUnitsInRadius(parent.GetTeamNumber(), pos, undefined, r, UnitTargetTeam.ENEMY,
                    ((f.heroOnly ?? 0) > 0 ? UnitTargetType.HERO : UnitTargetType.HERO + UnitTargetType.BASIC), UnitTargetFlags.NONE, FindOrder.ANY, false);
                for (const u of units) if (u.IsAlive() && ((f.heroOnly ?? 0) <= 0 || (u.IsRealHero() && !u.IsDebuffImmune()))) u.AddNewModifier(parent, this.ab(f.ab), fxModifierName(f.key), { duration: 0.6 });
            }
        }
        this.trailTick(now);
        this.trapTick(now);
    }

    /** Самоприменение: способность срабатывает сама по ближайшему врагу (бесплатно). */
    private autoTick(f: FxDef & { t: "auto" }, now: number) {
        const parent = this.parent;
        const at = this.autoAt.get(f.key) ?? now + 2;
        if (!this.autoAt.has(f.key)) this.autoAt.set(f.key, at);
        if (now < at) return;
        const ability = this.ab(f.ab);
        if (ability === undefined || ability.GetLevel() <= 0 || parent.IsStunned() || parent.IsSilenced() || parent.IsInvisible()) return;
        const range = this.num(f.range, f);
        const type = (f.heroOnly ?? 0) > 0 ? UnitTargetType.HERO : UnitTargetType.HERO + UnitTargetType.BASIC;
        const foes = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, range, UnitTargetTeam.ENEMY,
            type, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.CLOSEST, false);
        let t: CDOTA_BaseNPC | undefined;
        for (const u of foes) if (u.IsAlive() && !u.IsInvulnerable()) { t = u; break; }
        if (t === undefined) return;
        this.autoAt.set(f.key, now + this.num(f.every, f));
        this.freeCast(ability, t, t.GetAbsOrigin());
    }

    private stormTick(f: FxDef & { t: "storm" }, now: number) {
        const parent = this.parent;
        const at = this.stormAt.get(f.key) ?? 0;
        if (now < at) return;
        this.stormAt.set(f.key, now + f.every);
        const foes = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, this.num(f.radius, f), UnitTargetTeam.ENEMY,
            UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NO_INVIS + UnitTargetFlags.FOW_VISIBLE, FindOrder.ANY, false);
        const alive = foes.filter(u => u.IsAlive());
        if (alive.length === 0) return;
        // Герои — в приоритете
        const heroes = alive.filter(u => u.IsRealHero());
        const pool = heroes.length > 0 ? heroes : alive;
        const t = pool[RandomInt(0, pool.length - 1)];
        const p = ParticleManager.CreateParticle(STORM_PFX, ParticleAttachment.WORLDORIGIN, undefined);
        const tp = t.GetAbsOrigin();
        ParticleManager.SetParticleControl(p, 0, Vector(tp.x, tp.y, tp.z + 1000));
        ParticleManager.SetParticleControl(p, 1, tp);
        ParticleManager.ReleaseParticleIndex(p);
        EmitSoundOn("Hero_Zuus.LightningBolt", t);
        this.damage(t, this.num(f.dmg, f), damageType(f.type), f);
        if (f.debuff !== undefined) this.applyDebuff(f, f.debuff, t);
    }

    private trailTick(now: number) {
        if (this.trail.length === 0) return;
        const parent = this.parent;
        const keep: TrailPoint[] = [];
        for (const tp of this.trail) {
            if (now < tp.until) keep.push(tp);
            else if (tp.fx !== undefined) {
                ParticleManager.DestroyParticle(tp.fx, false);
                ParticleManager.ReleaseParticleIndex(tp.fx);
            }
        }
        this.trail = keep;
        if (now - this.lastTrailTick < 0.5 || keep.length === 0) return;
        this.lastTrailTick = now;
        const hit = new Set<CDOTA_BaseNPC>();
        for (const tp of keep) {
            const units = FindUnitsInRadius(parent.GetTeamNumber(), tp.pos, undefined, tp.f.radius, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
            for (const u of units) {
                if (hit.has(u) || !u.IsAlive()) continue;
                hit.add(u);
                this.damage(u, this.num(tp.f.dps, tp.f) * 0.5, damageType(tp.f.type), tp.f);
                if (tp.f.debuff !== undefined) this.applyDebuff(tp.f, tp.f.debuff, u);
            }
        }
    }

    private trapTick(now: number) {
        if (this.traps.length === 0) return;
        const parent = this.parent;
        for (const t of this.traps.slice()) {
            if (now >= t.until) {
                this.removeTrap(t);
                continue;
            }
            if (now < t.armAt) continue;
            const foes = FindUnitsInRadius(parent.GetTeamNumber(), t.pos, undefined, t.f.radius, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO, UnitTargetFlags.NONE, FindOrder.ANY, false);
            if (!foes.some(u => u.IsAlive() && u.IsRealHero())) continue;
            this.removeTrap(t);
            if (t.f.pfx !== undefined) {
                const p = ParticleManager.CreateParticle(t.f.pfx, ParticleAttachment.WORLDORIGIN, undefined);
                ParticleManager.SetParticleControl(p, 0, t.pos);
                ParticleManager.SetParticleControl(p, 1, Vector(t.f.radius, t.f.radius, t.f.radius));
                ParticleManager.ReleaseParticleIndex(p);
            }
            StartSoundEventFromPosition("Hero_Techies.LandMine.Detonate", t.pos);
            const all = FindUnitsInRadius(parent.GetTeamNumber(), t.pos, undefined, t.f.radius * 1.4, UnitTargetTeam.ENEMY,
                UnitTargetType.HERO + UnitTargetType.BASIC, UnitTargetFlags.NONE, FindOrder.ANY, false);
            for (const u of all) {
                if (!u.IsAlive()) continue;
                this.damage(u, this.num(t.f.dmg, t.f), damageType(t.f.type), t.f);
                if (t.f.debuff !== undefined) this.applyDebuff(t.f, t.f.debuff, u);
            }
        }
    }

    private comboCast(f: FxCombo, name: string, now: number) {
        const state = this.comboStates.get(f.key) ?? { casts: {}, readyAt: 0 };
        this.comboStates.set(f.key, state);
        if (!advanceCombo(state, f.abs, f.need, f.within, f.icd, name, now)) return;
        const parent = this.parent;
        if (!parent.IsAlive()) return;
        parent.AddNewModifier(parent, this.ab(f.ab), fxModifierName(f.key), { duration: this.num(f.dur, f) });
        const radius = this.num(f.radius, f);
        const amount = this.num(f.dmg, f);
        if (radius <= 0 || amount <= 0) return;
        const units = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, radius,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NONE, FindOrder.ANY, false);
        for (const u of units) if (u.IsAlive() && u.IsRealHero()) this.damage(u, amount, DamageTypes.MAGICAL, f);
        const fx = ParticleManager.CreateParticle(STORM_PFX, ParticleAttachment.ABSORIGIN_FOLLOW, parent);
        ParticleManager.SetParticleControl(fx, 0, (parent.GetAbsOrigin() + Vector(0, 0, 300)) as Vector);
        ParticleManager.SetParticleControl(fx, 1, parent.GetAbsOrigin());
        ParticleManager.ReleaseParticleIndex(fx);
    }

    private removeZone(zone: { rings: ParticleID[] }) {
        for (const fx of zone.rings) {
            ParticleManager.DestroyParticle(fx, true);
            ParticleManager.ReleaseParticleIndex(fx);
        }
        this.zones = this.zones.filter(z => z !== zone);
    }

    private startZone(f: FxZone, ability: CDOTABaseAbility, target: CDOTA_BaseNPC | undefined) {
        for (const zone of this.zones.slice()) if (zone.f.key === f.key) this.removeZone(zone);
        // Группа используется для легендарной и обычной версии одной зоны.
        // Приоритет у сферы с более сильным первым ударом.
        if (f.group !== undefined) {
            const previous = this.zones.find(z => z.f.group === f.group);
            if (previous !== undefined) {
                if (this.num(previous.f.entryDmg, previous.f) > this.num(f.entryDmg, f)) return;
                this.removeZone(previous);
            }
        }
        const pos = f.at === "self" ? this.parent.GetAbsOrigin() : f.at === "target" && target !== undefined
            ? target.GetAbsOrigin() : ability.GetCursorPosition();
        const rings: ParticleID[] = [];
        for (const radius of [f.radius, f.inner ?? 0]) {
            if (radius <= 0) continue;
            const fx = ParticleManager.CreateParticle(RING_PFX, ParticleAttachment.WORLDORIGIN, undefined);
            ParticleManager.SetParticleControl(fx, 0, pos);
            ParticleManager.SetParticleControl(fx, 1, Vector(radius, 0, 0));
            ParticleManager.SetParticleControl(fx, 2, Vector(160, 120, 60));
            rings.push(fx);
        }
        const now = GameRules.GetGameTime();
        this.zones.push({ f, pos, until: now + this.num(f.dur, f), next: now + f.every, rings, entered: new Set() });
    }

    private startTether(f: FxTether, castTarget: CDOTA_BaseNPC | undefined) {
        const epoch = this.combatEpoch;
        const acquire = (retries: number) => {
            const parent = this.parent;
            if (epoch !== this.combatEpoch || !IsValidEntity(parent) || !parent.IsAlive()) return;
            let target = castTarget;
            if (target === undefined) {
                const units = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, f.range,
                    UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.FOW_VISIBLE + UnitTargetFlags.NO_INVIS, FindOrder.CLOSEST, false);
                target = units.find(u => u.IsRealHero() && u.IsAlive() && this.hasOwnCombatModifier(u, f.targetMod));
            }
            if (!isEnemy(parent, target) || !target.IsRealHero() || !target.IsAlive()) {
                if (castTarget === undefined && f.targetMod !== undefined && retries > 0)
                    this.later(0.15, () => acquire(retries - 1));
                return;
            }
            const now = GameRules.GetGameTime();
            this.tethers.set(f.key, { f, target, until: now + this.num(f.dur, f), next: now + f.every, streak: 0, finished: false });
        };
        this.later(f.delay ?? 0, () => acquire(6));
    }

    private hasOwnCombatModifier(unit: CDOTA_BaseNPC, name: string | undefined): boolean {
        return name === undefined || unit.FindAllModifiers().some(mod => mod.GetName() === name && mod.GetCaster() === this.parent);
    }

    private markHit(f: FxMark, target: CDOTA_BaseNPC, source: string, now: number, cast = false) {
        if (!isEnemy(this.parent, target) || !target.IsAlive() || !target.IsRealHero() || target.IsInvulnerable() || target.IsDebuffImmune()) return;
        const consume = !cast && f.consume.includes(source);
        const place = (f.ab === source && (cast ? f.by === "cast" : f.by === "ab")) ||
            (source === "attack" && f.nativeMark !== undefined && this.hasOwnCombatModifier(target, f.nativeMark));
        if (!consume && !place) return;
        const set = this.marks.get(f.key) ?? new Map<EntityIndex, OrbMark>();
        this.marks.set(f.key, set);
        let active = 0;
        for (const [id, m] of set) {
            if (now - m.at >= f.icd) set.delete(id);
            else if (!m.spent && now - m.at < f.dur && !m.mod.IsNull()) active++;
        }
        const id = target.entindex();
        const mark = set.get(id);
        if (mark !== undefined) {
            const newCast = !f.nextCast || (this.lastCast.get(source) ?? -1) > (mark.castAt ?? -1);
            if (consume && newCast && !mark.spent && now - mark.at >= (f.arm ?? 0) && now - mark.at < f.dur && !mark.mod.IsNull()) {
                mark.spent = true;
                mark.mod.Destroy();
                const dealt = this.damage(target, this.num(f.dmg, f), DamageTypes.MAGICAL, f);
                if (dealt > 0 && (f.heal ?? 0) > 0 && this.parent.IsAlive())
                    this.parent.Heal(this.parent.GetMaxHealth() * (f.heal ?? 0) / 100, this.ab(f.ab));
            }
            return;
        }
        if (!place || active >= f.max) return;
        const mod = target.AddNewModifier(this.parent, this.ab(f.ab), fxModifierName(f.key), { duration: f.dur });
        if (mod !== undefined) set.set(id, { at: now, castAt: this.lastCast.get(f.ab), mod, spent: false });
    }

    private guardHit(f: FxGuard, damage: number, now: number) {
        const state = this.guards.get(f.key);
        const parent = this.parent;
        if (state === undefined || now >= state.until || now < state.readyAt || !parent.IsAlive()) return;
        state.damage += damage;
        if (state.damage < parent.GetMaxHealth() * f.thr / 100) return;
        state.until = 0;
        state.readyAt = now + f.icd;
        parent.AddNewModifier(parent, this.ab(f.ab), fxModifierName(f.key), { duration: f.dur });
        if (f.heal !== undefined) parent.Heal(parent.GetMaxHealth() * f.heal / 100, this.ab(f.ab));
        const amount = this.num(f.dmg, f);
        if (amount <= 0) return;
        const units = FindUnitsInRadius(parent.GetTeamNumber(), parent.GetAbsOrigin(), undefined, f.radius,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NONE, FindOrder.ANY, false);
        for (const u of units) if (u.IsAlive() && u.IsRealHero()) this.damage(u, amount, DamageTypes.MAGICAL, f);
    }

    private wireMarker(pos: Vector): ParticleID {
        const fx = ParticleManager.CreateParticle(RING_PFX, ParticleAttachment.WORLDORIGIN, undefined);
        ParticleManager.SetParticleControl(fx, 0, pos);
        ParticleManager.SetParticleControl(fx, 1, Vector(WIRE_END_RADIUS, 0, 0));
        ParticleManager.SetParticleControl(fx, 2, Vector(110, 185, 255));
        return fx;
    }

    private clearWire() {
        const particles = this.wire?.particles ?? (this.wireAnchor === undefined ? [] : [this.wireAnchor.marker]);
        for (const fx of particles) {
            ParticleManager.DestroyParticle(fx, true);
            ParticleManager.ReleaseParticleIndex(fx);
        }
        this.wireAnchor = undefined;
        this.wire = undefined;
    }

    private castWire(f: FxWire, now: number) {
        const parent = this.parent;
        const pos = parent.GetAbsOrigin();
        if (now >= (this.wire?.until ?? this.wireAnchor?.until ?? Infinity)) this.clearWire();
        const wire = this.wire;
        if (wire !== undefined) {
            // Третий каст у одного конца: отступить к другому, пожертвовав ловушкой.
            if (now < wire.armAt || !wire.leftEnds || parent.IsRooted() ||
                parent.HasModifier("modifier_slark_pounce_leash") || parent.HasModifier("modifier_puck_dream_coil")) return;
            const destination = nearWireEnd(pos, wire.start) ? wire.end : nearWireEnd(pos, wire.end) ? wire.start : undefined;
            if (destination === undefined) return;
            this.clearWire();
            FindClearSpaceForUnit(parent, destination, true);
            return;
        }
        if (now < this.wireReadyAt) return;
        const anchor = this.wireAnchor;
        if (anchor === undefined) {
            this.wireAnchor = { pos, until: now + f.within, marker: this.wireMarker(pos) };
            return;
        }
        const span = length2D(pos.x - anchor.pos.x, pos.y - anchor.pos.y);
        if (span < f.minDist || span > f.maxDist || Math.abs(pos.z - anchor.pos.z) >= 220) return;

        const beam = ParticleManager.CreateParticle(WIRE_PFX, ParticleAttachment.WORLDORIGIN, undefined);
        ParticleManager.SetParticleControl(beam, 0, Vector(anchor.pos.x, anchor.pos.y, anchor.pos.z + 70));
        ParticleManager.SetParticleControl(beam, 1, Vector(pos.x, pos.y, pos.z + 70));
        this.wire = { start: anchor.pos, end: pos, f, armAt: now + f.arm, until: now + f.dur, charges: f.max,
            particles: [anchor.marker, beam, this.wireMarker(pos)], hit: new Set(), leftEnds: false };
        this.wireAnchor = undefined;
        this.wireReadyAt = now + f.icd;
    }

    private tickWire(now: number) {
        if (now >= (this.wire?.until ?? this.wireAnchor?.until ?? Infinity)) this.clearWire();
        const wire = this.wire;
        if (wire === undefined) return;
        const { start, end, f } = wire;
        const pos = this.parent.GetAbsOrigin();
        if (!nearWireEnd(pos, start) && !nearWireEnd(pos, end)) wire.leftEnds = true;
        if (now < wire.armAt) return;
        const dx = end.x - start.x, dy = end.y - start.y;
        const length = length2D(dx, dy);
        const center = Vector((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
        const targets = FindUnitsInRadius(this.parent.GetTeamNumber(), center, undefined, length / 2 + f.radius,
            UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.FOW_VISIBLE + UnitTargetFlags.NO_INVIS, FindOrder.CLOSEST, false);
        for (const target of targets) {
            if (!target.IsRealHero() || !target.IsAlive() || target.IsInvulnerable() || target.IsDebuffImmune() || wire.hit.has(target.entindex())) continue;
            const p = target.GetAbsOrigin();
            const along = Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / (length * length)));
            const nx = p.x - (start.x + along * dx), ny = p.y - (start.y + along * dy);
            const d = length2D(nx, ny);
            if (d > f.radius || Math.abs(p.z - (start.z + along * (end.z - start.z))) > 135) continue;
            const direction = d > 0.01 ? Vector(nx / d, ny / d, 0) : Vector(-dy / length, dx / length, 0);
            wire.hit.add(target.entindex());
            wire.charges--;
            this.shove(target, direction, f.dist, 0.25);
            this.applyDebuff(f, f.debuff, target);
            EmitSoundOn("Hero_Zuus.LightningBolt", target);
            if (wire.charges <= 0) { this.clearWire(); return; }
        }
    }

    private combatTick(now: number) {
        const parent = this.parent;
        if (!parent.IsAlive()) { this.clearCombat(); return; }
        this.tickWire(now);
        this.zeus?.tick(now);
        this.maneuvers?.tick(now);
        for (const zone of this.zones.slice()) {
            if (now >= zone.until) { this.removeZone(zone); continue; }
            if (now < zone.next) continue;
            zone.next = now + zone.f.every; // после задержки кадра не выдаём залп пропущенных тиков
            const f = zone.f;
            const units = FindUnitsInRadius(parent.GetTeamNumber(), zone.pos, undefined, f.radius,
                UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.NONE, FindOrder.ANY, false);
            for (const u of units) {
                if (!u.IsAlive() || !u.IsRealHero() || !insideRing(((u.GetAbsOrigin() - zone.pos) as Vector).Length2D(), f.inner ?? 0, f.radius)) continue;
                const id = u.entindex();
                const entry = !zone.entered.has(id) ? this.num(f.entryDmg, f) : 0;
                zone.entered.add(id);
                this.damage(u, this.num(f.dmg, f) + entry, DamageTypes.MAGICAL, f);
                if (f.debuff !== undefined && !u.IsDebuffImmune()) this.applyDebuff(f, f.debuff, u);
            }
        }
        for (const [key, link] of this.tethers) {
            const f = link.f, target = link.target;
            if (now >= link.until || !IsValidEntity(target) || !target.IsAlive()
                || (f.ownerMod !== undefined && !this.hasOwnCombatModifier(parent, f.ownerMod) && !this.hasOwnCombatModifier(target, f.ownerMod))
                || !this.hasOwnCombatModifier(target, f.targetMod)) { this.tethers.delete(key); continue; }
            const band = tetherBand(((target.GetAbsOrigin() - parent.GetAbsOrigin()) as Vector).Length2D(), f.minDist ?? 0, f.maxDist, f.breakRange);
            if (band === "broken") { this.tethers.delete(key); continue; }
            if (band !== "active" || target.IsInvulnerable() || target.IsDebuffImmune()) { link.streak = 0; continue; }
            if (now < link.next) continue;
            link.next = now + f.every;
            if (f.isolated !== undefined) {
                const nearby = FindUnitsInRadius(parent.GetTeamNumber(), target.GetAbsOrigin(), undefined, f.isolated,
                    UnitTargetTeam.ENEMY, UnitTargetType.HERO, UnitTargetFlags.MAGIC_IMMUNE_ENEMIES + UnitTargetFlags.INVULNERABLE, FindOrder.ANY, false);
                if (nearby.some(u => u !== target && u.IsAlive() && u.IsRealHero())) { link.streak = 0; continue; }
            }
            link.streak++;
            let amount = this.num(f.dmg, f);
            if (!link.finished && f.finishTicks !== undefined && link.streak >= f.finishTicks) {
                link.finished = true;
                amount += this.num(f.finishDmg, f);
            }
            const dealt = this.damage(target, amount, DamageTypes.MAGICAL, f);
            if (f.heal !== undefined && dealt > 0) parent.Heal(dealt * f.heal / 100, this.ab(f.ab));
            const fx = ParticleManager.CreateParticle(CHAIN_PFX, ParticleAttachment.CUSTOMORIGIN, parent);
            ParticleManager.SetParticleControl(fx, 0, parent.GetAbsOrigin());
            ParticleManager.SetParticleControl(fx, 1, target.GetAbsOrigin());
            ParticleManager.ReleaseParticleIndex(fx);
        }
    }

    /** Умирая, герой теряет незавершённые сочетания, свои зоны и связи. */
    clearCombat() {
        this.combatEpoch++;
        this.clearWire();
        this.zeus?.clear();
        this.maneuvers?.clear();
        for (const zone of this.zones.slice()) this.removeZone(zone);
        this.tethers.clear();
        for (const set of this.marks.values()) for (const mark of set.values()) if (!mark.spent && !mark.mod.IsNull()) mark.mod.Destroy();
        this.marks.clear();
        for (const state of this.guards.values()) state.until = 0;
        for (const state of this.comboStates.values()) state.casts = {};
    }

    /** Убрать следы и ловушки (смерть героя, снятие эффектов). */
    clear() {
        this.clearCombat();
        for (const t of this.traps.slice()) this.removeTrap(t);
        for (const tp of this.trail) {
            if (tp.fx !== undefined) {
                ParticleManager.DestroyParticle(tp.fx, true);
                ParticleManager.ReleaseParticleIndex(tp.fx);
            }
        }
        this.trail = [];
    }
}
