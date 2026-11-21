local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__StringStartsWith = ____lualib.__TS__StringStartsWith
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
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
        MODIFIER_PROPERTY_STATUS_RESISTANCE_STACKING,
        MODIFIER_PROPERTY_SLOW_RESISTANCE_STACKING,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_PROPERTY_OVERRIDE_ABILITY_SPECIAL,
        MODIFIER_PROPERTY_OVERRIDE_ABILITY_SPECIAL_VALUE,
        MODIFIER_EVENT_ON_ATTACK_RECORD,
        MODIFIER_EVENT_ON_ATTACK_RECORD_DESTROY,
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
    local parent = self:GetParent()
    local modifiers = type(parent.FindAllModifiers) == "function" and parent:FindAllModifiers() or ({})
    for ____, mod in ipairs(modifiers) do
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
    if self:isItem(ability) or self:isUltimate(ability) then
        return false
    end
    local parent = self:GetParent()
    if type(parent.GetAbilityByIndex) ~= "function" then
        return false
    end
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
function ModifierOrbController.prototype.isItem(self, ability)
    local ____temp_0
    if type(ability.IsItem) == "function" then
        ____temp_0 = ability:IsItem()
    else
        ____temp_0 = __TS__StringStartsWith(
            ability:GetAbilityName(),
            "item_"
        )
    end
    return ____temp_0
end
function ModifierOrbController.prototype.isUltimate(self, ability)
    return type(ability.GetAbilityType) == "function" and ability:GetAbilityType() == ULTIMATE
end
function ModifierOrbController.prototype.orbCooldownFactor(self, b, ability, name)
    if self:isItem(ability) then
        return 1
    end
    local keep = (1 - b.cdr / 100) * (1 - (b.abilityCdr[name] or 0) / 100)
    if (b.code.l_master or 0) > 0 and self:isBasicAbility(ability) then
        keep = keep * (b.awake and 0.65 or 0.75)
    end
    if b.awake and (b.code.l_double_ult or 0) > 0 and self:isUltimate(ability) then
        keep = keep * 0.8
    end
    return 1 - boundedOrbCooldown(name, 100 - keep * 100) / 100
end
function ModifierOrbController.prototype.extraCharges(self, b, ability, name)
    if type(ability.IsPassive) == "function" and ability:IsPassive() then
        return 0
    end
    return bonusAbilityCharges(
        b,
        name,
        self:isUltimate(ability)
    )
end
function ModifierOrbController.prototype.GetModifierOverrideAbilitySpecial(self, e)
    local ability = e.ability
    if ability == nil then
        return 0
    end
    local b = self:b()
    local name = ability:GetAbilityName()
    local key = e.ability_special_value
    if replacesWrathDamage(b, name, key) then
        return 1
    end
    if key == "AbilityCharges" or key == "AbilityCooldown" or key == "AbilityChargeRestoreTime" then
        local extra = self:extraCharges(b, ability, name)
        if key == "AbilityCharges" and extra > 0 then
            return 1
        end
        if key == "AbilityCooldown" and extra > 0 and ability:GetLevelSpecialValueNoOverride("AbilityCharges", e.ability_special_level) <= 0 then
            return 1
        end
        if key ~= "AbilityCharges" and self:orbCooldownFactor(b, ability, name) < 1 then
            return 1
        end
    end
    local ____opt_1 = b.specials[name]
    local ____temp_5 = (____opt_1 and ____opt_1[key]) ~= nil
    if not ____temp_5 then
        local ____opt_3 = b.specialsSet[name]
        ____temp_5 = (____opt_3 and ____opt_3[key]) ~= nil
    end
    local ____temp_5_8 = ____temp_5
    if not ____temp_5_8 then
        local ____opt_6 = b.specialsMul[name]
        ____temp_5_8 = (____opt_6 and ____opt_6[key]) ~= nil
    end
    if ____temp_5_8 then
        return 1
    end
    return 0
end
function ModifierOrbController.prototype.GetModifierOverrideAbilitySpecialValue(self, e)
    local ability = e.ability
    local key = e.ability_special_value
    local level = e.ability_special_level
    local name = ability:GetAbilityName()
    local b = self:b()
    local base = ability:GetLevelSpecialValueNoOverride(key, level)
    if IsServer() and replacesWrathDamage(b, name, key) then
        return 0
    end
    if key == "AbilityCharges" then
        local extra = self:extraCharges(b, ability, name)
        if extra > 0 then
            return nativeChargeCount(base, extra)
        end
    elseif key == "AbilityCooldown" and self:extraCharges(b, ability, name) > 0 and ability:GetLevelSpecialValueNoOverride("AbilityCharges", level) <= 0 then
        return 0
    end
    local adjusted = overrideValue(b, name, key, base) or base
    if key == "AbilityCooldown" or key == "AbilityChargeRestoreTime" then
        return adjusted * self:orbCooldownFactor(b, ability, name)
    end
    return adjusted
end
function ModifierOrbController.prototype.OnAttackRecord(self, e)
    local parent = self:GetParent()
    local target = e.target
    if not IsServer() or e.attacker ~= parent or parent:IsIllusion() or e.record == nil or e.no_attack_cooldown or target == nil or target:IsBuilding() or target:IsWard() or target:GetTeamNumber() == parent:GetTeamNumber() then
        return
    end
    local n = self:b().code.p_crit or 0
    if n <= 0 or not RollPseudoRandomPercentage(20, DOTA_PSEUDO_RANDOM_CUSTOM_GAME_1, parent) then
        return
    end
    if self.orbCriticals == nil then
        self.orbCriticals = __TS__New(Map)
    end
    self.orbCriticals:set(
        e.record,
        {
            target = target,
            bonus = math.min(350, 50 + 50 * n)
        }
    )
end
function ModifierOrbController.prototype.OnAttackRecordDestroy(self, e)
    if IsServer() and e.attacker == self:GetParent() then
        local ____opt_9 = self.orbCriticals
        if ____opt_9 ~= nil then
            ____opt_9:delete(e.record)
        end
    end
end
function ModifierOrbController.prototype.OnAttackLanded(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.attacker ~= parent or parent:IsIllusion() then
        return
    end
    local target = e.target
    local ____temp_15 = e.damage > 0 and target ~= nil
    if ____temp_15 then
        local ____opt_13 = self.orbCriticals
        local ____opt_11 = ____opt_13 and ____opt_13:get(e.record)
        ____temp_15 = (____opt_11 and ____opt_11.target) == target
    end
    if ____temp_15 and IsValidEntity(target) then
        SendOverheadEventMessage(
            nil,
            OVERHEAD_ALERT_CRITICAL,
            target,
            math.floor(e.damage + 0.5),
            nil
        )
    end
    local n = self:b().code.p_cleave or 0
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
                goto __continue70
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
        ::__continue70::
    end
end
function ModifierOrbController.prototype.GetModifierTotalDamageOutgoing_Percentage(self, e)
    if self:GetParent():IsIllusion() then
        return 0
    end
    local b = self:b()
    local pct = 0
    local target = e and e.target
    if (b.code.p_executioner or 0) > 0 and target ~= nil and target:IsHero() and target:GetHealthPercent() < 30 then
        pct = pct + 20 * (b.code.p_executioner or 0)
    end
    local inflictor = e and e.inflictor
    if inflictor ~= nil and (b.code.l_master or 0) > 0 and self:isBasicAbility(inflictor) then
        pct = pct + (b.awake and 30 or 20)
    end
    local ____temp_24
    if IsServer() and (e and e.attacker) == self:GetParent() and e.damage_category == DOTA_DAMAGE_CATEGORY_ATTACK and inflictor == nil and e.record ~= nil then
        local ____opt_22 = self.orbCriticals
        ____temp_24 = ____opt_22 and ____opt_22:get(e.record)
    else
        ____temp_24 = nil
    end
    local crit = ____temp_24
    local bonus = crit ~= nil and crit.target == target and crit.bonus or 0
    return pct + bonus + pct * bonus / 100
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
    local key = ability:GetMaxAbilityCharges(level) > 0 and "AbilityChargeRestoreTime" or "AbilityCooldown"
    local cooldown = ability:GetLevelSpecialValueNoOverride(key, level)
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
                        goto __continue86
                    end
                    ApplyDamage({victim = u, attacker = parent, damage = dmg, damage_type = DAMAGE_TYPE_MAGICAL})
                    u:AddNewModifier(parent, nil, "modifier_stunned", {duration = 0.4})
                end
                ::__continue86::
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
        local ____temp_25
        if e.damage_category ~= nil then
            ____temp_25 = e.damage_category == DOTA_DAMAGE_CATEGORY_SPELL
        else
            ____temp_25 = e.inflictor ~= nil
        end
        local spell = ____temp_25
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
                spell and e.inflictor ~= nil
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
                goto __continue115
            end
            ApplyDamage({victim = u, attacker = parent, damage = dps * BURN_INTERVAL, damage_type = DAMAGE_TYPE_MAGICAL})
        end
        ::__continue115::
    end
end
modifier_orb_controller = registerModifier("modifier_orb_controller", ____exports.ModifierOrbController)
return ____exports
