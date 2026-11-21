local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local Set = ____lualib.Set
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local __TS__ArrayEntries = ____lualib.__TS__ArrayEntries
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____modifier_orb_battle_shield = require("modifiers.modifier_orb_battle_shield")
local ModifierOrbBattleShield = ____modifier_orb_battle_shield.ModifierOrbBattleShield
local WARD = "juggernaut_healing_ward"
local WARD_UNIT = "npc_dota_juggernaut_healing_ward"
local DANCE = "juggernaut_blade_dance"
local OMNI = "juggernaut_omni_slash"
local OMNI_STATE = "modifier_juggernaut_omnislash"
local CUTS = "orb_jugg_three_cuts"
local ENCORE = "orb_jugg_encore"
local CHARGE = "modifier_orb_jugg_ward_charge"
local FUSE = "modifier_orb_jugg_ward_fuse"
local R_DELAY = "modifier_orb_jugg_encore_pause"
local BIND = "modifier_orb_jugg_ward_bind"
local CUT_STATE = "modifier_orb_jugg_cuts"
local R_READY = "modifier_orb_jugg_encore_ready"
local R_SLASH = "modifier_orb_jugg_encore_slash"
local WOUND = "modifier_orb_jugg_open_wound"
local INTERMISSION = "modifier_orb_jugg_intermission"
local W_RADIUS = 475
local W_FUSE = 0.65
local W_CLOSE = 0.38
local R_PAUSE = 0.9
local R_RANGE = 450
local W_RING = "particles/ui_mouseactions/range_display.vpcf"
local W_FIRE = "particles/units/heroes/hero_juggernaut/juggernaut_healingward_flame.vpcf"
local W_BURST = "particles/units/heroes/hero_juggernaut/juggernaut_healing_ward_eruption.vpcf"
local W_BLADE = "particles/units/heroes/hero_juggernaut/juggernaut_omni_dash.vpcf"
local HIT = "particles/units/heroes/hero_juggernaut/juggernaut_omni_slash_tgt.vpcf"
local GLOW = "particles/units/heroes/hero_juggernaut/juggernaut_omnislash_light.vpcf"
local function time()
    return GameRules:GetGameTime()
end
local function live(u)
    return u ~= nil and IsValidEntity(u) and u:IsAlive()
end
local function clearParticle(p)
    if p == nil then
        return
    end
    ParticleManager:DestroyParticle(p, true)
    ParticleManager:ReleaseParticleIndex(p)
end
local function burst(path, point)
    local id = ParticleManager:CreateParticle(path, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, point)
    ParticleManager:ReleaseParticleIndex(id)
end
local function attached(path, target)
    local id = ParticleManager:CreateParticle(path, PATTACH_ABSORIGIN_FOLLOW, target)
    ParticleManager:ReleaseParticleIndex(id)
end
local function distance(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2)
end
local function dashFlash(from, to)
    local id = ParticleManager:CreateParticle(W_BLADE, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(
        id,
        0,
        Vector(from.x, from.y, from.z + 57)
    )
    ParticleManager:SetParticleControl(
        id,
        1,
        Vector(to.x, to.y, to.z + 57)
    )
    ParticleManager:ReleaseParticleIndex(id)
end
local function clearMod(mod)
    if mod ~= nil and not mod:IsNull() then
        mod:Destroy()
    end
end
local GuardCut = __TS__Class()
GuardCut.name = "GuardCut"
__TS__ClassExtends(GuardCut, ModBase)
function GuardCut.prototype.IsHidden(self)
    return false
end
function GuardCut.prototype.IsDebuff(self)
    return true
end
function GuardCut.prototype.IsPurgable(self)
    return true
end
function GuardCut.prototype.GetTexture(self)
    return WARD
end
function GuardCut.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE}
end
function GuardCut.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return -25
end
local OpenWound = __TS__Class()
OpenWound.name = "OpenWound"
__TS__ClassExtends(OpenWound, ModBase)
function OpenWound.prototype.IsHidden(self)
    return false
end
function OpenWound.prototype.IsDebuff(self)
    return true
end
function OpenWound.prototype.IsPurgable(self)
    return true
end
function OpenWound.prototype.GetTexture(self)
    return OMNI
end
local Intermission = __TS__Class()
Intermission.name = "Intermission"
__TS__ClassExtends(Intermission, ModifierOrbBattleShield)
function Intermission.prototype.GetTexture(self)
    return "juggernaut_swift_slash"
end
local WardIcon = __TS__Class()
WardIcon.name = "WardIcon"
__TS__ClassExtends(WardIcon, ModBase)
function WardIcon.prototype.IsHidden(self)
    return false
end
function WardIcon.prototype.IsPurgable(self)
    return false
end
function WardIcon.prototype.GetTexture(self)
    return WARD
end
local WardFuse = __TS__Class()
WardFuse.name = "WardFuse"
__TS__ClassExtends(WardFuse, WardIcon)
function WardFuse.prototype.GetTexture(self)
    return "juggernaut_blade_fury"
end
local WardBind = __TS__Class()
WardBind.name = "WardBind"
__TS__ClassExtends(WardBind, ModBase)
function WardBind.prototype.IsHidden(self)
    return false
end
function WardBind.prototype.IsDebuff(self)
    return true
end
function WardBind.prototype.IsPurgable(self)
    return true
end
function WardBind.prototype.GetTexture(self)
    return WARD
end
function WardBind.prototype.CheckState(self)
    return {[MODIFIER_STATE_ROOTED] = true}
end
local CutIcon = __TS__Class()
CutIcon.name = "CutIcon"
__TS__ClassExtends(CutIcon, ModBase)
function CutIcon.prototype.IsHidden(self)
    return false
end
function CutIcon.prototype.IsPurgable(self)
    return false
end
function CutIcon.prototype.GetTexture(self)
    return "juggernaut_blade_dance_arcana"
end
local EncoreIcon = __TS__Class()
EncoreIcon.name = "EncoreIcon"
__TS__ClassExtends(EncoreIcon, ModBase)
function EncoreIcon.prototype.IsHidden(self)
    return false
end
function EncoreIcon.prototype.IsPurgable(self)
    return false
end
function EncoreIcon.prototype.GetTexture(self)
    return OMNI
end
local EncoreReady = __TS__Class()
EncoreReady.name = "EncoreReady"
__TS__ClassExtends(EncoreReady, EncoreIcon)
function EncoreReady.prototype.GetTexture(self)
    return "juggernaut_swift_slash"
end
local EncoreSlash = __TS__Class()
EncoreSlash.name = "EncoreSlash"
__TS__ClassExtends(EncoreSlash, EncoreIcon)
function EncoreSlash.prototype.CheckState(self)
    return {[MODIFIER_STATE_COMMAND_RESTRICTED] = true, [MODIFIER_STATE_INVULNERABLE] = true, [MODIFIER_STATE_NO_UNIT_COLLISION] = true, [MODIFIER_STATE_NO_HEALTH_BAR] = true}
end
function EncoreSlash.prototype.GetEffectName(self)
    return GLOW
end
function EncoreSlash.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
____exports.JuggernautLegends = __TS__Class()
local JuggernautLegends = ____exports.JuggernautLegends
JuggernautLegends.name = "JuggernautLegends"
__TS__ClassExtends(JuggernautLegends, ModBase)
function JuggernautLegends.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.trackingOmni = false
    self.pendingOmniUntil = 0
    self.omniWounds = __TS__New(Map)
    self.rhythmReadyAt = 0
    self.cutsShown = false
    self.encoreShown = false
end
function JuggernautLegends.prototype.bonuses(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        time()
    )
end
function JuggernautLegends.prototype.owns(self, id)
    return (self:bonuses().code[id] or 0) > 0
end
function JuggernautLegends.prototype.IsHidden(self)
    return true
end
function JuggernautLegends.prototype.IsPurgable(self)
    return false
end
function JuggernautLegends.prototype.RemoveOnDeath(self)
    return false
end
function JuggernautLegends.prototype.OnCreated(self)
    if IsServer() then
        self:StartIntervalThink(0.05)
    end
end
function JuggernautLegends.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_EVENT_ON_ATTACK_FAIL,
        MODIFIER_PROPERTY_PREATTACK_CRITICALSTRIKE,
        MODIFIER_EVENT_ON_DEATH
    }
end
function JuggernautLegends.prototype.enemy(self, target)
    return live(target) and target:IsRealHero() and not target:IsIllusion() and not target:IsOutOfGame() and not target:IsInvulnerable() and target:GetTeamNumber() ~= self:GetParent():GetTeamNumber()
end
function JuggernautLegends.prototype.flip(self, original, name, show)
    local hero = self:GetParent()
    local base = hero:FindAbilityByName(original)
    if base == nil then
        return false
    end
    local alt = hero:FindAbilityByName(name) or (show and hero:AddAbility(name) or nil)
    if alt == nil then
        return false
    end
    if show then
        alt:SetLevel(name == CUTS and base:GetLevel() or 1)
        hero:SwapAbilities(original, name, name == CUTS, true)
        base:SetHidden(true)
        alt:SetHidden(false)
    else
        hero:SwapAbilities(name, original, false, true)
        alt:SetHidden(true)
        base:SetHidden(false)
    end
    base:MarkAbilityButtonDirty()
    alt:MarkAbilityButtonDirty()
    return show
end
function JuggernautLegends.prototype.clearWard(self)
    local s = self.ward
    self.ward = nil
    if s == nil then
        return
    end
    clearParticle(s.ring)
    clearParticle(s.fire)
    for ____, blade in ipairs(s.sweep or ({})) do
        clearParticle(blade)
    end
    clearMod(s.icon)
    clearMod(s.ownerIcon)
end
function JuggernautLegends.prototype.clearCuts(self)
    local ____clearMod_2 = clearMod
    local ____opt_0 = self.cuts
    ____clearMod_2(____opt_0 and ____opt_0.icon)
    self.cuts = nil
end
function JuggernautLegends.prototype.clearEncore(self)
    local ____clearMod_5 = clearMod
    local ____opt_3 = self.encore
    ____clearMod_5(____opt_3 and ____opt_3.icon)
    self.encore = nil
    if self.encoreShown then
        self.encoreShown = self:flip(OMNI, ENCORE, false)
    end
end
function JuggernautLegends.prototype.clearSlashes(self)
    local previous = self.slashing
    self.slashing = nil
    clearMod(previous and previous.mod)
end
function JuggernautLegends.prototype.clearCombat(self)
    self:clearWard()
    self:clearCuts()
    self:clearEncore()
    self:clearSlashes()
    self.trackingOmni = false
    self.pendingOmniUntil = 0
    self:clearWounds()
    self.rhythm = nil
end
function JuggernautLegends.prototype.OnDestroy(self)
    if not IsServer() then
        return
    end
    self:clearCombat()
    if self.cutsShown then
        self.cutsShown = self:flip(DANCE, CUTS, false)
    end
end
function JuggernautLegends.prototype.OnDeath(self, e)
    if IsServer() and e.unit == self:GetParent() then
        self:clearCombat()
    end
end
function JuggernautLegends.prototype.OnAbilityFullyCast(self, e)
    local hero = self:GetParent()
    if not IsServer() or e.unit ~= hero or e.ability == nil then
        return
    end
    local a = e.ability
    if a:GetAbilityName() == WARD and self:owns("jugg_l_sanctuary") then
        self:clearWard()
        self.ward = {
            ability = a,
            findUntil = time() + 0.85,
            point = a:GetCursorPosition(),
            after = self.lastWard,
            hit = __TS__New(Set),
            stacks = 0,
            leaveWard = self:bonuses().awake
        }
    end
    if a:GetAbilityName() == OMNI and (self:owns("jugg_l_endless") or self:owns("jugg_p_bloody_omni") or self:owns("jugg_p_dispel")) then
        self:clearWounds()
        self:clearEncore()
        self.trackingOmni = hero:HasModifier(OMNI_STATE)
        self.pendingOmniUntil = self.trackingOmni and 0 or time() + 0.28
    end
end
function JuggernautLegends.prototype.StartCuts(self, ability)
    if not self:owns("jugg_l_cuts") then
        return
    end
    self:clearCuts()
    local hero = self:GetParent()
    local icon = hero:AddNewModifier(hero, ability, CUT_STATE, {duration = 5})
    if icon ~= nil then
        icon:SetStackCount(1)
    end
    self.cuts = {
        ["until"] = time() + 5,
        hits = 0,
        icon = icon,
        critical = self:bonuses().awake and 350 or 300
    }
    attached(HIT, hero)
end
function JuggernautLegends.prototype.CanEncore(self)
    local w = self.encore
    return w ~= nil and time() >= w.opens and time() < w.closes and self:owns("jugg_l_endless")
end
function JuggernautLegends.prototype.StartEncore(self, ability, victim)
    if not self:CanEncore() then
        return
    end
    self:clearEncore()
    if not self:enemy(victim) or victim:TriggerSpellAbsorb(ability) or victim:IsAttackImmune() then
        return
    end
    local hero = self:GetParent()
    local mod = hero:AddNewModifier(hero, ability, R_SLASH, {duration = 1.25})
    if mod == nil then
        return
    end
    self.slashing = {
        victim = victim,
        hits = 0,
        next = time(),
        mod = mod
    }
    self:tickEncoreSlashes(
        time(),
        R_RANGE + 65
    )
end
function JuggernautLegends.prototype.ordinary(self, e)
    local hero = self:GetParent()
    return e.attacker == hero and not e.no_attack_cooldown and live(hero) and self.slashing == nil and not hero:HasModifier(OMNI_STATE) and not hero:HasModifier("modifier_juggernaut_swift_slash") and not hero:HasModifier("modifier_juggernaut_blade_fury") and not hero:HasModifier("modifier_juggernaut_trinity") and not hero:HasModifier("modifier_juggernaut_vaulted_strike")
end
function JuggernautLegends.prototype.GetModifierPreAttack_CriticalStrike(self, e)
    local s = self.cuts
    if not IsServer() or s == nil or s.hits ~= 2 or e.target ~= s.target or time() >= s["until"] or not self:ordinary(e) or not self:enemy(e.target) then
        return 0
    end
    if s.record ~= nil and s.record ~= e.record then
        return 0
    end
    s.record = e.record
    local wounded = self:owns("jugg_p_finisher") and e.target:GetHealthPercent() < 40
    return s.critical + (wounded and 35 or 0)
end
function JuggernautLegends.prototype.OnAttackFail(self, e)
    local ____IsServer_result_12 = IsServer()
    if ____IsServer_result_12 then
        local ____opt_10 = self.cuts
        ____IsServer_result_12 = (____opt_10 and ____opt_10.record) ~= nil
    end
    if ____IsServer_result_12 and self.cuts.record == e.record and e.attacker == self:GetParent() then
        self:clearCuts()
    end
end
function JuggernautLegends.prototype.clearWounds(self)
    for ____, w in __TS__Iterator(self.omniWounds:values()) do
        clearMod(w.icon)
    end
    self.omniWounds:clear()
end
function JuggernautLegends.prototype.wound(self, target, attack, nativeOmni)
    local hero = self:GetParent()
    local ability = hero:FindAbilityByName(OMNI)
    local id = target:entindex()
    local entry = self.omniWounds:get(id)
    if nativeOmni then
        if entry == nil then
            entry = {hits = 0, victim = target}
            self.omniWounds:set(id, entry)
        end
        entry.hits = entry.hits + 1
        if entry.hits == 2 and not target:IsDebuffImmune() then
            entry.icon = target:AddNewModifier(hero, ability, WOUND, {duration = 5})
        end
        return
    end
    if not attack or (entry and entry.icon) == nil or entry.icon:IsNull() or target:IsAttackImmune() then
        return
    end
    clearMod(entry.icon)
    entry.icon = nil
    attached(HIT, target)
    ApplyDamage({
        victim = target,
        attacker = hero,
        ability = ability,
        damage_type = DAMAGE_TYPE_PHYSICAL,
        damage_flags = bit.bor(DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION, DOTA_DAMAGE_FLAG_NO_SPELL_LIFESTEAL),
        damage = math.min(
            400,
            140 + 0.08 * (target:GetMaxHealth() - target:GetHealth())
        )
    })
end
function JuggernautLegends.prototype.countRhythm(self, target)
    local now = time()
    local hero = self:GetParent()
    if now < self.rhythmReadyAt then
        return
    end
    if self.rhythm == nil or self.rhythm.target ~= target or now >= self.rhythm["until"] then
        self.rhythm = {target = target, hits = 0, ["until"] = now + 5}
    end
    local ____self_rhythm_15, ____hits_16 = self.rhythm, "hits"
    local ____self_rhythm_hits_17 = ____self_rhythm_15[____hits_16] + 1
    ____self_rhythm_15[____hits_16] = ____self_rhythm_hits_17
    if ____self_rhythm_hits_17 < 3 then
        return
    end
    self.rhythm = nil
    self.rhythmReadyAt = now + 5
    for ____, name in ipairs({"juggernaut_blade_fury", OMNI}) do
        do
            local a = hero:FindAbilityByName(name)
            if a == nil or a:GetMaxAbilityCharges(math.max(
                0,
                a:GetLevel() - 1
            )) > 0 then
                goto __continue99
            end
            local left = a:GetCooldownTimeRemaining()
            if left <= 0 then
                goto __continue99
            end
            a:EndCooldown()
            if left > 1 then
                a:StartCooldown(left - 1)
            end
        end
        ::__continue99::
    end
end
function JuggernautLegends.prototype.OnAttackLanded(self, e)
    if not IsServer() or e.attacker ~= self:GetParent() then
        return
    end
    local ordinary = self:ordinary(e)
    if self:enemy(e.target) and e.damage > 0 and self:owns("jugg_p_bloody_omni") then
        self:wound(
            e.target,
            ordinary or self.slashing ~= nil,
            self:GetParent():HasModifier(OMNI_STATE)
        )
    end
    if not ordinary then
        return
    end
    if not self:enemy(e.target) or e.damage <= 0 then
        local ____opt_18 = self.cuts
        if (____opt_18 and ____opt_18.record) ~= nil and self.cuts.record == e.record then
            self:clearCuts()
        end
        return
    end
    self:chargeWard(e.target)
    if self:owns("jugg_p_death_dance") then
        self:countRhythm(e.target)
    end
    local s = self.cuts
    if s == nil or time() >= s["until"] then
        return
    end
    if s.target ~= nil and s.target ~= e.target then
        self:clearCuts()
        return
    end
    s.target = e.target
    s.hits = s.hits + 1
    if s.hits == 3 then
        attached(HIT, e.target)
        self:clearCuts()
        return
    end
    local ____opt_20 = s.icon
    if ____opt_20 ~= nil then
        ____opt_20:SetStackCount(s.hits + 1)
    end
    if s.hits == 2 then
        self:stepAcross(e.target)
    end
end
function JuggernautLegends.prototype.stepAcross(self, target)
    local hero = self:GetParent()
    if hero:IsRooted() or hero:IsCurrentlyHorizontalMotionControlled() or hero:HasModifier("modifier_slark_pounce_leash") or hero:HasModifier("modifier_puck_dream_coil") then
        return
    end
    local from = hero:GetAbsOrigin()
    local center = target:GetAbsOrigin()
    local dx = center.x - from.x
    local dy = center.y - from.y
    local span = distance(from, center)
    if span < 20 or span > 185 then
        return
    end
    local to = GetGroundPosition(
        Vector(center.x + dx / span * 105, center.y + dy / span * 105, center.z),
        hero
    )
    if math.abs(to.z - from.z) > 90 or math.abs(to.x) >= MAP.bounds or math.abs(to.y) >= MAP.bounds or not GridNav:CanFindPath(from, to) or not GridNav:IsTraversable(to) or GridNav:IsBlocked(to) then
        return
    end
    dashFlash(from, to)
    FindClearSpaceForUnit(hero, to, true)
end
function JuggernautLegends.prototype.chargeWard(self, target)
    local s = self.ward
    local hero = self:GetParent()
    if s == nil or not live(s.ward) or s.arm ~= nil then
        return
    end
    local pos = s.ward:GetAbsOrigin()
    if distance(
        hero:GetAbsOrigin(),
        pos
    ) > W_RADIUS or distance(
        target:GetAbsOrigin(),
        pos
    ) > W_RADIUS then
        return
    end
    s.stacks = s.target == target and s.stacks + 1 or 1
    s.target = target
    local ____opt_22 = s.icon
    if ____opt_22 ~= nil then
        ____opt_22:SetStackCount(s.stacks)
    end
    local ____opt_24 = s.ownerIcon
    if ____opt_24 ~= nil then
        ____opt_24:SetStackCount(s.stacks)
    end
    if s.stacks < 2 then
        dashFlash(
            target:GetAbsOrigin(),
            pos
        )
        return
    end
    s.center = pos
    s.arm = time() + W_FUSE
    clearMod(s.icon)
    clearMod(s.ownerIcon)
    s.icon = s.ward:AddNewModifier(hero, s.ability, FUSE, {duration = W_FUSE + W_CLOSE})
    s.ownerIcon = hero:AddNewModifier(hero, s.ability, FUSE, {duration = W_FUSE + W_CLOSE})
    s.ring = ParticleManager:CreateParticle(W_RING, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(s.ring, 0, pos)
    ParticleManager:SetParticleControl(
        s.ring,
        1,
        Vector(W_RADIUS, 0, 0)
    )
    ParticleManager:SetParticleControl(
        s.ring,
        2,
        Vector(255, 154, 75)
    )
    s.fire = ParticleManager:CreateParticle(W_FIRE, PATTACH_ABSORIGIN_FOLLOW, s.ward)
    EmitSoundOn("Hero_Juggernaut.BladeFuryStart", s.ward)
    s.sweep = {}
    do
        local i = 0
        while i < 6 do
            local angle = i * math.pi / 3
            local x = math.cos(angle)
            local y = math.sin(angle)
            local blade = ParticleManager:CreateParticle(W_BLADE, PATTACH_WORLDORIGIN, nil)
            ParticleManager:SetParticleControl(
                blade,
                0,
                Vector(pos.x + x * W_RADIUS, pos.y + y * W_RADIUS, pos.z + 57)
            )
            ParticleManager:SetParticleControl(
                blade,
                1,
                Vector(pos.x + x * 300, pos.y + y * 300, pos.z + 57)
            )
            local ____s_sweep_26 = s.sweep
            ____s_sweep_26[#____s_sweep_26 + 1] = blade
            i = i + 1
        end
    end
end
function JuggernautLegends.prototype.tickWard(self, now)
    local s = self.ward
    if s == nil then
        return
    end
    local hero = self:GetParent()
    if s.ward == nil then
        if now >= s.findUntil then
            self:clearWard()
            return
        end
        local found = __TS__ArrayFind(
            FindUnitsInRadius(
                hero:GetTeamNumber(),
                s.point,
                nil,
                425,
                1,
                55,
                64,
                1,
                false
            ),
            function(____, u) return live(u) and u:GetUnitName() == WARD_UNIT and u:GetPlayerOwnerID() == hero:GetPlayerOwnerID() and u:entindex() ~= s.after end
        )
        if found ~= nil then
            s.ward = found
            self.lastWard = found:entindex()
            s.icon = found:AddNewModifier(hero, s.ability, CHARGE, {})
            s.ownerIcon = hero:AddNewModifier(hero, s.ability, CHARGE, {})
        end
        return
    end
    if not live(s.ward) then
        self:clearWard()
        return
    end
    if s.arm == nil or s.center == nil or s.ring == nil or now < s.arm then
        return
    end
    local center = s.center
    local t = math.min(1, (now - s.arm) / W_CLOSE)
    local radius = W_RADIUS * (1 - t)
    ParticleManager:SetParticleControl(
        s.ring,
        1,
        Vector(radius, 0, 0)
    )
    if not s.burstPlayed then
        burst(W_BURST, center)
        s.burstPlayed = true
    end
    for ____, ____value in __TS__Iterator(__TS__ArrayEntries(s.sweep or ({}))) do
        local i = ____value[1]
        local blade = ____value[2]
        local angle = i * math.pi / 3 + t * 1.9
        local x = math.cos(angle)
        local y = math.sin(angle)
        ParticleManager:SetParticleControl(
            blade,
            0,
            Vector(center.x + x * (radius + 90), center.y + y * (radius + 90), center.z + 57)
        )
        ParticleManager:SetParticleControl(
            blade,
            1,
            Vector(center.x + x * radius, center.y + y * radius, center.z + 57)
        )
    end
    local foes = FindUnitsInRadius(
        hero:GetTeamNumber(),
        center,
        nil,
        W_RADIUS,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES,
        FIND_ANY_ORDER,
        false
    )
    for ____, foe in ipairs(foes) do
        do
            if not self:enemy(foe) or s.hit:has(foe:entindex()) then
                goto __continue135
            end
            local pos = foe:GetAbsOrigin()
            local r = distance(pos, center)
            if math.abs(center.z - pos.z) > 160 or r < radius then
                goto __continue135
            end
            s.hit:add(foe:entindex())
            attached(HIT, foe)
            ApplyDamage({
                victim = foe,
                attacker = hero,
                ability = s.ability,
                damage_type = DAMAGE_TYPE_MAGICAL,
                damage = math.min(
                    700,
                    380 + 0.1 * foe:GetMaxHealth()
                )
            })
            if live(foe) and not foe:IsDebuffImmune() then
                if r > 15 and not foe:IsCurrentlyHorizontalMotionControlled() then
                    foe:AddNewModifier(
                        hero,
                        s.ability,
                        "modifier_knockback",
                        {
                            duration = 0.24,
                            knockback_duration = 0.24,
                            center_x = pos.x + (pos.x - center.x) / r * 50,
                            center_y = pos.y + (pos.y - center.y) / r * 50,
                            center_z = pos.z,
                            knockback_distance = math.min(r, 300),
                            knockback_height = 0,
                            should_stun = 0
                        }
                    )
                end
                foe:AddNewModifier(hero, s.ability, BIND, {duration = 0.9})
            end
        end
        ::__continue135::
    end
    if t >= 1 then
        self:clearWard()
        if not s.leaveWard and live(s.ward) then
            s.ward:ForceKill(false)
        end
    end
end
function JuggernautLegends.prototype.tickEncoreSlashes(self, now, reach)
    if reach == nil then
        reach = 550
    end
    local s = self.slashing
    local hero = self:GetParent()
    if s == nil or now < s.next then
        return
    end
    local u = s.victim
    if not self:enemy(u) or u:IsAttackImmune() or s.mod == nil or s.mod:IsNull() or not hero:CanEntityBeSeenByMyTeam(u) or distance(
        hero:GetAbsOrigin(),
        u:GetAbsOrigin()
    ) > reach then
        self:clearSlashes()
        return
    end
    local from = hero:GetAbsOrigin()
    local to = u:GetAbsOrigin()
    local angle = s.hits * 2.4
    local ____end = Vector(
        to.x + math.cos(angle) * 110,
        to.y + math.sin(angle) * 110,
        to.z
    )
    dashFlash(from, ____end)
    if math.abs(____end.x) < MAP.bounds and math.abs(____end.y) < MAP.bounds then
        FindClearSpaceForUnit(hero, ____end, true)
    end
    hero:FaceTowards(to)
    attached(HIT, u)
    EmitSoundOn("Hero_Juggernaut.OmniSlash", u)
    s.hits = s.hits + 1
    s.next = now + 0.36
    hero:PerformAttack(
        u,
        false,
        true,
        true,
        false,
        false,
        false,
        false
    )
    if s.hits >= 3 then
        self:clearSlashes()
    end
end
function JuggernautLegends.prototype.OnIntervalThink(self)
    if not IsServer() then
        return
    end
    local hero = self:GetParent()
    if not live(hero) then
        return
    end
    local b = self:bonuses()
    local now = time()
    local showCuts = (b.code.jugg_l_cuts or 0) > 0 and hero:FindAbilityByName(DANCE) ~= nil
    if showCuts ~= self.cutsShown then
        self:clearCuts()
        self.cutsShown = self:flip(DANCE, CUTS, showCuts)
    end
    if self.cuts ~= nil and (now >= self.cuts["until"] or self.cuts.target ~= nil and not self:enemy(self.cuts.target)) then
        self:clearCuts()
    end
    if (b.code.jugg_l_sanctuary or 0) > 0 then
        self:tickWard(now)
    else
        self:clearWard()
    end
    local encore = (b.code.jugg_l_endless or 0) > 0
    if not encore then
        self:clearEncore()
        self:clearSlashes()
    end
    for ____, ____value in __TS__Iterator(self.omniWounds) do
        local id = ____value[1]
        local w = ____value[2]
        if not self:enemy(w.victim) then
            clearMod(w.icon)
            self.omniWounds:delete(id)
        end
    end
    if self.pendingOmniUntil > 0 then
        if now >= self.pendingOmniUntil then
            self.pendingOmniUntil = 0
        elseif hero:HasModifier(OMNI_STATE) then
            self.trackingOmni = true
            self.pendingOmniUntil = 0
        end
    end
    if self.trackingOmni and not hero:HasModifier(OMNI_STATE) then
        self.trackingOmni = false
        local native = hero:FindAbilityByName(OMNI)
        if (b.code.jugg_p_dispel or 0) > 0 then
            hero:AddNewModifier(
                hero,
                native,
                INTERMISSION,
                {
                    duration = encore and 2.2 or 1.5,
                    amount = 170 + 30 * (native and native:GetLevel() or 1)
                }
            )
        end
        if encore then
            local wnd = b.awake and 6 or 5
            self.encore = {
                opens = now + R_PAUSE,
                closes = now + wnd,
                icon = hero:AddNewModifier(hero, native, R_DELAY, {duration = R_PAUSE})
            }
        end
    end
    local w = self.encore
    if w ~= nil then
        local native = hero:FindAbilityByName(OMNI)
        if native == nil or native:IsCooldownReady() or now >= w.closes then
            self:clearEncore()
        elseif now >= w.opens and not self.encoreShown then
            self.encoreShown = self:flip(OMNI, ENCORE, true)
            if self.encoreShown then
                clearMod(w.icon)
                w.icon = hero:AddNewModifier(hero, native, R_READY, {duration = w.closes - now})
            end
        end
    end
    self:tickEncoreSlashes(now)
end
modifier_orb_jugg_guardcut = registerModifier("modifier_orb_jugg_guardcut", GuardCut)
modifier_orb_jugg_open_wound = registerModifier("modifier_orb_jugg_open_wound", OpenWound)
modifier_orb_jugg_intermission = registerModifier("modifier_orb_jugg_intermission", Intermission)
modifier_orb_jugg_legend = registerModifier("modifier_orb_jugg_legend", ____exports.JuggernautLegends)
modifier_orb_jugg_ward_charge = registerModifier("modifier_orb_jugg_ward_charge", WardIcon)
modifier_orb_jugg_ward_bind = registerModifier("modifier_orb_jugg_ward_bind", WardBind)
modifier_orb_jugg_cuts = registerModifier("modifier_orb_jugg_cuts", CutIcon)
modifier_orb_jugg_ward_fuse = registerModifier("modifier_orb_jugg_ward_fuse", WardFuse)
modifier_orb_jugg_encore_pause = registerModifier("modifier_orb_jugg_encore_pause", EncoreIcon)
modifier_orb_jugg_encore_ready = registerModifier("modifier_orb_jugg_encore_ready", EncoreReady)
modifier_orb_jugg_encore_slash = registerModifier("modifier_orb_jugg_encore_slash", EncoreSlash)
return ____exports
