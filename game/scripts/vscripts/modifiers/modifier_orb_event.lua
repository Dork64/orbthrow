local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____arenaevents = require("core.arenaevents")
local ARENA = ____arenaevents.ARENA
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbEventHaste = __TS__Class()
local ModifierOrbEventHaste = ____exports.ModifierOrbEventHaste
ModifierOrbEventHaste.name = "ModifierOrbEventHaste"
__TS__ClassExtends(ModifierOrbEventHaste, ModBase)
function ModifierOrbEventHaste.prototype.IsHidden(self)
    return false
end
function ModifierOrbEventHaste.prototype.IsPurgable(self)
    return false
end
function ModifierOrbEventHaste.prototype.IsDebuff(self)
    return false
end
function ModifierOrbEventHaste.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbEventHaste.prototype.GetTexture(self)
    return "rune_haste"
end
function ModifierOrbEventHaste.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE, MODIFIER_PROPERTY_COOLDOWN_PERCENTAGE, MODIFIER_PROPERTY_MANACOST_PERCENTAGE}
end
function ModifierOrbEventHaste.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return ARENA.hasteMs
end
function ModifierOrbEventHaste.prototype.GetModifierPercentageCooldown(self)
    return ARENA.hasteCdr
end
function ModifierOrbEventHaste.prototype.GetModifierPercentageManacost(self)
    return ARENA.hasteMana
end
____exports.ModifierOrbEventBloodmoon = __TS__Class()
local ModifierOrbEventBloodmoon = ____exports.ModifierOrbEventBloodmoon
ModifierOrbEventBloodmoon.name = "ModifierOrbEventBloodmoon"
__TS__ClassExtends(ModifierOrbEventBloodmoon, ModBase)
function ModifierOrbEventBloodmoon.prototype.IsHidden(self)
    return false
end
function ModifierOrbEventBloodmoon.prototype.IsPurgable(self)
    return false
end
function ModifierOrbEventBloodmoon.prototype.IsDebuff(self)
    return false
end
function ModifierOrbEventBloodmoon.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbEventBloodmoon.prototype.GetTexture(self)
    return "item_satanic"
end
function ModifierOrbEventBloodmoon.prototype.DeclareFunctions(self)
    return {MODIFIER_EVENT_ON_TAKEDAMAGE, MODIFIER_PROPERTY_TOOLTIP}
end
function ModifierOrbEventBloodmoon.prototype.OnTooltip(self)
    return ARENA.moonLifesteal
end
function ModifierOrbEventBloodmoon.prototype.OnTakeDamage(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.attacker ~= parent or e.unit == parent or not e.unit:IsRealHero() then
        return
    end
    if parent:GetTeamNumber() == e.unit:GetTeamNumber() or not parent:IsAlive() then
        return
    end
    if e.damage <= 0 or bit.band(e.damage_flags, DOTA_DAMAGE_FLAG_REFLECTION + DOTA_DAMAGE_FLAG_HPLOSS) ~= 0 then
        return
    end
    local spell = e.inflictor ~= nil
    if spell and bit.band(e.damage_flags, DOTA_DAMAGE_FLAG_NO_SPELL_LIFESTEAL) ~= 0 then
        return
    end
    parent:HealWithParams(
        e.damage * ARENA.moonLifesteal / 100,
        e.inflictor,
        true,
        true,
        parent,
        spell
    )
end
--- Исчезновение (общая фиолетовая): +20% скорости бега на время невидимости после ультимейта.
____exports.ModifierOrbVanishSpeed = __TS__Class()
local ModifierOrbVanishSpeed = ____exports.ModifierOrbVanishSpeed
ModifierOrbVanishSpeed.name = "ModifierOrbVanishSpeed"
__TS__ClassExtends(ModifierOrbVanishSpeed, ModBase)
function ModifierOrbVanishSpeed.prototype.IsHidden(self)
    return false
end
function ModifierOrbVanishSpeed.prototype.IsPurgable(self)
    return true
end
function ModifierOrbVanishSpeed.prototype.IsDebuff(self)
    return false
end
function ModifierOrbVanishSpeed.prototype.GetTexture(self)
    return "item_invis_sword"
end
function ModifierOrbVanishSpeed.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE}
end
function ModifierOrbVanishSpeed.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return 20
end
modifier_orb_event_haste = registerModifier("modifier_orb_event_haste", ____exports.ModifierOrbEventHaste)
modifier_orb_event_bloodmoon = registerModifier("modifier_orb_event_bloodmoon", ____exports.ModifierOrbEventBloodmoon)
modifier_orb_vanish_speed = registerModifier("modifier_orb_vanish_speed", ____exports.ModifierOrbVanishSpeed)
return ____exports
