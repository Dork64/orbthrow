local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____herocode = require("core.herocode")
local HERO_CODE = ____herocode.HERO_CODE
local RANGE_FX = "particles/ui_mouseactions/range_display.vpcf"
--- Железная воля: сопротивление эффектам на время Вызова.
____exports.ModifierOrbAxeIronWill = __TS__Class()
local ModifierOrbAxeIronWill = ____exports.ModifierOrbAxeIronWill
ModifierOrbAxeIronWill.name = "ModifierOrbAxeIronWill"
__TS__ClassExtends(ModifierOrbAxeIronWill, ModBase)
function ModifierOrbAxeIronWill.prototype.IsHidden(self)
    return false
end
function ModifierOrbAxeIronWill.prototype.IsPurgable(self)
    return false
end
function ModifierOrbAxeIronWill.prototype.GetTexture(self)
    return "axe_berserkers_call"
end
function ModifierOrbAxeIronWill.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_STATUS_RESISTANCE_STACKING}
end
function ModifierOrbAxeIronWill.prototype.OrbStatusResistance(self)
    return HERO_CODE.ironWillStatus
end
function ModifierOrbAxeIronWill.prototype.GetModifierStatusResistanceStacking(self)
    return 0
end
--- Рваные раны: −1 брони за стак.
____exports.ModifierOrbAxeLacerate = __TS__Class()
local ModifierOrbAxeLacerate = ____exports.ModifierOrbAxeLacerate
ModifierOrbAxeLacerate.name = "ModifierOrbAxeLacerate"
__TS__ClassExtends(ModifierOrbAxeLacerate, ModBase)
function ModifierOrbAxeLacerate.prototype.IsHidden(self)
    return false
end
function ModifierOrbAxeLacerate.prototype.IsDebuff(self)
    return true
end
function ModifierOrbAxeLacerate.prototype.IsPurgable(self)
    return true
end
function ModifierOrbAxeLacerate.prototype.GetTexture(self)
    return "axe_counter_helix"
end
function ModifierOrbAxeLacerate.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS}
end
function ModifierOrbAxeLacerate.prototype.GetModifierPhysicalArmorBonus(self)
    return -HERO_CODE.lacerateArmor * self:GetStackCount()
end
--- Раскрутка: скорость бега и атаки за стак.
____exports.ModifierOrbAxeSpin = __TS__Class()
local ModifierOrbAxeSpin = ____exports.ModifierOrbAxeSpin
ModifierOrbAxeSpin.name = "ModifierOrbAxeSpin"
__TS__ClassExtends(ModifierOrbAxeSpin, ModBase)
function ModifierOrbAxeSpin.prototype.IsHidden(self)
    return false
end
function ModifierOrbAxeSpin.prototype.IsPurgable(self)
    return true
end
function ModifierOrbAxeSpin.prototype.GetTexture(self)
    return "axe_counter_helix"
end
function ModifierOrbAxeSpin.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE, MODIFIER_PROPERTY_ATTACKSPEED_BONUS_CONSTANT}
end
function ModifierOrbAxeSpin.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return HERO_CODE.spinMs * self:GetStackCount()
end
function ModifierOrbAxeSpin.prototype.GetModifierAttackSpeedBonus_Constant(self)
    return HERO_CODE.spinAs * self:GetStackCount()
end
--- Кровавая охота: броня и скорость за каждого врага под Голодом (стаки ставит modifier_orb_hero).
____exports.ModifierOrbAxeHunt = __TS__Class()
local ModifierOrbAxeHunt = ____exports.ModifierOrbAxeHunt
ModifierOrbAxeHunt.name = "ModifierOrbAxeHunt"
__TS__ClassExtends(ModifierOrbAxeHunt, ModBase)
function ModifierOrbAxeHunt.prototype.IsHidden(self)
    return self:GetStackCount() <= 0
end
function ModifierOrbAxeHunt.prototype.IsPurgable(self)
    return false
end
function ModifierOrbAxeHunt.prototype.GetTexture(self)
    return "axe_battle_hunger"
end
function ModifierOrbAxeHunt.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS, MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE}
end
function ModifierOrbAxeHunt.prototype.GetModifierPhysicalArmorBonus(self)
    return HERO_CODE.huntArmor * self:GetStackCount()
end
function ModifierOrbAxeHunt.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return HERO_CODE.huntMs * self:GetStackCount()
end
--- Арена гладиатора (на невидимом «мыслителе»): враги, побывавшие внутри, не могут выйти пешком
-- (рывок дальше 300 за край — можно). Акс внутри получает бафф.
____exports.ModifierOrbAxeArena = __TS__Class()
local ModifierOrbAxeArena = ____exports.ModifierOrbAxeArena
ModifierOrbAxeArena.name = "ModifierOrbAxeArena"
__TS__ClassExtends(ModifierOrbAxeArena, ModBase)
function ModifierOrbAxeArena.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.radius = HERO_CODE.arenaRadius
    self.awake = 0
    self.inside = __TS__New(Set)
end
function ModifierOrbAxeArena.prototype.IsHidden(self)
    return true
end
function ModifierOrbAxeArena.prototype.IsPurgable(self)
    return false
end
function ModifierOrbAxeArena.prototype.OnCreated(self, params)
    if not IsServer() then
        return
    end
    self.awake = params.awake or 0
    self.inside = __TS__New(Set)
    local p = self:GetParent()
    self.fx = ParticleManager:CreateParticle(RANGE_FX, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(
        self.fx,
        0,
        p:GetAbsOrigin()
    )
    ParticleManager:SetParticleControl(
        self.fx,
        1,
        Vector(self.radius, 0, 0)
    )
    ParticleManager:SetParticleControl(
        self.fx,
        2,
        Vector(10, 0, 0)
    )
    ParticleManager:SetParticleControl(
        self.fx,
        3,
        Vector(100, 0, 0)
    )
    ParticleManager:SetParticleControl(
        self.fx,
        15,
        Vector(255, 80, 40)
    )
    EmitSoundOn("Hero_Axe.Berserkers_Call", p)
    self:OnIntervalThink()
    self:StartIntervalThink(0.03)
end
function ModifierOrbAxeArena.prototype.OnIntervalThink(self)
    local thinker = self:GetParent()
    local caster = self:GetCaster()
    if caster == nil or not IsValidEntity(caster) then
        return
    end
    local c = thinker:GetAbsOrigin()
    local r = self.radius
    local units = FindUnitsInRadius(
        caster:GetTeamNumber(),
        c,
        nil,
        r + 300,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES,
        FIND_ANY_ORDER,
        false
    )
    for ____, u in ipairs(units) do
        do
            if not u:IsAlive() then
                goto __continue32
            end
            local o = u:GetAbsOrigin()
            local dx = o.x - c.x
            local dy = o.y - c.y
            local d = math.sqrt(dx * dx + dy * dy)
            local id = u:entindex()
            if d < r - 30 then
                self.inside:add(id)
                goto __continue32
            end
            if not self.inside:has(id) or d <= 0 then
                goto __continue32
            end
            local k = (r - 40) / d
            FindClearSpaceForUnit(
                u,
                Vector(c.x + dx * k, c.y + dy * k, o.z),
                false
            )
        end
        ::__continue32::
    end
    local o = caster:GetAbsOrigin()
    if caster:IsAlive() and (o.x - c.x) * (o.x - c.x) + (o.y - c.y) * (o.y - c.y) <= r * r then
        local m = caster:AddNewModifier(
            caster,
            self:GetAbility(),
            "modifier_orb_axe_arena_buff",
            {duration = 0.15}
        )
        if m ~= nil then
            m:SetStackCount(self.awake > 0 and 1 or 0)
        end
    end
end
function ModifierOrbAxeArena.prototype.OnDestroy(self)
    if not IsServer() then
        return
    end
    if self.fx ~= nil then
        ParticleManager:DestroyParticle(self.fx, false)
        ParticleManager:ReleaseParticleIndex(self.fx)
    end
    UTIL_Remove(self:GetParent())
end
--- Арена: броня Акса внутри; после Пробуждения (стак 1) — еще и урон.
____exports.ModifierOrbAxeArenaBuff = __TS__Class()
local ModifierOrbAxeArenaBuff = ____exports.ModifierOrbAxeArenaBuff
ModifierOrbAxeArenaBuff.name = "ModifierOrbAxeArenaBuff"
__TS__ClassExtends(ModifierOrbAxeArenaBuff, ModBase)
function ModifierOrbAxeArenaBuff.prototype.IsHidden(self)
    return false
end
function ModifierOrbAxeArenaBuff.prototype.IsPurgable(self)
    return false
end
function ModifierOrbAxeArenaBuff.prototype.GetTexture(self)
    return "axe_berserkers_call"
end
function ModifierOrbAxeArenaBuff.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS, MODIFIER_PROPERTY_TOTALDAMAGEOUTGOING_PERCENTAGE}
end
function ModifierOrbAxeArenaBuff.prototype.GetModifierPhysicalArmorBonus(self)
    return HERO_CODE.arenaArmor
end
function ModifierOrbAxeArenaBuff.prototype.GetModifierTotalDamageOutgoing_Percentage(self)
    return self:GetStackCount() > 0 and HERO_CODE.arenaDamageAwake or 0
end
--- Палач: окно, в которое Culling Blade можно применить снова бесплатно и дальше.
____exports.ModifierOrbAxeFreeCull = __TS__Class()
local ModifierOrbAxeFreeCull = ____exports.ModifierOrbAxeFreeCull
ModifierOrbAxeFreeCull.name = "ModifierOrbAxeFreeCull"
__TS__ClassExtends(ModifierOrbAxeFreeCull, ModBase)
function ModifierOrbAxeFreeCull.prototype.IsHidden(self)
    return false
end
function ModifierOrbAxeFreeCull.prototype.IsPurgable(self)
    return false
end
function ModifierOrbAxeFreeCull.prototype.GetTexture(self)
    return "axe_culling_blade"
end
function ModifierOrbAxeFreeCull.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_CAST_RANGE_BONUS_TARGET}
end
function ModifierOrbAxeFreeCull.prototype.GetModifierCastRangeBonusTarget(self, e)
    local a = e.ability
    if a == nil or a:GetAbilityName() ~= "axe_culling_blade" then
        return 0
    end
    return HERO_CODE.executionerRange
end
--- Бродячий тотем: броня рядом с тотемом.
____exports.ModifierOrbJuggWardArmor = __TS__Class()
local ModifierOrbJuggWardArmor = ____exports.ModifierOrbJuggWardArmor
ModifierOrbJuggWardArmor.name = "ModifierOrbJuggWardArmor"
__TS__ClassExtends(ModifierOrbJuggWardArmor, ModBase)
function ModifierOrbJuggWardArmor.prototype.IsHidden(self)
    return false
end
function ModifierOrbJuggWardArmor.prototype.IsPurgable(self)
    return false
end
function ModifierOrbJuggWardArmor.prototype.GetTexture(self)
    return "juggernaut_healing_ward"
end
function ModifierOrbJuggWardArmor.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS}
end
function ModifierOrbJuggWardArmor.prototype.GetModifierPhysicalArmorBonus(self)
    return HERO_CODE.wardArmor
end
--- Неуловимый: невосприимчивость к магии после Омнислэша.
____exports.ModifierOrbJuggImmune = __TS__Class()
local ModifierOrbJuggImmune = ____exports.ModifierOrbJuggImmune
ModifierOrbJuggImmune.name = "ModifierOrbJuggImmune"
__TS__ClassExtends(ModifierOrbJuggImmune, ModBase)
function ModifierOrbJuggImmune.prototype.IsHidden(self)
    return false
end
function ModifierOrbJuggImmune.prototype.IsPurgable(self)
    return false
end
function ModifierOrbJuggImmune.prototype.GetTexture(self)
    return "juggernaut_omni_slash"
end
function ModifierOrbJuggImmune.prototype.GetStatusEffectName(self)
    return "particles/status_fx/status_effect_avatar.vpcf"
end
function ModifierOrbJuggImmune.prototype.StatusEffectPriority(self)
    return MODIFIER_PRIORITY_HIGH
end
function ModifierOrbJuggImmune.prototype.CheckState(self)
    return {[MODIFIER_STATE_MAGIC_IMMUNE] = true}
end
modifier_orb_axe_iron_will = registerModifier("modifier_orb_axe_iron_will", ____exports.ModifierOrbAxeIronWill)
modifier_orb_axe_lacerate = registerModifier("modifier_orb_axe_lacerate", ____exports.ModifierOrbAxeLacerate)
modifier_orb_axe_spin = registerModifier("modifier_orb_axe_spin", ____exports.ModifierOrbAxeSpin)
modifier_orb_axe_hunt = registerModifier("modifier_orb_axe_hunt", ____exports.ModifierOrbAxeHunt)
modifier_orb_axe_arena = registerModifier("modifier_orb_axe_arena", ____exports.ModifierOrbAxeArena)
modifier_orb_axe_arena_buff = registerModifier("modifier_orb_axe_arena_buff", ____exports.ModifierOrbAxeArenaBuff)
modifier_orb_axe_free_cull = registerModifier("modifier_orb_axe_free_cull", ____exports.ModifierOrbAxeFreeCull)
modifier_orb_jugg_ward_armor = registerModifier("modifier_orb_jugg_ward_armor", ____exports.ModifierOrbJuggWardArmor)
modifier_orb_jugg_immune = registerModifier("modifier_orb_jugg_immune", ____exports.ModifierOrbJuggImmune)
return ____exports
