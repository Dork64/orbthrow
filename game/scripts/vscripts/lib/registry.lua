--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local function copyPrototype(target, cls)
    local proto = cls.prototype
    while proto ~= nil do
        for key in pairs(proto) do
            if target[key] == nil then
                target[key] = proto[key]
            end
        end
        proto = getmetatable(proto)
    end
end
function ____exports.registerModifier(name, cls)
    local t = {}
    copyPrototype(t, cls)
    local originalOnCreated = t.OnCreated
    t.OnCreated = function(self, params)
        local ctor = self.____constructor
        if ctor ~= nil then
            ctor(self)
        end
        if originalOnCreated ~= nil then
            originalOnCreated(self, params)
        end
    end
    _G[name] = t
    return t
end
function ____exports.registerAbility(name, cls)
    local t = {}
    copyPrototype(t, cls)
    local originalSpawn = t.Spawn
    t.Spawn = function(self)
        local ctor = self.____constructor
        if ctor ~= nil then
            ctor(self)
        end
        if originalSpawn ~= nil then
            originalSpawn(self)
        end
    end
    _G[name] = t
    return t
end
return ____exports
