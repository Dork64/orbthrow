local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local HASTE = "modifier_orb_fountain_haste"
____exports.ModifierOrbFountain = __TS__Class()
local ModifierOrbFountain = ____exports.ModifierOrbFountain
ModifierOrbFountain.name = "ModifierOrbFountain"
__TS__ClassExtends(ModifierOrbFountain, ModBase)
function ModifierOrbFountain.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.fx = 0
    self.fy = 0
    self.radius = 850
    self.regen = 16
    self.calm = 3
    self.hasteDuration = 3
    self.hastePct = 40
    self.lastHurt = -100
    self.wasInside = false
end
function ModifierOrbFountain.prototype.IsHidden(self)
    return self:GetStackCount() < 2
end
function ModifierOrbFountain.prototype.IsPurgable(self)
    return false
end
function ModifierOrbFountain.prototype.IsDebuff(self)
    return false
end
function ModifierOrbFountain.prototype.IsPermanent(self)
    return true
end
function ModifierOrbFountain.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbFountain.prototype.GetTexture(self)
    return "rune_regen"
end
function ModifierOrbFountain.prototype.OnCreated(self, p)
    if not IsServer() then
        return
    end
    self.fx = p.x or 0
    self.fy = p.y or 0
    self.radius = p.r or 850
    self.regen = p.regen or 16
    self.calm = p.calm or 3
    self.hasteDuration = p.hd or 3
    self.hastePct = p.hp or 40
    self.lastHurt = -100
    self.wasInside = false
    self:StartIntervalThink(0.1)
end
function ModifierOrbFountain.prototype.inside(self)
    local parent = self:GetParent()
    if not parent:IsAlive() then
        return false
    end
    local o = parent:GetAbsOrigin()
    local dx = o.x - self.fx
    local dy = o.y - self.fy
    return dx * dx + dy * dy <= self.radius * self.radius
end
function ModifierOrbFountain.prototype.OnIntervalThink(self)
    local parent = self:GetParent()
    local now = GameRules:GetGameTime()
    local calm = now - self.lastHurt >= self.calm
    local inside = self:inside()
    if self.wasInside and not inside and calm and parent:IsAlive() then
        parent:AddNewModifier(parent, nil, HASTE, {duration = self.hasteDuration, pct = self.hastePct})
    end
    self.wasInside = inside
    local want = inside and (calm and 2 or 1) or 0
    if self:GetStackCount() ~= want then
        self:SetStackCount(want)
    end
end
function ModifierOrbFountain.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_HEALTH_REGEN_PERCENTAGE, MODIFIER_PROPERTY_MANA_REGEN_TOTAL_PERCENTAGE, MODIFIER_EVENT_ON_TAKEDAMAGE}
end
function ModifierOrbFountain.prototype.CheckState(self)
    return {[MODIFIER_STATE_NO_UNIT_COLLISION] = self:GetStackCount() > 0}
end
function ModifierOrbFountain.prototype.GetModifierHealthRegenPercentage(self)
    return self:GetStackCount() >= 2 and CONFIG.fountainFastRegen or 0
end
function ModifierOrbFountain.prototype.GetModifierTotalPercentageManaRegen(self)
    return self:GetStackCount() >= 2 and CONFIG.fountainFastRegen or 0
end
function ModifierOrbFountain.prototype.OnTakeDamage(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.unit ~= parent or e.damage <= 0 then
        return
    end
    if e.attacker == parent then
        return
    end
    self.lastHurt = GameRules:GetGameTime()
    if self:GetStackCount() == 2 then
        self:SetStackCount(1)
    end
    parent:RemoveModifierByName(HASTE)
end
____exports.ModifierOrbFountainHaste = __TS__Class()
local ModifierOrbFountainHaste = ____exports.ModifierOrbFountainHaste
ModifierOrbFountainHaste.name = "ModifierOrbFountainHaste"
__TS__ClassExtends(ModifierOrbFountainHaste, ModBase)
function ModifierOrbFountainHaste.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.pct = 40
end
function ModifierOrbFountainHaste.prototype.IsHidden(self)
    return false
end
function ModifierOrbFountainHaste.prototype.IsPurgable(self)
    return true
end
function ModifierOrbFountainHaste.prototype.IsDebuff(self)
    return false
end
function ModifierOrbFountainHaste.prototype.GetTexture(self)
    return "rune_haste"
end
function ModifierOrbFountainHaste.prototype.GetEffectName(self)
    return "particles/generic_gameplay/rune_haste_owner.vpcf"
end
function ModifierOrbFountainHaste.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
function ModifierOrbFountainHaste.prototype.OnCreated(self, p)
    self.pct = p.pct or 40
    if IsServer() then
        self:SetStackCount(self.pct)
    end
end
function ModifierOrbFountainHaste.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE}
end
function ModifierOrbFountainHaste.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return self:GetStackCount()
end
modifier_orb_fountain = registerModifier("modifier_orb_fountain", ____exports.ModifierOrbFountain)
modifier_orb_fountain_haste = registerModifier("modifier_orb_fountain_haste", ____exports.ModifierOrbFountainHaste)
return ____exports
