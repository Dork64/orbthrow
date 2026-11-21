local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local ____exports = {}
local ____orbs = require("core.orbs")
local diminishing = ____orbs.diminishing
local effectiveStacks = ____orbs.effectiveStacks
local greyDef = ____orbs.greyDef
local ORB = ____orbs.ORB
local upDef = ____orbs.upDef
local ____fxutil = require("core.fxutil")
local fxOfOrb = ____fxutil.fxOfOrb
local fxView = ____fxutil.fxView
local ____orbdata = require("core.orbdata")
local SPECIAL_CAPS = ____orbdata.SPECIAL_CAPS
local ____herocode = require("core.herocode")
local CODE_SPECIALS = ____herocode.CODE_SPECIALS
local function empty()
    return {
        health = 0,
        damage = 0,
        armor = 0,
        attackSpeed = 0,
        spellAmp = 0,
        magicResist = 0,
        moveSpeed = 0,
        hpRegen = 0,
        mana = 0,
        manaRegen = 0,
        str = 0,
        agi = 0,
        int = 0,
        cdr = 0,
        status = 0,
        lifesteal = 0,
        specials = {},
        specialsSet = {},
        specialsMul = {},
        abilityCdr = {},
        code = {},
        awake = false
    }
end
--- Значение серой сферы: с убыванием до предела или линейно с половинной прибавкой после порога.
function ____exports.greyValue(id, stacks)
    local g = greyDef(id)
    if g == nil then
        return 0
    end
    if id == "g_status" then
        return math.min(50, g.per * stacks)
    end
    if g.cap > 0 then
        return diminishing(stacks, g.per, g.cap)
    end
    return g.per * effectiveStacks(stacks, g.max)
end
--- Изменения значений способности: прибавка за стак, процент, множитель или замена. n — действующие стаки.
local function applyMods(b, ability, mods, n)
    for ____, m in ipairs(mods) do
        if m.op == "pct" then
            local t = b.specialsMul[ability] or ({})
            t[m.key] = (t[m.key] or 1) * (1 + m.add * n / 100)
            b.specialsMul[ability] = t
        elseif m.op == "mul" then
            local t = b.specialsMul[ability] or ({})
            t[m.key] = (t[m.key] or 1) * m.add ^ n
            b.specialsMul[ability] = t
        elseif m.op == "set" then
            local t = b.specialsSet[ability] or ({})
            t[m.key] = m.add
            b.specialsSet[ability] = t
        else
            local t = b.specials[ability] or ({})
            t[m.key] = (t[m.key] or 0) + m.add * n
            b.specials[ability] = t
        end
    end
end
--- Атрибуты: 0 сила, 1 ловкость, 2 интеллект, 3 универсальный.
function ____exports.computeBonuses(stacks, primaryAttr)
    local b = empty()
    local function s(id)
        return stacks[id] or 0
    end
    b.health = ____exports.greyValue(
        "g_health",
        s("g_health")
    )
    b.damage = ____exports.greyValue(
        "g_damage",
        s("g_damage")
    )
    b.armor = ____exports.greyValue(
        "g_armor",
        s("g_armor")
    )
    b.attackSpeed = ____exports.greyValue(
        "g_attack_speed",
        s("g_attack_speed")
    )
    b.spellAmp = ____exports.greyValue(
        "g_spell_amp",
        s("g_spell_amp")
    )
    b.magicResist = ____exports.greyValue(
        "g_magic_resist",
        s("g_magic_resist")
    )
    b.moveSpeed = ____exports.greyValue(
        "g_move_speed",
        s("g_move_speed")
    )
    b.hpRegen = ____exports.greyValue(
        "g_hp_regen",
        s("g_hp_regen")
    )
    b.mana = ____exports.greyValue(
        "g_mana",
        s("g_mana")
    )
    local ____effectiveStacks_3 = effectiveStacks
    local ____s_result_2 = s("g_mana")
    local ____opt_0 = greyDef("g_mana")
    b.manaRegen = 1.5 * ____effectiveStacks_3(____s_result_2, ____opt_0 and ____opt_0.max or 0)
    b.cdr = ____exports.greyValue(
        "g_cdr",
        s("g_cdr")
    )
    b.status = ____exports.greyValue(
        "g_status",
        s("g_status")
    )
    b.lifesteal = ____exports.greyValue(
        "g_lifesteal",
        s("g_lifesteal")
    )
    local prim = ____exports.greyValue(
        "g_primary",
        s("g_primary")
    )
    if primaryAttr == 0 then
        b.str = prim
    elseif primaryAttr == 1 then
        b.agi = prim
    elseif primaryAttr == 2 then
        b.int = prim
    elseif prim > 0 then
        local ____effectiveStacks_7 = effectiveStacks
        local ____s_result_6 = s("g_primary")
        local ____opt_4 = greyDef("g_primary")
        local each = 2.5 * ____effectiveStacks_7(____s_result_6, ____opt_4 and ____opt_4.max or 0)
        b.str = each
        b.agi = each
        b.int = each
    end
    b.awake = s("awake") > 0
    for id in pairs(stacks) do
        do
            local n = stacks[id]
            if n <= 0 then
                goto __continue20
            end
            local d = upDef(id)
            if d == nil then
                goto __continue20
            end
            b.code[id] = n
            for ____, effect in ipairs(fxOfOrb(id)) do
                do
                    local f = fxView(effect, b.awake)
                    if f.t ~= "charges" then
                        goto __continue23
                    end
                    local t = b.specials[d.ability] or ({})
                    t.AbilityCharges = (t.AbilityCharges or 0) + f.n
                    b.specials[d.ability] = t
                end
                ::__continue23::
            end
            if d.code then
                goto __continue20
            end
            if d.cd > 0 then
                b.abilityCdr[d.ability] = diminishing(n, d.cd, ORB.blueCdCap)
            end
            applyMods(
                b,
                d.ability,
                d.mods,
                d.rarity == "blue" and effectiveStacks(n, d.max) or n
            )
            if b.awake and d.awmods ~= nil then
                applyMods(b, d.ability, d.awmods, 1)
            end
        end
        ::__continue20::
    end
    for ____, c in ipairs(CODE_SPECIALS) do
        do
            if (b.code[c.id] or 0) <= 0 then
                goto __continue30
            end
            if c.when == "awake" and not b.awake then
                goto __continue30
            end
            if c.when == "notAwake" and b.awake then
                goto __continue30
            end
            if c.op == "add" then
                local t = b.specials[c.ability] or ({})
                t[c.key] = (t[c.key] or 0) + c.value
                b.specials[c.ability] = t
            elseif c.op == "set" then
                local t = b.specialsSet[c.ability] or ({})
                t[c.key] = c.value
                b.specialsSet[c.ability] = t
            else
                local t = b.specialsMul[c.ability] or ({})
                t[c.key] = (t[c.key] or 1) * c.value
                b.specialsMul[c.ability] = t
            end
        end
        ::__continue30::
    end
    return b
end
--- Итоговое значение ключа способности с учетом сфер; undefined — сферы его не меняют.
function ____exports.overrideValue(b, ability, key, base)
    local ____opt_8 = b.specials[ability]
    local add = ____opt_8 and ____opt_8[key]
    local ____opt_10 = b.specialsSet[ability]
    local set = ____opt_10 and ____opt_10[key]
    local ____opt_12 = b.specialsMul[ability]
    local mul = ____opt_12 and ____opt_12[key]
    if add == nil and set == nil and mul == nil then
        return nil
    end
    local from = set ~= nil and set or base
    local v = (from + (add or 0)) * (mul or 1)
    if add ~= nil and add < 0 and from > 0 then
        v = math.max(v, from * 0.25)
    end
    if add ~= nil and add > 0 and from < 0 then
        v = math.min(v, 0)
    end
    local ____opt_14 = SPECIAL_CAPS[ability]
    local cap = ____opt_14 and ____opt_14[key]
    if cap ~= nil then
        v = math.min(
            v,
            math.max(cap, base)
        )
    end
    return v
end
local fallbackStore = {
    bonuses = __TS__New(Map),
    versions = __TS__New(Map),
    checkedAt = __TS__New(Map)
}
--- Хранилище живет в _G: файл модификатора движок загружает в своем окружении,
-- и даже если модуль подключится там второй раз, данные останутся общими.
local function store()
    if type(_G) == "nil" then
        return fallbackStore
    end
    local g = _G
    if g.ORBTHROW_ORB_STORE == nil then
        g.ORBTHROW_ORB_STORE = {
            bonuses = __TS__New(Map),
            versions = __TS__New(Map),
            checkedAt = __TS__New(Map)
        }
    end
    return g.ORBTHROW_ORB_STORE
end
function ____exports.setBonuses(pid, stacks, primaryAttr, version)
    store().bonuses:set(
        pid,
        ____exports.computeBonuses(stacks, primaryAttr)
    )
    store().versions:set(pid, version)
end
local EMPTY = empty()
--- Бонусы игрока. На клиенте раз в 0.25 с сверяется с сетевой таблицей.
-- now — игровое время (GameRules.GetGameTime()), isServer — IsServer().
function ____exports.bonusesOf(pid, isServer, now)
    if not isServer then
        local last = store().checkedAt:get(pid) or -1
        if now - last > 0.25 or now < last then
            store().checkedAt:set(pid, now)
            local t = CustomNetTables:GetTableValue(
                "orb_spheres",
                tostring(pid)
            )
            if t ~= nil and t.v ~= store().versions:get(pid) then
                local stacks = {}
                if t.st ~= nil then
                    for k in pairs(t.st) do
                        stacks[k] = tonumber(t.st[k]) or 0
                    end
                end
                ____exports.setBonuses(
                    pid,
                    stacks,
                    tonumber(t.pa) or 0,
                    t.v
                )
            end
        end
    end
    return store().bonuses:get(pid) or EMPTY
end
function ____exports.bonusAbilityCharges(b, name, ultimate)
    local ____opt_16 = b.specials[name]
    return (____opt_16 and ____opt_16.AbilityCharges or 0) + (ultimate and (b.code.l_double_ult or 0) > 0 and 1 or 0)
end
function ____exports.nativeChargeCount(base, extra)
    return extra > 0 and math.max(1, base) + extra or base
end
return ____exports
