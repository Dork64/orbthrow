local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbTravel = __TS__Class()
local ModifierOrbTravel = ____exports.ModifierOrbTravel
ModifierOrbTravel.name = "ModifierOrbTravel"
__TS__ClassExtends(ModifierOrbTravel, ModBase)
function ModifierOrbTravel.prototype.IsHidden(self)
    return false
end
function ModifierOrbTravel.prototype.IsPurgable(self)
    return false
end
function ModifierOrbTravel.prototype.IsPermanent(self)
    return true
end
function ModifierOrbTravel.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbTravel.prototype.AllowIllusionDuplicate(self)
    return true
end
function ModifierOrbTravel.prototype.GetTexture(self)
    return "item_travel_boots"
end
function ModifierOrbTravel.prototype.GetAttributes(self)
    return MODIFIER_ATTRIBUTE_PERMANENT
end
function ModifierOrbTravel.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_CONSTANT}
end
function ModifierOrbTravel.prototype.GetModifierMoveSpeedBonus_Constant(self)
    return CONFIG.travelEatSpeed * self:GetStackCount()
end
modifier_orb_travel = registerModifier("modifier_orb_travel", ____exports.ModifierOrbTravel)
return ____exports
