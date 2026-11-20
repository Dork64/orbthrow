local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local ____exports = {}
local lastShown = __TS__New(Map)
function ____exports.report(system, err)
    local text = (("[orbthrow] ошибка в «" .. system) .. "»: ") .. tostring(err)
    print(text)
    local now = Time()
    local prev = lastShown:get(text)
    if prev ~= nil and now - prev < 30 then
        return
    end
    lastShown:set(text, now)
    CustomGameEventManager:Send_ServerToAllClients("orb_error", {text = text})
end
function ____exports.safe(system, fn)
    local ok, result = pcall(fn)
    if not ok then
        ____exports.report(system, result)
        return nil
    end
    return result
end
function ____exports.log(...)
    local parts = {...}
    print("[orbthrow] " .. table.concat(
        __TS__ArrayMap(
            parts,
            function(____, p) return tostring(p) end
        ),
        " "
    ))
end
function ____exports.heroOf(id)
    local h = PlayerResource:GetSelectedHeroEntity(id)
    if h ~= nil and IsValidEntity(h) then
        return h
    end
    return nil
end
function ____exports.isValid(e)
    return e ~= nil and IsValidEntity(e) and not e:IsNull()
end
function ____exports.dist2d(a, b)
    return (a - b):Length2D()
end
--- Случайная точка в кольце между rMin и rMax (равномерно по площади).
function ____exports.randomPointInRing(center, rMin, rMax)
    local a2 = rMin * rMin
    local r = math.sqrt(a2 + (rMax * rMax - a2) * RandomFloat(0, 1))
    local ang = RandomFloat(0, math.pi * 2)
    return Vector(
        center.x + r * math.cos(ang),
        center.y + r * math.sin(ang),
        center.z
    )
end
function ____exports.randomPointInCircle(center, radius)
    local r = radius * math.sqrt(RandomFloat(0, 1))
    local ang = RandomFloat(0, math.pi * 2)
    return Vector(
        center.x + r * math.cos(ang),
        center.y + r * math.sin(ang),
        center.z
    )
end
return ____exports
