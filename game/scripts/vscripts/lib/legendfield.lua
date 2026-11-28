local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local ____exports = {}
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
function ____exports.resizeRing(id, radius)
    ParticleManager:SetParticleControl(
        id,
        1,
        Vector(radius, 0, 0)
    )
end
____exports.now = function() return GameRules:GetGameTime() end
function ____exports.distance(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2)
end
function ____exports.direction(from, to, fallback)
    local length = ____exports.distance(from, to)
    return length < 1 and fallback or Vector((to.x - from.x) / length, (to.y - from.y) / length, 0)
end
function ____exports.offset(from, along, length)
    return Vector(from.x + along.x * length, from.y + along.y * length, from.z)
end
function ____exports.valid(unit)
    return unit ~= nil and IsValidEntity(unit) and unit:IsAlive() and not unit:IsOutOfGame()
end
function ____exports.opponent(hero, unit)
    return ____exports.valid(unit) and unit:IsRealHero() and not unit:IsIllusion() and not unit:IsInvulnerable() and unit:GetTeamNumber() ~= hero:GetTeamNumber()
end
function ____exports.vulnerable(unit)
    return not unit:IsDebuffImmune() and not unit:IsMagicImmune()
end
function ____exports.legal(point)
    return math.abs(point.x) < MAP.bounds - 32 and math.abs(point.y) < MAP.bounds - 32 and GridNav:IsTraversable(point) and not GridNav:IsBlocked(point)
end
function ____exports.effect(name, point)
    local id = ParticleManager:CreateParticle(name, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, point)
    return id
end
function ____exports.setControls(id, point, destination)
    ParticleManager:SetParticleControl(id, 0, point)
    if destination then
        ParticleManager:SetParticleControl(id, 1, destination)
    end
end
function ____exports.flash(name, point, destination)
    local id = ____exports.effect(name, point)
    if destination then
        ParticleManager:SetParticleControl(id, 1, destination)
    end
    ParticleManager:ReleaseParticleIndex(id)
end
function ____exports.ring(point, radius, tint)
    local id = ____exports.effect(
        "particles/ui_mouseactions/range_display.vpcf",
        GetGroundPosition(point, nil)
    )
    ____exports.resizeRing(id, radius)
    ParticleManager:SetParticleControl(id, 2, tint)
    return id
end
function ____exports.stop(id)
    ParticleManager:DestroyParticle(id, true)
    ParticleManager:ReleaseParticleIndex(id)
end
function ____exports.prop(model, point, scale, aim)
    local entity = SpawnEntityFromTableSynchronous("prop_dynamic", {model = model, solid = 0, modelscale = scale, DefaultAnim = "idle"})
    if entity and IsValidEntity(entity) then
        entity:SetAbsOrigin(point)
        entity:SetForwardVector(aim)
        return entity
    end
    return nil
end
function ____exports.removeProp(entity)
    if entity and IsValidEntity(entity) then
        UTIL_Remove(entity)
    end
end
____exports.LegendField = __TS__Class()
local LegendField = ____exports.LegendField
LegendField.name = "LegendField"
__TS__ClassExtends(LegendField, ModBase)
function LegendField.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.cues = {}
    self.motions = {}
    self.recasts = __TS__New(Map)
end
function LegendField.prototype.IsHidden(self)
    return true
end
function LegendField.prototype.IsPurgable(self)
    return false
end
function LegendField.prototype.RemoveOnDeath(self)
    return false
end
function LegendField.prototype.OnCreated(self)
    if IsServer() then
        self:StartIntervalThink(0.05)
    end
end
function LegendField.prototype.owns(self, id)
    return (bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        ____exports.now()
    ).code[id] or 0) > 0
end
function LegendField.prototype.awake(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        ____exports.now()
    ).awake
end
function LegendField.prototype.hero(self)
    return self:GetParent()
end
function LegendField.prototype.after(self, delay, marks, fire, cleanup)
    local ____self_cues_0 = self.cues
    ____self_cues_0[#____self_cues_0 + 1] = {
        time = ____exports.now() + delay,
        marks = marks,
        fire = fire,
        cleanup = cleanup
    }
end
function LegendField.prototype.animate(self, duration, move, cleanup)
    local ____self_motions_1 = self.motions
    ____self_motions_1[#____self_motions_1 + 1] = {
        start = ____exports.now(),
        duration = duration,
        move = move,
        cleanup = cleanup
    }
end
function LegendField.prototype.transient(self, name, point, duration, destination)
    local id = ____exports.effect(name, point)
    if destination then
        ____exports.setControls(id, point, destination)
    end
    self:after(
        duration,
        {id},
        function()
        end
    )
end
function LegendField.prototype.tiles(self, model, from, to, scale, spacing)
    if scale == nil then
        scale = 1
    end
    if spacing == nil then
        spacing = 210
    end
    local length = ____exports.distance(from, to)
    local aim = ____exports.direction(
        from,
        to,
        self:hero():GetForwardVector()
    )
    local count = math.max(
        1,
        math.ceil(length / (spacing * scale))
    )
    local props = {}
    do
        local i = 0
        while i < count do
            local node = ____exports.offset(from, aim, length * (i + 0.5) / count)
            local part = ____exports.prop(
                model,
                GetGroundPosition(node, nil),
                scale,
                aim
            )
            if part then
                props[#props + 1] = part
            end
            i = i + 1
        end
    end
    return function()
        for ____, part in ipairs(props) do
            ____exports.removeProp(part)
        end
    end
end
function LegendField.prototype.area(self, point, radius)
    local hero = self:hero()
    return __TS__ArrayFilter(
        FindUnitsInRadius(
            hero:GetTeamNumber(),
            point,
            nil,
            radius,
            2,
            1,
            0,
            0,
            false
        ),
        function(____, unit) return ____exports.opponent(hero, unit) and ____exports.vulnerable(unit) end
    )
end
function LegendField.prototype.line(self, from, to, width)
    local hero = self:hero()
    return __TS__ArrayFilter(
        FindUnitsInLine(
            hero:GetTeamNumber(),
            from,
            to,
            nil,
            width,
            2,
            1,
            0
        ),
        function(____, unit) return ____exports.opponent(hero, unit) and ____exports.vulnerable(unit) end
    )
end
function LegendField.prototype.hit(self, ability, target, damage, ____type)
    if ____type == nil then
        ____type = DAMAGE_TYPE_MAGICAL
    end
    if not ____exports.opponent(
        self:hero(),
        target
    ) or not ____exports.vulnerable(target) then
        return
    end
    ApplyDamage({
        attacker = self:hero(),
        victim = target,
        ability = ability,
        damage = damage,
        damage_type = ____type,
        damage_flags = bit.bor(
            bit.bor(DOTA_DAMAGE_FLAG_REFLECTION, DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION),
            DOTA_DAMAGE_FLAG_NO_SPELL_LIFESTEAL
        )
    })
end
function LegendField.prototype.isNativeDamage(self, event)
    return event.attacker == self:hero() and event.damage > 0 and ____exports.opponent(
        self:hero(),
        event.unit
    ) and bit.band(event.damage_flags or 0, DOTA_DAMAGE_FLAG_REFLECTION) == 0
end
function LegendField.prototype.open(self, native, name, duration, close)
    local hero = self:hero()
    local alt = hero:FindAbilityByName(name) or hero:AddAbility(name)
    if not alt then
        return false
    end
    self:consume(name)
    if alt:GetLevel() == 0 then
        alt:SetLevel(1)
    end
    alt:EndCooldown()
    hero:SwapAbilities(
        native:GetAbilityName(),
        name,
        false,
        true
    )
    native:SetHidden(true)
    alt:SetHidden(false)
    native:MarkAbilityButtonDirty()
    alt:MarkAbilityButtonDirty()
    self.recasts:set(
        name,
        {
            native = native,
            alt = alt,
            time = ____exports.now() + duration,
            close = close
        }
    )
    return true
end
function LegendField.prototype.consume(self, name)
    local recast = self.recasts:get(name)
    if not recast then
        return
    end
    self.recasts:delete(name)
    local native = recast.native
    local alt = recast.alt
    self:hero():SwapAbilities(
        name,
        native:GetAbilityName(),
        false,
        true
    )
    native:SetHidden(false)
    alt:SetHidden(true)
    native:MarkAbilityButtonDirty()
    alt:MarkAbilityButtonDirty()
    local ____opt_2 = recast.close
    if ____opt_2 ~= nil then
        ____opt_2(recast)
    end
    return recast
end
function LegendField.prototype.OnIntervalThink(self)
    if not ____exports.valid(self:hero()) then
        self:clear()
        return
    end
    local time = ____exports.now()
    for ____, ____value in __TS__Iterator(self.recasts) do
        local name = ____value[1]
        local recast = ____value[2]
        if recast.time <= time then
            self:consume(name)
        end
    end
    local ready = __TS__ArrayFilter(
        self.cues,
        function(____, cue) return cue.time <= time end
    )
    self.cues = __TS__ArrayFilter(
        self.cues,
        function(____, cue) return cue.time > time end
    )
    for ____, cue in ipairs(ready) do
        self:cleanupCue(cue)
        if ____exports.valid(self:hero()) then
            cue:fire()
        end
    end
    for ____, motion in ipairs({unpack(self.motions)}) do
        if not ____exports.valid(self:hero()) then
            break
        end
        local progress = math.max(
            0,
            math.min(1, (time - motion.start) / motion.duration)
        )
        motion:move(progress)
        if progress >= 1 then
            local index = __TS__ArrayIndexOf(self.motions, motion)
            if index >= 0 then
                __TS__ArraySplice(self.motions, index, 1)
                motion:cleanup()
            end
        end
    end
end
function LegendField.prototype.cleanupCue(self, cue)
    for ____, mark in ipairs(cue.marks) do
        ____exports.stop(mark)
    end
    local ____this_5
    ____this_5 = cue
    local ____opt_4 = ____this_5.cleanup
    if ____opt_4 ~= nil then
        ____opt_4(____this_5)
    end
end
function LegendField.prototype.clear(self)
    for ____, cue in ipairs(self.cues) do
        self:cleanupCue(cue)
    end
    for ____, motion in ipairs(self.motions) do
        motion:cleanup()
    end
    self.cues = {}
    self.motions = {}
    for ____, ____value in __TS__Iterator(self.recasts) do
        local name = ____value[1]
        self:consume(name)
    end
end
function LegendField.prototype.OnDestroy(self)
    if IsServer() then
        self:clear()
    end
end
return ____exports
