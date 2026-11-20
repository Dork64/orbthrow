local ____lualib = require("lualib_bundle")
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____fxtypes = require("core.fxtypes")
local fxModifierName = ____fxtypes.fxModifierName
local ____fxutil = require("core.fxutil")
local fxByKey = ____fxutil.fxByKey
local fxNum = ____fxutil.fxNum
local fxView = ____fxutil.fxView
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
--- Свойство → функция модификатора → имя метода.
local PROP_FUNCS = {
    {"armor", MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS, "GetModifierPhysicalArmorBonus"},
    {"ms", MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE, "GetModifierMoveSpeedBonus_Percentage"},
    {"msc", MODIFIER_PROPERTY_MOVESPEED_BONUS_CONSTANT, "GetModifierMoveSpeedBonus_Constant"},
    {"as", MODIFIER_PROPERTY_ATTACKSPEED_BONUS_CONSTANT, "GetModifierAttackSpeedBonus_Constant"},
    {"dmg", MODIFIER_PROPERTY_TOTALDAMAGEOUTGOING_PERCENTAGE, "GetModifierTotalDamageOutgoing_Percentage"},
    {"dmgc", MODIFIER_PROPERTY_PREATTACK_BONUS_DAMAGE, "GetModifierPreAttack_BonusDamage"},
    {"inc", MODIFIER_PROPERTY_INCOMING_DAMAGE_PERCENTAGE, "GetModifierIncomingDamage_Percentage"},
    {"status", MODIFIER_PROPERTY_STATUS_RESISTANCE_STACKING, "GetModifierStatusResistanceStacking"},
    {"slowres", MODIFIER_PROPERTY_SLOW_RESISTANCE_STACKING, "GetModifierSlowResistance_Stacking"},
    {"sa", MODIFIER_PROPERTY_SPELL_AMPLIFY_PERCENTAGE, "GetModifierSpellAmplify_Percentage"},
    {"mr", MODIFIER_PROPERTY_MAGICAL_RESISTANCE_BONUS, "GetModifierMagicalResistanceBonus"},
    {"regen", MODIFIER_PROPERTY_HEALTH_REGEN_CONSTANT, "GetModifierConstantHealthRegen"},
    {"regenpct", MODIFIER_PROPERTY_HEALTH_REGEN_PERCENTAGE, "GetModifierHealthRegenPercentage"},
    {"evasion", MODIFIER_PROPERTY_EVASION_CONSTANT, "GetModifierEvasion_Constant"},
    {"range", MODIFIER_PROPERTY_ATTACK_RANGE_BONUS, "GetModifierAttackRangeBonus"},
    {"castrange", MODIFIER_PROPERTY_CAST_RANGE_BONUS_STACKING, "GetModifierCastRangeBonusStacking"},
    {"str", MODIFIER_PROPERTY_STATS_STRENGTH_BONUS, "GetModifierBonusStats_Strength"},
    {"agi", MODIFIER_PROPERTY_STATS_AGILITY_BONUS, "GetModifierBonusStats_Agility"},
    {"int", MODIFIER_PROPERTY_STATS_INTELLECT_BONUS, "GetModifierBonusStats_Intellect"},
    {"hp", MODIFIER_PROPERTY_HEALTH_BONUS, "GetModifierHealthBonus"}
}
local STATE_PROPS = {
    {"immune", MODIFIER_STATE_MAGIC_IMMUNE},
    {"silence", MODIFIER_STATE_SILENCED},
    {"root", MODIFIER_STATE_ROOTED},
    {"stun", MODIFIER_STATE_STUNNED},
    {"disarm", MODIFIER_STATE_DISARMED},
    {"brk", MODIFIER_STATE_PASSIVES_DISABLED},
    {"nocol", MODIFIER_STATE_NO_UNIT_COLLISION},
    {"invis", MODIFIER_STATE_INVISIBLE},
    {"fly", MODIFIER_STATE_FLYING_FOR_PATHING_PURPOSES_ONLY}
}
--- Свойства эффекта (бафф, дебафф или стаки за убийства).
function ____exports.fxPropsOf(f)
    repeat
        local ____switch3 = f.t
        local ____cond3 = ____switch3 == "guard" or ____switch3 == "combo" or ____switch3 == "buff" or ____switch3 == "passive" or ____switch3 == "lowhp" or ____switch3 == "stacks" or ____switch3 == "still" or ____switch3 == "aura"
        if ____cond3 then
            return f.props
        end
        ____cond3 = ____cond3 or ____switch3 == "kill"
        if ____cond3 then
            return f.stack ~= nil and f.stack.props or nil
        end
        ____cond3 = ____cond3 or (____switch3 == "zone" or ____switch3 == "hit" or ____switch3 == "blast" or ____switch3 == "trail" or ____switch3 == "trap" or ____switch3 == "storm")
        if ____cond3 then
            return f.debuff ~= nil and f.debuff.props or nil
        end
        do
            return nil
        end
    until true
end
--- Все свойства, которые эффект может иметь (до и после Пробуждения).
local function allProps(f)
    local out = __TS__New(Set)
    local function add(p)
        if p == nil then
            return
        end
        for k in pairs(p) do
            out:add(k)
        end
    end
    add(____exports.fxPropsOf(f))
    if f.aw ~= nil then
        add(____exports.fxPropsOf(fxView(f, true)))
    end
    return out
end
function ____exports.fxIsDebuff(f)
    return f.t == "mark" or f.t == "zone" or f.t == "hit" or f.t == "blast" or f.t == "aura" or f.t == "trail" or f.t == "trap" or f.t == "storm"
end
--- Свойства умножаются на число стаков.
function ____exports.fxStacking(f)
    if f.t == "hit" or f.t == "blast" then
        return f.debuff ~= nil and (f.debuff.max or 1) > 1
    end
    if f.t == "kill" then
        return f.stack ~= nil
    end
    if f.t == "stacks" then
        return (f.perstack or 0) > 0
    end
    if f.t == "passive" then
        return (f.perlvl or 0) > 0
    end
    return false
end
____exports.ModifierOrbFx = __TS__Class()
local ModifierOrbFx = ____exports.ModifierOrbFx
ModifierOrbFx.name = "ModifierOrbFx"
__TS__ClassExtends(ModifierOrbFx, ModBase)
function ModifierOrbFx.prototype.fx(self)
    return fxByKey(self.fxKey)
end
function ModifierOrbFx.prototype.owner(self)
    local c = self:GetCaster()
    return c ~= nil and IsValidEntity(c) and c or self:GetParent()
end
function ModifierOrbFx.prototype.view(self)
    local f = self:fx()
    if f == nil then
        return nil
    end
    if f.aw == nil then
        return f
    end
    local o = self:owner()
    local awake = bonusesOf(
        o:GetPlayerOwnerID(),
        IsServer(),
        GameRules:GetGameTime()
    ).awake
    return fxView(f, awake)
end
function ModifierOrbFx.prototype.val(self, prop)
    local f = self:view()
    if f == nil then
        return 0
    end
    local p = ____exports.fxPropsOf(f)
    if p == nil then
        return 0
    end
    local raw = p[prop]
    if raw == nil then
        return 0
    end
    local o = self:owner()
    local ____temp_0
    if f.ab ~= "" then
        ____temp_0 = o:FindAbilityByName(f.ab)
    else
        ____temp_0 = nil
    end
    local ab = ____temp_0
    local v = fxNum(
        raw,
        function(key) return ab ~= nil and ab:GetSpecialValueFor(key) or 0 end
    )
    return ____exports.fxStacking(f) and v * math.max(
        1,
        self:GetStackCount()
    ) or v
end
function ModifierOrbFx.prototype.IsHidden(self)
    return false
end
function ModifierOrbFx.prototype.IsDebuff(self)
    local f = self:fx()
    return f ~= nil and ____exports.fxIsDebuff(f)
end
function ModifierOrbFx.prototype.IsPurgable(self)
    return self:IsDebuff()
end
function ModifierOrbFx.prototype.RemoveOnDeath(self)
    local f = self:fx()
    if f == nil then
        return true
    end
    if f.t == "passive" then
        return false
    end
    if f.t == "kill" then
        return not (f.stack ~= nil and (f.stack.perm or 0) > 0)
    end
    return true
end
function ModifierOrbFx.prototype.GetTexture(self)
    local f = self:fx()
    return f ~= nil and f.icon or "item_ultimate_orb"
end
function ModifierOrbFx.prototype.GetEffectName(self)
    local f = self:fx()
    if f == nil then
        return ""
    end
    local p = ____exports.fxPropsOf(f)
    if p ~= nil and p.stun ~= nil then
        return "particles/generic_gameplay/generic_stunned.vpcf"
    end
    if p ~= nil and p.silence ~= nil then
        return "particles/generic_gameplay/generic_silenced.vpcf"
    end
    return ""
end
function ModifierOrbFx.prototype.GetEffectAttachType(self)
    return PATTACH_OVERHEAD_FOLLOW
end
function ModifierOrbFx.prototype.DeclareFunctions(self)
    local f = self:fx()
    if f == nil then
        return {}
    end
    local props = allProps(f)
    local list = {}
    for ____, ____value in ipairs(PROP_FUNCS) do
        local k = ____value[1]
        local fn = ____value[2]
        if props:has(k) then
            list[#list + 1] = fn
        end
    end
    if props:has("healred") then
        list[#list + 1] = MODIFIER_PROPERTY_HEAL_AMPLIFY_PERCENTAGE_TARGET
        list[#list + 1] = MODIFIER_PROPERTY_HP_REGEN_AMPLIFY_PERCENTAGE
        list[#list + 1] = MODIFIER_PROPERTY_LIFESTEAL_AMPLIFY_PERCENTAGE
        list[#list + 1] = MODIFIER_PROPERTY_SPELL_LIFESTEAL_AMPLIFY_PERCENTAGE
    end
    if props:has("cleave") then
        list[#list + 1] = MODIFIER_EVENT_ON_ATTACK_LANDED
    end
    if props:has("ls") or props:has("sls") then
        list[#list + 1] = MODIFIER_EVENT_ON_TAKEDAMAGE
    end
    if props:has("stun") then
        list[#list + 1] = MODIFIER_PROPERTY_OVERRIDE_ANIMATION
    end
    if props:has("invis") then
        list[#list + 1] = MODIFIER_PROPERTY_INVISIBILITY_LEVEL
        list[#list + 1] = MODIFIER_EVENT_ON_ATTACK
    end
    if props:has("scale") then
        list[#list + 1] = MODIFIER_PROPERTY_MODEL_SCALE
    end
    return list
end
function ModifierOrbFx.prototype.CheckState(self)
    local f = self:fx()
    local out = {}
    if f == nil then
        return out
    end
    local props = allProps(f)
    for ____, ____value in ipairs(STATE_PROPS) do
        local k = ____value[1]
        local st = ____value[2]
        if props:has(k) and self:val(k) > 0 then
            out[st] = true
        end
    end
    if props:has("reveal") and self:val("reveal") > 0 then
        out[MODIFIER_STATE_INVISIBLE] = false
    end
    return out
end
function ModifierOrbFx.prototype.GetOverrideAnimation(self)
    return ACT_DOTA_DISABLED
end
function ModifierOrbFx.prototype.GetModifierPhysicalArmorBonus(self)
    return self:val("armor")
end
function ModifierOrbFx.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return self:val("ms")
end
function ModifierOrbFx.prototype.GetModifierMoveSpeedBonus_Constant(self)
    return self:val("msc")
end
function ModifierOrbFx.prototype.GetModifierAttackSpeedBonus_Constant(self)
    return self:val("as")
end
function ModifierOrbFx.prototype.GetModifierTotalDamageOutgoing_Percentage(self)
    return self:val("dmg")
end
function ModifierOrbFx.prototype.GetModifierPreAttack_BonusDamage(self)
    return self:val("dmgc")
end
function ModifierOrbFx.prototype.GetModifierIncomingDamage_Percentage(self)
    return self:val("inc")
end
function ModifierOrbFx.prototype.OrbStatusResistance(self)
    return math.max(
        0,
        self:val("status")
    )
end
function ModifierOrbFx.prototype.GetModifierStatusResistanceStacking(self)
    return math.min(
        0,
        self:val("status")
    )
end
function ModifierOrbFx.prototype.GetModifierSlowResistance_Stacking(self)
    return self:val("slowres")
end
function ModifierOrbFx.prototype.GetModifierSpellAmplify_Percentage(self)
    return self:val("sa")
end
function ModifierOrbFx.prototype.GetModifierMagicalResistanceBonus(self)
    return self:val("mr")
end
function ModifierOrbFx.prototype.GetModifierConstantHealthRegen(self)
    return self:val("regen")
end
function ModifierOrbFx.prototype.GetModifierHealthRegenPercentage(self)
    return self:val("regenpct")
end
function ModifierOrbFx.prototype.GetModifierEvasion_Constant(self)
    return self:val("evasion")
end
function ModifierOrbFx.prototype.GetModifierAttackRangeBonus(self)
    return self:val("range")
end
function ModifierOrbFx.prototype.GetModifierCastRangeBonusStacking(self)
    return self:val("castrange")
end
function ModifierOrbFx.prototype.GetModifierBonusStats_Strength(self)
    return self:val("str")
end
function ModifierOrbFx.prototype.GetModifierBonusStats_Agility(self)
    return self:val("agi")
end
function ModifierOrbFx.prototype.GetModifierBonusStats_Intellect(self)
    return self:val("int")
end
function ModifierOrbFx.prototype.GetModifierHealthBonus(self)
    return self:val("hp")
end
function ModifierOrbFx.prototype.GetModifierInvisibilityLevel(self)
    return self:val("invis") > 0 and 1 or 0
end
function ModifierOrbFx.prototype.GetModifierModelScale(self)
    return self:val("scale") > 0 and self:val("scale") - 100 or 0
end
function ModifierOrbFx.prototype.OnAttack(self, e)
    if not IsServer() then
        return
    end
    if e.attacker == self:GetParent() and self:val("invis") > 0 then
        self:Destroy()
    end
end
function ModifierOrbFx.prototype.GetModifierHealAmplify_PercentageTarget(self)
    return -self:val("healred")
end
function ModifierOrbFx.prototype.GetModifierHPRegenAmplify_Percentage(self)
    return -self:val("healred")
end
function ModifierOrbFx.prototype.GetModifierLifestealRegenAmplify_Percentage(self)
    return -self:val("healred")
end
function ModifierOrbFx.prototype.GetModifierSpellLifestealRegenAmplify_Percentage(self)
    return -self:val("healred")
end
function ModifierOrbFx.prototype.OnAttackLanded(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.attacker ~= parent or parent:IsRangedAttacker() or parent:IsIllusion() then
        return
    end
    local t = e.target
    if t == nil or not IsValidEntity(t) or t:IsBuilding() or t:GetTeamNumber() == parent:GetTeamNumber() then
        return
    end
    local pct = self:val("cleave")
    if pct <= 0 then
        return
    end
    DoCleaveAttack(
        parent,
        t,
        nil,
        e.damage * pct / 100,
        150,
        360,
        625,
        "particles/items_fx/battlefury_cleave.vpcf"
    )
end
function ModifierOrbFx.prototype.OnTakeDamage(self, e)
    if not IsServer() then
        return
    end
    local parent = self:GetParent()
    if e.attacker ~= parent or e.damage <= 0 then
        return
    end
    local u = e.unit
    if u == nil or not u:IsRealHero() or u:GetTeamNumber() == parent:GetTeamNumber() then
        return
    end
    if bit.band(e.damage_flags, DOTA_DAMAGE_FLAG_REFLECTION) ~= 0 or bit.band(e.damage_flags, DOTA_DAMAGE_FLAG_HPLOSS) ~= 0 then
        return
    end
    local spell = e.inflictor ~= nil
    if not parent:IsAlive() or spell and bit.band(e.damage_flags, DOTA_DAMAGE_FLAG_NO_SPELL_LIFESTEAL) ~= 0 then
        return
    end
    local pct = self:val(spell and "sls" or "ls")
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
end
--- Модификатор эффекта по ключу (вызывается из modifiers/modifier_orb_fx.ts).
function ____exports.makeFx(key)
    local t = registerModifier(
        fxModifierName(key),
        ____exports.ModifierOrbFx
    )
    t.fxKey = key
    return t
end
return ____exports
