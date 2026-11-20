// Чистая логика сфер (DESIGN раздел 5): шкалы, пороги, предложения карточек, перебросы, убывание.
// Без API Доты — проверяется тестами в Node и LuaJIT.

import { byPlace } from "./rules";
import { GREY_DEFS, UPGRADE_DEFS } from "./orbdata";
import type { Branch, GreyDef, Rarity, UpgradeDef } from "./orbtypes";

export const ORB = {
    greyNeed: 1000,
    greyRateFirst: 4.5,
    greyRateLast: 8.5,
    blueFirst: 25,
    blueStep: 8,
    purpleFirst: 5,
    purpleStep: 1,
    campPoints: { small: 4, medium: 6, large: 9, ancient: 14 } as Record<string, number>,
    runePoints: 4,
    killPoints: 2,
    killEqualBonus: 1,
    killHuntedBonus: 2,
    assistPoints: 1,
    assistHuntedBonus: 1,
    autoPickSeconds: 60,
    freeRerolls: 2,
    rerollCosts: [150, 300, 450, 600],
    fallbackGold: { grey: 250, blue: 400, purple: 700, legend: 700 } as Record<Rarity, number>,
    /** Перезарядка способности от синих сфер: −15% за стак с убыванием, всего не больше −60%. */
    blueCdCap: 60,
    /** Предела стаков нет (просьба автора 31.10); это число — просто «бесконечность» для пула. */
    stackLimit: 99,
    /** После порога стаков из данных (поле max) каждая следующая сфера дает половину. */
    softCapFactor: 0.5,
    cards: 3,
    /** С каким шансом в синем предложении одна карточка — механика героя, %. */
    mechInBluePct: 50,
    legendCards: 4,
    legendLevel: 10,
    /** Вторая легендарка (выбор из оставшихся) — на 30-й минуте. */
    secondLegendTime: 1800,
    awakeningLevel: 20,
} as const;

export function greyRate(place: number, players: number): number {
    return byPlace(place, players, ORB.greyRateFirst, ORB.greyRateLast);
}

export function blueNeed(count: number): number {
    return ORB.blueFirst + ORB.blueStep * count;
}

export function purpleNeed(count: number): number {
    return ORB.purpleFirst + ORB.purpleStep * count;
}

/**
 * Убывающее сложение: каждый стак забирает per% от оставшегося пути до предела cap.
 * cap <= 0 — обычное сложение.
 */
export function diminishing(stacks: number, per: number, cap: number): number {
    if (stacks <= 0) return 0;
    if (cap <= 0) return per * stacks;
    return cap * (1 - Math.pow(1 - per / cap, stacks));
}

/** Действующие стаки: до порога soft — полностью, после — по половине. */
export function effectiveStacks(stacks: number, soft: number): number {
    if (stacks <= 0) return 0;
    if (soft <= 0 || stacks <= soft) return stacks;
    return soft + (stacks - soft) * ORB.softCapFactor;
}

export function rerollCost(paidUsed: number): number {
    const c = ORB.rerollCosts;
    return c[Math.min(paidUsed, c.length - 1)];
}

/** Шкала: очки и сколько сфер она уже выдала (от этого зависит следующий порог). */
export interface Bar {
    points: number;
    count: number;
}

/** Добавить очки; вернуть, сколько сфер набралось (может быть несколько сразу). */
export function addBarPoints(bar: Bar, pts: number, need: (count: number) => number): number {
    if (pts <= 0) return 0;
    bar.points += pts;
    let gained = 0;
    let guard = 0;
    while (bar.points >= need(bar.count) && guard++ < 50) {
        bar.points -= need(bar.count);
        bar.count++;
        gained++;
    }
    return gained;
}

/** Очки фиолетовой шкалы за убийство. */
export function killPurplePoints(victimKillsBefore: number, killerKillsBefore: number, victimHunted: boolean): number {
    let p = ORB.killPoints;
    if (victimKillsBefore >= killerKillsBefore) p += ORB.killEqualBonus;
    if (victimHunted) p += ORB.killHuntedBonus;
    return p;
}

export function assistPurplePoints(victimHunted: boolean): number {
    return ORB.assistPoints + (victimHunted ? ORB.assistHuntedBonus : 0);
}

// ---------- Пул улучшений ----------

export interface Card {
    id: string;
    rarity: Rarity;
    branch: Branch | "G";
    /** Механика (меняет игру способностью) — подмешивается и в синие предложения. */
    mech?: boolean;
}

const greyById = new Map<string, GreyDef>();
for (const g of GREY_DEFS) greyById.set(g.id, g);
const upById = new Map<string, UpgradeDef>();
for (const u of UPGRADE_DEFS) upById.set(u.id, u);

export function greyDef(id: string): GreyDef | undefined {
    return greyById.get(id);
}
/** Синее, фиолетовое или легендарное улучшение по id. */
export function upDef(id: string): UpgradeDef | undefined {
    return upById.get(id);
}
/** Совместимость со старым именем. */
export const blueDef = upDef;
/** Улучшения героя заданной редкости, включая общие («*»). */
export function upgradesOf(hero: string, rarity: "blue" | "purple" | "legend"): UpgradeDef[] {
    return UPGRADE_DEFS.filter(u => u.rarity === rarity && (u.hero === hero || u.hero === "*"));
}
export function bluesOfHero(hero: string): UpgradeDef[] {
    return UPGRADE_DEFS.filter(u => u.rarity === "blue" && u.hero === hero);
}
/** Все улучшения героя со способностями (для проверки данных при появлении героя). */
export function heroUpgrades(hero: string): UpgradeDef[] {
    return UPGRADE_DEFS.filter(u => u.hero === hero);
}
/** Сколько раз можно взять: серые, синие и общие фиолетовые — без предела; свои фиолетовые и легендарки — по данным. */
export function maxStacks(id: string): number {
    if (greyById.has(id)) return ORB.stackLimit;
    const u = upById.get(id);
    if (u === undefined) return 1;
    if (u.rarity === "blue" || (u.rarity === "purple" && u.hero === "*")) return ORB.stackLimit;
    return u.max;
}
export function rarityOf(id: string): Rarity | undefined {
    if (greyById.has(id)) return "grey";
    return upById.get(id)?.rarity;
}

/** Все доступные варианты редкости (не набравшие максимум). disabled — выключенные проверкой данных. */
export function candidates(rarity: Rarity, hero: string, stacks: Record<string, number>, disabled: Record<string, boolean> = {}, legendSlots = 1): Card[] {
    const out: Card[] = [];
    if (rarity === "grey") {
        for (const g of GREY_DEFS) if ((stacks[g.id] ?? 0) < maxStacks(g.id) && !disabled[g.id]) out.push({ id: g.id, rarity, branch: "G" });
        return out;
    }
    // Легендарок — legendSlots за партию (вторая — на 30-й минуте): набрал — вариантов нет.
    if (rarity === "legend" && upgradesOf(hero, "legend").filter(u => (stacks[u.id] ?? 0) > 0).length >= legendSlots) return out;
    let pool = upgradesOf(hero, rarity);
    // Герои уровня A получают только свои легендарки (они задают стиль игры героем, DESIGN 15)
    if (rarity === "legend") {
        const own = pool.filter(u => u.hero === hero);
        if (own.length > 0) pool = own;
    }
    for (const u of pool) if ((stacks[u.id] ?? 0) < maxStacks(u.id) && !disabled[u.id]) out.push({ id: u.id, rarity, branch: u.branch, mech: u.mech === true });
    return out;
}

const LOWER: Record<Rarity, Rarity | undefined> = { legend: "purple", purple: "blue", blue: "grey", grey: undefined };

export type Offer = { kind: "cards"; rarity: Rarity; asked: Rarity; cards: Card[] } | { kind: "gold"; asked: Rarity; gold: number };

/**
 * Предложение из 3 карточек.
 * - серые: 3 разных общих улучшения;
 * - синие: из разных веток, если возможно; главная ветка (после легендарки) — первой;
 * - пустой пул — редкость ниже, если нет и там — золото;
 * - exclude — карточки прошлого предложения (при перебросе стараемся показать новые).
 * rng(n) возвращает целое 0..n-1.
 */
export function makeOffer(
    asked: Rarity,
    hero: string,
    stacks: Record<string, number>,
    rng: (n: number) => number,
    mainBranch?: Branch,
    exclude: string[] = [],
    disabled: Record<string, boolean> = {},
    legendSlots = 1,
): Offer {
    let rarity: Rarity | undefined = asked;
    while (rarity !== undefined) {
        const all = candidates(rarity, hero, stacks, disabled, legendSlots);
        if (all.length > 0) {
            if (rarity === "legend") return { kind: "cards", rarity, asked, cards: all.slice(0, ORB.legendCards) };
            const fresh = all.filter(c => !exclude.includes(c.id));
            const pool = fresh.length >= Math.min(ORB.cards, all.length) ? fresh : all;
            const cards = pickCards(pool, all, rng, mainBranch);
            // В синие с шансом 50% подмешиваем одну механику героя (вместо последней карточки)
            if (rarity === "blue" && cards.length >= 2 && rng(100) < ORB.mechInBluePct) {
                const mech = upgradesOf(hero, "purple").filter(u => u.mech === true && u.hero === hero &&
                    (stacks[u.id] ?? 0) < maxStacks(u.id) && !disabled[u.id] && !exclude.includes(u.id));
                if (mech.length > 0) {
                    const u = mech[rng(mech.length)];
                    cards[cards.length - 1] = { id: u.id, rarity: "purple", branch: u.branch, mech: true };
                }
            }
            return { kind: "cards", rarity, asked, cards };
        }
        rarity = LOWER[rarity];
    }
    return { kind: "gold", asked, gold: ORB.fallbackGold[asked] };
}

function takeRandom<T>(list: T[], rng: (n: number) => number): T {
    const i = rng(list.length);
    const [x] = list.splice(i, 1);
    return x;
}

function pickCards(pool: Card[], all: Card[], rng: (n: number) => number, mainBranch?: Branch): Card[] {
    const result: Card[] = [];
    const left = pool.slice();
    const usedBranches: string[] = [];
    // Главная ветка первой
    if (mainBranch !== undefined) {
        const main = left.filter(c => c.branch === mainBranch);
        if (main.length > 0) {
            const c = takeRandom(main, rng);
            left.splice(left.indexOf(c), 1);
            result.push(c);
            usedBranches.push(c.branch);
        }
    }
    // Остальные — из разных веток («G» у серых не ограничивает)
    while (result.length < ORB.cards && left.length > 0) {
        const other = left.filter(c => c.branch === "G" || !usedBranches.includes(c.branch));
        const from = other.length > 0 ? other : left;
        const c = takeRandom(from, rng);
        left.splice(left.indexOf(c), 1);
        result.push(c);
        usedBranches.push(c.branch);
    }
    // Если свежих не хватило (переброс), добираем из всех
    if (result.length < ORB.cards) {
        for (const c of all) {
            if (result.length >= ORB.cards) break;
            if (!result.some(r => r.id === c.id)) result.push(c);
        }
    }
    return result;
}

/** Общий предел только бонусов сфер; предметы и способности Доты складываются отдельно. */
export function orbStatusResistance(grey: number, unstoppable: number, sources: number[]): number {
    let keep = (1 - Math.min(50, Math.max(0, grey)) / 100) * (1 - diminishing(unstoppable, 15, 50) / 100);
    for (const value of sources) keep *= 1 - Math.min(50, Math.max(0, value)) / 100;
    return Math.min(50, 100 - keep * 100);
}
