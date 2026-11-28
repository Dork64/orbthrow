local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local LegendButton = __TS__Class()
LegendButton.name = "LegendButton"
__TS__ClassExtends(LegendButton, AbilityBase)
function LegendButton.prototype.ProcsMagicStick(self)
    return false
end
function LegendButton.prototype.controller(self)
    return self:GetCaster():FindModifierByName("modifier_orb_earthshaker_legend")
end
local Pivot = __TS__Class()
Pivot.name = "Pivot"
__TS__ClassExtends(Pivot, LegendButton)
function Pivot.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_0 = self:controller()
        if ____opt_0 ~= nil then
            ____opt_0:Pivot(self:GetCursorPosition())
        end
    end
end
local Step = __TS__Class()
Step.name = "Step"
__TS__ClassExtends(Step, LegendButton)
function Step.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_2 = self:controller()
        if ____opt_2 ~= nil then
            ____opt_2:Step(self:GetCursorPosition())
        end
    end
end
local Seismograph = __TS__Class()
Seismograph.name = "Seismograph"
__TS__ClassExtends(Seismograph, LegendButton)
function Seismograph.prototype.OnUpgrade(self)
    if not IsServer() then
        return
    end
    local e = self:GetCaster():FindAbilityByName("earthshaker_aftershock")
    if e ~= nil and e:GetLevel() < self:GetLevel() then
        e:SetLevel(self:GetLevel())
    end
end
function Seismograph.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_4 = self:controller()
        if ____opt_4 ~= nil then
            ____opt_4:Detonate(self)
        end
    end
end
orb_es_pivot = registerAbility("orb_es_pivot", Pivot)
orb_es_step = registerAbility("orb_es_step", Step)
orb_es_seismograph = registerAbility("orb_es_seismograph", Seismograph)
return ____exports
