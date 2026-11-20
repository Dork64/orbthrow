local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbSpawnProtection = __TS__Class()
local ModifierOrbSpawnProtection = ____exports.ModifierOrbSpawnProtection
ModifierOrbSpawnProtection.name = "ModifierOrbSpawnProtection"
__TS__ClassExtends(ModifierOrbSpawnProtection, ModBase)
function ModifierOrbSpawnProtection.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.cx = 0
    self.cy = 0
    self.radius = 400
end
function ModifierOrbSpawnProtection.prototype.IsHidden(self)
    return false
end
function ModifierOrbSpawnProtection.prototype.IsPurgable(self)
    return false
end
function ModifierOrbSpawnProtection.prototype.IsDebuff(self)
    return false
end
function ModifierOrbSpawnProtection.prototype.RemoveOnDeath(self)
    return true
end
function ModifierOrbSpawnProtection.prototype.GetTexture(self)
    return "item_glimmer_cape"
end
function ModifierOrbSpawnProtection.prototype.OnCreated(self, params)
    if not IsServer() then
        return
    end
    self.cx = params.x or 0
    self.cy = params.y or 0
    self.radius = params.r or 400
    self:StartIntervalThink(0.1)
end
function ModifierOrbSpawnProtection.prototype.OnIntervalThink(self)
    local o = self:GetParent():GetAbsOrigin()
    local dx = o.x - self.cx
    local dy = o.y - self.cy
    if dx * dx + dy * dy > self.radius * self.radius then
        self:Destroy()
    end
end
function ModifierOrbSpawnProtection.prototype.CheckState(self)
    return {[MODIFIER_STATE_INVULNERABLE] = true, [MODIFIER_STATE_DISARMED] = true, [MODIFIER_STATE_SILENCED] = true, [MODIFIER_STATE_MUTED] = true}
end
function ModifierOrbSpawnProtection.prototype.GetStatusEffectName(self)
    return "particles/status_fx/status_effect_dark_willow_shadow_realm.vpcf"
end
function ModifierOrbSpawnProtection.prototype.StatusEffectPriority(self)
    return MODIFIER_PRIORITY_SUPER_ULTRA
end
modifier_orb_spawn_protection = registerModifier("modifier_orb_spawn_protection", ____exports.ModifierOrbSpawnProtection)
return ____exports
