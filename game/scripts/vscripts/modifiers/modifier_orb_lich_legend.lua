local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____legendfield = require("lib.legendfield")
local direction = ____legendfield.direction
local distance = ____legendfield.distance
local flash = ____legendfield.flash
local LegendField = ____legendfield.LegendField
local now = ____legendfield.now
local offset = ____legendfield.offset
local opponent = ____legendfield.opponent
local prop = ____legendfield.prop
local removeProp = ____legendfield.removeProp
local ring = ____legendfield.ring
local stop = ____legendfield.stop
local vulnerable = ____legendfield.vulnerable
local Q = "lich_frost_nova"
local W = "lich_frost_shield"
local E = "lich_sinister_gaze"
local R = "lich_chain_frost"
local NOVA = "particles/units/heroes/hero_lich/lich_frost_nova.vpcf"
local ICE = "particles/units/heroes/hero_lich/lich_chain_frost_explode.vpcf"
local BEAM = "particles/units/heroes/hero_lich/lich_chain_frost_explode_beam.vpcf"
local FRACTURE = "models/orbthrow/legend_props/ice_fracture.vmdl"
local SATELLITE = "models/orbthrow/legend_props/ice_satellite.vmdl"
local MIRROR = "models/orbthrow/legend_props/ice_mirror.vmdl"
local SHIELD = "modifier_lich_frost_shield"
local function PALE()
    return Vector(145, 220, 255)
end
local TRACK_TIME = 1.65
local DIVE_TIME = 0.85
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
    if ability:GetAbilityName() == Q and self:owns("lich_l_nova") then
        self.nova = {
            target = event.target or ability:GetCursorTarget(),
            ["until"] = now() + ability:GetCastPoint() + 0.4
        }
    end
end
function LichLegends.prototype.OnAbilityExecuted(self, event)
    if not IsServer() or event.unit ~= self:hero() then
        return
    end
    local ability = event.ability
    local name = ability:GetAbilityName()
    if name == R and self:owns("lich_l_chain") then
        self.chainUntil = now() + 6
    end
    if name ~= E or not self:owns("lich_l_trance") then
        return
    end
    local target = event.target or ability:GetCursorTarget()
    local aim = opponent(
        self:hero(),
        target
    ) and target:GetAbsOrigin() or ability:GetCursorPosition()
    self.gaze = {
        start = now(),
        target = target,
        aim = aim
    }
end
function LichLegends.prototype.OnAbilityFullyCast(self, event)
    if not IsServer() or event.unit ~= self:hero() then
        return
    end
    local ability = event.ability
    repeat
        local ____switch13 = ability:GetAbilityName()
        local ____cond13 = ____switch13 == W
        if ____cond13 then
            if self:owns("lich_l_shield") and (event.target or ability:GetCursorTarget()) == self:hero() then
                self.shell = {
                    ability = ability,
                    ["until"] = now() + ability:GetSpecialValueFor("duration"),
                    hits = 0
                }
            end
            break
        end
        ____cond13 = ____cond13 or ____switch13 == E
        if ____cond13 then
            if not self.gaze and ability:IsChanneling() then
                self:OnAbilityExecuted(event)
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
    if name == Q and self.nova and self.nova["until"] >= now() and (not opponent(
        self:hero(),
        self.nova.target
    ) or self.nova.target == event.unit) then
        self.nova = nil
        self:fracture(
            ability,
            event.unit:GetAbsOrigin()
        )
    end
    if name == R and self.chainUntil > now() and vulnerable(event.unit) then
        self.chainUntil = 0
        self:startOrbit(ability, event.unit)
    end
end
function LichLegends.prototype.fracture(self, ability, target)
    local hero = self:hero()
    local point = GetGroundPosition(target, hero)
    local aim = direction(
        hero:GetAbsOrigin(),
        point,
        hero:GetForwardVector()
    )
    local scale = self:awake() and 1.2 or 1
    local from = offset(point, aim, -210 * scale)
    local to = offset(point, aim, 210 * scale)
    local damage = 320 + (self:owns("lich_p_blast") and 65 or 0)
    local delay = self:owns("lich_p_cold") and 0.55 or 0.75
    local model = prop(
        FRACTURE,
        Vector(point.x, point.y, point.z + 2),
        scale,
        aim
    )
    self:after(
        delay,
        {},
        function()
            for ____, node in ipairs({from, point, to}) do
                flash(NOVA, node)
            end
            for ____, target in ipairs(self:line(from, to, 105 * scale)) do
                self:hit(
                    ability,
                    target,
                    damage + math.min(
                        220,
                        target:GetMaxHealth() * 0.08
                    )
                )
            end
        end,
        function() return removeProp(model) end
    )
end
function LichLegends.prototype.startOrbit(self, ability, carrier)
    if self.orbit then
        self:clearOrbit(self.orbit)
    end
    local hero = self:hero()
    local since = now()
    local icon = carrier:AddNewModifier(hero, ability, "modifier_orb_lich_satellite", {duration = TRACK_TIME + DIVE_TIME + 0.6})
    if not icon then
        return
    end
    local origin = carrier:GetAbsOrigin()
    local awake = self:awake()
    local orbs = __TS__ArrayMap(
        {
            1,
            unpack(awake and ({-1}) or ({}))
        },
        function(____, side)
            local point = Vector(origin.x + side * 265, origin.y, origin.z + 115)
            return {
                model = prop(
                    SATELLITE,
                    point,
                    1.35,
                    hero:GetForwardVector()
                ),
                point = point
            }
        end
    )
    self.orbit = {
        carrier = carrier,
        ability = ability,
        since = since,
        icon = icon,
        orbs = orbs,
        hit = __TS__New(Set),
        radius = self:owns("lich_p_frostbound") and 300 or 255,
        blast = (awake and 650 or 535) + (self:owns("lich_p_soul") and 75 or 0)
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
    if not opponent(
        self:hero(),
        orbit.carrier
    ) or orbit.icon:IsNull() then
        self:clearOrbit(orbit)
        return
    end
    local time = now()
    local origin = orbit.carrier:GetAbsOrigin()
    if not orbit.dive and time - orbit.since >= TRACK_TIME then
        local point = GetGroundPosition(origin, nil)
        orbit.dive = {
            point = point,
            starts = time,
            ring = ring(
                point,
                orbit.radius,
                PALE()
            ),
            sources = __TS__ArrayMap(
                orbit.orbs,
                function(____, orb) return orb.point end
            )
        }
    end
    local dive = orbit.dive
    if dive then
        local progress = math.min(1, (time - dive.starts) / DIVE_TIME)
        __TS__ArrayForEach(
            orbit.orbs,
            function(____, orb, index)
                local from = dive.sources[index + 1]
                local to = dive.point
                self:placeOrb(
                    orb,
                    Vector(
                        from.x + (to.x - from.x) * progress,
                        from.y + (to.y - from.y) * progress,
                        from.z + (to.z + 35 - from.z) * progress + 100 * math.sin(progress * math.pi)
                    ),
                    time + index
                )
            end
        )
        if progress >= 1 then
            self:clearOrbit(orbit)
            flash(ICE, dive.point)
            flash(NOVA, dive.point)
            for ____, target in ipairs(self:area(dive.point, orbit.radius)) do
                self:hit(orbit.ability, target, orbit.blast)
            end
        end
        return
    end
    __TS__ArrayForEach(
        orbit.orbs,
        function(____, orb, index)
            local angle = (time - orbit.since) * 3.5 + math.pi * index
            local point = Vector(
                origin.x + 265 * math.cos(angle),
                origin.y + 265 * math.sin(angle),
                origin.z + 115
            )
            self:placeOrb(orb, point, time + index)
            if time - orbit.since < 0.28 then
                return
            end
            for ____, target in ipairs(self:area(point, 112)) do
                do
                    local id = target:entindex()
                    if orbit.hit:has(id) then
                        goto __continue44
                    end
                    orbit.hit:add(id)
                    flash(
                        ICE,
                        target:GetAbsOrigin()
                    )
                    self:hit(orbit.ability, target, 220)
                end
                ::__continue44::
            end
        end
    )
end
function LichLegends.prototype.placeOrb(self, orb, point, time)
    orb.point = point
    if not orb.model or not IsValidEntity(orb.model) then
        return
    end
    orb.model:SetAbsOrigin(point)
    orb.model:SetAbsAngles(
        15 * math.sin(time * 4),
        time * 260 % 360,
        20
    )
end
function LichLegends.prototype.clearOrbit(self, orbit)
    self.orbit = nil
    if orbit.dive then
        stop(orbit.dive.ring)
    end
    for ____, orb in ipairs(orbit.orbs) do
        removeProp(orb.model)
    end
    if not orbit.icon:IsNull() then
        orbit.icon:Destroy()
    end
end
function LichLegends.prototype.OnAttackLanded(self, event)
    local shell = self.shell
    local hero = self:hero()
    if not IsServer() or not shell or now() > shell["until"] or not hero:HasModifier(SHIELD) or event.no_attack_cooldown then
        return
    end
    local foe = event.target == hero and event.attacker or (event.attacker == hero and event.target or nil)
    local ____temp_3 = not opponent(hero, foe)
    if not ____temp_3 then
        local ____shell_0, ____hits_1 = shell, "hits"
        local ____shell_hits_2 = ____shell_0[____hits_1] + 1
        ____shell_0[____hits_1] = ____shell_hits_2
        ____temp_3 = ____shell_hits_2 < 2
    end
    if ____temp_3 then
        return
    end
    self.shell = nil
    local from = hero:GetAbsOrigin()
    local aim = direction(
        from,
        foe:GetAbsOrigin(),
        hero:GetForwardVector()
    )
    local length = 710 + (self:owns("lich_p_icy") and 140 or 0)
    local damage = (self:awake() and 440 or 350) + (self:owns("lich_p_thorns") and 45 or 0)
    local lanes = __TS__ArrayMap(
        {-0.36, 0, 0.36},
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
    local cleanup = __TS__ArrayMap(
        lanes,
        function(____, ____end) return self:tiles(
            FRACTURE,
            offset(
                from,
                direction(from, ____end, aim),
                190
            ),
            ____end,
            0.55,
            430
        ) end
    )
    self:after(
        0.6,
        {},
        function()
            local hit = __TS__New(Set)
            for ____, ____end in ipairs(lanes) do
                self:transient(BEAM, from, 0.45, ____end)
                for ____, target in ipairs(self:line(from, ____end, 88)) do
                    do
                        if hit:has(target:entindex()) then
                            goto __continue61
                        end
                        hit:add(target:entindex())
                        self:hit(shell.ability, target, damage)
                    end
                    ::__continue61::
                end
            end
        end,
        function()
            for ____, clear in ipairs(cleanup) do
                clear()
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
    local width = self:owns("lich_p_focus") and 150 or 110
    local damage = (self:awake() and 485 or 390) + (self:owns("lich_p_drain") and 65 or 0)
    local mirror = prop(
        MIRROR,
        offset(
            GetGroundPosition(from, nil),
            aim,
            48
        ),
        1.15,
        aim
    )
    local cleanup = self:tiles(
        FRACTURE,
        from,
        to,
        0.6,
        440
    )
    self:after(
        0.65,
        {},
        function()
            self:transient(BEAM, from, 0.55, to)
            for ____, target in ipairs(self:line(from, to, width)) do
                self:hit(ability, target, damage)
            end
        end,
        function()
            removeProp(mirror)
            cleanup()
        end
    )
end
function LichLegends.prototype.clear(self)
    LegendField.prototype.clear(self)
    if self.orbit then
        self:clearOrbit(self.orbit)
    end
    self.gaze = nil
    self.shell = nil
    self.nova = nil
    self.chainUntil = 0
end
function LichLegends.prototype.OnDeath(self, event)
    if IsServer() and event.unit == self:hero() then
        self:clear()
    end
end
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
function Satellite.prototype.IgnoreTenacity(self)
    return true
end
function Satellite.prototype.GetTexture(self)
    return "lich_chain_frost"
end
modifier_orb_lich_legend = registerModifier("modifier_orb_lich_legend", ____exports.LichLegends)
modifier_orb_lich_satellite = registerModifier("modifier_orb_lich_satellite", Satellite)
return ____exports
