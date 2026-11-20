local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayIsArray = ____lualib.__TS__ArrayIsArray
local __TS__StringSubstring = ____lualib.__TS__StringSubstring
local __TS__Number = ____lualib.__TS__Number
local ____exports = {}
local ____fxdata = require("core.fxdata")
local FX_LIST = ____fxdata.FX_LIST
local byOrb = __TS__New(Map)
local byKey = __TS__New(Map)
for ____, f in ipairs(FX_LIST) do
    local list = byOrb:get(f.orb) or ({})
    list[#list + 1] = f
    byOrb:set(f.orb, list)
    byKey:set(f.key, f)
end
--- Эффекты сферы.
function ____exports.fxOfOrb(orb)
    return byOrb:get(orb) or ({})
end
function ____exports.fxByKey(key)
    return byKey:get(key)
end
local awakeCache = __TS__New(Map)
--- Эффект с учетом Пробуждения: поля из aw заменяют исходные (props и debuff — по отдельным свойствам).
function ____exports.fxView(f, awake)
    if not awake or f.aw == nil then
        return f
    end
    local cached = awakeCache:get(f.key)
    if cached ~= nil then
        return cached
    end
    local out = {}
    local src = f
    for k in pairs(src) do
        out[k] = src[k]
    end
    local aw = f.aw
    for k in pairs(aw) do
        local a = aw[k]
        local b = src[k]
        if type(a) == "table" and a ~= nil and not __TS__ArrayIsArray(a) and type(b) == "table" and b ~= nil and not __TS__ArrayIsArray(b) then
            local merged = {}
            for kk in pairs(b) do
                merged[kk] = b[kk]
            end
            for kk in pairs(a) do
                local av = a[kk]
                local bv = b[kk]
                if kk == "props" and type(av) == "table" and type(bv) == "table" then
                    local p = {}
                    for x in pairs(bv) do
                        p[x] = bv[x]
                    end
                    for x in pairs(av) do
                        p[x] = av[x]
                    end
                    merged[kk] = p
                else
                    merged[kk] = av
                end
            end
            out[k] = merged
        else
            out[k] = a
        end
    end
    local view = out
    awakeCache:set(f.key, view)
    return view
end
--- Разбор «ключ» или «ключ*множитель».
function ____exports.parseFxExpr(s)
    local i = (string.find(s, "*", nil, true) or 0) - 1
    if i < 0 then
        return {key = s, mult = 1}
    end
    local m = __TS__Number(__TS__StringSubstring(s, i + 1))
    return {
        key = __TS__StringSubstring(s, 0, i),
        mult = m == m and m or 1
    }
end
--- Значение числа эффекта. Строку берем из способности: special(ключ) × множитель.
-- special — функция, читающая значение способности (на сервере и клиенте своя).
function ____exports.fxNum(v, special)
    if v == nil then
        return 0
    end
    if type(v) == "number" then
        return v
    end
    local e = ____exports.parseFxExpr(v)
    return special(e.key) * e.mult
end
return ____exports
