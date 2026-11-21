local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local WARD_HITS = 8
local HERO_HIT = 4
____exports.SMOKE_BREAK_RADIUS = 1025
____exports.ModifierOrbWard = __TS__Class()
local ModifierOrbWard = ____exports.ModifierOrbWard
ModifierOrbWard.name = "ModifierOrbWard"
__TS__ClassExtends(ModifierOrbWard, ModBase)
function ModifierOrbWard.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.sentry = false
    self.radius = 1050
    self.left = WARD_HITS
end
function ModifierOrbWard.prototype.IsHidden(self)
    return true
end
function ModifierOrbWard.prototype.IsPurgable(self)
    return false
end
function ModifierOrbWard.prototype.IsAura(self)
    return self.sentry
end
function ModifierOrbWard.prototype.GetAuraRadius(self)
    return self.radius
end
function ModifierOrbWard.prototype.GetModifierAura(self)
    return "modifier_truesight"
end
function ModifierOrbWard.prototype.GetAuraSearchTeam(self)
    return DOTA_UNIT_TARGET_TEAM_ENEMY
end
function ModifierOrbWard.prototype.GetAuraSearchType(self)
    return DOTA_UNIT_TARGET_ALL
end
function ModifierOrbWard.prototype.GetAuraSearchFlags(self)
    return DOTA_UNIT_TARGET_FLAG_INVULNERABLE + DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES
end
function ModifierOrbWard.prototype.GetAuraDuration(self)
    return 0.1
end
function ModifierOrbWard.prototype.OnCreated(self, p)
    self.sentry = (p.sentry or 0) == 1
    self.radius = p.radius or 1050
    self.left = WARD_HITS
end
function ModifierOrbWard.prototype.CheckState(self)
    return {[MODIFIER_STATE_INVISIBLE] = true, [MODIFIER_STATE_NO_UNIT_COLLISION] = true}
end
function ModifierOrbWard.prototype.DeclareFunctions(self)
    return {
        MODIFIER_PROPERTY_ABSOLUTE_NO_DAMAGE_MAGICAL,
        MODIFIER_PROPERTY_ABSOLUTE_NO_DAMAGE_PHYSICAL,
        MODIFIER_PROPERTY_ABSOLUTE_NO_DAMAGE_PURE,
        MODIFIER_PROPERTY_HEALTHBAR_PIPS,
        MODIFIER_EVENT_ON_ATTACK_LANDED
    }
end
function ModifierOrbWard.prototype.GetAbsoluteNoDamageMagical(self)
    return 1
end
function ModifierOrbWard.prototype.GetAbsoluteNoDamagePhysical(self)
    return 1
end
function ModifierOrbWard.prototype.GetAbsoluteNoDamagePure(self)
    return 1
end
function ModifierOrbWard.prototype.GetModifierHealthBarPips(self)
    return WARD_HITS / HERO_HIT
end
function ModifierOrbWard.prototype.OnAttackLanded(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.target ~= parent then
        return
    end
    local attacker = e.attacker
    if attacker == nil or not IsValidEntity(attacker) then
        return
    end
    self.left = self.left - (attacker:IsRealHero() and HERO_HIT or 1)
    if self.left <= 0 then
        parent:Kill(nil, attacker)
        return
    end
    parent:SetHealth(math.max(
        1,
        math.floor(parent:GetMaxHealth() * self.left / WARD_HITS)
    ))
end
____exports.ModifierOrbSmoke = __TS__Class()
local ModifierOrbSmoke = ____exports.ModifierOrbSmoke
ModifierOrbSmoke.name = "ModifierOrbSmoke"
__TS__ClassExtends(ModifierOrbSmoke, ModBase)
function ModifierOrbSmoke.prototype.IsHidden(self)
    return false
end
function ModifierOrbSmoke.prototype.IsPurgable(self)
    return true
end
function ModifierOrbSmoke.prototype.IsDebuff(self)
    return false
end
function ModifierOrbSmoke.prototype.GetTexture(self)
    return "item_smoke_of_deceit"
end
function ModifierOrbSmoke.prototype.GetEffectName(self)
    return "particles/items2_fx/smoke_of_deceit_buff.vpcf"
end
function ModifierOrbSmoke.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
function ModifierOrbSmoke.prototype.OnCreated(self)
    if IsServer() then
        self:StartIntervalThink(0.2)
    end
end
function ModifierOrbSmoke.prototype.CheckState(self)
    return {[MODIFIER_STATE_INVISIBLE] = true, [MODIFIER_STATE_NOT_ON_MINIMAP_FOR_ENEMIES] = true}
end
function ModifierOrbSmoke.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE, MODIFIER_PROPERTY_INVISIBILITY_LEVEL, MODIFIER_EVENT_ON_ATTACK}
end
function ModifierOrbSmoke.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return 15
end
function ModifierOrbSmoke.prototype.GetModifierInvisibilityLevel(self)
    return 1
end
function ModifierOrbSmoke.prototype.dissipate(self)
    local parent = self:GetParent()
    EmitSoundOn("DOTA_Item.SmokeOfDeceit.Activate", parent)
    self:Destroy()
end
function ModifierOrbSmoke.prototype.OnIntervalThink(self)
    local parent = self:GetParent()
    local enemies = FindUnitsInRadius(
        parent:GetTeamNumber(),
        parent:GetAbsOrigin(),
        nil,
        ____exports.SMOKE_BREAK_RADIUS,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_INVULNERABLE + DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES + DOTA_UNIT_TARGET_FLAG_NOT_ILLUSIONS,
        FIND_ANY_ORDER,
        false
    )
    for ____, u in ipairs(enemies) do
        if u:IsRealHero() and u:IsAlive() then
            self:dissipate()
            return
        end
    end
end
function ModifierOrbSmoke.prototype.OnAttack(self, e)
    if not IsServer() then
        return
    end
    if e.attacker == self:GetParent() then
        self:dissipate()
    end
end
____exports.ModifierOrbDust = __TS__Class()
local ModifierOrbDust = ____exports.ModifierOrbDust
ModifierOrbDust.name = "ModifierOrbDust"
__TS__ClassExtends(ModifierOrbDust, ModBase)
function ModifierOrbDust.prototype.IsHidden(self)
    return false
end
function ModifierOrbDust.prototype.IsPurgable(self)
    return true
end
function ModifierOrbDust.prototype.IsDebuff(self)
    return true
end
function ModifierOrbDust.prototype.GetTexture(self)
    return "item_dust"
end
function ModifierOrbDust.prototype.GetPriority(self)
    return MODIFIER_PRIORITY_SUPER_ULTRA
end
function ModifierOrbDust.prototype.GetEffectName(self)
    return "particles/items2_fx/true_sight_debuff.vpcf"
end
function ModifierOrbDust.prototype.GetEffectAttachType(self)
    return PATTACH_OVERHEAD_FOLLOW
end
function ModifierOrbDust.prototype.CheckState(self)
    return {[MODIFIER_STATE_INVISIBLE] = false}
end
function ModifierOrbDust.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE}
end
function ModifierOrbDust.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    local parent = self:GetParent()
    return (parent:HasModifier("modifier_orb_smoke") or parent:HasModifier("modifier_item_invisibility_edge_windwalk") or parent:HasModifier("modifier_item_silver_edge_windwalk") or parent:HasModifier("modifier_item_glimmer_cape_fade")) and -20 or 0
end
modifier_orb_ward = registerModifier("modifier_orb_ward", ____exports.ModifierOrbWard)
modifier_orb_smoke = registerModifier("modifier_orb_smoke", ____exports.ModifierOrbSmoke)
modifier_orb_dust = registerModifier("modifier_orb_dust", ____exports.ModifierOrbDust)
return ____exports
