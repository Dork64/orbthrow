local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbBattleShield = __TS__Class()
local ModifierOrbBattleShield = ____exports.ModifierOrbBattleShield
ModifierOrbBattleShield.name = "ModifierOrbBattleShield"
__TS__ClassExtends(ModifierOrbBattleShield, ModBase)
function ModifierOrbBattleShield.prototype.IsHidden(self)
    return false
end
function ModifierOrbBattleShield.prototype.IsPurgable(self)
    return false
end
function ModifierOrbBattleShield.prototype.IsDebuff(self)
    return false
end
function ModifierOrbBattleShield.prototype.GetTexture(self)
    return "item_aeon_disk"
end
function ModifierOrbBattleShield.prototype.GetEffectName(self)
    return "particles/items2_fx/vindicators_axe_armor.vpcf"
end
function ModifierOrbBattleShield.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
function ModifierOrbBattleShield.prototype.OnCreated(self, params)
    if IsServer() then
        self:SetStackCount(math.max(
            1,
            math.floor(params.amount or 1)
        ))
    end
end
function ModifierOrbBattleShield.prototype.OnRefresh(self, params)
    if IsServer() then
        self:SetStackCount(math.max(
            self:GetStackCount(),
            math.floor(params.amount or 0)
        ))
    end
end
function ModifierOrbBattleShield.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_INCOMING_DAMAGE_CONSTANT}
end
function ModifierOrbBattleShield.prototype.GetModifierIncomingDamageConstant(self, e)
    if not IsServer() then
        return self:GetStackCount()
    end
    local left = self:GetStackCount()
    local absorb = math.min(left, e.damage)
    if absorb >= left then
        self:Destroy()
    else
        self:SetStackCount(left - math.floor(absorb))
    end
    return -absorb
end
modifier_orb_battle_shield = registerModifier("modifier_orb_battle_shield", ____exports.ModifierOrbBattleShield)
return ____exports
