local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbSecondWind = __TS__Class()
local ModifierOrbSecondWind = ____exports.ModifierOrbSecondWind
ModifierOrbSecondWind.name = "ModifierOrbSecondWind"
__TS__ClassExtends(ModifierOrbSecondWind, ModBase)
function ModifierOrbSecondWind.prototype.IsHidden(self)
    return false
end
function ModifierOrbSecondWind.prototype.IsPurgable(self)
    return false
end
function ModifierOrbSecondWind.prototype.IsDebuff(self)
    return false
end
function ModifierOrbSecondWind.prototype.GetTexture(self)
    return "item_satanic"
end
function ModifierOrbSecondWind.prototype.GetEffectName(self)
    return "particles/items_fx/black_king_bar_avatar.vpcf"
end
function ModifierOrbSecondWind.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
function ModifierOrbSecondWind.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_INCOMING_DAMAGE_PERCENTAGE}
end
function ModifierOrbSecondWind.prototype.GetModifierIncomingDamage_Percentage(self)
    return -50
end
modifier_orb_second_wind = registerModifier("modifier_orb_second_wind", ____exports.ModifierOrbSecondWind)
return ____exports
