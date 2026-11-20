// Типы данных сфер (общие для сервера и клиента).

export type Rarity = "grey" | "blue" | "purple" | "legend";
export type Branch = "Q" | "W" | "E" | "R" | "H";

export interface GreyDef {
    id: string;
    per: number;
    cap: number;
    max: number;
    unit: string;
}

export interface BlueMod {
    key: string;
    /** Число операции: прибавка, множитель или новое значение (см. op). */
    add: number;
    /** add (по умолчанию) — прибавить за стак, mul — умножить итог, set — заменить значение,
     *  pct — +add% к значению способности за стак (растет вместе с уровнем способности). */
    op?: "add" | "mul" | "set" | "pct";
    unit: string;
    /** Значение на максимальном уровне способности без сфер (из файлов Доты, для справки). */
    base: number;
}

/** Улучшение синей, фиолетовой или легендарной сферы. */
export interface UpgradeDef {
    id: string;
    rarity: "blue" | "purple" | "legend";
    /** Герой или «*» — доступно всем. */
    hero: string;
    branch: Branch;
    ability: string;
    mods: BlueMod[];
    /** Снижение перезарядки за стак, % (0 — нет). */
    cd: number;
    /** Порог стаков: после него каждая сфера дает половину (предела нет, кроме своих фиолетовых и легендарок). */
    max: number;
    /** Эффект написан кодом (нет изменений значений способности). */
    code: boolean;
    /** Механика: меняет то, как играется способность (предлагается и среди синих). */
    mech?: boolean;
    /** Изменения значений только после Пробуждения (легендарки). */
    awmods?: BlueMod[];
}

/** Совместимость: синие — частный случай улучшения. */
export type BlueDef = UpgradeDef;
