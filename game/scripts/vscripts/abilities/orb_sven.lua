local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local function legends(caster)
    return caster:FindModifierByName("modifier_orb_sven_legend")
end
local Redirect = __TS__Class()
Redirect.name = "Redirect"
__TS__ClassExtends(Redirect, AbilityBase)
function Redirect.prototype.OnUpgrade(self)
    if not IsServer() then
        return
    end
    local passive = self:GetCaster():FindAbilityByName("sven_great_cleave")
    if passive ~= nil and passive:GetLevel() < self:GetLevel() then
        passive:SetLevel(self:GetLevel())
    end
end
function Redirect.prototype.CastFilterResultLocation(self, point)
    local ____temp_3
    local ____temp_2 = not IsServer()
    if not ____temp_2 then
        local ____opt_0 = legends(self:GetCaster())
        ____temp_2 = ____opt_0 and ____opt_0:CanRedirect(point)
    end
    if ____temp_2 then
        ____temp_3 = UF_SUCCESS
    else
        ____temp_3 = UF_FAIL_CUSTOM
    end
    return ____temp_3
end
function Redirect.prototype.GetCustomCastErrorLocation(self)
    return "#orb_sven_redirect_invalid"
end
function Redirect.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_4 = legends(self:GetCaster())
        if ____opt_4 ~= nil then
            ____opt_4:Redirect(self:GetCursorPosition())
        end
    end
end
local Weight = __TS__Class()
Weight.name = "Weight"
__TS__ClassExtends(Weight, AbilityBase)
function Weight.prototype.CastFilterResultLocation(self)
    local ____temp_9
    local ____temp_8 = not IsServer()
    if not ____temp_8 then
        local ____opt_6 = legends(self:GetCaster())
        ____temp_8 = ____opt_6 and ____opt_6:CanSwing()
    end
    if ____temp_8 then
        ____temp_9 = UF_SUCCESS
    else
        ____temp_9 = UF_FAIL_CUSTOM
    end
    return ____temp_9
end
function Weight.prototype.GetCustomCastErrorLocation(self)
    return "#orb_sven_weight_invalid"
end
function Weight.prototype.OnAbilityPhaseStart(self)
    local ____temp_13 = not IsServer()
    if not ____temp_13 then
        local ____opt_10 = legends(self:GetCaster())
        local ____temp_12 = ____opt_10 and ____opt_10:BeginSwing(
            self:GetCursorPosition(),
            self
        )
        if ____temp_12 == nil then
            ____temp_12 = false
        end
        ____temp_13 = ____temp_12
    end
    return ____temp_13
end
function Weight.prototype.OnAbilityPhaseInterrupted(self)
    if IsServer() then
        local ____opt_14 = legends(self:GetCaster())
        if ____opt_14 ~= nil then
            ____opt_14:CancelSwing()
        end
    end
end
function Weight.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_16 = legends(self:GetCaster())
        if ____opt_16 ~= nil then
            ____opt_16:Swing()
        end
    end
end
orb_sven_redirect = registerAbility("orb_sven_redirect", Redirect)
orb_sven_weight = registerAbility("orb_sven_weight", Weight)
return ____exports
