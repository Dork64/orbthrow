// Расчет бонусов сфер по стакам игрока. Общий для сервера и клиента:
// сервер заполняет хранилище из состояния игрока, клиент — из сетевой таблицы orb_spheres
// (иначе подсказки и цифры на панели героя у клиента были бы без сфер).

import { diminishing, effectiveStacks, greyDef, ORB, upDef } from "./orbs";
import { fxOfOrb, fxView } from "./fxutil";
import { SPECIAL_CAPS } from "./orbdata";
import { CODE_SPECIALS } from "./herocode";
import type { BlueMod } from "./orbtypes";

export interface OrbBonuses {
    health: number;
    damage: number;
    armor: number;
    attackSpeed: number;
    spellAmp: number;
    magicResist: number;
    moveSpeed: number;
    hpRegen: number;
    mana: number;
    manaRegen: number;
    str: number;
    agi: number;
    int: number;
    /** Общее снижение перезарядки способностей, % */
    cdr: number;
    status: number;
    lifesteal: number;
    /** способность → ключ → прибавка */
    specials: Record<string, Record<string, number>>;
    /** способность → ключ → новое значение (вместо значения способности) */
    specialsSet: Record<string, Record<string, number>>;
    /** способность → ключ → множитель итогового значения */
    specialsMul: Record<string, Record<string, number>>;
    /** способность → снижение перезарядки от синих сфер, % */
    abilityCdr: Record<string, number>;
    /** стаки всех взятых синих, фиолетовых и легендарных сфер, id → стаки (для эффектов-кода) */
    code: Record<string, number>;
    /** Пробуждение легендарки (20 уровень) */
    awake: boolean;
    /** Эффекты «запасной заряд» добавляются к одному обычному применению. */
    spareChargeAbilities: Record<string, boolean>;
}

function empty(): OrbBonuses {
    return {
        health: 0, damage: 0, armor: 0, attackSpeed: 0, spellAmp: 0, magicResist: 0, moveSpeed: 0,
        hpRegen: 0, mana: 0, manaRegen: 0, str: 0, agi: 0, int: 0, cdr: 0, status: 0, lifesteal: 0,
        specials: {}, specialsSet: {}, specialsMul: {}, abilityCdr: {}, code: {}, awake: false, spareChargeAbilities: {},
    };
}

/** Значение серой сферы: с убыванием до предела или линейно с половинной прибавкой после порога. */
export function greyValue(id: string, stacks: number): number {
    const g = greyDef(id);
    if (g === undefined) return 0;
    if (id === "g_status") return Math.min(50, g.per * stacks);
    if (g.cap > 0) return diminishing(stacks, g.per, g.cap);
    return g.per * effectiveStacks(stacks, g.max);
}

/** Изменения значений способности: прибавка за стак, процент, множитель или замена. n — действующие стаки. */
function applyMods(b: OrbBonuses, ability: string, mods: BlueMod[], n: number) {
    for (const m of mods) {
        if (m.op === "pct") {
            const t = b.specialsMul[ability] ?? {};
            t[m.key] = (t[m.key] ?? 1) * (1 + (m.add * n) / 100);
            b.specialsMul[ability] = t;
        } else if (m.op === "mul") {
            const t = b.specialsMul[ability] ?? {};
            t[m.key] = (t[m.key] ?? 1) * Math.pow(m.add, n);
            b.specialsMul[ability] = t;
        } else if (m.op === "set") {
            const t = b.specialsSet[ability] ?? {};
            t[m.key] = m.add;
            b.specialsSet[ability] = t;
        } else {
            const t = b.specials[ability] ?? {};
            t[m.key] = (t[m.key] ?? 0) + m.add * n;
            b.specials[ability] = t;
        }
    }
}

/** Атрибуты: 0 сила, 1 ловкость, 2 интеллект, 3 универсальный. */
export function computeBonuses(stacks: Record<string, number>, primaryAttr: number): OrbBonuses {
    const b = empty();
    const s = (id: string) => stacks[id] ?? 0;
    b.health = greyValue("g_health", s("g_health"));
    b.damage = greyValue("g_damage", s("g_damage"));
    b.armor = greyValue("g_armor", s("g_armor"));
    b.attackSpeed = greyValue("g_attack_speed", s("g_attack_speed"));
    b.spellAmp = greyValue("g_spell_amp", s("g_spell_amp"));
    b.magicResist = greyValue("g_magic_resist", s("g_magic_resist"));
    b.moveSpeed = greyValue("g_move_speed", s("g_move_speed"));
    b.hpRegen = greyValue("g_hp_regen", s("g_hp_regen"));
    b.mana = greyValue("g_mana", s("g_mana"));
    b.manaRegen = 1.5 * effectiveStacks(s("g_mana"), greyDef("g_mana")?.max ?? 0);
    b.cdr = greyValue("g_cdr", s("g_cdr"));
    b.status = greyValue("g_status", s("g_status"));
    b.lifesteal = greyValue("g_lifesteal", s("g_lifesteal"));
    const prim = greyValue("g_primary", s("g_primary"));
    if (primaryAttr === 0) b.str = prim;
    else if (primaryAttr === 1) b.agi = prim;
    else if (primaryAttr === 2) b.int = prim;
    else if (prim > 0) {
        const each = 2.5 * effectiveStacks(s("g_primary"), greyDef("g_primary")?.max ?? 0);
        b.str = each;
        b.agi = each;
        b.int = each;
    }
    b.awake = s("awake") > 0;
    for (const id in stacks) {
        const n = stacks[id];
        if (n <= 0) continue;
        const d = upDef(id);
        if (d === undefined) continue;
        b.code[id] = n;
        for (const effect of fxOfOrb(id)) {
            const f = fxView(effect, b.awake);
            if (f.t !== "charges") continue;
            b.spareChargeAbilities[d.ability] = true;
            const t = b.specials[d.ability] ?? {};
            t.AbilityCharges = (t.AbilityCharges ?? 0) + f.n;
            b.specials[d.ability] = t;
        }
        if (d.code) continue;
        if (d.cd > 0) {
            b.abilityCdr[d.ability] = diminishing(n, d.cd, ORB.blueCdCap);
        }
        // Синие: после порога из данных — половинная прибавка (предела стаков нет)
        applyMods(b, d.ability, d.mods, d.rarity === "blue" ? effectiveStacks(n, d.max) : n);
        if (b.awake && d.awmods !== undefined) applyMods(b, d.ability, d.awmods, 1);
    }
    // Значения способностей, которые меняют сферы-код (Вечный вихрь, Буря клинков и т.д.)
    for (const c of CODE_SPECIALS) {
        if ((b.code[c.id] ?? 0) <= 0) continue;
        if (c.when === "awake" && !b.awake) continue;
        if (c.when === "notAwake" && b.awake) continue;
        if (c.op === "add") {
            const t = b.specials[c.ability] ?? {};
            t[c.key] = (t[c.key] ?? 0) + c.value;
            b.specials[c.ability] = t;
        } else if (c.op === "set") {
            const t = b.specialsSet[c.ability] ?? {};
            t[c.key] = c.value;
            b.specialsSet[c.ability] = t;
        } else {
            const t = b.specialsMul[c.ability] ?? {};
            t[c.key] = (t[c.key] ?? 1) * c.value;
            b.specialsMul[c.ability] = t;
        }
    }
    return b;
}

/** Итоговое значение ключа способности с учетом сфер; undefined — сферы его не меняют. */
export function overrideValue(b: OrbBonuses, ability: string, key: string, base: number): number | undefined {
    const add = b.specials[ability]?.[key];
    const set = b.specialsSet[ability]?.[key];
    const mul = b.specialsMul[ability]?.[key];
    if (add === undefined && set === undefined && mul === undefined) return undefined;
    const from = set !== undefined ? set : base;
    let v = (from + (add ?? 0)) * (mul ?? 1);
    // Сферы без предела стаков: убывающее значение не переходит через ноль и не падает ниже
    // четверти исходного (например, «атак до контратаки» не станет 0 или меньше)
    if (add !== undefined && add < 0 && from > 0) v = Math.max(v, from * 0.25);
    if (add !== undefined && add > 0 && from < 0) v = Math.min(v, 0);
    const cap = SPECIAL_CAPS[ability]?.[key];
    if (cap !== undefined) v = Math.min(v, Math.max(cap, base)); // не ослаблять штатные таланты и предметы
    return v;
}

/** Хранилище по номеру игрока. version растет при каждом изменении стаков. */
interface OrbStoreData {
    bonuses: Map<number, OrbBonuses>;
    versions: Map<number, number>;
    checkedAt: Map<number, number>;
}

declare const _G: any;
const fallbackStore: OrbStoreData = { bonuses: new Map(), versions: new Map(), checkedAt: new Map() };

/**
 * Хранилище живет в _G: файл модификатора движок загружает в своем окружении,
 * и даже если модуль подключится там второй раз, данные останутся общими.
 */
function store(): OrbStoreData {
    if (typeof _G === "undefined") return fallbackStore; // тесты в Node
    const g = _G as { ORBTHROW_ORB_STORE?: OrbStoreData };
    if (g.ORBTHROW_ORB_STORE === undefined) {
        g.ORBTHROW_ORB_STORE = { bonuses: new Map(), versions: new Map(), checkedAt: new Map() };
    }
    return g.ORBTHROW_ORB_STORE;
}




export function setBonuses(pid: number, stacks: Record<string, number>, primaryAttr: number, version: number) {
    store().bonuses.set(pid, computeBonuses(stacks, primaryAttr));
    store().versions.set(pid, version);
}

const EMPTY = empty();

/**
 * Бонусы игрока. На клиенте раз в 0.25 с сверяется с сетевой таблицей.
 * now — игровое время (GameRules.GetGameTime()), isServer — IsServer().
 */
export function bonusesOf(pid: number, isServer: boolean, now: number): OrbBonuses {
    if (!isServer) {
        const last = store().checkedAt.get(pid) ?? -1;
        if (now - last > 0.25 || now < last) {
            store().checkedAt.set(pid, now);
            const t = CustomNetTables.GetTableValue("orb_spheres", tostring(pid)) as any;
            if (t !== undefined && t.v !== store().versions.get(pid)) {
                const stacks: Record<string, number> = {};
                if (t.st !== undefined) for (const k in t.st) stacks[k] = tonumber(t.st[k]) ?? 0;
                setBonuses(pid, stacks, tonumber(t.pa) ?? 0, t.v);
            }
        }
    }
    return store().bonuses.get(pid) ?? EMPTY;
}

export function nativeChargeCount(base: number, extra: number, spare = true): number {
    return (spare ? Math.max(1, base) : Math.max(0, base)) + Math.max(0, extra);
}
