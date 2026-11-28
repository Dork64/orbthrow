local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local function legends(caster)
    return caster:FindModifierByName("modifier_orb_ogre_magi_legend")
end
local Club = __TS__Class()
Club.name = "Club"
__TS__ClassExtends(Club, AbilityBase)
function Club.prototype.CastFilterResultLocation(self, point)
    local ____temp_3
    local ____temp_2 = not IsServer()
    if not ____temp_2 then
        local ____opt_0 = legends(self:GetCaster())
        ____temp_2 = ____opt_0 and ____opt_0:CanThrowClub(point)
    end
    if ____temp_2 then
        ____temp_3 = UF_SUCCESS
    else
        ____temp_3 = UF_FAIL_CUSTOM
    end
    return ____temp_3
end
function Club.prototype.GetCustomCastErrorLocation(self)
    return "#orb_ogre_club_invalid"
end
function Club.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_4 = legends(self:GetCaster())
        if ____opt_4 ~= nil then
            ____opt_4:ThrowClub(
                self:GetCursorPosition(),
                self
            )
        end
    end
end
local LoadedDie = __TS__Class()
LoadedDie.name = "LoadedDie"
__TS__ClassExtends(LoadedDie, AbilityBase)
function LoadedDie.prototype.CastFilterResult(self)
    local ____temp_9
    local ____temp_8 = not IsServer()
    if not ____temp_8 then
        local ____opt_6 = legends(self:GetCaster())
        ____temp_8 = ____opt_6 and ____opt_6:CanLoadDie()
    end
    if ____temp_8 then
        ____temp_9 = UF_SUCCESS
    else
        ____temp_9 = UF_FAIL_CUSTOM
    end
    return ____temp_9
end
function LoadedDie.prototype.GetCustomCastError(self)
    return "#orb_ogre_die_invalid"
end
function LoadedDie.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_10 = legends(self:GetCaster())
        if ____opt_10 ~= nil then
            ____opt_10:LoadDie()
        end
    end
end
orb_ogre_club = registerAbility("orb_ogre_club", Club)
orb_ogre_loaded_die = registerAbility("orb_ogre_loaded_die", LoadedDie)
return ____exports
