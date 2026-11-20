// Самопроверка при запуске: каждый наш модификатор должен реально создаваться на юните.
// Если движок его не нашел, пробуем второй вариант пути (с «.lua») и громко сообщаем результат —
// по первой же строке лога видно, работают ли сферы, кольцо и защита.

import { MODIFIER_NAMES, modifierFile } from "../lib/links";
import { log, report } from "./util";

let done = false;

export function modifierSelfTest() {
    if (done) return;
    done = true;
    const dummy = CreateUnitByName("npc_dota_xp_granter", Vector(-6000, -6000, 0), false, undefined, undefined, DotaTeam.NEUTRALS);
    if (dummy === undefined) {
        report("самопроверка", "не удалось создать юнит для проверки модификаторов");
        return;
    }
    const failed: string[] = [];
    const tryAll = (names: string[]) => {
        const bad: string[] = [];
        for (const name of names) {
            const m = dummy.AddNewModifier(dummy, undefined, name, { duration: 0.5, amount: 1 });
            if (m === undefined || !dummy.HasModifier(name)) bad.push(name);
            else dummy.RemoveModifierByName(name);
        }
        return bad;
    };
    let bad = tryAll(MODIFIER_NAMES);
    if (bad.length > 0) {
        log("самопроверка: не создались", bad.join(", "), "— пробую путь с .lua");
        for (const name of bad) LinkLuaModifier(name, modifierFile(name) + ".lua", LuaModifierMotionType.NONE);
        bad = tryAll(bad);
    }
    for (const n of bad) failed.push(n);
    UTIL_Remove(dummy);
    if (failed.length === 0) log("самопроверка: все модификаторы работают (" + MODIFIER_NAMES.length + ")");
    else report("самопроверка", "модификаторы не загрузились: " + failed.join(", "));
}
