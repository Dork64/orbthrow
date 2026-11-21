local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local function legends(h)
    return h:FindModifierByName("modifier_orb_pudge_legend")
end
local Counter = __TS__Class()
Counter.name = "Counter"
__TS__ClassExtends(Counter, AbilityBase)
function Counter.prototype.CastFilterResult(self)
    local ____temp_3
    local ____temp_2 = not IsServer()
    if not ____temp_2 then
        local ____opt_0 = legends(self:GetCaster())
        ____temp_2 = ____opt_0 and ____opt_0:CanCounter()
    end
    if ____temp_2 then
        ____temp_3 = UF_SUCCESS
    else
        ____temp_3 = UF_FAIL_CUSTOM
    end
    return ____temp_3
end
function Counter.prototype.GetCustomCastError(self)
    return "#orb_pudge_counter_invalid"
end
function Counter.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_4 = legends(self:GetCaster())
        if ____opt_4 ~= nil then
            ____opt_4:ArmCounter(self)
        end
    end
end
orb_pudge_counter = registerAbility("orb_pudge_counter", Counter)
return ____exports
