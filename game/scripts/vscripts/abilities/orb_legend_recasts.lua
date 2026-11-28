local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local Bank = __TS__Class()
Bank.name = "Bank"
__TS__ClassExtends(Bank, AbilityBase)
function Bank.prototype.OnSpellStart(self)
    if not IsServer() then
        return
    end
    local modifier = self:GetCaster():FindModifierByName("modifier_orb_snapfire_legend")
    if modifier ~= nil then
        modifier:Bank(self:GetCursorPosition())
    end
end
local Spring = __TS__Class()
Spring.name = "Spring"
__TS__ClassExtends(Spring, AbilityBase)
function Spring.prototype.OnSpellStart(self)
    if not IsServer() then
        return
    end
    local modifier = self:GetCaster():FindModifierByName("modifier_orb_snapfire_legend")
    if modifier ~= nil then
        modifier:Spring(self:GetCursorPosition())
    end
end
local ReturnToAnchor = __TS__Class()
ReturnToAnchor.name = "ReturnToAnchor"
__TS__ClassExtends(ReturnToAnchor, AbilityBase)
function ReturnToAnchor.prototype.OnSpellStart(self)
    if not IsServer() then
        return
    end
    local modifier = self:GetCaster():FindModifierByName("modifier_orb_tidehunter_legend")
    if modifier ~= nil then
        modifier:ReturnToAnchor()
    end
end
orb_snapfire_bank = registerAbility("orb_snapfire_bank", Bank)
orb_snapfire_spring = registerAbility("orb_snapfire_spring", Spring)
orb_tide_anchor_return = registerAbility("orb_tide_anchor_return", ReturnToAnchor)
return ____exports
