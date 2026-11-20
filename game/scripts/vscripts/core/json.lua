local ____lualib = require("lualib_bundle")
local __TS__StringCharAt = ____lualib.__TS__StringCharAt
local __TS__ArrayIsArray = ____lualib.__TS__ArrayIsArray
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ObjectKeys = ____lualib.__TS__ObjectKeys
local __TS__ArraySort = ____lualib.__TS__ArraySort
local ____exports = {}
local function esc(s)
    local out = ""
    do
        local i = 0
        while i < #s do
            local c = __TS__StringCharAt(s, i)
            if c == "\"" or c == "\\" then
                out = out .. "\\" .. c
            elseif c == "\n" then
                out = out .. "\\n"
            else
                out = out .. c
            end
            i = i + 1
        end
    end
    return ("\"" .. out) .. "\""
end
function ____exports.toJson(v)
    if v == nil or v == nil then
        return "null"
    end
    if type(v) == "number" then
        return (v ~= v or v == math.huge or v == -math.huge) and "null" or tostring(math.floor(v * 100 + 0.5) / 100)
    end
    if type(v) == "boolean" then
        return v and "true" or "false"
    end
    if type(v) == "string" then
        return esc(v)
    end
    if __TS__ArrayIsArray(v) then
        return ("[" .. table.concat(
            __TS__ArrayMap(
                v,
                function(____, x) return ____exports.toJson(x) end
            ),
            ","
        )) .. "]"
    end
    local keys = __TS__ArraySort(__TS__ObjectKeys(v))
    return ("{" .. table.concat(
        __TS__ArrayMap(
            keys,
            function(____, k) return (esc(k) .. ":") .. ____exports.toJson(v[k]) end
        ),
        ","
    )) .. "}"
end
return ____exports
