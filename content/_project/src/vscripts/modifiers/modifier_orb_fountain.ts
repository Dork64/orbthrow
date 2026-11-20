// Фонтан (просьба автора 31.10): у своего фонтана быстрое восстановление здоровья и маны,
// при выходе — ускорение на 3 с. Урон за последние 3 с выключает и то и другое:
// восстановление становится обычным (медленным, его дает сама Дота), ускорения нет.
// Модификатор постоянный, висит на каждом герое. Стаки: 0 — вне базы, 1 — на базе после урона,
// 2 — на базе без урона (быстрое восстановление). На своей базе герой проходит сквозь других
// (крипы и игроки не запирают узкий проход к фонтану).
import { CONFIG } from "../core/config";
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_fountain: unknown;
    // eslint-disable-next-line no-var
    var modifier_orb_fountain_haste: unknown;
}

const HASTE = "modifier_orb_fountain_haste";

export class ModifierOrbFountain extends ModBase {
    fx = 0;
    fy = 0;
    radius = 850;
    regen = 16;
    calm = 3;
    hasteDuration = 3;
    hastePct = 40;
    lastHurt = -100;
    wasInside = false;

    IsHidden() { return this.GetStackCount() < 2; }
    IsPurgable() { return false; }
    IsDebuff() { return false; }
    IsPermanent() { return true; }
    RemoveOnDeath() { return false; }
    GetTexture() { return "rune_regen"; }

    OnCreated(p: { x?: number; y?: number; r?: number; regen?: number; calm?: number; hd?: number; hp?: number }) {
        if (!IsServer()) return;
        this.fx = p.x ?? 0;
        this.fy = p.y ?? 0;
        this.radius = p.r ?? 850;
        this.regen = p.regen ?? 16;
        this.calm = p.calm ?? 3;
        this.hasteDuration = p.hd ?? 3;
        this.hastePct = p.hp ?? 40;
        this.lastHurt = -100;
        this.wasInside = false;
        this.StartIntervalThink(0.1);
    }

    private inside(): boolean {
        const parent = this.GetParent();
        if (!parent.IsAlive()) return false;
        const o = parent.GetAbsOrigin();
        const dx = o.x - this.fx;
        const dy = o.y - this.fy;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    OnIntervalThink() {
        const parent = this.GetParent();
        const now = GameRules.GetGameTime();
        const calm = now - this.lastHurt >= this.calm;
        const inside = this.inside();
        if (this.wasInside && !inside && calm && parent.IsAlive()) {
            parent.AddNewModifier(parent, undefined, HASTE, { duration: this.hasteDuration, pct: this.hastePct });
        }
        this.wasInside = inside;
        const want = inside ? (calm ? 2 : 1) : 0;
        if (this.GetStackCount() !== want) this.SetStackCount(want);
    }

    DeclareFunctions() {
        return [
            ModifierFunction.HEALTH_REGEN_PERCENTAGE,
            ModifierFunction.MANA_REGEN_TOTAL_PERCENTAGE,
            ModifierFunction.ON_TAKEDAMAGE,
        ];
    }

    CheckState(): Partial<Record<ModifierState, boolean>> {
        return { [ModifierState.NO_UNIT_COLLISION]: this.GetStackCount() > 0 };
    }

    // Число берем из конфига: на клиенте параметры создания недоступны, а показать реген надо верно
    GetModifierHealthRegenPercentage() { return this.GetStackCount() >= 2 ? CONFIG.fountainFastRegen : 0; }
    GetModifierTotalPercentageManaRegen() { return this.GetStackCount() >= 2 ? CONFIG.fountainFastRegen : 0; }

    OnTakeDamage(e: ModifierInstanceEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.unit !== parent || e.damage <= 0) return;
        if (e.attacker === parent) return; // свой урон (например, Гниль Пуджа) не считается
        this.lastHurt = GameRules.GetGameTime();
        if (this.GetStackCount() === 2) this.SetStackCount(1);
        parent.RemoveModifierByName(HASTE);
    }
}

export class ModifierOrbFountainHaste extends ModBase {
    pct = 40;
    IsHidden() { return false; }
    IsPurgable() { return true; }
    IsDebuff() { return false; }
    GetTexture() { return "rune_haste"; }
    GetEffectName() { return "particles/generic_gameplay/rune_haste_owner.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }

    OnCreated(p: { pct?: number }) {
        this.pct = p.pct ?? 40;
        if (IsServer()) this.SetStackCount(this.pct);
    }

    DeclareFunctions() { return [ModifierFunction.MOVESPEED_BONUS_PERCENTAGE]; }
    GetModifierMoveSpeedBonus_Percentage() { return this.GetStackCount(); }
}

modifier_orb_fountain = registerModifier("modifier_orb_fountain", ModifierOrbFountain);
modifier_orb_fountain_haste = registerModifier("modifier_orb_fountain_haste", ModifierOrbFountainHaste);
