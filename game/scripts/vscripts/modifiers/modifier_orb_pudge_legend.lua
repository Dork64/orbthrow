local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__Iterator = ____lualib.__TS__Iterator
local Set = ____lualib.Set
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ROT = "pudge_rot"
local HEAP = "pudge_flesh_heap"
local ULT = "pudge_dismember"
local HEAP_BUFF = "modifier_pudge_flesh_heap_block"
local ULT_DEBUFF = "modifier_pudge_dismember"
local COUNTER = "orb_pudge_counter"
local ROT_MARK = "modifier_orb_pudge_rot_mark"
local ROT_READY = "modifier_orb_pudge_rot_ready"
local ROT_FUSE = "modifier_orb_pudge_rot_fuse"
local ROT_RECOVERY = "modifier_orb_pudge_rot_recovery"
local STORE = "modifier_orb_pudge_counter_store"
local BITE = "modifier_orb_pudge_counter_hit"
local DRAG = "modifier_orb_pudge_dragging"
local VICTIM = "modifier_orb_pudge_drag_victim"
local CHEW_MARK = "modifier_orb_pudge_chew_mark"
local CLUTCH = "modifier_orb_pudge_clutch"
local LOCKED_JAWS = "modifier_orb_pudge_locked_jaws"
local GLOB = "models/events/dark_carnival/crate_drop_minigame/crate_drop_hazard_goop.vmdl"
local RING = "particles/ui_mouseactions/range_display.vpcf"
local FUMES = "particles/units/heroes/hero_pudge/pudge_rot_radius.vpcf"
local BURST = "particles/units/heroes/hero_pudge/pudge_swallow_release.vpcf"
local BITE_FX = "particles/units/heroes/hero_pudge/pudge_fleshheap_block_activation.vpcf"
local HOOK_FX = "particles/units/heroes/hero_pudge/pudge_meathook_impact.vpcf"
local CHAIN = "particles/units/heroes/hero_pudge/pudge_meathook_chain.vpcf"
local TICK = 0.05
local FUSE = 0.65
local BURST_RADIUS = 290
local BURST_RECOVERY = 6
local COUNTER_TIME = 4
local function now()
    return GameRules:GetGameTime()
end
local function live(u)
    return u ~= nil and IsValidEntity(u) and u:IsAlive()
end
local function distance(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2)
end
local function height(p)
    return Vector(p.x, p.y, p.z + 70)
end
local function clear(mod)
    if mod ~= nil and not mod:IsNull() then
        mod:Destroy()
    end
end
local function cleanup(p)
    ParticleManager:DestroyParticle(p, true)
    ParticleManager:ReleaseParticleIndex(p)
end
local function particle(path, p)
    local id = ParticleManager:CreateParticle(path, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, p)
    return id
end
local function flash(path, p)
    ParticleManager:ReleaseParticleIndex(particle(path, p))
end
local RotReady = __TS__Class()
RotReady.name = "RotReady"
__TS__ClassExtends(RotReady, ModBase)
function RotReady.prototype.IsHidden(self)
    return false
end
function RotReady.prototype.IsPurgable(self)
    return false
end
function RotReady.prototype.GetTexture(self)
    return ROT
end
local RotMark = __TS__Class()
RotMark.name = "RotMark"
__TS__ClassExtends(RotMark, RotReady)
function RotMark.prototype.IsDebuff(self)
    return true
end
function RotMark.prototype.GetEffectName(self)
    return "particles/units/heroes/hero_pudge/pudge_rot_recipient.vpcf"
end
function RotMark.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
local RotFuse = __TS__Class()
RotFuse.name = "RotFuse"
__TS__ClassExtends(RotFuse, RotReady)
function RotFuse.prototype.GetTexture(self)
    return "item_blight_stone"
end
local RotRecovery = __TS__Class()
RotRecovery.name = "RotRecovery"
__TS__ClassExtends(RotRecovery, RotReady)
local CounterStore = __TS__Class()
CounterStore.name = "CounterStore"
__TS__ClassExtends(CounterStore, RotReady)
function CounterStore.prototype.GetTexture(self)
    return HEAP
end
local CounterHit = __TS__Class()
CounterHit.name = "CounterHit"
__TS__ClassExtends(CounterHit, CounterStore)
function CounterHit.prototype.GetTexture(self)
    return "pudge_eject"
end
function CounterHit.prototype.GetEffectName(self)
    return "particles/units/heroes/hero_pudge/pudge_fleshheap_block_body_blob.vpcf"
end
function CounterHit.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
local Dragging = __TS__Class()
Dragging.name = "Dragging"
__TS__ClassExtends(Dragging, RotReady)
function Dragging.prototype.GetTexture(self)
    return ULT
end
local DragVictim = __TS__Class()
DragVictim.name = "DragVictim"
__TS__ClassExtends(DragVictim, Dragging)
function DragVictim.prototype.IsDebuff(self)
    return true
end
local LockedJaws = __TS__Class()
LockedJaws.name = "LockedJaws"
__TS__ClassExtends(LockedJaws, CounterStore)
local ChewMark = __TS__Class()
ChewMark.name = "ChewMark"
__TS__ClassExtends(ChewMark, DragVictim)
function ChewMark.prototype.IsPurgable(self)
    return true
end
local Clutch = __TS__Class()
Clutch.name = "Clutch"
__TS__ClassExtends(Clutch, CounterStore)
function Clutch.prototype.IsDebuff(self)
    return true
end
function Clutch.prototype.IsPurgable(self)
    return true
end
function Clutch.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE}
end
function Clutch.prototype.GetModifierMoveSpeedBonus_Percentage(self)
    return -25
end
____exports.PudgeLegends = __TS__Class()
local PudgeLegends = ____exports.PudgeLegends
PudgeLegends.name = "PudgeLegends"
__TS__ClassExtends(PudgeLegends, ModBase)
function PudgeLegends.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.pressure = __TS__New(Map)
    self.readyAt = 0
end
function PudgeLegends.prototype.IsHidden(self)
    return true
end
function PudgeLegends.prototype.IsPurgable(self)
    return false
end
function PudgeLegends.prototype.RemoveOnDeath(self)
    return false
end
function PudgeLegends.prototype.OnCreated(self)
    if IsServer() then
        self:StartIntervalThink(TICK)
    end
end
function PudgeLegends.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_EXECUTED,
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_EVENT_ON_ABILITY_END_CHANNEL,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_EVENT_ON_DEATH,
        MODIFIER_PROPERTY_INCOMING_DAMAGE_PERCENTAGE
    }
end
function PudgeLegends.prototype.bonuses(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        now()
    )
end
function PudgeLegends.prototype.has(self, id)
    return (self:bonuses().code[id] or 0) > 0
end
function PudgeLegends.prototype.tracksDismember(self)
    local b = self:bonuses().code
    return (b.pudge_l_dismember or 0) > 0 or (b.pudge_p_bulk or 0) > 0 or (b.pudge_p_chew or 0) > 0
end
function PudgeLegends.prototype.enemy(self, unit)
    return live(unit) and unit:IsRealHero() and not unit:IsIllusion() and not unit:IsInvulnerable() and not unit:IsOutOfGame() and unit:GetTeamNumber() ~= self:GetParent():GetTeamNumber()
end
function PudgeLegends.prototype.nearby(self, p, r)
    local h = self:GetParent()
    return __TS__ArrayFilter(
        FindUnitsInRadius(
            h:GetTeamNumber(),
            p,
            nil,
            r,
            2,
            1,
            16,
            1,
            false
        ),
        function(____, u) return self:enemy(u) and math.abs(u:GetAbsOrigin().z - p.z) <= 160 end
    )
end
function PudgeLegends.prototype.resetPressure(self)
    for ____, entry in __TS__Iterator(self.pressure:values()) do
        clear(entry.mark)
    end
    self.pressure:clear()
    clear(self.rotReady)
    self.rotReady = nil
end
function PudgeLegends.prototype.tickRot(self, ability, at, awake)
    local hero = self:GetParent()
    local required = (awake and 1.1 or 1.5) - (self:has("pudge_p_stench") and 0.2 or 0)
    if ability:GetLevel() <= 0 or at < self.readyAt then
        self:resetPressure()
        return
    end
    if ability:GetToggleState() then
        local nearby = __TS__ArrayFilter(
            self:nearby(
                hero:GetAbsOrigin(),
                ability:GetSpecialValueFor("rot_radius")
            ),
            function(____, u) return not u:IsDebuffImmune() end
        )
        local inside = __TS__New(
            Set,
            __TS__ArrayMap(
                nearby,
                function(____, u) return u:entindex() end
            )
        )
        for ____, ____value in __TS__Iterator(self.pressure) do
            local id = ____value[1]
            local entry = ____value[2]
            do
                if inside:has(id) then
                    goto __continue49
                end
                clear(entry.mark)
                self.pressure:delete(id)
            end
            ::__continue49::
        end
        local ready = 0
        for ____, u in ipairs(nearby) do
            local id = u:entindex()
            local entry = self.pressure:get(id)
            if entry == nil then
                self.pressure:set(id, {unit = u, since = at})
            elseif at - entry.since >= required then
                ready = ready + 1
                if entry.mark == nil then
                    entry.mark = u:AddNewModifier(hero, ability, ROT_MARK, {})
                end
            end
        end
        if ready > 0 then
            if self.rotReady == nil then
                self.rotReady = hero:AddNewModifier(hero, ability, ROT_READY, {})
            end
            local ____opt_0 = self.rotReady
            if ____opt_0 ~= nil then
                ____opt_0:SetStackCount(ready)
            end
        elseif self.rotReady ~= nil then
            clear(self.rotReady)
            self.rotReady = nil
        end
        return
    end
    if self.pressure.size == 0 then
        return
    end
    local target
    local point = hero:GetAbsOrigin()
    local radius = ability:GetSpecialValueFor("rot_radius")
    for ____, entry in __TS__Iterator(self.pressure:values()) do
        do
            if at - entry.since < required or not self:enemy(entry.unit) or entry.unit:IsDebuffImmune() then
                goto __continue59
            end
            local pos = entry.unit:GetAbsOrigin()
            if distance(point, pos) > radius or math.abs(point.z - pos.z) > 160 then
                goto __continue59
            end
            if target == nil or entry.since < target.since or entry.since == target.since and distance(point, pos) < distance(
                point,
                target.unit:GetAbsOrigin()
            ) then
                target = entry
            end
        end
        ::__continue59::
    end
    self:resetPressure()
    if target ~= nil then
        self:plantBoiler(
            target.unit:GetAbsOrigin(),
            ability,
            at
        )
    end
end
function PudgeLegends.prototype.plantBoiler(self, pos, ability, at)
    local hero = self:GetParent()
    local point = GetGroundPosition(pos, hero)
    local model = SpawnEntityFromTableSynchronous("prop_dynamic", {model = GLOB, solid = 0, disableshadows = 1})
    if model ~= nil then
        model:SetAbsOrigin(point)
    end
    if model ~= nil then
        model:SetLocalScale(0.6)
    end
    local ring = particle(RING, point)
    ParticleManager:SetParticleControl(
        ring,
        1,
        Vector(BURST_RADIUS, 0, 0)
    )
    ParticleManager:SetParticleControl(
        ring,
        2,
        Vector(238, 164, 46)
    )
    local fumes = particle(FUMES, point)
    self.readyAt = at + BURST_RECOVERY
    self.boiler = {
        pos = point,
        ability = ability,
        model = model,
        ring = ring,
        fumes = fumes,
        blowsAt = at + FUSE,
        icon = hero:AddNewModifier(hero, ability, ROT_FUSE, {duration = FUSE})
    }
end
function PudgeLegends.prototype.clearBoiler(self)
    local b = self.boiler
    self.boiler = nil
    if b == nil then
        return
    end
    cleanup(b.ring)
    cleanup(b.fumes)
    clear(b.icon)
    if b.model ~= nil and IsValidEntity(b.model) then
        UTIL_Remove(b.model)
    end
end
function PudgeLegends.prototype.tickBoiler(self, at)
    local b = self.boiler
    if b == nil then
        return
    end
    if at < b.blowsAt then
        if b.model ~= nil and IsValidEntity(b.model) then
            b.model:SetLocalScale(1.45 - (b.blowsAt - at) / FUSE * 0.85)
        end
        ParticleManager:SetParticleControl(
            b.fumes,
            1,
            Vector(130 + (1 - (b.blowsAt - at) / FUSE) * 105, 0, 0)
        )
        return
    end
    self:clearBoiler()
    local h = self:GetParent()
    flash(BURST, b.pos)
    StartSoundEventFromPosition("Hero_Pudge.Dismember", b.pos)
    self.rotRecovery = h:AddNewModifier(
        h,
        b.ability,
        ROT_RECOVERY,
        {duration = math.max(0.1, self.readyAt - at)}
    )
    for ____, foe in ipairs(self:nearby(b.pos, BURST_RADIUS)) do
        do
            if foe:IsDebuffImmune() then
                goto __continue73
            end
            ApplyDamage({
                victim = foe,
                attacker = h,
                ability = b.ability,
                damage_type = DAMAGE_TYPE_MAGICAL,
                damage = math.min(
                    650,
                    180 + 0.1 * foe:GetMaxHealth()
                )
            })
        end
        ::__continue73::
    end
end
function PudgeLegends.prototype.swapCounter(self, show)
    local h = self:GetParent()
    local alt = h:FindAbilityByName(COUNTER) or (show and h:AddAbility(COUNTER) or nil)
    local base = h:FindAbilityByName(HEAP)
    if base == nil or alt == nil then
        return false
    end
    if show then
        alt:SetLevel(1)
        h:SwapAbilities(HEAP, COUNTER, false, true)
    else
        h:SwapAbilities(COUNTER, HEAP, false, true)
    end
    alt:SetHidden(not show)
    base:SetHidden(show)
    base:MarkAbilityButtonDirty()
    alt:MarkAbilityButtonDirty()
    return show
end
function PudgeLegends.prototype.clearGuard(self)
    local g = self.guard
    self.guard = nil
    if g == nil then
        return
    end
    clear(g.icon)
    if g.shown then
        self:swapCounter(false)
    end
end
function PudgeLegends.prototype.clearCounter(self)
    local ____clear_8 = clear
    local ____opt_6 = self.counter
    ____clear_8(____opt_6 and ____opt_6.icon)
    self.counter = nil
end
function PudgeLegends.prototype.OnAbilityFullyCast(self, e)
    if not IsServer() or e.unit ~= self:GetParent() or e.ability == nil then
        return
    end
    local name = e.ability:GetAbilityName()
    if name == ULT and self.drag == nil and e.ability:IsChanneling() then
        self:OnAbilityExecuted(e)
    end
    if name ~= HEAP or not self:has("pudge_l_heap") and not self:has("pudge_p_glutton") then
        return
    end
    self:clearGuard()
    self:clearCounter()
    self.guard = {
        ability = e.ability,
        ["until"] = now() + 0.2,
        amount = 0,
        spent = false,
        clutched = false,
        shown = false
    }
    self:tickGuard(now())
end
function PudgeLegends.prototype.tickGuard(self, at)
    local g = self.guard
    local hero = self:GetParent()
    if g == nil then
        return
    end
    local native = hero:FindModifierByName(HEAP_BUFF)
    if native == nil then
        if at >= g["until"] or g.icon ~= nil or g.shown then
            self:clearGuard()
        end
        return
    end
    if g.spent or not self:has("pudge_l_heap") then
        return
    end
    if g.icon == nil then
        g.icon = hero:AddNewModifier(
            hero,
            g.ability,
            STORE,
            {duration = native:GetRemainingTime()}
        )
        local ____opt_9 = g.icon
        if ____opt_9 ~= nil then
            ____opt_9:SetStackCount(math.floor(g.amount))
        end
    end
    if not g.shown and g.amount >= 1 then
        g.shown = self:swapCounter(true)
    end
end
function PudgeLegends.prototype.OnTakeDamage(self, e)
    local g = self.guard
    local hero = self:GetParent()
    if not IsServer() or g == nil or g.spent or e.unit ~= hero or not self:enemy(e.attacker) or not self:has("pudge_l_heap") or not hero:HasModifier(HEAP_BUFF) or bit.band(
        e.damage_flags,
        bit.bor(DOTA_DAMAGE_FLAG_HPLOSS, DOTA_DAMAGE_FLAG_REFLECTION)
    ) ~= 0 then
        return
    end
    local cap = self:bonuses().awake and 750 or 600
    g.amount = math.min(cap, g.amount + e.damage * 0.55)
    local ____opt_11 = g.icon
    if ____opt_11 ~= nil then
        ____opt_11:SetStackCount(math.floor(g.amount))
    end
end
function PudgeLegends.prototype.CanCounter(self)
    local g = self.guard
    return g ~= nil and not g.spent and g.amount >= 1 and self:has("pudge_l_heap") and self:GetParent():HasModifier(HEAP_BUFF)
end
function PudgeLegends.prototype.ArmCounter(self, ability)
    local g = self.guard
    local hero = self:GetParent()
    if g == nil or not self:CanCounter() then
        return
    end
    g.spent = true
    clear(g.icon)
    g.icon = nil
    if g.shown then
        g.shown = self:swapCounter(false)
    end
    self:clearCounter()
    local amount = math.floor(g.amount)
    local duration = COUNTER_TIME + (self:has("pudge_p_lard") and 1 or 0)
    local icon = hero:AddNewModifier(hero, ability, BITE, {duration = duration})
    if icon ~= nil then
        icon:SetStackCount(amount)
    end
    self.counter = {
        ability = ability,
        amount = amount,
        expires = now() + duration,
        icon = icon
    }
    flash(
        BITE_FX,
        hero:GetAbsOrigin()
    )
end
function PudgeLegends.prototype.clutch(self, target, ability)
    local hero = self:GetParent()
    if not target:IsDebuffImmune() then
        target:AddNewModifier(hero, ability, CLUTCH, {duration = 1.4})
    end
end
function PudgeLegends.prototype.chew(self, target, ability)
    if target:IsAttackImmune() then
        return
    end
    local hero = self:GetParent()
    local dealt = ApplyDamage({
        victim = target,
        attacker = hero,
        ability = ability,
        damage_type = DAMAGE_TYPE_PHYSICAL,
        damage_flags = bit.bor(DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION, DOTA_DAMAGE_FLAG_NO_SPELL_LIFESTEAL),
        damage = math.min(
            350,
            120 + hero:GetStrength() * 0.4
        )
    })
    if dealt > 0 then
        hero:Heal(dealt * 0.5, ability)
    end
    flash(
        HOOK_FX,
        height(target:GetAbsOrigin())
    )
end
function PudgeLegends.prototype.clearChewMark(self)
    local ____clear_17 = clear
    local ____opt_15 = self.chewMark
    ____clear_17(____opt_15 and ____opt_15.icon)
    self.chewMark = nil
end
function PudgeLegends.prototype.OnAttackLanded(self, e)
    local h = self:GetParent()
    local target = e.target
    if not IsServer() or e.attacker ~= h or e.no_attack_cooldown or e.damage <= 0 or not self:enemy(target) or target:IsAttackImmune() then
        return
    end
    local g = self.guard
    local clutch = self:has("pudge_p_glutton")
    local slowed = false
    if clutch and g ~= nil and not g.clutched and h:HasModifier(HEAP_BUFF) then
        slowed = true
        g.clutched = true
        self:clutch(target, g.ability)
    end
    local mark = self.chewMark
    if (mark and mark.victim) == target and not mark.icon:IsNull() and now() < mark["until"] then
        self:clearChewMark()
        self:chew(target, mark.ability)
    end
    local c = self.counter
    if c == nil or now() >= c.expires or not self:enemy(target) then
        return
    end
    self:clearCounter()
    if clutch and not slowed then
        self:clutch(target, c.ability)
    end
    local dealt = ApplyDamage({
        victim = target,
        attacker = h,
        ability = c.ability,
        damage = c.amount,
        damage_type = DAMAGE_TYPE_PHYSICAL,
        damage_flags = bit.bor(DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION, DOTA_DAMAGE_FLAG_NO_SPELL_LIFESTEAL)
    })
    if dealt > 0 then
        h:Heal(dealt * 0.45, c.ability)
    end
    flash(
        HOOK_FX,
        height(target:GetAbsOrigin())
    )
end
function PudgeLegends.prototype.GetModifierIncomingDamage_Percentage(self, e)
    local d = self.drag
    if not IsServer() or not (d and d.latched) or not self:enemy(e and e.attacker) or not d.ability:IsChanneling() or not self:has("pudge_p_bulk") then
        return 0
    end
    return -25
end
function PudgeLegends.prototype.OnAbilityExecuted(self, e)
    local hero = self:GetParent()
    local ____temp_26 = not IsServer() or e.unit ~= hero
    if not ____temp_26 then
        local ____opt_24 = e.ability
        ____temp_26 = (____opt_24 and ____opt_24:GetAbilityName()) ~= ULT
    end
    if ____temp_26 or not self:tracksDismember() then
        return
    end
    self:clearDrag()
    self:clearChewMark()
    local victim = e.target or e.ability:GetCursorTarget()
    if not self:enemy(victim) then
        return
    end
    local at = now()
    self.drag = {
        ability = e.ability,
        victim = victim,
        ends = at + e.ability:GetChannelTime(),
        acquiredBy = at + 0.25,
        last = at,
        maxGap = 320,
        latched = false,
        canDrag = self:has("pudge_l_dismember")
    }
end
function PudgeLegends.prototype.order(self, e)
    local d = self.drag
    if d == nil or not d.canDrag or not d.latched or not d.ability:IsChanneling() or e.order_type ~= DOTA_UNIT_ORDER_MOVE_TO_POSITION or e.queue == 1 then
        return true
    end
    d.goal = Vector(e.position_x, e.position_y, e.position_z)
    return false
end
function PudgeLegends.prototype.clearDrag(self)
    local d = self.drag
    self.drag = nil
    if d == nil then
        return
    end
    clear(d.casterIcon)
    clear(d.guardIcon)
    clear(d.victimIcon)
    if d.chain ~= nil then
        cleanup(d.chain)
    end
end
function PudgeLegends.prototype.finishDrag(self, d, finished)
    self:clearDrag()
    if not finished or not d.latched or not self:enemy(d.victim) or not live(self:GetParent()) then
        return
    end
    local hero = self:GetParent()
    local chew = self:has("pudge_p_chew")
    if not d.canDrag then
        if not chew or d.victim:IsDebuffImmune() then
            return
        end
        local icon = d.victim:AddNewModifier(hero, d.ability, CHEW_MARK, {duration = 4})
        if icon ~= nil then
            self.chewMark = {
                victim = d.victim,
                ability = d.ability,
                icon = icon,
                ["until"] = now() + 4
            }
        end
        return
    end
    local damage = 0.12 * math.max(
        0,
        d.victim:GetMaxHealth() - d.victim:GetHealth()
    )
    if damage > 0 then
        flash(
            HOOK_FX,
            height(d.victim:GetAbsOrigin())
        )
        ApplyDamage({
            victim = d.victim,
            attacker = hero,
            ability = d.ability,
            damage_type = DAMAGE_TYPE_MAGICAL,
            damage = damage
        })
    end
    if chew and self:enemy(d.victim) then
        self:chew(d.victim, d.ability)
    end
end
function PudgeLegends.prototype.OnAbilityEndChannel(self, e)
    local d = self.drag
    if not IsServer() or d == nil or e.unit ~= self:GetParent() or e.ability ~= d.ability then
        return
    end
    local interrupted = e.interrupted == true or e.interrupted == 1
    self:finishDrag(
        d,
        not interrupted and now() >= d.ends - TICK
    )
end
function PudgeLegends.prototype.tickDrag(self, at, awake)
    local d = self.drag
    local hero = self:GetParent()
    if d == nil then
        return
    end
    if not self:enemy(d.victim) then
        self:clearDrag()
        return
    end
    local channeling = d.ability:IsChanneling()
    local bite = d.victim:FindModifierByName(ULT_DEBUFF)
    local held = bite ~= nil and bite:GetCaster() == hero and bite:GetAbility() == d.ability
    if not d.latched then
        if at > d.acquiredBy then
            self:clearDrag()
            return
        end
        if not channeling or not held then
            return
        end
        d.latched = true
        d.maxGap = math.min(
            750,
            math.max(
                320,
                distance(
                    hero:GetAbsOrigin(),
                    d.victim:GetAbsOrigin()
                ) + 30
            )
        )
        local started = d.ability:GetChannelStartTime()
        if started >= d.acquiredBy - 0.4 and started <= at then
            d.ends = started + d.ability:GetChannelTime()
        end
        local duration = math.max(TICK, d.ends - at)
        if self:has("pudge_p_bulk") then
            d.guardIcon = hero:AddNewModifier(hero, d.ability, LOCKED_JAWS, {duration = duration})
        end
        if d.canDrag then
            d.casterIcon = hero:AddNewModifier(hero, d.ability, DRAG, {duration = duration})
            d.victimIcon = d.victim:AddNewModifier(hero, d.ability, VICTIM, {duration = duration})
            d.chain = particle(
                CHAIN,
                height(hero:GetAbsOrigin())
            )
            ParticleManager:SetParticleControl(
                d.chain,
                1,
                height(d.victim:GetAbsOrigin())
            )
        end
    end
    if not channeling or not held then
        if at < d.ends - TICK then
            self:clearDrag()
            return
        end
        if d.stoppedAt == nil then
            d.stoppedAt = at
        end
        if at > d.stoppedAt + 0.08 then
            self:finishDrag(
                d,
                not channeling and at >= d.ends and not hero:IsStunned()
            )
        end
        return
    end
    local dt = math.min(0.1, at - d.last)
    d.last = at
    if d.canDrag then
        self:stepDrag(d, dt, awake)
    end
    if d.chain ~= nil then
        ParticleManager:SetParticleControl(
            d.chain,
            0,
            height(hero:GetAbsOrigin())
        )
        ParticleManager:SetParticleControl(
            d.chain,
            1,
            height(d.victim:GetAbsOrigin())
        )
    end
end
function PudgeLegends.prototype.stepDrag(self, d, dt, awake)
    local hero = self:GetParent()
    local pos = hero:GetAbsOrigin()
    local victim = d.victim:GetAbsOrigin()
    if d.goal == nil or hero:IsRooted() or hero:IsStunned() or hero:IsCurrentlyHorizontalMotionControlled() or hero:HasModifier("modifier_slark_pounce_leash") or hero:HasModifier("modifier_puck_dream_coil") or distance(pos, victim) > d.maxGap or math.abs(pos.z - victim.z) > 125 then
        return
    end
    local gap = distance(d.goal, pos)
    if gap <= 8 then
        d.goal = nil
        return
    end
    local speed = (awake and 0.7 or 0.55) + (self:has("pudge_p_bulk") and 0.05 or 0)
    local step = math.min(
        gap,
        hero:GetIdealSpeed() * speed * dt
    )
    local x = (d.goal.x - pos.x) * step / gap
    local y = (d.goal.y - pos.y) * step / gap
    local function next(u, from)
        return GetGroundPosition(
            Vector(from.x + x, from.y + y, from.z),
            u
        )
    end
    local p = next(hero, pos)
    local v = next(d.victim, victim)
    local function free(q, from)
        return math.abs(q.x) < MAP.bounds - 36 and math.abs(q.y) < MAP.bounds - 36 and math.abs(q.z - from.z) <= 32 and GridNav:IsTraversable(q) and not GridNav:IsBlocked(q) and GridNav:CanFindPath(from, q)
    end
    if not free(p, pos) or not free(v, victim) then
        d.goal = nil
        return
    end
    hero:SetAbsOrigin(p)
    d.victim:SetAbsOrigin(v)
end
function PudgeLegends.prototype.OnIntervalThink(self)
    local h = self:GetParent()
    if not IsServer() or not live(h) then
        return
    end
    local b = self:bonuses()
    local at = now()
    local ____temp_27
    if (b.code.pudge_l_mire or 0) > 0 then
        ____temp_27 = h:FindAbilityByName(ROT)
    else
        ____temp_27 = nil
    end
    local rot = ____temp_27
    if rot ~= nil then
        self:tickBoiler(at)
        self:tickRot(rot, at, b.awake)
    else
        self:resetPressure()
        self:clearBoiler()
        clear(self.rotRecovery)
        self.rotRecovery = nil
    end
    if (b.code.pudge_l_heap or 0) > 0 or (b.code.pudge_p_glutton or 0) > 0 then
        self:tickGuard(at)
        if self.counter ~= nil and at >= self.counter.expires then
            self:clearCounter()
        end
    else
        self:clearGuard()
        self:clearCounter()
    end
    if self:tracksDismember() then
        self:tickDrag(at, b.awake)
    else
        self:clearDrag()
    end
    if self.chewMark ~= nil and (at >= self.chewMark["until"] or not self:enemy(self.chewMark.victim)) then
        self:clearChewMark()
    end
end
function PudgeLegends.prototype.clearCombat(self)
    self:resetPressure()
    self:clearBoiler()
    clear(self.rotRecovery)
    self.rotRecovery = nil
    self:clearGuard()
    self:clearCounter()
    self:clearDrag()
    self:clearChewMark()
end
function PudgeLegends.prototype.OnDeath(self, e)
    if IsServer() and e.unit == self:GetParent() then
        self:clearCombat()
    end
end
function PudgeLegends.prototype.OnDestroy(self)
    if IsServer() then
        self:clearCombat()
    end
end
modifier_orb_pudge_chew_mark = registerModifier("modifier_orb_pudge_chew_mark", ChewMark)
modifier_orb_pudge_clutch = registerModifier("modifier_orb_pudge_clutch", Clutch)
modifier_orb_pudge_locked_jaws = registerModifier("modifier_orb_pudge_locked_jaws", LockedJaws)
modifier_orb_pudge_legend = registerModifier("modifier_orb_pudge_legend", ____exports.PudgeLegends)
modifier_orb_pudge_rot_ready = registerModifier("modifier_orb_pudge_rot_ready", RotReady)
modifier_orb_pudge_rot_mark = registerModifier("modifier_orb_pudge_rot_mark", RotMark)
modifier_orb_pudge_rot_fuse = registerModifier("modifier_orb_pudge_rot_fuse", RotFuse)
modifier_orb_pudge_rot_recovery = registerModifier("modifier_orb_pudge_rot_recovery", RotRecovery)
modifier_orb_pudge_counter_store = registerModifier("modifier_orb_pudge_counter_store", CounterStore)
modifier_orb_pudge_counter_hit = registerModifier("modifier_orb_pudge_counter_hit", CounterHit)
modifier_orb_pudge_dragging = registerModifier("modifier_orb_pudge_dragging", Dragging)
modifier_orb_pudge_drag_victim = registerModifier("modifier_orb_pudge_drag_victim", DragVictim)
return ____exports
