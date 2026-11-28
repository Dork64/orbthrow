local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local ____exports = {}
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____legendfield = require("lib.legendfield")
local direction = ____legendfield.direction
local distance = ____legendfield.distance
local flash = ____legendfield.flash
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
local SPLASH = "particles/units/heroes/hero_tidehunter/tidehunter_gush_splash.vpcf"
local GUSH = "particles/units/heroes/hero_tidehunter/tidehunter_gush.vpcf"
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
                local radius = self:owns("tide_p_brine") and 485 or 420
                self.shell = {
                    ability = ability,
                    mark = ring(
                        point,
                        radius,
                        teal()
                    ),
                    radius = radius,
                    ["until"] = now() + duration,
                    stored = 0,
                    icon = hero:AddNewModifier(hero, ability, "modifier_orb_tide_pressure", {duration = duration})
                }
                break
            end
        end
        ____cond6 = ____cond6 or ____switch6 == E
        if ____cond6 then
            do
                if not self:owns("tide_l_anchor") then
                    return
                end
                local mark = ring(
                    point,
                    self:owns("tide_p_weaken") and 310 or 265,
                    teal()
                )
                local model = prop(
                    ANCHOR,
                    Vector(point.x, point.y, point.z + 42),
                    0.9,
                    hero:GetForwardVector()
                )
                local function clear()
                    stop(mark)
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
                    hit = __TS__New(Set),
                    damage = 285 + (self:owns("tide_p_maelstrom") and 65 or 0)
                }
                break
            end
        end
    until true
end
function TidehunterLegends.prototype.OnTakeDamage(self, event)
    local hero = self:hero()
    if not IsServer() or bit.band(event.damage_flags or 0, DOTA_DAMAGE_FLAG_REFLECTION) ~= 0 or event.damage <= 0 then
        return
    end
    local shell = self.shell
    if shell and event.unit == hero and opponent(hero, event.attacker) and not hero:PassivesDisabled() and now() < shell["until"] then
        local cap = (self:awake() and 430 or 330) + (self:owns("tide_p_spikes") and 65 or 0)
        shell.stored = math.min(cap, shell.stored + event.damage * 0.45)
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
    local width = 115
    local length = math.min(
        1150,
        math.max(
            310,
            distance(from, tide.from)
        )
    )
    local aim = direction(
        from,
        tide.from,
        hero:GetForwardVector()
    )
    local to = offset(from, aim, length)
    local damage = (self:awake() and 275 or 215) + (self:owns("tide_p_corrode") and 50 or 0)
    self:after(
        self:owns("tide_p_tide") and 0.8 or 1,
        self:lane(
            from,
            to,
            width,
            teal()
        ),
        function()
            local hit = __TS__New(Set)
            local steps = math.ceil(length / 220)
            do
                local index = 0
                while index < steps do
                    local start = offset(from, aim, length * index / steps)
                    local ____end = offset(from, aim, length * (index + 1) / steps)
                    self:after(
                        index * 0.09,
                        {},
                        function()
                            flash(GUSH, start, ____end)
                            for ____, target in ipairs(self:line(start, ____end, width)) do
                                do
                                    if hit:has(target:entindex()) then
                                        goto __continue27
                                    end
                                    hit:add(target:entindex())
                                    self:hit(ability, target, damage)
                                end
                                ::__continue27::
                            end
                        end
                    )
                    index = index + 1
                end
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
    local damage = 135 + hero:GetAverageTrueAttackDamage(nil) * 0.35 + (self:owns("tide_p_heavy") and 55 or 0)
    self:after(
        0.35,
        {ring(
            from,
            radius,
            teal()
        )},
        function()
            if not self:movable(from) or hero:IsStunned() or hero:IsHexed() then
                return
            end
            FindClearSpaceForUnit(hero, from, true)
            local point = hero:GetAbsOrigin()
            if distance(point, from) > 110 then
                return
            end
            flash(SPLASH, point)
            for ____, target in ipairs(self:area(point, radius)) do
                self:hit(cast.native, target, damage, DAMAGE_TYPE_PHYSICAL)
            end
        end
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
    ParticleManager:SetParticleControl(
        shell.mark,
        0,
        GetGroundPosition(point, hero)
    )
    if now() < shell["until"] then
        return
    end
    self:clearShell(shell)
    if shell.stored < 90 or hero:PassivesDisabled() then
        return
    end
    flash(SPLASH, point)
    for ____, target in ipairs(self:area(point, shell.radius)) do
        self:hit(shell.ability, target, shell.stored + 65)
    end
end
function TidehunterLegends.prototype.tickWhirl(self, whirl)
    local progress = (now() - whirl.starts) / SURGE_TIME
    if progress < 0 then
        return
    end
    local radius = math.max(EYE, whirl.radius - (whirl.radius - EYE) * progress)
    resizeRing(whirl.outer, radius)
    for ____, target in ipairs(self:area(whirl.from, whirl.last + 38)) do
        do
            local id = target:entindex()
            local length = distance(
                whirl.from,
                target:GetAbsOrigin()
            )
            if length < EYE or length < radius - 38 or whirl.hit:has(id) then
                goto __continue50
            end
            whirl.hit:add(id)
            flash(
                SPLASH,
                target:GetAbsOrigin()
            )
            self:hit(whirl.ability, target, whirl.damage)
        end
        ::__continue50::
    end
    whirl.last = radius
    if progress >= 1 then
        self:clearWhirl(whirl)
    end
end
function TidehunterLegends.prototype.clearShell(self, shell)
    stop(shell.mark)
    if shell.icon and not shell.icon:IsNull() then
        shell.icon:Destroy()
    end
    self.shell = nil
end
function TidehunterLegends.prototype.clearWhirl(self, whirl)
    stop(whirl.outer)
    stop(whirl.eye)
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
