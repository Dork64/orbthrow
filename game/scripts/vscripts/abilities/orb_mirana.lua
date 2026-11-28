local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__Number = ____lualib.__TS__Number
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local function legend(caster)
    return caster:FindModifierByName("modifier_orb_mirana_legend")
end
local Star = __TS__Class()
Star.name = "Star"
__TS__ClassExtends(Star, AbilityBase)
function Star.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_0 = legend(self:GetCaster())
        if ____opt_0 ~= nil then
            ____opt_0:ThrowStar(
                self,
                self:GetCursorPosition()
            )
        end
    end
end
function Star.prototype.OnProjectileHit_ExtraData(self, target, _point, data)
    local ____opt_2 = legend(self:GetCaster())
    local ____temp_4 = ____opt_2 and ____opt_2:StarHit(
        target,
        __TS__Number(data.id)
    )
    if ____temp_4 == nil then
        ____temp_4 = true
    end
    return ____temp_4
end
local Arrow = __TS__Class()
Arrow.name = "Arrow"
__TS__ClassExtends(Arrow, AbilityBase)
function Arrow.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_5 = legend(self:GetCaster())
        if ____opt_5 ~= nil then
            ____opt_5:Redirect(
                self,
                self:GetCursorPosition()
            )
        end
    end
end
function Arrow.prototype.OnProjectileHit_ExtraData(self, target, point, data)
    local ____opt_7 = legend(self:GetCaster())
    local ____temp_9 = ____opt_7 and ____opt_7:ArrowHit(
        target,
        point,
        __TS__Number(data.id)
    )
    if ____temp_9 == nil then
        ____temp_9 = true
    end
    return ____temp_9
end
function Arrow.prototype.OnProjectileThink_ExtraData(self, point, data)
    local ____opt_10 = legend(self:GetCaster())
    if ____opt_10 ~= nil then
        ____opt_10:ArrowThink(
            point,
            __TS__Number(data.id)
        )
    end
end
local Turn = __TS__Class()
Turn.name = "Turn"
__TS__ClassExtends(Turn, AbilityBase)
function Turn.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_12 = legend(self:GetCaster())
        if ____opt_12 ~= nil then
            ____opt_12:Turn(
                self,
                self:GetCursorPosition()
            )
        end
    end
end
function Turn.prototype.OnProjectileHit_ExtraData(self, target, _point, data)
    local ____opt_14 = legend(self:GetCaster())
    local ____temp_16 = ____opt_14 and ____opt_14:FanHit(
        target,
        __TS__Number(data.id)
    )
    if ____temp_16 == nil then
        ____temp_16 = true
    end
    return ____temp_16
end
local Swap = __TS__Class()
Swap.name = "Swap"
__TS__ClassExtends(Swap, AbilityBase)
function Swap.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_17 = legend(self:GetCaster())
        if ____opt_17 ~= nil then
            ____opt_17:SwapMoon(self:GetCursorPosition())
        end
    end
end
orb_mirana_star = registerAbility("orb_mirana_star", Star)
orb_mirana_arrow = registerAbility("orb_mirana_arrow", Arrow)
orb_mirana_turn = registerAbility("orb_mirana_turn", Turn)
orb_mirana_swap = registerAbility("orb_mirana_swap", Swap)
return ____exports
