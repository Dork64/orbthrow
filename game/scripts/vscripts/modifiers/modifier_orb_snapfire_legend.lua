local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local ____exports = {}
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
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
local ring = ____legendfield.ring
local stop = ____legendfield.stop
local Q = "snapfire_scatterblast"
local W = "snapfire_firesnap_cookie"
local E = "snapfire_lil_shredder"
local R = "snapfire_mortimer_kisses"
local BANK = "orb_snapfire_bank"
local SPRING = "orb_snapfire_spring"
local BLAST = "particles/units/heroes/hero_snapfire/snapfire_flaming_creep_impact.vpcf"
local WEAPON = "models/heroes/snapfire/snapfire_weapon.vmdl"
local function orange()
    return Vector(255, 125, 50)
end
____exports.SnapfireLegends = __TS__Class()
local SnapfireLegends = ____exports.SnapfireLegends
SnapfireLegends.name = "SnapfireLegends"
__TS__ClassExtends(SnapfireLegends, LegendField)
function SnapfireLegends.prototype.____constructor(self, ...)
    LegendField.prototype.____constructor(self, ...)
    self.rounds = __TS__New(Set)
end
function SnapfireLegends.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_EVENT_ON_ATTACK_RECORD,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_EVENT_ON_ATTACK_RECORD_DESTROY,
        MODIFIER_EVENT_ON_DEATH
    }
end
function SnapfireLegends.prototype.OnAbilityFullyCast(self, event)
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
            do
                if not self:owns("snap_l_scatter") then
                    return
                end
                local mark = ring(
                    point,
                    95,
                    orange()
                )
                local muzzle = Vector(point.x, point.y, point.z + 44)
                local model = prop(
                    WEAPON,
                    muzzle,
                    1.15,
                    direction(
                        point,
                        ability:GetCursorPosition(),
                        hero:GetForwardVector()
                    )
                )
                local function clear()
                    stop(mark)
                    removeProp(model)
                    self.barrel = nil
                end
                if self:open(ability, BANK, 3, clear) then
                    self.barrel = point
                else
                    clear()
                end
                break
            end
        end
        ____cond6 = ____cond6 or ____switch6 == W
        if ____cond6 then
            if self:owns("snap_l_cookie") and ability:GetCursorTarget() == hero then
                local lands = now() + math.max(
                    0.2,
                    ability:GetSpecialValueFor("jump_duration")
                )
                self.flight = {ability = ability, from = point, lands = lands, expires = lands + 0.55}
            end
            break
        end
        ____cond6 = ____cond6 or ____switch6 == E
        if ____cond6 then
            if not self:owns("snap_l_shredder") then
                return
            end
            self:clearTurret()
            flash(BLAST, point)
            self.turret = {
                ability = ability,
                point = point,
                ["until"] = now() + ability:GetSpecialValueFor("AbilityDuration"),
                mark = ring(
                    point,
                    115,
                    orange()
                ),
                shots = 0,
                hits = 0,
                last = -1,
                model = prop(
                    WEAPON,
                    Vector(point.x, point.y, point.z + 76),
                    1.55,
                    hero:GetForwardVector()
                )
            }
            break
        end
        ____cond6 = ____cond6 or ____switch6 == R
        if ____cond6 then
            if self:owns("snap_l_mortimer") then
                self:barrage(ability, point)
            end
            break
        end
    until true
end
function SnapfireLegends.prototype.Bank(self, point)
    local from = self.barrel
    local cast = self:consume(BANK)
    if not from or not cast then
        return
    end
    local aim = direction(
        from,
        point,
        self:hero():GetForwardVector()
    )
    local to = offset(
        from,
        aim,
        self:awake() and 1150 or 900
    )
    local width = self:owns("snap_p_grit") and 180 or 135
    local damage = 290 + (self:owns("snap_p_buckshot") and 65 or 0)
    local marks = self:lane(
        from,
        to,
        width,
        orange()
    )
    self:after(
        0.6,
        marks,
        function()
            flash(BLAST, from)
            flash(
                BLAST,
                offset(
                    from,
                    aim,
                    distance(from, to) / 2
                )
            )
            flash(BLAST, to)
            for ____, target in ipairs(self:line(from, to, width)) do
                self:hit(cast.native, target, damage)
            end
        end
    )
end
function SnapfireLegends.prototype.Spring(self, point)
    local ability = self.spring
    local hero = self:hero()
    if not ability or hero:IsRooted() or hero:IsCurrentlyHorizontalMotionControlled() or hero:IsCurrentlyVerticalMotionControlled() then
        return
    end
    local from = hero:GetAbsOrigin()
    local aim = direction(
        from,
        point,
        hero:GetForwardVector()
    )
    local length = math.min(
        distance(from, point),
        self:owns("snap_p_fullbelly") and 495 or 430
    )
    local to = GetGroundPosition(
        offset(from, aim, length),
        hero
    )
    if length < 80 or not legal(to) or not GridNav:CanFindPath(from, to) then
        return
    end
    self:consume(SPRING)
    local radius = self:awake() and 310 or 255
    local damage = 225 + (self:owns("snap_p_shockwave") and 55 or 0)
    local center = offset(from, aim, -100)
    local hop = hero:AddNewModifier(hero, ability, "modifier_knockback", {
        center_x = center.x,
        center_y = center.y,
        center_z = center.z,
        duration = 0.42,
        knockback_duration = 0.42,
        knockback_distance = length,
        knockback_height = 185,
        should_stun = 0
    })
    if not hop then
        return
    end
    self:after(
        0.45,
        {ring(
            to,
            radius,
            orange()
        )},
        function()
            if distance(
                hero:GetAbsOrigin(),
                to
            ) > 110 then
                return
            end
            flash(BLAST, to)
            for ____, target in ipairs(self:area(to, radius)) do
                self:hit(ability, target, damage)
            end
        end
    )
end
function SnapfireLegends.prototype.OnAttackRecord(self, event)
    local hero = self:hero()
    if not IsServer() or not self.turret or event.attacker ~= hero or event.no_attack_cooldown or not hero:HasModifier("modifier_snapfire_lil_shredder_buff") then
        return
    end
    self.rounds:add(event.record)
end
function SnapfireLegends.prototype.OnAttackRecordDestroy(self, event)
    if IsServer() and event.attacker == self:hero() then
        self.rounds:delete(event.record)
    end
end
function SnapfireLegends.prototype.OnAttackLanded(self, event)
    local turret = self.turret
    local hero = self:hero()
    if not IsServer() or not turret or event.attacker ~= hero or event.no_attack_cooldown or not opponent(hero, event.target) or now() >= turret["until"] or now() - turret.last < 0.075 or distance(
        turret.point,
        event.target:GetAbsOrigin()
    ) > 1150 or not self.rounds:delete(event.record) then
        return
    end
    turret.last = now()
    local ____turret_0, ____hits_1 = turret, "hits"
    local ____turret_hits_2 = ____turret_0[____hits_1] + 1
    ____turret_0[____hits_1] = ____turret_hits_2
    if ____turret_hits_2 % 2 ~= 0 then
        return
    end
    if turret.shots >= (self:owns("snap_p_hotlead") and 4 or 3) then
        return
    end
    turret.shots = turret.shots + 1
    local aim = direction(
        turret.point,
        event.target:GetAbsOrigin(),
        hero:GetForwardVector()
    )
    local to = offset(
        turret.point,
        aim,
        math.min(
            1150,
            distance(
                turret.point,
                event.target:GetAbsOrigin()
            ) + 115
        )
    )
    if turret.model and IsValidEntity(turret.model) then
        turret.model:SetForwardVector(aim)
    end
    local marks = self:lane(
        turret.point,
        to,
        100,
        orange()
    )
    local damage = self:awake() and 185 or 140
    self:after(
        self:owns("snap_p_shred") and 0.45 or 0.6,
        marks,
        function()
            flash(BLAST, turret.point)
            flash(BLAST, to)
            for ____, target in ipairs(self:line(turret.point, to, 100)) do
                self:hit(turret.ability, target, damage, DAMAGE_TYPE_PHYSICAL)
            end
        end
    )
end
function SnapfireLegends.prototype.barrage(self, ability, from)
    local cursor = ability:GetCursorPosition()
    local aim = direction(
        from,
        cursor,
        self:hero():GetForwardVector()
    )
    local side = Vector(-aim.y, aim.x, 0)
    local middle = offset(
        from,
        aim,
        math.min(
            2400,
            math.max(
                600,
                distance(from, cursor)
            )
        )
    )
    local radius = self:owns("snap_p_shelter") and 290 or 250
    local damage = 255 + (self:owns("snap_p_napalm") and 60 or 0)
    local spots = {
        offset(
            offset(middle, aim, -360),
            side,
            -230
        ),
        offset(middle, side, 230)
    }
    if self:awake() then
        spots[#spots + 1] = offset(
            offset(middle, aim, 350),
            side,
            -150
        )
    end
    local hit = __TS__New(Set)
    __TS__ArrayForEach(
        spots,
        function(____, position, index)
            local point = GetGroundPosition(position, nil)
            self:after(
                1.15 + 0.55 * index,
                {ring(
                    point,
                    radius,
                    orange()
                )},
                function()
                    flash(BLAST, point)
                    for ____, target in ipairs(self:area(point, radius)) do
                        do
                            if hit:has(target:entindex()) then
                                goto __continue44
                            end
                            hit:add(target:entindex())
                            self:hit(ability, target, damage)
                        end
                        ::__continue44::
                    end
                end
            )
        end
    )
end
function SnapfireLegends.prototype.OnIntervalThink(self)
    LegendField.prototype.OnIntervalThink(self)
    if not IsServer() or not self:hero():IsAlive() then
        return
    end
    if self.turret and self.turret["until"] <= now() then
        self:clearTurret()
    end
    local flight = self.flight
    local hero = self:hero()
    if not flight or now() < flight.lands then
        return
    end
    if now() > flight.expires then
        self.flight = nil
        return
    end
    if hero:IsCurrentlyHorizontalMotionControlled() or hero:IsCurrentlyVerticalMotionControlled() then
        return
    end
    self.flight = nil
    if distance(
        flight.from,
        hero:GetAbsOrigin()
    ) < 140 then
        return
    end
    if self:open(
        flight.ability,
        SPRING,
        self:awake() and 2 or 1.45,
        function()
            self.spring = nil
        end
    ) then
        self.spring = flight.ability
    end
end
function SnapfireLegends.prototype.clearTurret(self)
    if self.turret then
        stop(self.turret.mark)
        removeProp(self.turret.model)
    end
    self.rounds:clear()
    self.turret = nil
end
function SnapfireLegends.prototype.clear(self)
    LegendField.prototype.clear(self)
    self:clearTurret()
    self.flight = nil
end
function SnapfireLegends.prototype.OnDeath(self, event)
    if IsServer() and event.unit == self:hero() then
        self:clear()
    end
end
modifier_orb_snapfire_legend = registerModifier("modifier_orb_snapfire_legend", ____exports.SnapfireLegends)
return ____exports
