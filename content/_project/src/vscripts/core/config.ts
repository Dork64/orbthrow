// Все числа баланса в одном месте. Источник — BALANCE.md.
// Модуль не обращается к API Доты: его можно тестировать в Node.

export const CONFIG = {
    // --- Партия ---
    goalBase: 16,
    goalPerPlayer: 1.5,
    goalMin: 20,
    goalMax: 30,
    timeLimit: 30 * 60,
    abandonGoalReduction: 2,
    abandonSeconds: 180,
    lastPlayerWinDelay: 30,
    heroSelectionTime: 30,
    preGameTime: 3, // секунды между выбором героя и стартом (успевают появиться боты)

    // --- Возрождение ---
    respawnFirst: 12,
    respawnLast: 5,
    spawnProtectionRadius: 400,

    // --- Засчитывание ---
    assistWindow: 15,
    assistMinHpShare: 0.05,
    creditWindow: 10,

    // --- Экономика ---
    startGold: 600,
    passiveGpm: 360,
    passiveXpm: 450,
    actionXpMultiplier: 1.5,
    ringRadius: 900,
    ringGpm: 450,
    ringXpm: 1200,
    centerVisionRadius: 1100,
    neutralBountyGrowthPerMin: 0.03,
    neutralStatGrowthPerMin: 0.04,
    neutralGrowthCapMin: 30,

    // --- Награда за убийство ---
    killGoldBase: 150,
    killGoldPerLevel: 8,
    killGoldNetworthShare: 0.2,
    killGoldNetworthCap: 1000,
    killGoldStreakStep: 60,
    killGoldStreakCap: 600,
    huntGold: 300,
    assistGoldShare: 0.35,
    killXpBase: 60,
    killXpShare: 0.06,

    // --- Сферы Повелителя (DESIGN 6.2-6.5) ---
    bossOrbCaptureRadius: 250,
    bossOrbCaptureTime: 4,
    bossOrbDecayPerSecond: 0.25,
    bossOrbMaxAge: 180,
    bossOrbPurpleFrom: 480,
    bossOrbPurpleLate: 1080,
    bossOrbPurpleChanceMid: 0.5,
    bossOrbPurpleChanceLate: 0.7,
    /** Сколько сфер за бросок на каждого игрока: 4 игрока — 1 сфера, 8 — 2 (дробная часть копится). */
    bossOrbsPerPlayer: 0.25,
    overthrowGap: 5,
    overthrowOrbs: 3,

    // --- Сундук курьера: захват как у сфер, но быстрее ---
    chestCaptureRadius: 230,
    chestCaptureTime: 3,

    // --- Монеты Повелителя ---
    coinChancePerSecond: 0.022,
    coinGold: 150,
    coinLifetime: 20,
    /** Монеты падают в кольцо между этими радиусами: ближе к центру их закрывает модель Повелителя. */
    coinMinRadius: 430,
    coinMaxRadius: 800,

    // --- Фонтан (просьба автора 31.10) ---
    /** Радиус базы вокруг своего фонтана: быстрое восстановление, магазин, без столкновений (как аура фонтана Overthrow — 1275). */
    fountainRadius: 1250,
    /** Добавка к восстановлению на фонтане, % здоровья и маны в секунду (базовые 4% дает Дота). */
    fountainFastRegen: 16,
    /** Сколько секунд без урона нужно для быстрого восстановления и ускорения. */
    fountainCalmSeconds: 3,
    fountainHasteDuration: 3,
    fountainHastePct: 40,

    // --- Расходники в слотах (как в 1x6) ---
    startObservers: 2,
    startSentries: 0,
    startSmokes: 3,
    startDusts: 3,
    /** Скорость за каждый съеденный Boots of Travel и сколько их можно съесть. */
    travelEatSpeed: 100,
    travelEatMax: 2,

    // --- Дальние руны-улучшения у края центральной возвышенности ---
    edgeOrbFirst: 300,
    edgeOrbEvery: 150,
    /** Отступ внутрь от края возвышенности. */
    edgeOrbInset: 170,

    // --- Боты (только для тестов в редакторе) ---
    toolsDefaultBots: 5,
    /** Через сколько секунд лобби стартует само, если хост не нажал «Начать». */
    lobbyAutoStart: 40,
} as const;

// Время партии, после которого начинаются события (секунды).
export const TIMINGS = {
    lagBonusTimes: [300, 600, 900, 1200, 1500],
    goblinTimes: [300, 900, 1500],
    courierFirst: 180,
    courierEvery: 90,
    runesFirst: 120,
    runesEvery: 120,
    bossOrbFirst: 60,
    bossOrbEvery: 60,
    bossOrbJitter: 8,
} as const;
