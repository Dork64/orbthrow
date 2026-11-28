local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArrayFlatMap = ____lualib.__TS__ArrayFlatMap
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____legendfield = require("lib.legendfield")
local direction = ____legendfield.direction
local distance = ____legendfield.distance
local effect = ____legendfield.effect
local flash = ____legendfield.flash
local LegendField = ____legendfield.LegendField
local now = ____legendfield.now
local offset = ____legendfield.offset
local opponent = ____legendfield.opponent
local ring = ____legendfield.ring
local stop = ____legendfield.stop
local Q = "lich_frost_nova"
local W = "lich_frost_shield"
local E = "lich_sinister_gaze"
local R = "lich_chain_frost"
local NOVA = "particles/units/heroes/hero_lich/lich_frost_nova.vpcf"
local ICE = "particles/units/heroes/hero_lich/lich_chain_frost_explode.vpcf"
local SATELLITE = "particles/units/heroes/hero_lich/lich_chain_frost_frostbound_marker_glow.vpcf"
local BEAM = "particles/units/heroes/hero_lich/lich_chain_frost_explode_beam.vpcf"
local SHIELD = "modifier_lich_frost_shield"
local function blue()
    return Vector(110, 205, 255)
end
____exports.LichLegends = __TS__Class()
local LichLegends = ____exports.LichLegends
LichLegends.name = "LichLegends"
__TS__ClassExtends(LichLegends, LegendField)
function LichLegends.prototype.____constructor(self, ...)
    LegendField.prototype.____constructor(self, ...)
    self.chainUntil = 0
end
function LichLegends.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_START,
        MODIFIER_EVENT_ON_ABILITY_EXECUTED,
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_EVENT_ON_ABILITY_END_CHANNEL,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_EVENT_ON_DEATH
    }
end
function LichLegends.prototype.OnAbilityStart(self, event)
    if not IsServer() or event.unit ~= self:hero() then
        return
    end
    local ability = event.ability
    local ____until = now() + ability:GetCastPoint() + 0.55
    if ability:GetAbilityName() == Q and self:owns("lich_l_nova") then
        self.nova = {
            target = ability:GetCursorTarget(),
            ["until"] = ____until
        }
    end
end
function LichLegends.prototype.OnAbilityExecuted(self, event)
    if not IsServer() or event.unit ~= self:hero() or event.ability:GetAbilityName() ~= E or not self:owns("lich_l_trance") then
        return
    end
    local ability = event.ability
    local target = ability:GetCursorTarget()
    self.gaze = {
        start = now(),
        target = target,
        aim = target and target:GetAbsOrigin() or ability:GetCursorPosition()
    }
end
function LichLegends.prototype.OnAbilityFullyCast(self, event)
    if not IsServer() or event.unit ~= self:hero() then
        return
    end
    local ability = event.ability
    repeat
        local ____switch11 = ability:GetAbilityName()
        local ____cond11 = ____switch11 == W
        if ____cond11 then
            if self:owns("lich_l_shield") and ability:GetCursorTarget() == self:hero() then
                self.shell = {
                    ability = ability,
                    ["until"] = now() + ability:GetSpecialValueFor("duration"),
                    hits = 0
                }
            end
            break
        end
        ____cond11 = ____cond11 or ____switch11 == E
        if ____cond11 then
            if not self.gaze and ability:IsChanneling() then
                self:OnAbilityExecuted(event)
            end
            break
        end
        ____cond11 = ____cond11 or ____switch11 == R
        if ____cond11 then
            if self:owns("lich_l_chain") then
                self.chainUntil = now() + 5
            end
            break
        end
    until true
end
function LichLegends.prototype.OnTakeDamage(self, event)
    if not IsServer() or not self:isNativeDamage(event) or not event.inflictor then
        return
    end
    local ability = event.inflictor
    local name = ability:GetAbilityName()
    if name == Q and self.nova and self.nova["until"] >= now() and self.nova.target == event.unit then
        self.nova = nil
        local point = event.unit:GetAbsOrigin()
        local radius = 255 + (self:awake() and 45 or 0)
        local damage = 230 + (self:owns("lich_p_blast") and 65 or 0)
        local delay = self:owns("lich_p_cold") and 0.8 or 1
        self:after(
            delay,
            {ring(
                point,
                radius,
                blue()
            )},
            function()
                flash(NOVA, point)
                for ____, target in ipairs(self:area(point, radius)) do
                    self:hit(ability, target, damage)
                end
            end
        )
    end
    if name == R and self.chainUntil > now() then
        self.chainUntil = 0
        self:startOrbit(ability, event.unit)
    end
end
function LichLegends.prototype.startOrbit(self, ability, carrier)
    if self.orbit then
        self:clearOrbit(self.orbit)
    end
    local hero = self:hero()
    local since = now()
    local duration = self:owns("lich_p_frostbound") and 4.2 or 3.5
    local icon = carrier:AddNewModifier(hero, ability, "modifier_orb_lich_satellite", {duration = duration})
    if not icon then
        return
    end
    local radius = 290
    local point = carrier:GetAbsOrigin()
    local orb = effect(
        SATELLITE,
        Vector(point.x + radius, point.y, point.z + 80)
    )
    local orbs = {orb}
    if self:awake() then
        orbs[#orbs + 1] = effect(
            SATELLITE,
            Vector(point.x - radius, point.y, point.z + 80)
        )
    end
    self.orbit = {
        carrier = carrier,
        ability = ability,
        since = since,
        ends = since + duration,
        radius = radius,
        icon = icon,
        orbs = orbs,
        damage = 290 + (self:owns("lich_p_soul") and 65 or 0),
        hit = __TS__New(Set)
    }
end
function LichLegends.prototype.OnIntervalThink(self)
    LegendField.prototype.OnIntervalThink(self)
    if not IsServer() then
        return
    end
    local orbit = self.orbit
    if not orbit then
        return
    end
    local time = now()
    if time >= orbit.ends or not opponent(
        self:hero(),
        orbit.carrier
    ) or orbit.icon:IsNull() then
        self:clearOrbit(orbit)
        return
    end
    local origin = orbit.carrier:GetAbsOrigin()
    __TS__ArrayForEach(
        orbit.orbs,
        function(____, orb, index)
            local angle = (time - orbit.since) * 2.75 + math.pi * index
            local point = Vector(
                origin.x + orbit.radius * math.cos(angle),
                origin.y + orbit.radius * math.sin(angle),
                origin.z + 80
            )
            ParticleManager:SetParticleControl(orb, 0, point)
            if time - orbit.since < 0.45 then
                return
            end
            for ____, target in ipairs(self:area(point, 110)) do
                do
                    local id = target:entindex()
                    if orbit.hit:has(id) then
                        goto __continue32
                    end
                    orbit.hit:add(id)
                    flash(
                        ICE,
                        target:GetAbsOrigin()
                    )
                    self:hit(orbit.ability, target, orbit.damage)
                end
                ::__continue32::
            end
        end
    )
end
function LichLegends.prototype.clearOrbit(self, orbit)
    for ____, orb in ipairs(orbit.orbs) do
        stop(orb)
    end
    if not orbit.icon:IsNull() then
        orbit.icon:Destroy()
    end
    self.orbit = nil
end
function LichLegends.prototype.clear(self)
    LegendField.prototype.clear(self)
    if self.orbit then
        self:clearOrbit(self.orbit)
    end
end
function LichLegends.prototype.OnAttackLanded(self, event)
    local shell = self.shell
    local hero = self:hero()
    if not IsServer() or event.target ~= hero or not shell or now() > shell["until"] or not hero:HasModifier(SHIELD) or event.no_attack_cooldown or not opponent(hero, event.attacker) then
        return
    end
    local ____shell_2, ____hits_3 = shell, "hits"
    local ____shell_hits_4 = ____shell_2[____hits_3] + 1
    ____shell_2[____hits_3] = ____shell_hits_4
    if ____shell_hits_4 < 3 then
        return
    end
    self.shell = nil
    local from = hero:GetAbsOrigin()
    local aim = direction(
        from,
        event.attacker:GetAbsOrigin(),
        hero:GetForwardVector()
    )
    local length = 710 + (self:owns("lich_p_icy") and 140 or 0)
    local damage = (self:awake() and 270 or 215) + (self:owns("lich_p_thorns") and 45 or 0)
    local lanes = __TS__ArrayMap(
        {-0.38, 0, 0.38},
        function(____, angle) return offset(
            from,
            Vector(
                aim.x * math.cos(angle) - aim.y * math.sin(angle),
                aim.y * math.cos(angle) + aim.x * math.sin(angle),
                0
            ),
            length
        ) end
    )
    self:after(
        0.65,
        __TS__ArrayFlatMap(
            lanes,
            function(____, ____end) return self:lane(
                from,
                ____end,
                85,
                blue()
            ) end
        ),
        function()
            local hit = __TS__New(Set)
            for ____, ____end in ipairs(lanes) do
                flash(BEAM, from, ____end)
                for ____, target in ipairs(self:line(from, ____end, 85)) do
                    do
                        if hit:has(target:entindex()) then
                            goto __continue48
                        end
                        hit:add(target:entindex())
                        self:hit(shell.ability, target, damage)
                    end
                    ::__continue48::
                end
            end
        end
    )
end
function LichLegends.prototype.OnAbilityEndChannel(self, event)
    if not IsServer() or event.unit ~= self:hero() or event.ability:GetAbilityName() ~= E then
        return
    end
    local gaze = self.gaze
    self.gaze = nil
    if not gaze or event.interrupted == true or event.interrupted == 1 or now() - gaze.start < 0.72 then
        return
    end
    local ability = event.ability
    local from = self:hero():GetAbsOrigin()
    local point = opponent(
        self:hero(),
        gaze.target
    ) and gaze.target:GetAbsOrigin() or gaze.aim
    local aim = direction(
        from,
        point,
        self:hero():GetForwardVector()
    )
    local to = offset(
        from,
        aim,
        math.min(
            950,
            math.max(
                430,
                distance(from, point) + 250
            )
        )
    )
    local width = self:owns("lich_p_focus") and 155 or 115
    local damage = (self:awake() and 315 or 245) + (self:owns("lich_p_drain") and 55 or 0)
    self:after(
        0.8,
        self:lane(
            from,
            to,
            width,
            blue()
        ),
        function()
            flash(BEAM, from, to)
            for ____, target in ipairs(self:line(from, to, width)) do
                self:hit(ability, target, damage)
            end
        end
    )
end
function LichLegends.prototype.OnDeath(self, event)
    if not IsServer() or event.unit ~= self:hero() then
        return
    end
    self.gaze = nil
    self.shell = nil
    self.nova = nil
    self.chainUntil = 0
    self:clear()
end
modifier_orb_lich_legend = registerModifier("modifier_orb_lich_legend", ____exports.LichLegends)
local Satellite = __TS__Class()
Satellite.name = "Satellite"
__TS__ClassExtends(Satellite, ModBase)
function Satellite.prototype.IsDebuff(self)
    return true
end
function Satellite.prototype.IsPurgable(self)
    return false
end
function Satellite.prototype.IsPurgeException(self)
    return true
end
function Satellite.prototype.GetTexture(self)
    return "lich_chain_frost"
end
modifier_orb_lich_satellite = registerModifier("modifier_orb_lich_satellite", Satellite)
return ____exports
