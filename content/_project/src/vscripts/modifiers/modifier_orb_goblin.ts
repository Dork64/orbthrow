// Гоблин-казначей: виден всем, записывает, кто наносил ему урон (для помощи).
import { ModBase } from "../lib/modbase";
import { registerModifier } from "../lib/registry";

declare global {
    // eslint-disable-next-line no-var
    var modifier_orb_goblin: unknown;
}

export interface GoblinHit { pid: number; time: number; amount: number }

export class ModifierOrbGoblin extends ModBase {
    hits: GoblinHit[] = [];

    IsHidden() { return true; }
    IsPurgable() { return false; }
    RemoveOnDeath() { return false; }
    GetEffectName() { return "particles/generic_gameplay/rune_bounty_owner.vpcf"; }
    GetEffectAttachType() { return ParticleAttachment.ABSORIGIN_FOLLOW; }
    CheckState(): Partial<Record<ModifierState, boolean>> {
        return { [ModifierState.NO_UNIT_COLLISION]: true };
    }
    OnCreated() {
        this.hits = [];
        if (IsServer()) this.StartIntervalThink(0.5);
    }
    DeclareFunctions() {
        return [ModifierFunction.ON_TAKEDAMAGE];
    }
    OnTakeDamage(e: ModifierInstanceEvent) {
        if (!IsServer() || e.unit !== this.GetParent()) return;
        const a = e.attacker;
        if (a === undefined) return;
        const pid = a.GetPlayerOwnerID();
        if (pid < 0) return;
        this.hits.push({ pid, time: GameRules.GetGameTime(), amount: e.damage });
        // Чистим на месте, не заменяя массив: на него ссылается goblin.ts
        if (this.hits.length > 200) this.hits.splice(0, 100);
    }
    /** Видно всем: обзор вокруг Гоблина для каждой команды. */
    OnIntervalThink() {
        const p = this.GetParent();
        if (!p.IsAlive()) return;
        // Команды 2..13, кроме нейтралов (4) и «без команды» (5)
        for (let t = 2; t <= 13; t++) {
            if (t === 4 || t === 5) continue;
            AddFOWViewer(t as DotaTeam, p.GetAbsOrigin(), 350, 0.6, false);
        }
    }
}
modifier_orb_goblin = registerModifier("modifier_orb_goblin", ModifierOrbGoblin);
