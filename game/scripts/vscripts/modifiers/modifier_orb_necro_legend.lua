local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__StringStartsWith = ____lualib.__TS__StringStartsWith
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local Map = ____lualib.Map
local __TS__Iterator = ____lualib.__TS__Iterator
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
____exports.PULSE = "necrolyte_death_pulse"
____exports.SHROUD = "necrolyte_ghost_shroud"
____exports.AURA = "necrolyte_heartstopper_aura"
____exports.SCYTHE = "necrolyte_reapers_scythe"
local Q = "orb_necro_pulse"
local W = "orb_necro_return"
local E = "orb_necro_beacon"
local SHIFT = "orb_necro_move_beacon"
local R = "orb_necro_verdict"
local Q_READY = "modifier_orb_necro_pulse_ready"
local Q_WIND = "modifier_orb_necro_pulse_windup"
local W_ANCHOR = "modifier_orb_necro_anchor"
____exports.E_ACTIVE = "modifier_orb_necro_beacon"
local E_BUILD = "modifier_orb_necro_exposed"
local E_PLAGUE = "modifier_orb_necro_plague"
local R_MARK = "modifier_orb_necro_sentence"
local R_READY = "modifier_orb_necro_verdict"
local HERO_MODEL = "models/heroes/necrolyte/necrolyte.vmdl"
local RING = "particles/ui_mouseactions/range_display.vpcf"
local PULSE_FX = "particles/units/heroes/hero_necrolyte/necrolyte_pulse_launch.vpcf"
local IMPACT = "particles/units/heroes/hero_necrolyte/necrolyte_pulse_enemy_explosion.vpcf"
local GHOST_FX = "particles/units/heroes/hero_necrolyte/necrolyte_spirit_ground.vpcf"
local PLAGUE_FX = "particles/units/heroes/hero_necrolyte/necrolyte_spirit_debuff.vpcf"
local MARK_FX = "particles/units/heroes/hero_necrolyte/necrolyte_scythe_model_static.vpcf"
local SCYTHE_FX = "particles/units/heroes/hero_necrolyte/necrolyte_scythe.vpcf"
local PULSE_RADIUS = 300
local VERDICT_RANGE = 650
local BEACON_RANGE = 650
local BEACON_SHIFT = 300
local STEP = 0.05
local function now()
    return GameRules:GetGameTime()
end
local function distance(a, b)
    local x = a.x - b.x
    local y = a.y - b.y
    return math.sqrt(x * x + y * y)
end
local function alive(unit)
    return unit ~= nil and IsValidEntity(unit) and unit:IsAlive() and unit:GetHealth() > 0
end
local function clear(mod)
    if mod ~= nil and not mod:IsNull() then
        mod:Destroy()
    end
end
local function clearParticle(id)
    if id == nil then
        return
    end
    ParticleManager:DestroyParticle(id, true)
    ParticleManager:ReleaseParticleIndex(id)
end
local function worldParticle(path, point)
    local id = ParticleManager:CreateParticle(path, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, point)
    return id
end
local function flash(path, point)
    ParticleManager:ReleaseParticleIndex(worldParticle(path, point))
end
local function ring(point, radius, color)
    local id = worldParticle(RING, point)
    ParticleManager:SetParticleControl(
        id,
        1,
        Vector(radius, 0, 0)
    )
    ParticleManager:SetParticleControl(id, 2, color)
    return id
end
local Visible = __TS__Class()
Visible.name = "Visible"
__TS__ClassExtends(Visible, ModBase)
function Visible.prototype.IsHidden(self)
    return false
end
function Visible.prototype.IsPurgable(self)
    return false
end
local PulseReady = __TS__Class()
PulseReady.name = "PulseReady"
__TS__ClassExtends(PulseReady, Visible)
function PulseReady.prototype.GetTexture(self)
    return ____exports.PULSE
end
local PulseWindup = __TS__Class()
PulseWindup.name = "PulseWindup"
__TS__ClassExtends(PulseWindup, PulseReady)
local AnchorIcon = __TS__Class()
AnchorIcon.name = "AnchorIcon"
__TS__ClassExtends(AnchorIcon, Visible)
function AnchorIcon.prototype.GetTexture(self)
    return ____exports.SHROUD
end
local BeaconIcon = __TS__Class()
BeaconIcon.name = "BeaconIcon"
__TS__ClassExtends(BeaconIcon, Visible)
function BeaconIcon.prototype.GetTexture(self)
    return ____exports.AURA
end
local Exposed = __TS__Class()
Exposed.name = "Exposed"
__TS__ClassExtends(Exposed, BeaconIcon)
function Exposed.prototype.IsDebuff(self)
    return true
end
function Exposed.prototype.IgnoreTenacity(self)
    return true
end
function Exposed.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_HEAL_AMPLIFY_PERCENTAGE_TARGET, MODIFIER_PROPERTY_HP_REGEN_AMPLIFY_PERCENTAGE, MODIFIER_PROPERTY_LIFESTEAL_AMPLIFY_PERCENTAGE, MODIFIER_PROPERTY_SPELL_LIFESTEAL_AMPLIFY_PERCENTAGE}
end
function Exposed.prototype.reduction(self)
    return -self:GetStackCount()
end
function Exposed.prototype.GetModifierHealAmplify_PercentageTarget(self)
    return self:reduction()
end
function Exposed.prototype.GetModifierHPRegenAmplify_Percentage(self)
    return self:reduction()
end
function Exposed.prototype.GetModifierLifestealRegenAmplify_Percentage(self)
    return self:reduction()
end
function Exposed.prototype.GetModifierSpellLifestealRegenAmplify_Percentage(self)
    return self:reduction()
end
local Plague = __TS__Class()
Plague.name = "Plague"
__TS__ClassExtends(Plague, Exposed)
function Plague.prototype.GetEffectName(self)
    return PLAGUE_FX
end
function Plague.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
local VerdictIcon = __TS__Class()
VerdictIcon.name = "VerdictIcon"
__TS__ClassExtends(VerdictIcon, Visible)
function VerdictIcon.prototype.GetTexture(self)
    return ____exports.SCYTHE
end
local Sentence = __TS__Class()
Sentence.name = "Sentence"
__TS__ClassExtends(Sentence, VerdictIcon)
function Sentence.prototype.IsDebuff(self)
    return true
end
function Sentence.prototype.IgnoreTenacity(self)
    return true
end
function Sentence.prototype.GetEffectName(self)
    return MARK_FX
end
function Sentence.prototype.GetEffectAttachType(self)
    return PATTACH_OVERHEAD_FOLLOW
end
____exports.NecroLegends = __TS__Class()
local NecroLegends = ____exports.NecroLegends
NecroLegends.name = "NecroLegends"
__TS__ClassExtends(NecroLegends, ModBase)
function NecroLegends.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.qCastUntil = 0
    self.qNext = 0
    self.scytheUntil = 0
    self.swapped = __TS__New(Set)
end
function NecroLegends.prototype.IsHidden(self)
    return true
end
function NecroLegends.prototype.IsPurgable(self)
    return false
end
function NecroLegends.prototype.RemoveOnDeath(self)
    return false
end
function NecroLegends.prototype.OnCreated(self)
    if IsServer() then
        self:StartIntervalThink(STEP)
    end
end
function NecroLegends.prototype.DeclareFunctions(self)
    return {MODIFIER_EVENT_ON_ABILITY_FULLY_CAST, MODIFIER_EVENT_ON_TAKEDAMAGE, MODIFIER_EVENT_ON_DEATH}
end
function NecroLegends.prototype.bonuses(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        IsServer(),
        now()
    )
end
function NecroLegends.prototype.owns(self, id)
    return (self:bonuses().code[id] or 0) > 0
end
function NecroLegends.prototype.IsAwake(self)
    return self:bonuses().awake
end
function NecroLegends.prototype.swap(self, stock, extra, show, keepPassive)
    if keepPassive == nil then
        keepPassive = false
    end
    if self.swapped:has(extra) == show then
        return
    end
    local caster = self:GetParent()
    local native = caster:FindAbilityByName(stock)
    if native == nil or native:GetLevel() < 1 then
        return
    end
    local alternate = caster:FindAbilityByName(extra) or (show and caster:AddAbility(extra) or nil)
    if alternate == nil then
        return
    end
    if show then
        alternate:SetLevel(keepPassive and native:GetLevel() or 1)
        caster:SwapAbilities(stock, extra, keepPassive, true)
        self.swapped:add(extra)
    else
        caster:SwapAbilities(extra, stock, false, true)
        self.swapped:delete(extra)
    end
    native:SetHidden(show)
    alternate:SetHidden(not show)
    native:MarkAbilityButtonDirty()
    alternate:MarkAbilityButtonDirty()
end
function NecroLegends.prototype.enemy(self, unit)
    return alive(unit) and unit:IsRealHero() and not unit:IsIllusion() and not unit:IsOutOfGame() and not unit:IsInvulnerable() and unit:GetTeamNumber() ~= self:GetParent():GetTeamNumber()
end
function NecroLegends.prototype.protected(self, unit)
    return unit:IsDebuffImmune() or unit:IsMagicImmune()
end
function NecroLegends.prototype.enemies(self, point, radius)
    local hero = self:GetParent()
    return __TS__ArrayFilter(
        FindUnitsInRadius(
            hero:GetTeamNumber(),
            point,
            nil,
            radius,
            2,
            1,
            16,
            1,
            false
        ),
        function(____, unit) return self:enemy(unit) end
    )
end
function NecroLegends.prototype.OnAbilityFullyCast(self, event)
    local hero = self:GetParent()
    local ability = event.ability
    if not IsServer() or event.unit ~= hero or not alive(hero) or ability == nil then
        return
    end
    local name = ability:GetAbilityName()
    if name == ____exports.PULSE and self:owns("necro_l_garden") and now() >= self.qNext and self.pulse == nil then
        self.qCastUntil = now() + 2.5
    elseif name == ____exports.SHROUD and self:owns("necro_l_breathcycle") then
        self:createAnchor(ability)
    elseif name == ____exports.SCYTHE and self:owns("necro_l_testament") then
        self:clearVerdict()
        local target = ability:GetCursorTarget()
        self.scytheTarget = self:enemy(target) and target or nil
        self.scytheUntil = now() + 2.5
    end
end
function NecroLegends.prototype.OnTakeDamage(self, event)
    local hero = self:GetParent()
    if not IsServer() or not alive(hero) or event.attacker ~= hero or not self:enemy(event.unit) or event.inflictor == nil or event.damage <= 0 then
        return
    end
    local name = event.inflictor:GetAbilityName()
    if name == ____exports.PULSE and self.qCastUntil > now() and self.pulse == nil and not self:protected(event.unit) then
        self.qCastUntil = 0
        local icon = hero:AddNewModifier(hero, event.inflictor, Q_READY, {duration = 2})
        if icon ~= nil then
            icon:SetStackCount(1)
        end
        self.pulse = {
            ability = event.inflictor,
            ends = now() + 2,
            icon = icon
        }
        self:swap(____exports.PULSE, Q, true)
    elseif name == ____exports.SCYTHE and self.scytheUntil > now() and (self.scytheTarget == nil or self.scytheTarget == event.unit) then
        self.scytheUntil = 0
        if not self:protected(event.unit) then
            self:markVerdict(event.unit, event.inflictor)
        end
    end
end
function NecroLegends.prototype.BeginPulse(self)
    if self.pulse == nil or self.pulse.ends <= now() or self.qWind ~= nil then
        return false
    end
    local hero = self:GetParent()
    local time = self:IsAwake() and 0.4 or 0.6
    self.qWind = {
        ring = ring(
            hero:GetAbsOrigin(),
            PULSE_RADIUS,
            Vector(125, 255, 124)
        ),
        icon = hero:AddNewModifier(hero, self.pulse.ability, Q_WIND, {duration = time})
    }
    EmitSoundOn("Hero_Necrolyte.DeathPulse", hero)
    return true
end
function NecroLegends.prototype.InterruptPulse(self)
    local ____clearParticle_4 = clearParticle
    local ____opt_2 = self.qWind
    ____clearParticle_4(____opt_2 and ____opt_2.ring)
    local ____clear_7 = clear
    local ____opt_5 = self.qWind
    ____clear_7(____opt_5 and ____opt_5.icon)
    self.qWind = nil
end
function NecroLegends.prototype.clearPulse(self)
    self:InterruptPulse()
    local ____clear_10 = clear
    local ____opt_8 = self.pulse
    ____clear_10(____opt_8 and ____opt_8.icon)
    self.pulse = nil
    self:swap(____exports.PULSE, Q, false)
end
function NecroLegends.prototype.FinishPulse(self, ability)
    local pulse = self.pulse
    local woundUp = self.qWind ~= nil
    self:clearPulse()
    local hero = self:GetParent()
    if not woundUp or pulse == nil or not alive(hero) then
        return
    end
    self.qNext = now() + 8
    flash(
        PULSE_FX,
        hero:GetAbsOrigin()
    )
    local target = self:enemies(
        hero:GetAbsOrigin(),
        PULSE_RADIUS
    )[1]
    if target == nil or self:protected(target) then
        return
    end
    flash(
        IMPACT,
        target:GetAbsOrigin()
    )
    local special = pulse.ability:GetSpecialValueFor("AbilityDamage")
    local base = special > 0 and special or pulse.ability:GetAbilityDamage()
    local dealt = ApplyDamage({
        victim = target,
        attacker = hero,
        ability = ability,
        damage = base * 1.6,
        damage_type = DAMAGE_TYPE_MAGICAL
    })
    if dealt > 0 and alive(hero) then
        hero:Heal(dealt * 0.35, ability)
    end
end
function NecroLegends.prototype.shroud(self, ability)
    local hero = self:GetParent()
    return __TS__ArrayFind(
        hero:FindAllModifiers(),
        function(____, mod) return mod:GetRemainingTime() > 0 and not mod:IsDebuff() and (mod:GetAbility() == ability and __TS__StringStartsWith(
            mod:GetName(),
            "modifier_necrolyte_"
        ) or mod:GetName() == "modifier_necrolyte_ghost_shroud_active" or mod:GetName() == "modifier_necrolyte_sadist_active") end
    )
end
function NecroLegends.prototype.createAnchor(self, ability)
    self:clearAnchor()
    local hero = self:GetParent()
    local pos = GetGroundPosition(
        hero:GetAbsOrigin(),
        hero
    )
    local model = SpawnEntityFromTableSynchronous("prop_dynamic", {
        model = HERO_MODEL,
        solid = 0,
        disableshadows = 1,
        modelscale = 0.79,
        rendermode = 1,
        renderamt = 138,
        rendercolor = "108 243 167"
    })
    if model ~= nil then
        model:SetAbsOrigin(pos)
        model:SetForwardVector(hero:GetForwardVector())
    end
    local ____opt_11 = self:shroud(ability)
    local duration = ____opt_11 and ____opt_11:GetRemainingTime() or ability:GetSpecialValueFor("duration")
    local icon = hero:AddNewModifier(hero, ability, W_ANCHOR, {duration = duration})
    if icon ~= nil then
        icon:SetStackCount(1)
    end
    self.anchor = {
        ability = ability,
        pos = pos,
        health = hero:GetHealth(),
        model = model,
        icon = icon,
        ring = ring(
            pos,
            105,
            Vector(109, 243, 190)
        ),
        mist = worldParticle(GHOST_FX, pos)
    }
    self:swap(____exports.SHROUD, W, true)
end
function NecroLegends.prototype.clearAnchor(self)
    local anchor = self.anchor
    if anchor == nil then
        return
    end
    self.anchor = nil
    clear(anchor.icon)
    clearParticle(anchor.ring)
    clearParticle(anchor.mist)
    if anchor.model ~= nil and IsValidEntity(anchor.model) then
        UTIL_Remove(anchor.model)
    end
    self:swap(____exports.SHROUD, W, false)
end
function NecroLegends.prototype.CanReturn(self)
    local hero = self:GetParent()
    local anchor = self.anchor
    return anchor ~= nil and alive(hero) and not hero:IsRooted() and not hero:IsCurrentlyHorizontalMotionControlled() and not hero:HasModifier("modifier_slark_pounce_leash") and not hero:HasModifier("modifier_puck_dream_coil") and distance(
        hero:GetAbsOrigin(),
        anchor.pos
    ) <= (self:IsAwake() and 1100 or 750) and self:shroud(anchor.ability) ~= nil and GridNav:IsTraversable(anchor.pos) and not GridNav:IsBlocked(anchor.pos)
end
function NecroLegends.prototype.ReturnToAnchor(self, ability)
    local anchor = self.anchor
    if anchor == nil or not self:CanReturn() then
        return
    end
    local hero = self:GetParent()
    local heal = math.min(
        math.max(
            0,
            anchor.health - hero:GetHealth()
        ),
        hero:GetMaxHealth() * (self:IsAwake() and 0.45 or 0.35)
    )
    flash(
        PULSE_FX,
        hero:GetAbsOrigin()
    )
    self:clearAnchor()
    clear(self:shroud(anchor.ability))
    FindClearSpaceForUnit(hero, anchor.pos, true)
    flash(
        PULSE_FX,
        hero:GetAbsOrigin()
    )
    EmitSoundOn("Hero_Necrolyte.DeathPulse", hero)
    if heal > 0 then
        hero:Heal(heal, ability)
    end
end
function NecroLegends.prototype.CanPlace(self, point, shift)
    local hero = self:GetParent()
    local beacon = self.beacon
    if not alive(hero) or hero:PassivesDisabled() or math.abs(point.x) > MAP.bounds - 40 or math.abs(point.y) > MAP.bounds - 40 or not GridNav:IsTraversable(point) or GridNav:IsBlocked(point) then
        return false
    end
    if shift then
        return beacon ~= nil and not beacon.moved and self:IsAwake() and distance(beacon.pos, point) <= BEACON_SHIFT and distance(
            hero:GetAbsOrigin(),
            point
        ) <= BEACON_RANGE + BEACON_SHIFT
    end
    return beacon == nil and distance(
        hero:GetAbsOrigin(),
        point
    ) <= BEACON_RANGE
end
function NecroLegends.prototype.PlaceBeacon(self, point)
    if not self:CanPlace(point, false) then
        return
    end
    local hero = self:GetParent()
    local ability = hero:FindAbilityByName(____exports.AURA)
    if ability == nil or ability:GetLevel() < 1 then
        return
    end
    local pos = GetGroundPosition(point, hero)
    local radius = math.max(
        500,
        500 + ability:GetSpecialValueFor("aura_radius") - 700
    )
    local placed = now()
    self.beacon = {
        ability = ability,
        pos = pos,
        radius = radius,
        ends = placed + 6,
        lastTick = placed,
        moved = false,
        victims = __TS__New(Map),
        ring = ring(
            pos,
            radius,
            Vector(100, 219, 97)
        ),
        mist = worldParticle(GHOST_FX, pos),
        icon = hero:AddNewModifier(hero, ability, ____exports.E_ACTIVE, {duration = 6})
    }
    local ____opt_15 = self.beacon.icon
    if ____opt_15 ~= nil then
        ____opt_15:SetStackCount(radius)
    end
    self:refreshAura(ability)
    EmitSoundOn("Hero_Necrolyte.DeathPulse", hero)
    if self:IsAwake() then
        self:swap(E, SHIFT, true)
    end
end
function NecroLegends.prototype.ShiftBeacon(self, point)
    local beacon = self.beacon
    if beacon == nil or not self:CanPlace(point, true) then
        return
    end
    beacon.moved = true
    beacon.pos = GetGroundPosition(
        point,
        self:GetParent()
    )
    ParticleManager:SetParticleControl(beacon.ring, 0, beacon.pos)
    ParticleManager:SetParticleControl(beacon.mist, 0, beacon.pos)
    flash(PULSE_FX, beacon.pos)
    self:swap(E, SHIFT, false)
    self:updateBeacon(now())
end
function NecroLegends.prototype.clearBeacon(self)
    local beacon = self.beacon
    if beacon == nil then
        return
    end
    self.beacon = nil
    clear(beacon.icon)
    clearParticle(beacon.ring)
    clearParticle(beacon.mist)
    for ____, ____value in __TS__Iterator(beacon.victims) do
        local v = ____value[2]
        clear(v.icon)
    end
    self:swap(E, SHIFT, false)
    self:refreshAura(beacon.ability)
end
function NecroLegends.prototype.refreshAura(self, ability)
    local intrinsic = ability:GetIntrinsicModifierName()
    if intrinsic ~= "" then
        local ____opt_17 = self:GetParent():FindModifierByName(intrinsic)
        if ____opt_17 ~= nil then
            ____opt_17:ForceRefresh()
        end
    end
    ability:MarkAbilityButtonDirty()
end
function NecroLegends.prototype.updateBeacon(self, time)
    local beacon = self.beacon
    if beacon == nil then
        return
    end
    local hero = self:GetParent()
    local ability = beacon.ability
    if time >= beacon.ends or hero:PassivesDisabled() then
        self:clearBeacon()
        return
    end
    local targets = __TS__New(
        Set,
        self:enemies(beacon.pos, beacon.radius)
    )
    for ____, ____value in __TS__Iterator(beacon.victims) do
        local target = ____value[1]
        local exposure = ____value[2]
        if not targets:has(target) or self:protected(target) then
            clear(exposure.icon)
            beacon.victims:delete(target)
        end
    end
    local tick = time - beacon.lastTick
    local damageTick = tick >= 0.249
    if damageTick then
        beacon.lastTick = time
    end
    local baseReduction = math.max(
        0,
        ability:GetSpecialValueFor("heal_reduction_pct")
    )
    local baseDamage = ability:GetSpecialValueFor("aura_damage") / 100
    local regenDamage = hero:HasScepter() and hero:GetHealthRegen() * ability:GetSpecialValueFor("heal_regen_to_damage") / 100 or 0
    for ____, target in __TS__Iterator(targets) do
        do
            local exposure = beacon.victims:get(target)
            if not self:protected(target) then
                if exposure == nil then
                    exposure = {
                        since = time,
                        active = false,
                        icon = target:AddNewModifier(hero, ability, E_BUILD, {duration = -1})
                    }
                    local ____opt_19 = exposure.icon
                    if ____opt_19 ~= nil then
                        ____opt_19:SetDuration(1.25, true)
                    end
                    local ____opt_21 = exposure.icon
                    if ____opt_21 ~= nil then
                        ____opt_21:SetStackCount(baseReduction)
                    end
                    beacon.victims:set(target, exposure)
                end
                if not exposure.active and time - exposure.since + 0.001 >= 1.25 then
                    clear(exposure.icon)
                    exposure.icon = target:AddNewModifier(hero, ability, E_PLAGUE, {})
                    local ____opt_23 = exposure.icon
                    if ____opt_23 ~= nil then
                        ____opt_23:SetStackCount(math.max(60, baseReduction))
                    end
                    exposure.active = true
                end
            end
            if damageTick then
                local extra = exposure and exposure.active and 0.03 or 0
                local amount = ((baseDamage + extra) * target:GetMaxHealth() + regenDamage) * tick
                if amount <= 0 then
                    goto __continue102
                end
                ApplyDamage({
                    victim = target,
                    attacker = hero,
                    ability = ability,
                    damage = amount,
                    damage_type = DAMAGE_TYPE_MAGICAL,
                    damage_flags = bit.bor(DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION, DOTA_DAMAGE_FLAG_NO_SPELL_LIFESTEAL)
                })
            end
        end
        ::__continue102::
    end
end
function NecroLegends.prototype.markVerdict(self, target, ability)
    local hero = self:GetParent()
    local awake = self:IsAwake()
    local duration = awake and 4 or 3
    local threshold = awake and 30 or 25
    local targetIcon = target:AddNewModifier(hero, ability, R_MARK, {duration = duration})
    local ownerIcon = hero:AddNewModifier(hero, ability, R_READY, {duration = duration})
    if targetIcon ~= nil then
        targetIcon:SetStackCount(threshold)
    end
    if ownerIcon ~= nil then
        ownerIcon:SetStackCount(1)
    end
    self.verdict = {
        target = target,
        ends = now() + duration,
        threshold = threshold,
        targetIcon = targetIcon,
        ownerIcon = ownerIcon
    }
    self:swap(____exports.SCYTHE, R, true)
    self:refreshVerdict()
end
function NecroLegends.prototype.clearVerdict(self)
    if self.verdict == nil then
        return
    end
    clear(self.verdict.targetIcon)
    clear(self.verdict.ownerIcon)
    self.verdict = nil
    self:swap(____exports.SCYTHE, R, false)
end
function NecroLegends.prototype.CanVerdict(self)
    local verdict = self.verdict
    return verdict ~= nil and verdict.ends > now() and self:enemy(verdict.target) and not self:protected(verdict.target) and verdict.target:GetHealth() * 100 <= verdict.threshold * verdict.target:GetMaxHealth() and distance(
        self:GetParent():GetAbsOrigin(),
        verdict.target:GetAbsOrigin()
    ) <= VERDICT_RANGE
end
function NecroLegends.prototype.refreshVerdict(self)
    local ability = self:GetParent():FindAbilityByName(R)
    if ability == nil then
        return
    end
    local ready = self:CanVerdict()
    if ability:IsActivated() ~= ready then
        ability:SetActivated(ready)
        ability:MarkAbilityButtonDirty()
    end
end
function NecroLegends.prototype.FinishVerdict(self, ability)
    local verdict = self.verdict
    if verdict == nil then
        return
    end
    local valid = self:CanVerdict()
    self:clearVerdict()
    if not valid then
        return
    end
    local target = verdict.target
    flash(
        SCYTHE_FX,
        target:GetAbsOrigin()
    )
    EmitSoundOn("Hero_Necrolyte.ReapersScythe.Target", target)
    ApplyDamage({
        victim = target,
        attacker = self:GetParent(),
        ability = ability,
        damage_type = DAMAGE_TYPE_MAGICAL,
        damage = math.min(
            1050,
            target:GetMaxHealth() * 0.35
        ),
        damage_flags = DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION
    })
end
function NecroLegends.prototype.OnIntervalThink(self)
    local hero = self:GetParent()
    if not alive(hero) then
        self:reset()
        return
    end
    if self:owns("necro_l_lastcircle") then
        self:swap(____exports.AURA, E, true, true)
    end
    local time = now()
    if self.pulse ~= nil and self.qWind == nil and self.pulse.ends <= time then
        self:clearPulse()
    end
    if self.anchor ~= nil then
        if self:shroud(self.anchor.ability) == nil then
            self:clearAnchor()
        else
            local ability = hero:FindAbilityByName(W)
            local ready = self:CanReturn()
            if ability ~= nil and ability:IsActivated() ~= ready then
                ability:SetActivated(ready)
            end
        end
    end
    self:updateBeacon(time)
    if self.verdict ~= nil then
        if self.verdict.ends <= time or not self:enemy(self.verdict.target) then
            self:clearVerdict()
        else
            self:refreshVerdict()
        end
    end
end
function NecroLegends.prototype.OnDeath(self, event)
    if event.unit == self:GetParent() then
        self:reset()
    else
        local ____event_unit_33 = event.unit
        local ____opt_31 = self.verdict
        if ____event_unit_33 == (____opt_31 and ____opt_31.target) then
            self:clearVerdict()
        end
    end
end
function NecroLegends.prototype.reset(self)
    self.qCastUntil = 0
    self.scytheUntil = 0
    self.scytheTarget = nil
    self:clearPulse()
    self:clearAnchor()
    self:clearBeacon()
    self:clearVerdict()
end
function NecroLegends.prototype.OnDestroy(self)
    if not IsServer() then
        return
    end
    self:reset()
    self:swap(____exports.AURA, E, false)
end
modifier_orb_necro_legend = registerModifier("modifier_orb_necro_legend", ____exports.NecroLegends)
modifier_orb_necro_pulse_ready = registerModifier("modifier_orb_necro_pulse_ready", PulseReady)
modifier_orb_necro_pulse_windup = registerModifier("modifier_orb_necro_pulse_windup", PulseWindup)
modifier_orb_necro_anchor = registerModifier("modifier_orb_necro_anchor", AnchorIcon)
modifier_orb_necro_beacon = registerModifier("modifier_orb_necro_beacon", BeaconIcon)
modifier_orb_necro_exposed = registerModifier("modifier_orb_necro_exposed", Exposed)
modifier_orb_necro_plague = registerModifier("modifier_orb_necro_plague", Plague)
modifier_orb_necro_sentence = registerModifier("modifier_orb_necro_sentence", Sentence)
modifier_orb_necro_verdict = registerModifier("modifier_orb_necro_verdict", VerdictIcon)
return ____exports
