// Баффы событий арены (game/arenaevents.ts): Ускорение и Кровавая луна. Висят на всех героях,
// пока идет событие; новый герой (возрождение) получает их при появлении.
import { ARENA } from "../core/arenaevents";
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    /* eslint-disable no-var */
    var modifier_orb_event_haste: unknown;
    var modifier_orb_event_bloodmoon: unknown;
    var modifier_orb_vanish_speed: unknown;
    /* eslint-enable no-var */
}

export class ModifierOrbEventHaste extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    IsDebuff() { return false; }
    RemoveOnDeath() { return false; }
    GetTexture() { return "rune_haste"; }
    DeclareFunctions() {
        return [ModifierFunction.MOVESPEED_BONUS_PERCENTAGE, ModifierFunction.COOLDOWN_PERCENTAGE, ModifierFunction.MANACOST_PERCENTAGE];
    }
    GetModifierMoveSpeedBonus_Percentage() { return ARENA.hasteMs; }
    GetModifierPercentageCooldown() { return ARENA.hasteCdr; }
    GetModifierPercentageManacost() { return ARENA.hasteMana; }
}

export class ModifierOrbEventBloodmoon extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return false; }
    IsDebuff() { return false; }
    RemoveOnDeath() { return false; }
    GetTexture() { return "item_satanic"; }
    DeclareFunctions() {
        return [ModifierFunction.ON_TAKEDAMAGE, ModifierFunction.TOOLTIP];
    }
    OnTooltip() { return ARENA.moonLifesteal; }
    /** Вампиризм от любого урона по героям (атаки и способности). */
    OnTakeDamage(e: ModifierInstanceEvent) {
        if (!IsServer()) return;
        const parent = this.GetParent();
        if (e.attacker !== parent || e.unit === parent || !e.unit.IsRealHero()) return;
        if (parent.GetTeamNumber() === e.unit.GetTeamNumber() || !parent.IsAlive()) return;
        if (e.damage <= 0 || (e.damage_flags & (DamageFlag.REFLECTION + DamageFlag.HPLOSS)) !== 0) return;
        const spell = e.inflictor !== undefined;
        if (spell && (e.damage_flags & DamageFlag.NO_SPELL_LIFESTEAL) !== 0) return;
        parent.HealWithParams(e.damage * ARENA.moonLifesteal / 100, e.inflictor as CDOTABaseAbility, true, true, parent, spell);
    }
}

/** Исчезновение (общая фиолетовая): +20% скорости бега на время невидимости после ультимейта. */
export class ModifierOrbVanishSpeed extends ModBase {
    IsHidden() { return false; }
    IsPurgable() { return true; }
    IsDebuff() { return false; }
    GetTexture() { return "item_invis_sword"; }
    DeclareFunctions() { return [ModifierFunction.MOVESPEED_BONUS_PERCENTAGE]; }
    GetModifierMoveSpeedBonus_Percentage() { return 20; }
}

modifier_orb_event_haste = registerModifier("modifier_orb_event_haste", ModifierOrbEventHaste);
modifier_orb_event_bloodmoon = registerModifier("modifier_orb_event_bloodmoon", ModifierOrbEventBloodmoon);
modifier_orb_vanish_speed = registerModifier("modifier_orb_vanish_speed", ModifierOrbVanishSpeed);
