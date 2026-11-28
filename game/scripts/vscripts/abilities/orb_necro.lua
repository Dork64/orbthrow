local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local function legends(caster)
    return caster:FindModifierByName("modifier_orb_necro_legend")
end
local Pulse = __TS__Class()
Pulse.name = "Pulse"
__TS__ClassExtends(Pulse, AbilityBase)
function Pulse.prototype.GetCastPoint(self)
    local ____opt_0 = legends(self:GetCaster())
    return ____opt_0 and ____opt_0:IsAwake() and 0.4 or 0.6
end
function Pulse.prototype.OnAbilityPhaseStart(self)
    local ____temp_5 = not IsServer()
    if not ____temp_5 then
        local ____opt_2 = legends(self:GetCaster())
        local ____temp_4 = ____opt_2 and ____opt_2:BeginPulse()
        if ____temp_4 == nil then
            ____temp_4 = false
        end
        ____temp_5 = ____temp_4
    end
    return ____temp_5
end
function Pulse.prototype.OnAbilityPhaseInterrupted(self)
    if IsServer() then
        local ____opt_6 = legends(self:GetCaster())
        if ____opt_6 ~= nil then
            ____opt_6:InterruptPulse()
        end
    end
end
function Pulse.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_8 = legends(self:GetCaster())
        if ____opt_8 ~= nil then
            ____opt_8:FinishPulse(self)
        end
    end
end
local ReturnToAnchor = __TS__Class()
ReturnToAnchor.name = "ReturnToAnchor"
__TS__ClassExtends(ReturnToAnchor, AbilityBase)
function ReturnToAnchor.prototype.CastFilterResult(self)
    local ____temp_13
    local ____temp_12 = not IsServer()
    if not ____temp_12 then
        local ____opt_10 = legends(self:GetCaster())
        ____temp_12 = ____opt_10 and ____opt_10:CanReturn()
    end
    if ____temp_12 then
        ____temp_13 = UF_SUCCESS
    else
        ____temp_13 = UF_FAIL_CUSTOM
    end
    return ____temp_13
end
function ReturnToAnchor.prototype.GetCustomCastError(self)
    return "#orb_necro_return_invalid"
end
function ReturnToAnchor.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_14 = legends(self:GetCaster())
        if ____opt_14 ~= nil then
            ____opt_14:ReturnToAnchor(self)
        end
    end
end
local function beaconRadius(caster)
    local active = caster:FindModifierByName("modifier_orb_necro_beacon")
    if active ~= nil then
        return active:GetStackCount()
    end
    local aura = caster:FindAbilityByName("necrolyte_heartstopper_aura")
    return math.max(
        500,
        (aura and aura:GetSpecialValueFor("aura_radius") or 700) - 200
    )
end
local Beacon = __TS__Class()
Beacon.name = "Beacon"
__TS__ClassExtends(Beacon, AbilityBase)
function Beacon.prototype.GetAOERadius(self)
    return beaconRadius(self:GetCaster())
end
function Beacon.prototype.OnUpgrade(self)
    if not IsServer() then
        return
    end
    local aura = self:GetCaster():FindAbilityByName("necrolyte_heartstopper_aura")
    if aura ~= nil and aura:GetLevel() < self:GetLevel() then
        aura:SetLevel(self:GetLevel())
    end
end
function Beacon.prototype.CastFilterResultLocation(self, point)
    local ____temp_21
    local ____temp_20 = not IsServer()
    if not ____temp_20 then
        local ____opt_18 = legends(self:GetCaster())
        ____temp_20 = ____opt_18 and ____opt_18:CanPlace(point, false)
    end
    if ____temp_20 then
        ____temp_21 = UF_SUCCESS
    else
        ____temp_21 = UF_FAIL_CUSTOM
    end
    return ____temp_21
end
function Beacon.prototype.GetCustomCastErrorLocation(self)
    return "#orb_necro_beacon_invalid"
end
function Beacon.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_22 = legends(self:GetCaster())
        if ____opt_22 ~= nil then
            ____opt_22:PlaceBeacon(self:GetCursorPosition())
        end
    end
end
local ShiftBeacon = __TS__Class()
ShiftBeacon.name = "ShiftBeacon"
__TS__ClassExtends(ShiftBeacon, AbilityBase)
function ShiftBeacon.prototype.GetAOERadius(self)
    return beaconRadius(self:GetCaster())
end
function ShiftBeacon.prototype.CastFilterResultLocation(self, point)
    local ____temp_27
    local ____temp_26 = not IsServer()
    if not ____temp_26 then
        local ____opt_24 = legends(self:GetCaster())
        ____temp_26 = ____opt_24 and ____opt_24:CanPlace(point, true)
    end
    if ____temp_26 then
        ____temp_27 = UF_SUCCESS
    else
        ____temp_27 = UF_FAIL_CUSTOM
    end
    return ____temp_27
end
function ShiftBeacon.prototype.GetCustomCastErrorLocation(self)
    return "#orb_necro_shift_invalid"
end
function ShiftBeacon.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_28 = legends(self:GetCaster())
        if ____opt_28 ~= nil then
            ____opt_28:ShiftBeacon(self:GetCursorPosition())
        end
    end
end
local Verdict = __TS__Class()
Verdict.name = "Verdict"
__TS__ClassExtends(Verdict, AbilityBase)
function Verdict.prototype.OnAbilityPhaseStart(self)
    local ____temp_33 = not IsServer()
    if not ____temp_33 then
        local ____opt_30 = legends(self:GetCaster())
        local ____temp_32 = ____opt_30 and ____opt_30:CanVerdict()
        if ____temp_32 == nil then
            ____temp_32 = false
        end
        ____temp_33 = ____temp_32
    end
    return ____temp_33
end
function Verdict.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_34 = legends(self:GetCaster())
        if ____opt_34 ~= nil then
            ____opt_34:FinishVerdict(self)
        end
    end
end
orb_necro_pulse = registerAbility("orb_necro_pulse", Pulse)
orb_necro_return = registerAbility("orb_necro_return", ReturnToAnchor)
orb_necro_beacon = registerAbility("orb_necro_beacon", Beacon)
orb_necro_move_beacon = registerAbility("orb_necro_move_beacon", ShiftBeacon)
orb_necro_verdict = registerAbility("orb_necro_verdict", Verdict)
return ____exports
