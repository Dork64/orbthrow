local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__Number = ____lualib.__TS__Number
local ____exports = {}
local ____combatpatterns = require("core.combatpatterns")
local boundedOrbCooldown = ____combatpatterns.boundedOrbCooldown
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusAbilityCharges = ____orbstore.bonusAbilityCharges
local bonusesOf = ____orbstore.bonusesOf
local overrideValue = ____orbstore.overrideValue
local nativeChargeCount = ____orbstore.nativeChargeCount
local replacesWrathDamage = ____orbstore.replacesWrathDamage
local ____orbs = require("core.orbs")
local diminishing = ____orbs.diminishing
local orbStatusResistance = ____orbs.orbStatusResistance
local ULTIMATE = 1
local BURN_RADIUS = 350
local BURN_INTERVAL = 0.5
local CLEAVE_PARTICLE = "particles/items_fx/battlefury_cleave.vpcf"
local BURN_PARTICLE = "particles/items2_fx/radiance_owner.vpcf"
local METEOR_PARTICLE = "particles/units/heroes/hero_lina/lina_spell_light_strike_array.vpcf"
____exports.ModifierOrbController = __TS__Class()
local ModifierOrbController = ____exports.ModifierOrbController
ModifierOrbController.name = "ModifierOrbController"
__TS__ClassExtends(ModifierOrbController, ModBase)
function ModifierOrbController.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.lastHurtAt = -100
    self.shieldReadyAt = 0
    self.secondWindReadyAt = 0
    self.graveReadyAt = 0
    self.meteorReadyAt = 0
end
function ModifierOrbController.prototype.IsHidden(self)
    return true
end
function ModifierOrbController.prototype.IsPurgable(self)
    return false
end
function ModifierOrbController.prototype.IsPermanent(self)
    return true
end
function ModifierOrbController.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbController.prototype.AllowIllusionDuplicate(self)
    return true
end
function ModifierOrbController.prototype.GetAttributes(self)
    return MODIFIER_ATTRIBUTE_PERMANENT + MODIFIER_ATTRIBUTE_IGNORE_INVULNERABLE
end
function ModifierOrbController.prototype.b(self)
    local parent = self:GetParent()
    return bonusesOf(
        parent:GetPlayerOwnerID(),
        IsServer(),
        GameRules:GetGameTime()
    )
end
function ModifierOrbController.prototype.OnCreated(self)
    if not IsServer() then
        return
    end
    self.lastHurtAt = -100
    self.shieldReadyAt = 0
    self.secondWindReadyAt = 0
    self:StartIntervalThink(BURN_INTERVAL)
end
function ModifierOrbController.prototype.OnDestroy(self)
    if IsServer() and self.burnFx ~= nil then
        ParticleManager:DestroyParticle(self.burnFx, false)
        ParticleManager:ReleaseParticleIndex(self.burnFx)
        self.burnFx = nil
    end
end
function ModifierOrbController.prototype.DeclareFunctions(self)
    return {
        MODIFIER_PROPERTY_HEALTH_BONUS,
        MODIFIER_PROPERTY_PREATTACK_BONUS_DAMAGE,
        MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS,
        MODIFIER_PROPERTY_ATTACKSPEED_BONUS_CONSTANT,
        MODIFIER_PROPERTY_SPELL_AMPLIFY_PERCENTAGE,
        MODIFIER_PROPERTY_MAGICAL_RESISTANCE_BONUS,
        MODIFIER_PROPERTY_MOVESPEED_BONUS_CONSTANT,
        MODIFIER_PROPERTY_HEALTH_REGEN_CONSTANT,
        MODIFIER_PROPERTY_MANA_BONUS,
        MODIFIER_PROPERTY_MANA_REGEN_CONSTANT,
        MODIFIER_PROPERTY_STATS_STRENGTH_BONUS,
        MODIFIER_PROPERTY_STATS_AGILITY_BONUS,
        MODIFIER_PROPERTY_STATS_INTELLECT_BONUS,
        MODIFIER_PROPERTY_COOLDOWN_PERCENTAGE_STACKING,
        MODIFIER_PROPERTY_STATUS_RESISTANCE_STACKING,
        MODIFIER_PROPERTY_SLOW_RESISTANCE_STACKING,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_PROPERTY_OVERRIDE_ABILITY_SPECIAL,
        MODIFIER_PROPERTY_OVERRIDE_ABILITY_SPECIAL_VALUE,
        MODIFIER_PROPERTY_PREATTACK_CRITICALSTRIKE,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_PROPERTY_TOTALDAMAGEOUTGOING_PERCENTAGE,
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_PROPERTY_MIN_HEALTH
    }
end
function ModifierOrbController.prototype.GetModifierHealthBonus(self)
    return self:b().health
end
function ModifierOrbController.prototype.GetModifierPreAttack_BonusDamage(self)
    return self:b().damage
end
function ModifierOrbController.prototype.GetModifierPhysicalArmorBonus(self)
    return self:b().armor
end
function ModifierOrbController.prototype.GetModifierAttackSpeedBonus_Constant(self)
    return self:b().attackSpeed
end
function ModifierOrbController.prototype.GetModifierSpellAmplify_Percentage(self)
    return self:b().spellAmp
end
function ModifierOrbController.prototype.GetModifierMagicalResistanceBonus(self)
    return self:b().magicResist
end
function ModifierOrbController.prototype.GetModifierMoveSpeedBonus_Constant(self)
    return self:b().moveSpeed
end
function ModifierOrbController.prototype.GetModifierConstantHealthRegen(self)
    return self:b().hpRegen
end
function ModifierOrbController.prototype.GetModifierManaBonus(self)
    return self:b().mana
end
function ModifierOrbController.prototype.GetModifierConstantManaRegen(self)
    return self:b().manaRegen
end
function ModifierOrbController.prototype.GetModifierBonusStats_Strength(self)
    return self:b().str
end
function ModifierOrbController.prototype.GetModifierBonusStats_Agility(self)
    return self:b().agi
end
function ModifierOrbController.prototype.GetModifierBonusStats_Intellect(self)
    return self:b().int
end
function ModifierOrbController.prototype.GetModifierStatusResistanceStacking(self)
    local b = self:b()
    local sources = {}
    for ____, mod in ipairs(self:GetParent():FindAllModifiers()) do
        local source = mod
        if source.OrbStatusResistance ~= nil then
            sources[#sources + 1] = source:OrbStatusResistance()
        end
    end
    return orbStatusResistance(b.status, b.code.p_unstoppable or 0, sources)
end
function ModifierOrbController.prototype.GetModifierSlowResistance_Stacking(self)
    return diminishing(
        self:b().code.p_unstoppable or 0,
        15,
        35
    )
end
function ModifierOrbController.prototype.isBasicAbility(self, ability)
    if ability:IsItem() or ability:GetAbilityType() == ULTIMATE then
        return false
    end
    local parent = self:GetParent()
    do
        local i = 0
        while i < 3 do
            local a = parent:GetAbilityByIndex(i)
            if a ~= nil and a == ability then
                return true
            end
            i = i + 1
        end
    end
    return false
end
function ModifierOrbController.prototype.GetModifierPercentageCooldownStacking(self, e)
    local ability = e and e.ability
    if ability == nil or ability:IsItem() then
        return 0
    end
    local b = self:b()
    local keep = (100 - b.cdr) / 100
    keep = keep * ((100 - (b.abilityCdr[ability:GetAbilityName()] or 0)) / 100)
    if (b.code.l_master or 0) > 0 and self:isBasicAbility(ability) then
        keep = keep * (b.awake and 0.65 or 0.75)
    end
    if (b.code.l_double_ult or 0) > 0 and b.awake and ability:GetAbilityType() == ULTIMATE then
        keep = keep * 0.8
    end
    return boundedOrbCooldown(
        ability:GetAbilityName(),
        100 - keep * 100
    )
end
function ModifierOrbController.prototype.GetModifierOverrideAbilitySpecial(self, e)
    local ability = e.ability
    if ability == nil then
        return 0
    end
    local b = self:b()
    local name = ability:GetAbilityName()
    local k = e.ability_special_value
    if replacesWrathDamage(b, name, k) then
        return 1
    end
    if k == "AbilityCharges" or k == "AbilityCooldown" or k == "AbilityChargeRestoreTime" then
        local extra = ability:IsPassive() and 0 or bonusAbilityCharges(
            b,
            name,
            ability:GetAbilityType() == ULTIMATE
        )
        if extra > 0 then
            if k == "AbilityCharges" then
                return 1
            end
            if ability:GetLevelSpecialValueNoOverride("AbilityCharges", e.ability_special_level) <= 0 and (k == "AbilityCooldown" or ability:GetCooldownTimeRemaining() > 0) then
                return 1
            end
        end
    end
    local ____opt_2 = b.specials[name]
    local ____temp_6 = (____opt_2 and ____opt_2[k]) ~= nil
    if not ____temp_6 then
        local ____opt_4 = b.specialsSet[name]
        ____temp_6 = (____opt_4 and ____opt_4[k]) ~= nil
    end
    local ____temp_6_9 = ____temp_6
    if not ____temp_6_9 then
        local ____opt_7 = b.specialsMul[name]
        ____temp_6_9 = (____opt_7 and ____opt_7[k]) ~= nil
    end
    if ____temp_6_9 then
        return 1
    end
    return 0
end
function ModifierOrbController.prototype.GetModifierOverrideAbilitySpecialValue(self, e)
    local ability = e.ability
    local base = ability:GetLevelSpecialValueNoOverride(e.ability_special_value, e.ability_special_level)
    local b = self:b()
    local key = e.ability_special_value
    if IsServer() and replacesWrathDamage(
        b,
        ability:GetAbilityName(),
        key
    ) then
        return 0
    end
    if key == "AbilityCharges" or key == "AbilityCooldown" or key == "AbilityChargeRestoreTime" then
        local extra = ability:IsPassive() and 0 or bonusAbilityCharges(
            b,
            ability:GetAbilityName(),
            ability:GetAbilityType() == ULTIMATE
        )
        if extra > 0 then
            if key == "AbilityCharges" then
                return nativeChargeCount(base, extra)
            end
            if ability:GetLevelSpecialValueNoOverride("AbilityCharges", e.ability_special_level) <= 0 then
                if key == "AbilityCooldown" then
                    return 0
                end
                local remaining = ability:GetCooldownTimeRemaining()
                if remaining > 0 then
                    return remaining
                end
            end
        end
    end
    local v = overrideValue(
        b,
        ability:GetAbilityName(),
        e.ability_special_value,
        base
    )
    return v ~= nil and v or base
end
function ModifierOrbController.prototype.GetModifierPreAttack_CriticalStrike(self, e)
    if not IsServer() then
        return 0
    end
    if self:GetParent():IsIllusion() then
        return 0
    end
    local n = self:b().code.p_crit or 0
    if n <= 0 or e.target == nil or e.target:IsBuilding() then
        return 0
    end
    if not RollPseudoRandomPercentage(
        20,
        DOTA_PSEUDO_RANDOM_CUSTOM_GAME_1,
        self:GetParent()
    ) then
        return 0
    end
    return math.min(450, 150 + 50 * n)
end
function ModifierOrbController.prototype.OnAttackLanded(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.attacker ~= parent or parent:IsIllusion() then
        return
    end
    local n = self:b().code.p_cleave or 0
    local target = e.target
    if n <= 0 or target == nil or not IsValidEntity(target) or target:IsBuilding() or target:GetTeamNumber() == parent:GetTeamNumber() then
        return
    end
    if not parent:IsRangedAttacker() then
        DoCleaveAttack(
            parent,
            target,
            nil,
            e.damage * 0.4 * n,
            150,
            360,
            650,
            CLEAVE_PARTICLE
        )
        return
    end
    local others = FindUnitsInRadius(
        parent:GetTeamNumber(),
        target:GetAbsOrigin(),
        nil,
        450,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
        FIND_CLOSEST,
        false
    )
    local hits = 0
    for ____, u in ipairs(others) do
        do
            if hits >= n then
                break
            end
            if u == target or not u:IsAlive() then
                goto __continue66
            end
            ApplyDamage({
                victim = u,
                attacker = parent,
                damage = e.damage * 0.5,
                damage_type = DAMAGE_TYPE_PHYSICAL,
                damage_flags = DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION
            })
            hits = hits + 1
        end
        ::__continue66::
    end
end
function ModifierOrbController.prototype.GetModifierTotalDamageOutgoing_Percentage(self, e)
    if self:GetParent():IsIllusion() then
        return 0
    end
    local b = self:b()
    local pct = 0
    local target = e.target
    if (b.code.p_executioner or 0) > 0 and target ~= nil and target:IsHero() and target:GetHealthPercent() < 30 then
        pct = pct + 20 * (b.code.p_executioner or 0)
    end
    local inflictor = e.inflictor
    if inflictor ~= nil and not inflictor:IsItem() then
        if (b.code.l_master or 0) > 0 and self:isBasicAbility(inflictor) then
            pct = pct + (b.awake and 30 or 20)
        end
    end
    return pct
end
function ModifierOrbController.prototype.GetMinHealth(self)
    if not IsServer() or self:GetParent():IsIllusion() then
        return 0
    end
    if (self:b().code.p_grave or 0) <= 0 then
        return 0
    end
    return GameRules:GetGameTime() >= self.graveReadyAt and 1 or 0
end
function ModifierOrbController.prototype.meteor(self, ability, n)
    local parent = self:parent()
    local now = GameRules:GetGameTime()
    if now < self.meteorReadyAt then
        return
    end
    local level = math.max(
        0,
        ability:GetLevel() - 1
    )
    local cooldown = ability:GetMaxAbilityCharges(level) > 0 and ability:GetAbilityChargeRestoreTime(level) or ability:GetCooldown(level)
    if cooldown < 3 then
        return
    end
    self.meteorReadyAt = now + 3
    local t = ability:GetCursorTarget()
    local pos = t ~= nil and IsValidEntity(t) and t ~= parent and t:GetAbsOrigin() or ability:GetCursorPosition()
    local pointCast = bit.band(
        __TS__Number(ability:GetBehavior()),
        DOTA_ABILITY_BEHAVIOR_POINT
    ) ~= 0
    local far = (pos - parent:GetAbsOrigin()):Length2D() > 2500
    local center = (t == nil or t == parent) and (not pointCast or far) and parent:GetAbsOrigin() or pos
    local minute = math.max(
        0,
        GameRules:GetDOTATime(false, false) / 60
    )
    local dmg = (60 + 6 * minute) * (1 + 0.5 * (n - 1))
    parent:SetContextThink(
        "orb_meteor",
        function()
            if not IsValidEntity(parent) then
                return nil
            end
            local fx = ParticleManager:CreateParticle(METEOR_PARTICLE, PATTACH_WORLDORIGIN, nil)
            ParticleManager:SetParticleControl(fx, 0, center)
            ParticleManager:SetParticleControl(
                fx,
                1,
                Vector(275, 275, 275)
            )
            ParticleManager:ReleaseParticleIndex(fx)
            StartSoundEventFromPosition("Ability.LightStrikeArray", center)
            local enemies = FindUnitsInRadius(
                parent:GetTeamNumber(),
                center,
                nil,
                275,
                DOTA_UNIT_TARGET_TEAM_ENEMY,
                DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
                DOTA_UNIT_TARGET_FLAG_NONE,
                FIND_ANY_ORDER,
                false
            )
            for ____, u in ipairs(enemies) do
                do
                    if not u:IsAlive() then
                        goto __continue83
                    end
                    ApplyDamage({victim = u, attacker = parent, damage = dmg, damage_type = DAMAGE_TYPE_MAGICAL})
                    u:AddNewModifier(parent, nil, "modifier_stunned", {duration = 0.4})
                end
                ::__continue83::
            end
            return nil
        end,
        0.7
    )
end
function ModifierOrbController.prototype.parent(self)
    return self:GetParent()
end
function ModifierOrbController.prototype.OnAbilityFullyCast(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.unit ~= parent or parent:IsIllusion() then
        return
    end
    local ability = e.ability
    if ability == nil or ability:IsItem() then
        return
    end
    local meteors = self:b().code.p_meteor or 0
    if meteors > 0 then
        self:meteor(ability, meteors)
    end
    if ability:GetAbilityType() ~= ULTIMATE then
        return
    end
    local vanish = self:b().code.p_vanish or 0
    if vanish > 0 then
        local dur = 2.5 + (vanish - 1)
        parent:AddNewModifier(parent, nil, "modifier_invisible", {duration = dur})
        parent:AddNewModifier(parent, nil, "modifier_orb_vanish_speed", {duration = dur})
        EmitSoundOn("DOTA_Item.InvisibilitySword.Activate", parent)
    end
end
function ModifierOrbController.prototype.OnTakeDamage(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.attacker ~= parent and e.unit ~= parent then
        return
    end
    if parent:IsIllusion() then
        return
    end
    local b = self:b()
    local now = GameRules:GetGameTime()
    if e.attacker == parent and e.damage > 0 then
        local unit = e.unit
        if unit == nil or unit:GetTeamNumber() == parent:GetTeamNumber() or unit:IsBuilding() then
            return
        end
        local flags = e.damage_flags
        if bit.band(flags, DOTA_DAMAGE_FLAG_REFLECTION) ~= 0 or bit.band(flags, DOTA_DAMAGE_FLAG_HPLOSS) ~= 0 then
            return
        end
        local spell = e.inflictor ~= nil
        if not parent:IsAlive() or spell and bit.band(flags, DOTA_DAMAGE_FLAG_NO_SPELL_LIFESTEAL) ~= 0 then
            return
        end
        local pct = b.lifesteal
        if unit:IsHero() then
            pct = pct + 12 * (b.code.p_bloodsucker or 0)
        end
        if pct > 0 then
            parent:HealWithParams(
                e.damage * pct / 100,
                e.inflictor,
                true,
                true,
                parent,
                spell
            )
        end
        return
    end
    if e.unit ~= parent or parent:IsIllusion() then
        return
    end
    local attacker = e.attacker
    local fromHero = attacker ~= nil and attacker:GetTeamNumber() ~= parent:GetTeamNumber() and attacker:GetPlayerOwnerID() >= 0
    if (b.code.p_battle_shield or 0) > 0 and fromHero and now - self.lastHurtAt >= 8 and now >= self.shieldReadyAt and parent:IsAlive() then
        self.shieldReadyAt = now + 15
        local share = math.min(0.6, 0.2 * (b.code.p_battle_shield or 1))
        parent:AddNewModifier(
            parent,
            nil,
            "modifier_orb_battle_shield",
            {
                duration = 5,
                amount = math.floor(parent:GetMaxHealth() * share)
            }
        )
    end
    self.lastHurtAt = now
    local graves = b.code.p_grave or 0
    if graves > 0 and parent:IsAlive() and parent:GetHealth() <= 1 and now >= self.graveReadyAt then
        self.graveReadyAt = now + math.max(30, 90 - 20 * (graves - 1))
        parent:AddNewModifier(parent, nil, "modifier_invulnerable", {duration = 1.5})
        parent:Heal(
            parent:GetMaxHealth() * 0.25,
            nil
        )
        EmitSoundOn("Hero_Dazzle.Shallow_Grave", parent)
    end
    if (b.code.l_second_wind or 0) > 0 and parent:IsAlive() and parent:GetHealthPercent() < 25 and now >= self.secondWindReadyAt then
        self.secondWindReadyAt = now + (b.awake and 40 or 60)
        parent:Heal(
            parent:GetMaxHealth() * 0.4,
            nil
        )
        parent:AddNewModifier(parent, nil, "modifier_orb_second_wind", {duration = 4})
    end
end
function ModifierOrbController.prototype.OnIntervalThink(self)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    local b = self:b()
    local now = GameRules:GetGameTime()
    local n = parent:IsIllusion() and 0 or (b.code.p_burn_aura or 0)
    if n > 0 and self.burnFx == nil then
        self.burnFx = ParticleManager:CreateParticle(BURN_PARTICLE, PATTACH_ABSORIGIN_FOLLOW, parent)
    end
    if n <= 0 or not parent:IsAlive() then
        return
    end
    local minute = math.max(
        0,
        GameRules:GetDOTATime(false, false) / 60
    )
    local dps = (40 + 3 * minute) * n
    local enemies = FindUnitsInRadius(
        parent:GetTeamNumber(),
        parent:GetAbsOrigin(),
        nil,
        BURN_RADIUS,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_ANY_ORDER,
        false
    )
    for ____, u in ipairs(enemies) do
        do
            if not u:IsAlive() then
                goto __continue112
            end
            ApplyDamage({victim = u, attacker = parent, damage = dps * BURN_INTERVAL, damage_type = DAMAGE_TYPE_MAGICAL})
        end
        ::__continue112::
    end
end
modifier_orb_controller = registerModifier("modifier_orb_controller", ____exports.ModifierOrbController)
return ____exports
