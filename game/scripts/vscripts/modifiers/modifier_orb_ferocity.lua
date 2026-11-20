local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbFerocity = __TS__Class()
local ModifierOrbFerocity = ____exports.ModifierOrbFerocity
ModifierOrbFerocity.name = "ModifierOrbFerocity"
__TS__ClassExtends(ModifierOrbFerocity, ModBase)
function ModifierOrbFerocity.prototype.IsHidden(self)
    return false
end
function ModifierOrbFerocity.prototype.IsPurgable(self)
    return false
end
function ModifierOrbFerocity.prototype.IsDebuff(self)
    return false
end
function ModifierOrbFerocity.prototype.RemoveOnDeath(self)
    return true
end
function ModifierOrbFerocity.prototype.GetTexture(self)
    return "item_armlet"
end
function ModifierOrbFerocity.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_PREATTACK_BONUS_DAMAGE, MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE}
end
function ModifierOrbFerocity.prototype.GetModifierPreAttack_BonusDamage(self)
    return 12 * self:GetStackCount()
end
function ModifierOrbFerocity.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return 4 * self:GetStackCount()
end
modifier_orb_ferocity = registerModifier("modifier_orb_ferocity", ____exports.ModifierOrbFerocity)
return ____exports
