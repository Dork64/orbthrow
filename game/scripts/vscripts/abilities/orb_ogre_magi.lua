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
local Challenge = __TS__Class()
Challenge.name = "Challenge"
__TS__ClassExtends(Challenge, AbilityBase)
function Challenge.prototype.CastFilterResultTarget(self, target)
    local ____IsServer_result_8 = IsServer()
    if ____IsServer_result_8 then
        local ____opt_6 = legends(self:GetCaster())
        ____IsServer_result_8 = not (____opt_6 and ____opt_6:CanChallenge(target))
    end
    if ____IsServer_result_8 then
        return UF_FAIL_CUSTOM
    end
    return UnitFilter(
        target,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NONE,
        self:GetCaster():GetTeamNumber()
    )
end
function Challenge.prototype.GetCustomCastErrorTarget(self)
    return "#orb_ogre_challenge_invalid"
end
function Challenge.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_9 = legends(self:GetCaster())
        if ____opt_9 ~= nil then
            ____opt_9:StartChallenge(
                self:GetCursorTarget(),
                self
            )
        end
    end
end
local LoadedDie = __TS__Class()
LoadedDie.name = "LoadedDie"
__TS__ClassExtends(LoadedDie, AbilityBase)
function LoadedDie.prototype.CastFilterResult(self)
    local ____temp_14
    local ____temp_13 = not IsServer()
    if not ____temp_13 then
        local ____opt_11 = legends(self:GetCaster())
        ____temp_13 = ____opt_11 and ____opt_11:CanLoadDie()
    end
    if ____temp_13 then
        ____temp_14 = UF_SUCCESS
    else
        ____temp_14 = UF_FAIL_CUSTOM
    end
    return ____temp_14
end
function LoadedDie.prototype.GetCustomCastError(self)
    return "#orb_ogre_die_invalid"
end
function LoadedDie.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_15 = legends(self:GetCaster())
        if ____opt_15 ~= nil then
            ____opt_15:LoadDie()
        end
    end
end
orb_ogre_club = registerAbility("orb_ogre_club", Club)
orb_ogre_challenge = registerAbility("orb_ogre_challenge", Challenge)
orb_ogre_loaded_die = registerAbility("orb_ogre_loaded_die", LoadedDie)
return ____exports
