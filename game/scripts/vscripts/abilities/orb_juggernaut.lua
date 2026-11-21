local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local function legends(caster)
    return caster:FindModifierByName("modifier_orb_jugg_legend")
end
local ThreeCuts = __TS__Class()
ThreeCuts.name = "ThreeCuts"
__TS__ClassExtends(ThreeCuts, AbilityBase)
function ThreeCuts.prototype.OnUpgrade(self)
    if not IsServer() then
        return
    end
    local passive = self:GetCaster():FindAbilityByName("juggernaut_blade_dance")
    if passive ~= nil and passive:GetLevel() < self:GetLevel() then
        passive:SetLevel(self:GetLevel())
    end
end
function ThreeCuts.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_0 = legends(self:GetCaster())
        if ____opt_0 ~= nil then
            ____opt_0:StartCuts(self)
        end
    end
end
local Encore = __TS__Class()
Encore.name = "Encore"
__TS__ClassExtends(Encore, AbilityBase)
function Encore.prototype.CastFilterResultTarget(self, target)
    local caster = self:GetCaster()
    local ____IsServer_result_5 = IsServer()
    if ____IsServer_result_5 then
        local ____temp_4 = not target:IsRealHero() or target:IsIllusion()
        if not ____temp_4 then
            local ____opt_2 = legends(caster)
            ____temp_4 = not (____opt_2 and ____opt_2:CanEncore())
        end
        ____IsServer_result_5 = ____temp_4
    end
    if ____IsServer_result_5 then
        return UF_FAIL_CUSTOM
    end
    return UnitFilter(
        target,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES,
        caster:GetTeamNumber()
    )
end
function Encore.prototype.GetCustomCastErrorTarget(self)
    return "#orb_jugg_encore_invalid"
end
function Encore.prototype.OnSpellStart(self)
    if IsServer() then
        local ____opt_6 = legends(self:GetCaster())
        if ____opt_6 ~= nil then
            ____opt_6:StartEncore(
                self,
                self:GetCursorTarget()
            )
        end
    end
end
orb_jugg_three_cuts = registerAbility("orb_jugg_three_cuts", ThreeCuts)
orb_jugg_encore = registerAbility("orb_jugg_encore", Encore)
return ____exports
