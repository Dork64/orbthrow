local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbLeft = __TS__Class()
local ModifierOrbLeft = ____exports.ModifierOrbLeft
ModifierOrbLeft.name = "ModifierOrbLeft"
__TS__ClassExtends(ModifierOrbLeft, ModBase)
function ModifierOrbLeft.prototype.IsHidden(self)
    return true
end
function ModifierOrbLeft.prototype.IsPurgable(self)
    return false
end
function ModifierOrbLeft.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbLeft.prototype.OnCreated(self)
    if IsServer() then
        self:GetParent():AddNoDraw()
    end
end
function ModifierOrbLeft.prototype.OnDestroy(self)
    if IsServer() then
        self:GetParent():RemoveNoDraw()
    end
end
function ModifierOrbLeft.prototype.CheckState(self)
    return {
        [MODIFIER_STATE_INVULNERABLE] = true,
        [MODIFIER_STATE_OUT_OF_GAME] = true,
        [MODIFIER_STATE_NO_HEALTH_BAR] = true,
        [MODIFIER_STATE_UNSELECTABLE] = true,
        [MODIFIER_STATE_NOT_ON_MINIMAP] = true,
        [MODIFIER_STATE_STUNNED] = true,
        [MODIFIER_STATE_NO_UNIT_COLLISION] = true
    }
end
modifier_orb_left = registerModifier("modifier_orb_left", ____exports.ModifierOrbLeft)
return ____exports
