// Сферы-код героев уровня A (Axe, Juggernaut): какие значения способностей они меняют.
// Остальные эффекты этих сфер — в modifiers/modifier_orb_hero.ts. Без API Доты: файл
// загружается и на клиенте (подсказки способностей показывают новые числа).

export interface CodeSpecial {
    id: string;
    ability: string;
    key: string;
    /** add — прибавить, set — заменить, mul — умножить итог */
    op: "add" | "set" | "mul";
    value: number;
    /** awake — только после Пробуждения, notAwake — только до него */
    when?: "awake" | "notAwake";
}

export const CODE_SPECIALS: CodeSpecial[] = [
    // Вечный вихрь: Спираль каждые 2 атаки, 70% урона (после Пробуждения — 100%)
    { id: "axe_l_eternal", ability: "axe_counter_helix", key: "trigger_attacks", op: "set", value: 2 },
    { id: "axe_l_eternal", ability: "axe_counter_helix", key: "damage", op: "mul", value: 0.7, when: "notAwake" },
    // Кровавая охота, Пробуждение: урон Голода ×1.5, замедление +10%
    { id: "axe_l_hunt", ability: "axe_battle_hunger", key: "damage_per_second", op: "mul", value: 1.5, when: "awake" },
    { id: "axe_l_hunt", ability: "axe_battle_hunger", key: "slow", op: "add", value: 10, when: "awake" },
    // Палач, Пробуждение: порог казни +100
    { id: "axe_l_executioner", ability: "axe_culling_blade", key: "damage", op: "add", value: 100, when: "awake" },
    // Буря клинков: радиус +120, Пробуждение: длительность +2 с
    { id: "jugg_l_storm", ability: "juggernaut_blade_fury", key: "blade_fury_radius", op: "add", value: 120 },
    { id: "jugg_l_storm", ability: "juggernaut_blade_fury", key: "duration", op: "add", value: 2, when: "awake" },
];

/** Числа эффектов-кода (в одном месте, чтобы описания и код не расходились). */
export const HERO_CODE = {
    spikedReturn: 0.25,
    ironWillStatus: 40,
    contagiousRadius: 900,
    feastHeal: 0.6,
    lacerateArmor: 1,
    lacerateMax: 8,
    lacerateDuration: 6,
    spinMs: 4,
    spinAs: 15,
    spinMax: 5,
    spinDuration: 4,
    oneArmyRadius: 700,
    arenaRadius: 550,
    arenaDuration: 2.5,
    arenaDurationAwake: 4,
    arenaArmor: 20,
    arenaDamageAwake: 20,
    huntRadius: 450,
    huntArmor: 4,
    huntMs: 5,
    executionerWindow: 3,
    executionerWindowAwake: 5,
    executionerRange: 400,
    wardArmor: 5,
    healingFuryRange: 1200,
    deathDanceCdr: 1,
    finisherChance: 12,
    finisherHealthPct: 40,
    bloodyOmniHeal: 0.25,
    dispelImmunity: 1.5,
    stormPullPerSecond: 60,
    sanctuaryInvuln: 5,
    sanctuaryReduce: 20,
    sanctuaryReduceAwake: 30,
    sanctuaryHealAwake: 1,
    cutsPct: 0.25,
    cutsPctAwake: 0.4,
    cutsDuration: 3,
    endlessExtend: 1,
    endlessExtendAwake: 1.5,
    endlessDamageAwake: 15,
    /** Атака считается критом, если урон больше среднего хотя бы в 1.3 раза */
    critRatio: 1.3,
} as const;
