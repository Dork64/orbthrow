--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
--- Эффекты, у которых есть свой модификатор со свойствами (бафф или дебафф).
function ____exports.fxHasModifier(f)
    if f.t == "mark" or f.t == "guard" then
        return true
    end
    if f.t == "combo" or f.t == "wire" or f.t == "thunderball" then
        return true
    end
    if f.t == "zone" or f.t == "maneuver" then
        return f.debuff ~= nil
    end
    if f.t == "buff" or f.t == "passive" or f.t == "lowhp" or f.t == "stacks" or f.t == "still" or f.t == "aura" then
        return true
    end
    if f.t == "kill" then
        return f.stack ~= nil
    end
    if f.t == "hit" then
        return f.debuff ~= nil
    end
    if f.t == "blast" or f.t == "trail" or f.t == "trap" or f.t == "storm" then
        return f.debuff ~= nil
    end
    return false
end
function ____exports.fxModifierName(key)
    return "modifier_orb_fx_" .. key
end
return ____exports
