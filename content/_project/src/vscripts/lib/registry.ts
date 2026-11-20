// Сборка классов Lua-модификаторов и способностей из классов TypeScript (без debug/getfenv).
//
// Как Дота находит модификатор (так делает Overthrow 3.0 и примеры Valve):
// 1. LinkLuaModifier(имя, путь) вызывается ЗАРАНЕЕ, из lib/links.ts — на сервере
//    (addon_game_mode) и на клиенте (addon_game_mode_client). Сам файл модификатора
//    при старте НЕ подключается через require.
// 2. Когда модификатор впервые нужен, движок сам загружает файл в отдельном окружении
//    и ищет там глобальную переменную с именем модификатора. Поэтому каждый файл
//    модификатора делает `modifier_x = registerModifier("modifier_x", Класс)`.
// Это проверяют tools/checklua.js и tools/smoke.lua.

declare const _G: any;

function copyPrototype(target: any, cls: any) {
    let proto = cls.prototype;
    while (proto !== undefined) {
        for (const key in proto) {
            if (target[key] === undefined) target[key] = proto[key];
        }
        proto = getmetatable(proto);
    }
}

/**
 * name — имя модификатора, path — путь к Lua-файлу относительно scripts/vscripts без .lua.
 * Пример: registerModifier("modifier_orb_ring", "modifiers/modifier_orb_ring", ModifierOrbRing)
 */
type SelfFn = (this: any, ...args: any[]) => any;

export function registerModifier(name: string, cls: any): unknown {
    const t: any = {};
    copyPrototype(t, cls);
    const originalOnCreated = t.OnCreated as SelfFn | undefined;
    t.OnCreated = function (this: any, params: any) {
        const ctor = this.____constructor as SelfFn | undefined;
        if (ctor !== undefined) ctor.call(this);
        if (originalOnCreated !== undefined) originalOnCreated.call(this, params);
    };
    _G[name] = t;
    return t;
}

export function registerAbility(name: string, cls: any): unknown {
    const t: any = {};
    copyPrototype(t, cls);
    const originalSpawn = t.Spawn as SelfFn | undefined;
    t.Spawn = function (this: any) {
        const ctor = this.____constructor as SelfFn | undefined;
        if (ctor !== undefined) ctor.call(this);
        if (originalSpawn !== undefined) originalSpawn.call(this);
    };
    _G[name] = t;
    return t;
}
