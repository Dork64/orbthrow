local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__Iterator = ____lualib.__TS__Iterator
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local ____herocode = require("core.herocode")
local H = ____herocode.HERO_CODE
local ____fxengine = require("lib.fxengine")
local FxEngine = ____fxengine.FxEngine
local THINK = 0.1
local WARD_UNIT = "npc_dota_juggernaut_healing_ward"
local function hasModifierLike(u, parts)
    for ____, m in ipairs(u:FindAllModifiers()) do
        local n = m:GetName()
        for ____, p in ipairs(parts) do
            if (string.find(n, p, nil, true) or 0) - 1 >= 0 then
                return true
            end
        end
    end
    return false
end
local function isEnemyHero(parent, u)
    return u ~= nil and IsValidEntity(u) and u:IsRealHero() and u:GetTeamNumber() ~= parent:GetTeamNumber()
end
____exports.ModifierOrbHero = __TS__Class()
local ModifierOrbHero = ____exports.ModifierOrbHero
ModifierOrbHero.name = "ModifierOrbHero"
__TS__ClassExtends(ModifierOrbHero, ModBase)
function ModifierOrbHero.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.callUntil = 0
    self.furyUntil = 0
    self.omniUntil = 0
    self.omniWasActive = false
    self.hunger = __TS__New(Map)
    self.spreading = false
    self.lastHelixAt = -100
    self.wardSearchUntil = 0
    self.lastWardOrder = 0
    self.freeCullUntil = 0
    self.cullRestore = 0
    self.cullUsedInWindow = false
end
function ModifierOrbHero.prototype.IsHidden(self)
    return true
end
function ModifierOrbHero.prototype.IsPurgable(self)
    return false
end
function ModifierOrbHero.prototype.IsPermanent(self)
    return true
end
function ModifierOrbHero.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbHero.prototype.AllowIllusionDuplicate(self)
    return false
end
function ModifierOrbHero.prototype.GetAttributes(self)
    return MODIFIER_ATTRIBUTE_PERMANENT
end
function ModifierOrbHero.prototype.b(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        IsServer(),
        GameRules:GetGameTime()
    )
end
function ModifierOrbHero.prototype.has(self, id, b)
    return ((b or self:b()).code[id] or 0) > 0
end
function ModifierOrbHero.prototype.OnCreated(self)
    if not IsServer() then
        return
    end
    self.hunger = __TS__New(Map)
    self.engine = __TS__New(
        FxEngine,
        self:GetParent()
    )
    self:StartIntervalThink(THINK)
end
function ModifierOrbHero.prototype.OnDestroy(self)
    if IsServer() and self.engine ~= nil then
        self.engine:clear()
    end
end
function ModifierOrbHero.prototype.fx(self, b)
    local e = self.engine
    if e == nil then
        return nil
    end
    e:refresh(b or self:b())
    return e
end
function ModifierOrbHero.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_EVENT_ON_DEATH,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_PROPERTY_PREATTACK_CRITICALSTRIKE,
        MODIFIER_PROPERTY_PREATTACK_BONUS_DAMAGE,
        MODIFIER_PROPERTY_STATS_STRENGTH_BONUS,
        MODIFIER_PROPERTY_TOTALDAMAGEOUTGOING_PERCENTAGE
    }
end
function ModifierOrbHero.prototype.GetModifierBonusStats_Strength(self)
    return self:GetStackCount()
end
function ModifierOrbHero.prototype.GetModifierPreAttack_BonusDamage(self)
    if not IsServer() then
        return 0
    end
    local b = self:b()
    if not self:has("jugg_l_endless", b) or not b.awake then
        return 0
    end
    return GameRules:GetGameTime() < self.omniUntil and H.endlessDamageAwake or 0
end
function ModifierOrbHero.prototype.GetModifierPreAttack_CriticalStrike(self, e)
    if not IsServer() then
        return 0
    end
    local engine = self:fx()
    local best = engine ~= nil and engine:crit(e.target) or 0
    return math.max(
        best,
        self:finisherCrit(e)
    )
end
function ModifierOrbHero.prototype.GetModifierTotalDamageOutgoing_Percentage(self, e)
    if not IsServer() then
        return 0
    end
    local engine = self:fx()
    return engine ~= nil and engine:outgoing(e.target, e.inflictor) or 0
end
function ModifierOrbHero.prototype.finisherCrit(self, e)
    if not self:has("jugg_p_finisher") then
        return 0
    end
    local parent = self:GetParent()
    local t = e.target
    if not isEnemyHero(parent, t) or t:GetHealthPercent() >= H.finisherHealthPct then
        return 0
    end
    local dance = parent:FindAbilityByName("juggernaut_blade_dance")
    if dance == nil or dance:GetLevel() <= 0 then
        return 0
    end
    if not RollPseudoRandomPercentage(H.finisherChance, DOTA_PSEUDO_RANDOM_CUSTOM_GAME_2, parent) then
        return 0
    end
    return dance:GetSpecialValueFor("blade_dance_crit_mult")
end
function ModifierOrbHero.prototype.OnAbilityFullyCast(self, e)
    if not IsServer() or self.spreading then
        return
    end
    local parent = self:GetParent()
    if e.unit ~= parent then
        return
    end
    local ability = e.ability
    if ability == nil then
        return
    end
    if ability:IsItem() then
        local item = ability:GetAbilityName()
        if item == "item_refresher" or item == "item_refresher_shard" then
            local ____opt_0 = self.engine
            if ____opt_0 ~= nil then
                ____opt_0:refillOrbCharges()
            end
        end
        return
    end
    local name = ability:GetAbilityName()
    local now = GameRules:GetGameTime()
    local b = self:b()
    local engine = self:fx(b)
    if engine ~= nil then
        engine:onCast(
            ability,
            e.target or ability:GetCursorTarget()
        )
    end
    if name == "axe_berserkers_call" then
        local dur = ability:GetSpecialValueFor("duration")
        self.callUntil = now + dur
        if self:has("axe_p_iron_will", b) then
            parent:AddNewModifier(parent, ability, "modifier_orb_axe_iron_will", {duration = dur})
        end
        if self:has("axe_l_arena", b) then
            CreateModifierThinker(
                parent,
                ability,
                "modifier_orb_axe_arena",
                {duration = b.awake and H.arenaDurationAwake or H.arenaDuration, awake = b.awake and 1 or 0},
                parent:GetAbsOrigin(),
                parent:GetTeamNumber(),
                false
            )
        end
    elseif name == "axe_battle_hunger" then
        local target = e.target or ability:GetCursorTarget()
        if target == nil then
            return
        end
        local dur = ability:GetSpecialValueFor("duration")
        self.hunger:set(
            target:entindex(),
            now + dur
        )
        if self:has("axe_l_hunt", b) then
            self:spreadHunger(ability, target, dur)
        end
    elseif name == "axe_culling_blade" then
        if now < self.freeCullUntil then
            self.cullUsedInWindow = true
            parent:GiveMana(ability:GetManaCost(ability:GetLevel() - 1))
            parent:RemoveModifierByName("modifier_orb_axe_free_cull")
            self.freeCullUntil = 0
        end
    elseif name == "juggernaut_blade_fury" then
        self.furyUntil = now + ability:GetSpecialValueFor("duration")
    elseif name == "juggernaut_omni_slash" or name == "juggernaut_swift_slash" then
        local dur = ability:GetSpecialValueFor("duration")
        self.omniUntil = now + math.max(0.5, dur)
    elseif name == "juggernaut_healing_ward" then
        self.ward = nil
        self.wardSearchUntil = now + 1
        self.wardSearchPos = ability:GetCursorPosition()
    end
end
function ModifierOrbHero.prototype.spreadHunger(self, ability, target, dur)
    local parent = self:GetParent()
    local others = FindUnitsInRadius(
        parent:GetTeamNumber(),
        target:GetAbsOrigin(),
        nil,
        H.huntRadius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_ANY_ORDER,
        false
    )
    self.spreading = true
    local now = GameRules:GetGameTime()
    for ____, u in ipairs(others) do
        do
            if u == target or not u:IsAlive() then
                goto __continue56
            end
            parent:SetCursorCastTarget(u)
            ability:OnSpellStart()
            self.hunger:set(
                u:entindex(),
                now + dur
            )
        end
        ::__continue56::
    end
    parent:SetCursorCastTarget(target)
    self.spreading = false
end
function ModifierOrbHero.prototype.OnTakeDamage(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.attacker ~= parent and e.unit ~= parent then
        return
    end
    if e.damage <= 0 then
        return
    end
    local flags = e.damage_flags
    local reflected = bit.band(flags, DOTA_DAMAGE_FLAG_REFLECTION) ~= 0
    local now = GameRules:GetGameTime()
    local b = self:b()
    local engine = self:fx(b)
    if engine ~= nil then
        if e.attacker == parent then
            engine:onDealt(e)
        else
            engine:onTaken(e)
        end
    end
    if e.unit == parent then
        local a = e.attacker
        if not reflected and now < self.callUntil and self:has("axe_p_spiked", b) and isEnemyHero(parent, a) and a:IsAlive() then
            ApplyDamage({
                victim = a,
                attacker = parent,
                damage = e.damage * H.spikedReturn,
                damage_type = DAMAGE_TYPE_PURE,
                damage_flags = DOTA_DAMAGE_FLAG_REFLECTION + DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION
            })
        end
        return
    end
    local victim = e.unit
    if victim == nil or victim:GetTeamNumber() == parent:GetTeamNumber() or victim:IsBuilding() then
        return
    end
    local inflictor = e.inflictor
    local iname = inflictor ~= nil and inflictor:GetAbilityName() or ""
    if iname == "axe_battle_hunger" and self:has("axe_p_feast", b) then
        parent:Heal(e.damage * H.feastHeal, inflictor)
    end
    if iname == "axe_counter_helix" then
        if self:has("axe_p_lacerate", b) then
            local m = victim:FindModifierByName("modifier_orb_axe_lacerate") or victim:AddNewModifier(parent, inflictor, "modifier_orb_axe_lacerate", {duration = H.lacerateDuration})
            if m ~= nil then
                if m:GetStackCount() < H.lacerateMax then
                    m:IncrementStackCount()
                end
                m:SetDuration(H.lacerateDuration, true)
            end
        end
        if self:has("axe_p_spin", b) and now - self.lastHelixAt > 0.1 then
            self.lastHelixAt = now
            local m = parent:FindModifierByName("modifier_orb_axe_spin") or parent:AddNewModifier(parent, inflictor, "modifier_orb_axe_spin", {duration = H.spinDuration})
            if m ~= nil then
                if m:GetStackCount() < H.spinMax then
                    m:IncrementStackCount()
                end
                m:SetDuration(H.spinDuration, true)
            end
        end
    end
    if not reflected and now < self.omniUntil and victim:IsRealHero() and self:has("jugg_p_bloody_omni", b) and e.damage_category == DOTA_DAMAGE_CATEGORY_ATTACK then
        parent:Heal(e.damage * H.bloodyOmniHeal, nil)
    end
end
function ModifierOrbHero.prototype.OnAttackLanded(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.attacker ~= parent then
        return
    end
    local b = self:b()
    local engine = self:fx(b)
    if engine ~= nil then
        engine:onAttack(e)
    end
    local t = e.target
    if not isEnemyHero(parent, t) then
        return
    end
    local dance = self:has("jugg_p_death_dance", b)
    local cuts = self:has("jugg_l_cuts", b)
    if not dance and not cuts then
        return
    end
    local avg = parent:GetAverageTrueAttackDamage(t)
    if avg <= 0 or e.damage < avg * H.critRatio then
        return
    end
    if dance then
        for ____, n in ipairs({"juggernaut_blade_fury", "juggernaut_omni_slash"}) do
            do
                local a = parent:FindAbilityByName(n)
                if a == nil then
                    goto __continue86
                end
                local left = a:GetCooldownTimeRemaining()
                if left <= 0 then
                    goto __continue86
                end
                a:EndCooldown()
                if left > H.deathDanceCdr then
                    a:StartCooldown(left - H.deathDanceCdr)
                end
            end
            ::__continue86::
        end
    end
    if cuts and t:IsAlive() then
        local pct = b.awake and H.cutsPctAwake or H.cutsPct
        t:AddNewModifier(
            parent,
            parent:FindAbilityByName("juggernaut_blade_dance"),
            "modifier_orb_jugg_bleed",
            {duration = H.cutsDuration + 0.1, total = e.damage * pct}
        )
    end
end
function ModifierOrbHero.prototype.OnDeath(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    local dead = e.unit
    if dead == parent then
        if self.engine ~= nil then
            self.engine:clearCombat()
        end
        return
    end
    if dead == nil then
        return
    end
    local now = GameRules:GetGameTime()
    local b = self:b()
    local ____until = self.hunger:get(dead:entindex())
    if ____until ~= nil then
        self.hunger:delete(dead:entindex())
        if ____until > now and self:has("axe_p_contagious", b) then
            self:jumpHunger(dead)
        end
    end
    if e.attacker ~= parent or not isEnemyHero(parent, dead) then
        return
    end
    local engine = self:fx(b)
    if engine ~= nil then
        engine:onKill(dead, e.inflictor)
    end
    local inflictor = e.inflictor
    local iname = inflictor ~= nil and inflictor:GetAbilityName() or ""
    if iname == "axe_culling_blade" and inflictor ~= nil then
        self:onCullKill(inflictor, b)
    end
    if now < self.omniUntil and self:has("jugg_l_endless", b) then
        local ext = b.awake and H.endlessExtendAwake or H.endlessExtend
        for ____, m in ipairs(parent:FindAllModifiers()) do
            local n = m:GetName()
            if (string.find(n, "omni", nil, true) or 0) - 1 >= 0 or (string.find(n, "swift_slash", nil, true) or 0) - 1 >= 0 then
                m:SetDuration(
                    m:GetRemainingTime() + ext,
                    true
                )
            end
        end
        self.omniUntil = self.omniUntil + ext
        local fury = parent:FindAbilityByName("juggernaut_blade_fury")
        if fury ~= nil then
            fury:EndCooldown()
        end
    end
end
function ModifierOrbHero.prototype.jumpHunger(self, dead)
    local parent = self:GetParent()
    local ability = parent:FindAbilityByName("axe_battle_hunger")
    if ability == nil or ability:GetLevel() <= 0 then
        return
    end
    local near = FindUnitsInRadius(
        parent:GetTeamNumber(),
        dead:GetAbsOrigin(),
        nil,
        H.contagiousRadius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_CLOSEST,
        false
    )
    for ____, u in ipairs(near) do
        do
            if u == dead or not u:IsAlive() or not u:IsRealHero() then
                goto __continue109
            end
            self.spreading = true
            parent:SetCursorCastTarget(u)
            ability:OnSpellStart()
            self.spreading = false
            self.hunger:set(
                u:entindex(),
                GameRules:GetGameTime() + ability:GetSpecialValueFor("duration")
            )
            return
        end
        ::__continue109::
    end
end
function ModifierOrbHero.prototype.onCullKill(self, ability, b)
    local parent = self:GetParent()
    if self:has("axe_p_execution", b) then
        ability:EndCooldown()
    end
    if self:has("axe_l_executioner", b) then
        local window = b.awake and H.executionerWindowAwake or H.executionerWindow
        local left = ability:GetCooldownTimeRemaining()
        ability:EndCooldown()
        self.freeCullUntil = GameRules:GetGameTime() + window
        self.cullUsedInWindow = false
        self.cullRestore = self:has("axe_p_execution", b) and 0 or math.max(0, left - window)
        parent:AddNewModifier(parent, ability, "modifier_orb_axe_free_cull", {duration = window})
    end
end
function ModifierOrbHero.prototype.OnIntervalThink(self)
    local parent = self:GetParent()
    local now = GameRules:GetGameTime()
    local b = self:b()
    local engine = self:fx(b)
    if engine ~= nil then
        engine:think()
    end
    self:thinkOneArmy(parent, b)
    self:thinkHunt(parent, b, now)
    self:thinkCull(parent, now)
    self:thinkWard(parent, b, now)
    self:thinkStorm(parent, b, now)
    self:thinkOmniEnd(parent, b, now)
end
function ModifierOrbHero.prototype.thinkOneArmy(self, parent, b)
    local bonus = 0
    if self:has("axe_p_one_army", b) and parent:IsAlive() then
        local oma = parent:FindAbilityByName("axe_one_man_army")
        local enemies = FindUnitsInRadius(
            parent:GetTeamNumber(),
            parent:GetAbsOrigin(),
            nil,
            H.oneArmyRadius,
            DOTA_UNIT_TARGET_TEAM_ENEMY,
            DOTA_UNIT_TARGET_HERO,
            DOTA_UNIT_TARGET_FLAG_NONE,
            FIND_ANY_ORDER,
            false
        )
        local heroes = 0
        for ____, u in ipairs(enemies) do
            if u:IsRealHero() then
                heroes = heroes + 1
            end
        end
        if oma ~= nil and heroes >= 2 then
            local pct = oma:GetSpecialValueFor("armor_pct_as_strength")
            bonus = math.floor(math.max(
                0,
                parent:GetPhysicalArmorValue(false)
            ) * pct / 100)
        end
    end
    if bonus ~= self:GetStackCount() then
        self:SetStackCount(bonus)
        if parent:IsHero() then
            parent:CalculateStatBonus(true)
        end
    end
end
function ModifierOrbHero.prototype.thinkHunt(self, parent, b, now)
    local n = 0
    for ____, ____value in __TS__Iterator(self.hunger) do
        local id = ____value[1]
        local ____until = ____value[2]
        do
            local u = EntIndexToHScript(id)
            if ____until <= now or u == nil or not IsValidEntity(u) or not u:IsAlive() or not hasModifierLike(u, {"battle_hunger"}) then
                if u == nil or not IsValidEntity(u) or u:IsAlive() or ____until <= now then
                    self.hunger:delete(id)
                end
                goto __continue126
            end
            n = n + 1
        end
        ::__continue126::
    end
    if not self:has("axe_l_hunt", b) then
        return
    end
    local m = parent:FindModifierByName("modifier_orb_axe_hunt")
    if n > 0 and m == nil then
        m = parent:AddNewModifier(parent, nil, "modifier_orb_axe_hunt", {})
    end
    if m ~= nil and m:GetStackCount() ~= n then
        m:SetStackCount(n)
    end
end
function ModifierOrbHero.prototype.thinkCull(self, parent, now)
    if self.freeCullUntil <= 0 or now < self.freeCullUntil then
        return
    end
    self.freeCullUntil = 0
    local ability = parent:FindAbilityByName("axe_culling_blade")
    if ability ~= nil and not self.cullUsedInWindow and self.cullRestore > 0 and ability:IsCooldownReady() then
        ability:StartCooldown(self.cullRestore)
    end
    self.cullRestore = 0
end
function ModifierOrbHero.prototype.thinkWard(self, parent, b, now)
    local roaming = self:has("jugg_p_roaming_ward", b)
    local fury = self:has("jugg_p_healing_fury", b)
    local sanct = self:has("jugg_l_sanctuary", b)
    if not roaming and not fury and not sanct then
        return
    end
    if self.ward == nil and now < self.wardSearchUntil and self.wardSearchPos ~= nil then
        local units = FindUnitsInRadius(
            parent:GetTeamNumber(),
            self.wardSearchPos,
            nil,
            500,
            DOTA_UNIT_TARGET_TEAM_FRIENDLY,
            DOTA_UNIT_TARGET_ALL,
            DOTA_UNIT_TARGET_FLAG_INVULNERABLE,
            FIND_CLOSEST,
            false
        )
        for ____, u in ipairs(units) do
            do
                if u:GetUnitName() ~= WARD_UNIT or u:GetPlayerOwnerID() ~= parent:GetPlayerOwnerID() then
                    goto __continue139
                end
                self.ward = u
                if sanct then
                    u:AddNewModifier(parent, nil, "modifier_invulnerable", {duration = H.sanctuaryInvuln})
                end
                break
            end
            ::__continue139::
        end
    end
    local w = self.ward
    if w == nil or not IsValidEntity(w) or not w:IsAlive() then
        self.ward = nil
        return
    end
    if not parent:IsAlive() then
        return
    end
    local po = parent:GetAbsOrigin()
    local wo = w:GetAbsOrigin()
    local dist = (po - wo):Length2D()
    local healAbility = parent:FindAbilityByName("juggernaut_healing_ward")
    local radius = healAbility ~= nil and healAbility:GetSpecialValueFor("healing_ward_aura_radius") or 400
    if roaming and dist > 150 and now - self.lastWardOrder >= 0.5 then
        self.lastWardOrder = now
        w:MoveToNPC(parent)
    end
    if roaming and dist <= radius then
        parent:AddNewModifier(parent, healAbility, "modifier_orb_jugg_ward_armor", {duration = 0.25})
    end
    if sanct and dist <= radius then
        local m = parent:AddNewModifier(parent, healAbility, "modifier_orb_jugg_sanctuary", {duration = 0.25})
        if m ~= nil then
            m:SetStackCount(b.awake and H.sanctuaryReduceAwake or H.sanctuaryReduce)
        end
        if b.awake then
            parent:Heal(
                parent:GetMaxHealth() * H.sanctuaryHealAwake / 100 * THINK,
                healAbility
            )
        end
    end
    if fury and now < self.furyUntil and dist <= H.healingFuryRange and healAbility ~= nil then
        local pct = healAbility:GetSpecialValueFor("healing_ward_heal_amount")
        local extra = dist <= radius and pct or pct * 2
        parent:Heal(
            parent:GetMaxHealth() * extra / 100 * THINK,
            healAbility
        )
    end
end
function ModifierOrbHero.prototype.thinkStorm(self, parent, b, now)
    if now >= self.furyUntil or not self:has("jugg_l_storm", b) or not parent:IsAlive() then
        return
    end
    local fury = parent:FindAbilityByName("juggernaut_blade_fury")
    local radius = fury ~= nil and fury:GetSpecialValueFor("blade_fury_radius") or 380
    local c = parent:GetAbsOrigin()
    local units = FindUnitsInRadius(
        parent:GetTeamNumber(),
        c,
        nil,
        radius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_ANY_ORDER,
        false
    )
    local step = H.stormPullPerSecond * THINK
    for ____, u in ipairs(units) do
        do
            if not u:IsAlive() then
                goto __continue153
            end
            local o = u:GetAbsOrigin()
            local d = (o - c):Length2D()
            if d <= 120 then
                goto __continue153
            end
            local dir = (c - o):Normalized()
            FindClearSpaceForUnit(u, o + dir * step, false)
        end
        ::__continue153::
    end
end
function ModifierOrbHero.prototype.thinkOmniEnd(self, parent, b, now)
    local active = now < self.omniUntil
    if self.omniWasActive and not active and self:has("jugg_p_dispel", b) and parent:IsAlive() then
        parent:AddNewModifier(
            parent,
            parent:FindAbilityByName("juggernaut_omni_slash"),
            "modifier_orb_jugg_immune",
            {duration = H.dispelImmunity}
        )
    end
    self.omniWasActive = active
end
modifier_orb_hero = registerModifier("modifier_orb_hero", ____exports.ModifierOrbHero)
return ____exports
