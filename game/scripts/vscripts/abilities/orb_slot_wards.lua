local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____slots = require("game.slots")
local castSlotWard = ____slots.castSlotWard
local slotWardError = ____slots.slotWardError
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local OrbSlotWard = __TS__Class()
OrbSlotWard.name = "OrbSlotWard"
__TS__ClassExtends(OrbSlotWard, AbilityBase)
function OrbSlotWard.prototype.kind(self)
    return self:GetAbilityName() == "orb_slot_observer" and "ob" or "se"
end
function OrbSlotWard.prototype.CastFilterResultLocation(self, location)
    if not IsServer() then
        return UF_SUCCESS
    end
    local caster = self:GetCaster()
    local ____temp_0
    if slotWardError(
        caster,
        self:kind(),
        location
    ) == nil then
        ____temp_0 = UF_SUCCESS
    else
        ____temp_0 = UF_FAIL_CUSTOM
    end
    return ____temp_0
end
function OrbSlotWard.prototype.GetCustomCastErrorLocation(self, location)
    if not IsServer() then
        return ""
    end
    return slotWardError(
        self:GetCaster(),
        self:kind(),
        location
    ) or ""
end
function OrbSlotWard.prototype.OnSpellStart(self)
    if IsServer() then
        castSlotWard(
            self:GetCaster(),
            self:kind(),
            self:GetCursorPosition(),
            self
        )
    end
end
orb_slot_observer = registerAbility("orb_slot_observer", OrbSlotWard)
orb_slot_sentry = registerAbility("orb_slot_sentry", OrbSlotWard)
return ____exports
