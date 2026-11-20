local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbPregame = __TS__Class()
local ModifierOrbPregame = ____exports.ModifierOrbPregame
ModifierOrbPregame.name = "ModifierOrbPregame"
__TS__ClassExtends(ModifierOrbPregame, ModBase)
function ModifierOrbPregame.prototype.IsHidden(self)
    return false
end
function ModifierOrbPregame.prototype.IsPurgable(self)
    return false
end
function ModifierOrbPregame.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbPregame.prototype.GetTexture(self)
    return "item_ward_dispenser"
end
function ModifierOrbPregame.prototype.CheckState(self)
    return {[MODIFIER_STATE_ROOTED] = true, [MODIFIER_STATE_DISARMED] = true, [MODIFIER_STATE_INVULNERABLE] = true}
end
modifier_orb_pregame = registerModifier("modifier_orb_pregame", ____exports.ModifierOrbPregame)
return ____exports
