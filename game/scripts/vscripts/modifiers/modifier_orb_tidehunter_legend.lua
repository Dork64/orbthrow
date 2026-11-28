local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local ____exports = {}
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____legendfield = require("lib.legendfield")
local direction = ____legendfield.direction
local distance = ____legendfield.distance
local legal = ____legendfield.legal
local LegendField = ____legendfield.LegendField
local now = ____legendfield.now
local offset = ____legendfield.offset
local opponent = ____legendfield.opponent
local prop = ____legendfield.prop
local removeProp = ____legendfield.removeProp
local resizeRing = ____legendfield.resizeRing
local ring = ____legendfield.ring
local stop = ____legendfield.stop
local Q = "tidehunter_gush"
local W = "tidehunter_kraken_shell"
local E = "tidehunter_anchor_smash"
local R = "tidehunter_ravage"
local RETURN = "orb_tide_anchor_return"
local RELEASE = "orb_tide_shell_release"
local SPLASH = "particles/units/heroes/hero_tidehunter/tidehunter_gush_splash.vpcf"
local CREST = "models/orbthrow/legend_props/undertow_crest.vmdl"
local TRACK = "models/orbthrow/legend_props/undertow_track.vmdl"
local CARAPACE = "models/heroes/tidehunter/tidehunter_kraken_shell.vmdl"
local WAVE_SPEED = 1450
local ANCHOR = "models/heroes/tidehunter/tidehunter_anchor.vmdl"
local function teal()
    return Vector(75, 240, 185)
end
local EYE = 295
local MIN_SURGE_DELAY = 3.2
local SURGE_TIME = 1.2
____exports.TidehunterLegends = __TS__Class()
local TidehunterLegends = ____exports.TidehunterLegends
TidehunterLegends.name = "TidehunterLegends"
__TS__ClassExtends(TidehunterLegends, LegendField)
function TidehunterLegends.prototype.DeclareFunctions(self)
    return {MODIFIER_EVENT_ON_ABILITY_FULLY_CAST, MODIFIER_EVENT_ON_TAKEDAMAGE, MODIFIER_EVENT_ON_DEATH}
end
function TidehunterLegends.prototype.OnAbilityFullyCast(self, event)
    local hero = self:hero()
    if not IsServer() or event.unit ~= hero then
        return
    end
    local ability = event.ability
    local point = hero:GetAbsOrigin()
    repeat
        local ____switch6 = ability:GetAbilityName()
        local ____cond6 = ____switch6 == Q
        if ____cond6 then
            if self:owns("tide_l_gush") then
                self.tide = {
                    from = point,
                    ["until"] = now() + (hero:HasScepter() and 2.1 or 1)
                }
            end
            break
        end
        ____cond6 = ____cond6 or ____switch6 == W
        if ____cond6 then
            do
                if not self:owns("tide_l_shell") then
                    return
                end
                if self.shell then
                    self:clearShell(self.shell)
                end
                local duration = math.max(
                    1,
                    ability:GetSpecialValueFor("active_duration")
                )
                local radius = self:owns("tide_p_brine") and 525 or 460
                local models = {}
                do
                    local i = 0
                    while i < 3 do
                        local model = prop(
                            CARAPACE,
                            point,
                            1.15,
                            hero:GetForwardVector()
                        )
                        if model then
                            models[#models + 1] = model
                        end
                        i = i + 1
                    end
                end
                local shell = {
                    ability = ability,
                    models = models,
                    radius = radius,
                    start = now(),
                    ["until"] = now() + duration,
                    stored = 0,
                    icon = hero:AddNewModifier(hero, ability, "modifier_orb_tide_pressure", {duration = duration})
                }
                self.shell = shell
                self:open(ability, RELEASE, duration)
                self:tickShell(shell)
                break
            end
        end
        ____cond6 = ____cond6 or ____switch6 == E
        if ____cond6 then
            do
                if not self:owns("tide_l_anchor") then
                    return
                end
                local model = prop(
                    ANCHOR,
                    Vector(point.x, point.y, point.z + 42),
                    0.9,
                    hero:GetForwardVector()
                )
                local function clear()
                    removeProp(model)
                    self.anchor = nil
                end
                if self:open(
                    ability,
                    RETURN,
                    self:awake() and 2.7 or 2.1,
                    clear
                ) then
                    self.anchor = point
                else
                    clear()
                end
                break
            end
        end
        ____cond6 = ____cond6 or ____switch6 == R
        if ____cond6 then
            do
                if not self:owns("tide_l_ravage") then
                    return
                end
                if self.whirl then
                    self:clearWhirl(self.whirl)
                end
                local radius = (self:awake() and 950 or 820) + (self:owns("tide_p_bulwark") and 85 or 0)
                local speed = math.max(
                    1,
                    ability:GetSpecialValueFor("speed")
                )
                local stun = ability:GetSpecialValueFor("duration")
                local windup = math.max(MIN_SURGE_DELAY, stun + (radius + 38) / speed + 0.45)
                self.whirl = {
                    ability = ability,
                    from = point,
                    starts = now() + windup,
                    radius = radius,
                    last = radius,
                    outer = ring(
                        point,
                        radius,
                        teal()
                    ),
                    eye = ring(
                        point,
                        EYE,
                        teal()
                    ),
                    crests = {},
                    hit = __TS__New(Set),
                    damage = 345 + (self:owns("tide_p_maelstrom") and 65 or 0)
                }
                do
                    local i = 0
                    while i < 6 do
                        local angle = math.pi * i / 3
                        local along = Vector(
                            math.cos(angle),
                            math.sin(angle),
                            0
                        )
                        local model = prop(
                            CREST,
                            GetGroundPosition(
                                offset(point, along, radius),
                                nil
                            ),
                            0.78,
                            Vector(-along.x, -along.y, 0)
                        )
                        if model then
                            local ____self_whirl_crests_0 = self.whirl.crests
                            ____self_whirl_crests_0[#____self_whirl_crests_0 + 1] = {angle = angle, model = model}
                        end
                        i = i + 1
                    end
                end
                break
            end
        end
    until true
end
function TidehunterLegends.prototype.OnTakeDamage(self, event)
    local hero = self:hero()
    if not IsServer() or bit.band(
        event.damage_flags or 0,
        bit.bor(DOTA_DAMAGE_FLAG_REFLECTION, DOTA_DAMAGE_FLAG_HPLOSS)
    ) ~= 0 then
        return
    end
    local shell = self.shell
    if shell and event.unit == hero and opponent(hero, event.attacker) and not hero:PassivesDisabled() and now() < shell["until"] then
        local cap = (self:awake() and 530 or 410) + (self:owns("tide_p_spikes") and 65 or 0)
        shell.stored = math.min(
            cap,
            shell.stored + math.max(event.original_damage or 0, event.damage) * 0.6
        )
        if shell.icon and not shell.icon:IsNull() then
            shell.icon:SetStackCount(math.floor(shell.stored))
        end
    end
    local tide = self.tide
    local ability = event.inflictor
    if not tide or not ability or ability:GetAbilityName() ~= Q or now() > tide["until"] or not self:isNativeDamage(event) then
        return
    end
    self.tide = nil
    local from = event.unit:GetAbsOrigin()
    local width = 145
    local length = math.min(
        1300,
        math.max(
            400,
            distance(from, tide.from)
        )
    )
    local aim = direction(
        from,
        tide.from,
        hero:GetForwardVector()
    )
    local to = offset(from, aim, length)
    local damage = (self:awake() and 380 or 315) + (self:owns("tide_p_corrode") and 50 or 0)
    local cleanup = self:tiles(TRACK, from, to, 1.25)
    self:after(
        self:owns("tide_p_tide") and 0.56 or 0.74,
        {},
        function()
            local crest = prop(
                CREST,
                GetGroundPosition(from, nil),
                1,
                aim
            )
            local hit = __TS__New(Set)
            local last = from
            local sprayAt = -150
            self:animate(
                length / WAVE_SPEED,
                function(progress)
                    local point = GetGroundPosition(
                        offset(from, aim, length * progress),
                        nil
                    )
                    if crest and IsValidEntity(crest) then
                        crest:SetAbsOrigin(point)
                    end
                    local travelled = length * progress
                    if travelled - sprayAt >= 145 then
                        sprayAt = travelled
                        self:transient(SPLASH, point, 0.75)
                    end
                    local targets = distance(last, point) < 1 and self:area(point, width) or self:line(last, point, width)
                    for ____, target in ipairs(targets) do
                        do
                            if hit:has(target:entindex()) then
                                goto __continue32
                            end
                            hit:add(target:entindex())
                            self:hit(ability, target, damage)
                        end
                        ::__continue32::
                    end
                    last = point
                end,
                function() return removeProp(crest) end
            )
        end,
        cleanup
    )
end
function TidehunterLegends.prototype.ReleaseShell(self)
    local shell = self.shell
    if shell and now() - shell.start >= 0.45 then
        self:burstShell(shell)
    end
end
function TidehunterLegends.prototype.burstShell(self, shell)
    self:clearShell(shell)
    if self:hero():PassivesDisabled() then
        return
    end
    local point = GetGroundPosition(
        self:hero():GetAbsOrigin(),
        nil
    )
    local marker = ring(
        point,
        shell.radius,
        teal()
    )
    local vents = {}
    do
        local i = 0
        while i < 4 do
            local angle = math.pi * i / 2
            local aim = Vector(
                math.cos(angle),
                math.sin(angle),
                0
            )
            local model = prop(
                CREST,
                GetGroundPosition(
                    offset(point, aim, 95),
                    nil
                ),
                0.6,
                aim
            )
            if model then
                vents[#vents + 1] = model
            end
            i = i + 1
        end
    end
    self:after(
        0.42,
        {marker},
        function()
            if self:hero():PassivesDisabled() then
                return
            end
            self:transient(SPLASH, point, 0.8)
            for ____, target in ipairs(self:area(point, shell.radius)) do
                self:hit(shell.ability, target, shell.stored + 225)
            end
        end,
        function()
            for ____, vent in ipairs(vents) do
                removeProp(vent)
            end
        end
    )
end
function TidehunterLegends.prototype.ReturnToAnchor(self)
    local from = self.anchor
    local hero = self:hero()
    if not from or not self:movable(from) then
        return
    end
    local cast = self:consume(RETURN)
    if not cast then
        return
    end
    local radius = self:owns("tide_p_weaken") and 310 or 265
    local damage = 180 + hero:GetAverageTrueAttackDamage(nil) * 0.45 + (self:owns("tide_p_heavy") and 55 or 0)
    local model = prop(
        ANCHOR,
        Vector(from.x, from.y, from.z + 42),
        1,
        hero:GetForwardVector()
    )
    self:after(
        0.35,
        {},
        function()
            if not self:movable(from) or hero:IsStunned() or hero:IsHexed() then
                return
            end
            FindClearSpaceForUnit(hero, from, true)
            local point = hero:GetAbsOrigin()
            if distance(point, from) > 110 then
                return
            end
            self:transient(SPLASH, point, 0.75)
            for ____, target in ipairs(self:area(point, radius)) do
                self:hit(cast.native, target, damage, DAMAGE_TYPE_PHYSICAL)
            end
        end,
        function() return removeProp(model) end
    )
end
function TidehunterLegends.prototype.movable(self, to)
    local hero = self:hero()
    local from = hero:GetAbsOrigin()
    return not hero:IsRooted() and not hero:IsCurrentlyHorizontalMotionControlled() and distance(from, to) <= 720 and legal(to) and GridNav:CanFindPath(from, to)
end
function TidehunterLegends.prototype.OnIntervalThink(self)
    LegendField.prototype.OnIntervalThink(self)
    if not IsServer() or not self:hero():IsAlive() then
        return
    end
    if self.shell then
        self:tickShell(self.shell)
    end
    if self.whirl then
        self:tickWhirl(self.whirl)
    end
end
function TidehunterLegends.prototype.tickShell(self, shell)
    local hero = self:hero()
    local point = hero:GetAbsOrigin()
    if now() >= shell["until"] then
        self:burstShell(shell)
        return
    end
    __TS__ArrayForEach(
        shell.models,
        function(____, model, index)
            if not IsValidEntity(model) then
                return
            end
            local angle = now() * 2.45 + index * 2 * math.pi / 3
            local aim = Vector(
                math.cos(angle),
                math.sin(angle),
                0
            )
            local radius = 112 + math.min(35, shell.stored / 14)
            model:SetAbsOrigin(offset(
                Vector(
                    point.x,
                    point.y,
                    point.z + 92 + 16 * math.sin(angle)
                ),
                aim,
                radius
            ))
            model:SetForwardVector(aim)
        end
    )
end
function TidehunterLegends.prototype.tickWhirl(self, whirl)
    local progress = (now() - whirl.starts) / SURGE_TIME
    local radius = math.max(
        EYE,
        whirl.radius - (whirl.radius - EYE) * math.max(0, progress)
    )
    resizeRing(whirl.outer, radius)
    for ____, crest in ipairs(whirl.crests) do
        do
            if not IsValidEntity(crest.model) then
                goto __continue68
            end
            local angle = crest.angle + now() * 0.72
            local aim = Vector(
                math.cos(angle),
                math.sin(angle),
                0
            )
            crest.model:SetAbsOrigin(GetGroundPosition(
                offset(whirl.from, aim, radius),
                nil
            ))
            crest.model:SetForwardVector(Vector(-aim.x, -aim.y, 0))
        end
        ::__continue68::
    end
    if progress < 0 then
        return
    end
    for ____, target in ipairs(self:area(whirl.from, whirl.last + 38)) do
        do
            local id = target:entindex()
            local length = distance(
                whirl.from,
                target:GetAbsOrigin()
            )
            if length < EYE or length < radius - 38 or whirl.hit:has(id) then
                goto __continue72
            end
            whirl.hit:add(id)
            self:transient(
                SPLASH,
                target:GetAbsOrigin(),
                0.7
            )
            self:hit(whirl.ability, target, whirl.damage)
        end
        ::__continue72::
    end
    whirl.last = radius
    if progress >= 1 then
        self:clearWhirl(whirl)
    end
end
function TidehunterLegends.prototype.clearShell(self, shell)
    self.shell = nil
    self:consume(RELEASE)
    for ____, model in ipairs(shell.models) do
        removeProp(model)
    end
    if shell.icon and not shell.icon:IsNull() then
        shell.icon:Destroy()
    end
end
function TidehunterLegends.prototype.clearWhirl(self, whirl)
    stop(whirl.outer)
    stop(whirl.eye)
    for ____, ____value in ipairs(whirl.crests) do
        local model = ____value.model
        removeProp(model)
    end
    self.whirl = nil
end
function TidehunterLegends.prototype.clear(self)
    LegendField.prototype.clear(self)
    if self.shell then
        self:clearShell(self.shell)
    end
    if self.whirl then
        self:clearWhirl(self.whirl)
    end
    self.tide = nil
end
function TidehunterLegends.prototype.OnDeath(self, event)
    if IsServer() and event.unit == self:hero() then
        self:clear()
    end
end
local Pressure = __TS__Class()
Pressure.name = "Pressure"
__TS__ClassExtends(Pressure, ModBase)
function Pressure.prototype.IsPurgable(self)
    return false
end
function Pressure.prototype.GetTexture(self)
    return "tidehunter_kraken_shell"
end
modifier_orb_tidehunter_legend = registerModifier("modifier_orb_tidehunter_legend", ____exports.TidehunterLegends)
modifier_orb_tide_pressure = registerModifier("modifier_orb_tide_pressure", Pressure)
return ____exports
