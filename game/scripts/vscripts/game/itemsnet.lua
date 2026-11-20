local ____lualib = require("lualib_bundle")
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local Map = ____lualib.Map
local __TS__ArraySetLength = ____lualib.__TS__ArraySetLength
local __TS__ArraySort = ____lualib.__TS__ArraySort
local ____exports = {}
local parts = {}
local dirty = __TS__New(Set)
local lastSig = __TS__New(Map)
function ____exports.resetItemsNet()
    __TS__ArraySetLength(parts, 0)
    dirty:clear()
    lastSig:clear()
end
function ____exports.addItemsNetPart(fn)
    parts[#parts + 1] = fn
end
function ____exports.markItemsDirty(pid)
    dirty:add(pid)
end
local function sigOf(v)
    if type(v) ~= "table" then
        return tostring(v)
    end
    local keys = {}
    for k in pairs(v) do
        keys[#keys + 1] = k
    end
    __TS__ArraySort(keys)
    local s = "{"
    for ____, k in ipairs(keys) do
        s = s .. ((k .. "=") .. sigOf(v[k])) .. ","
    end
    return s .. "}"
end
--- Отправить таблицу игрока, если она изменилась (force — каждый вызов проверяет).
function ____exports.pushItemsNet(pid, force)
    if force == nil then
        force = false
    end
    if not force and not dirty:has(pid) then
        return
    end
    dirty:delete(pid)
    local t = {}
    for ____, fn in ipairs(parts) do
        local part = fn(pid)
        for k in pairs(part) do
            t[k] = part[k]
        end
    end
    local sig = sigOf(t)
    if lastSig:get(pid) == sig then
        return
    end
    lastSig:set(pid, sig)
    CustomNetTables:SetTableValue(
        "orb_items",
        tostring(pid),
        t
    )
end
return ____exports
