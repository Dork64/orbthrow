local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbSphereUnit = __TS__Class()
local ModifierOrbSphereUnit = ____exports.ModifierOrbSphereUnit
ModifierOrbSphereUnit.name = "ModifierOrbSphereUnit"
__TS__ClassExtends(ModifierOrbSphereUnit, ModBase)
function ModifierOrbSphereUnit.prototype.IsHidden(self)
    return true
end
function ModifierOrbSphereUnit.prototype.IsPurgable(self)
    return false
end
function ModifierOrbSphereUnit.prototype.CheckState(self)
    return {
        [MODIFIER_STATE_INVULNERABLE] = true,
        [MODIFIER_STATE_NO_HEALTH_BAR] = true,
        [MODIFIER_STATE_UNSELECTABLE] = true,
        [MODIFIER_STATE_NO_UNIT_COLLISION] = true,
        [MODIFIER_STATE_MAGIC_IMMUNE] = true,
        [MODIFIER_STATE_UNTARGETABLE] = true
    }
end
modifier_orb_sphere_unit = registerModifier("modifier_orb_sphere_unit", ____exports.ModifierOrbSphereUnit)
return ____exports
