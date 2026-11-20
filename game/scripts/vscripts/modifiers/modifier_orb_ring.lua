local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbRing = __TS__Class()
local ModifierOrbRing = ____exports.ModifierOrbRing
ModifierOrbRing.name = "ModifierOrbRing"
__TS__ClassExtends(ModifierOrbRing, ModBase)
function ModifierOrbRing.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.radius = 900
end
function ModifierOrbRing.prototype.IsHidden(self)
    return false
end
function ModifierOrbRing.prototype.IsPurgable(self)
    return false
end
function ModifierOrbRing.prototype.IsDebuff(self)
    return false
end
function ModifierOrbRing.prototype.RemoveOnDeath(self)
    return true
end
function ModifierOrbRing.prototype.GetTexture(self)
    return "item_gem"
end
function ModifierOrbRing.prototype.GetPriority(self)
    return MODIFIER_PRIORITY_SUPER_ULTRA
end
function ModifierOrbRing.prototype.CheckState(self)
    return {[MODIFIER_STATE_INVISIBLE] = false}
end
function ModifierOrbRing.prototype.OnCreated(self, params)
    if not IsServer() then
        return
    end
    self.radius = params.r or 900
    self:StartIntervalThink(0.2)
end
function ModifierOrbRing.prototype.OnIntervalThink(self)
    local o = self:GetParent():GetAbsOrigin()
    if o.x * o.x + o.y * o.y > self.radius * self.radius then
        self:Destroy()
    end
end
modifier_orb_ring = registerModifier("modifier_orb_ring", ____exports.ModifierOrbRing)
return ____exports
