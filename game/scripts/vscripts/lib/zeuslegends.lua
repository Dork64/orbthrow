local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local ____exports = {}
local ____fxtypes = require("core.fxtypes")
local fxModifierName = ____fxtypes.fxModifierName
local ____orbstore = require("core.orbstore")
local overrideValue = ____orbstore.overrideValue
local RING = "particles/ui_mouseactions/range_display.vpcf"
local BOLT = "particles/units/heroes/hero_zuus/zuus_lightning_bolt.vpcf"
local ARC = "particles/items_fx/chain_lightning.vpcf"
local ZAP = "Hero_Zuus.LightningBolt"
local function atMost(a, b, range)
    local dx = a.x - b.x
    local dy = a.y - b.y
    return dx * dx + dy * dy <= range * range and math.abs(a.z - b.z) < 170
end
local function livingHero(unit)
    return unit ~= nil and IsValidEntity(unit) and unit:IsAlive() and unit:IsRealHero()
end
local function realFighter(unit)
    return livingHero(unit) and not unit:IsOutOfGame() and not unit:IsInvulnerable()
end
local function ring(pos, radius, color)
    local fx = ParticleManager:CreateParticle(RING, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(fx, 0, pos)
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(radius, 0, 0)
    )
    ParticleManager:SetParticleControl(fx, 2, color)
    return fx
end
local function clearParticle(fx)
    ParticleManager:DestroyParticle(fx, true)
    ParticleManager:ReleaseParticleIndex(fx)
end
local function flash(from, to, pfx, carrier)
    local fx = ParticleManager:CreateParticle(pfx, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(
        fx,
        0,
        Vector(from.x, from.y, from.z + 65)
    )
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(to.x, to.y, to.z + 65)
    )
    ParticleManager:ReleaseParticleIndex(fx)
    EmitSoundOn(ZAP, carrier)
end
____exports.ZeusLegends = __TS__Class()
local ZeusLegends = ____exports.ZeusLegends
ZeusLegends.name = "ZeusLegends"
function ZeusLegends.prototype.____constructor(self, owner, strike)
    self.owner = owner
    self.strike = strike
    self.ballReadyAt = 0
end
function ZeusLegends.prototype.castSpring(self, f, now)
    if self.spring ~= nil and now < self.spring["until"] then
        return
    end
    self:clearSpring()
    local pos = self.owner:GetAbsOrigin()
    self.spring = {
        f = f,
        pos = pos,
        marker = ring(
            pos,
            f.radius,
            Vector(90, 190, 255)
        ),
        ["until"] = now + f.dur,
        armedAt = now + f.arm,
        ownerLeft = false,
        ownerOnly = false
    }
end
function ZeusLegends.prototype.castBall(self, f, ability, b, now)
    if self.ball ~= nil or now < self.ballReadyAt then
        return
    end
    local pos = self.owner:GetAbsOrigin()
    local candidates = FindUnitsInRadius(
        self.owner:GetTeamNumber(),
        pos,
        nil,
        f.range,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
        FIND_CLOSEST,
        false
    )
    local carrier = __TS__ArrayFind(
        candidates,
        function(____, unit) return realFighter(unit) end
    ) or self.owner
    local base = ability:GetLevelSpecialValueNoOverride(
        "damage",
        math.max(
            0,
            ability:GetLevel() - 1
        )
    )
    local amount = (overrideValue(b, f.ab, "damage", base) or base) * f.pct / 100
    local to = carrier:GetAbsOrigin()
    local ball = {
        f = f,
        carrier = carrier,
        marker = ring(
            to,
            120,
            Vector(255, 194, 75)
        ),
        ability = ability,
        ["until"] = now + f.dur,
        passAt = now + f.delay,
        amount = amount
    }
    self.ball = ball
    self.ballReadyAt = ball["until"]
    self:showBall(ball, now)
    flash(pos, to, ARC, carrier)
end
function ZeusLegends.prototype.attack(self, e, now)
    local ball = self.ball
    local ____temp_1 = ball == nil or e.attacker ~= ball.carrier or not realFighter(e.target)
    if not ____temp_1 then
        local ____e_no_attack_cooldown_0 = e.no_attack_cooldown
        if ____e_no_attack_cooldown_0 == nil then
            ____e_no_attack_cooldown_0 = false
        end
        ____temp_1 = ____e_no_attack_cooldown_0
    end
    if ____temp_1 then
        return
    end
    if not atMost(
        e.attacker:GetAbsOrigin(),
        e.target:GetAbsOrigin(),
        ball.f.dist
    ) then
        return
    end
    self:passBall(ball, e.target, now)
end
function ZeusLegends.prototype.bolt(self, target, now)
    local ball = self.ball
    if ball ~= nil and ball.f.bolt and ball.carrier == self.owner and realFighter(target) then
        self:passBall(ball, target, now)
    end
end
function ZeusLegends.prototype.passBall(self, ball, target, now)
    if not realFighter(ball.carrier) or now < ball.passAt or now >= ball["until"] or ball.carrier:GetTeamNumber() == target:GetTeamNumber() then
        return
    end
    local from = ball.carrier:GetAbsOrigin()
    self:clearBallBuff(ball)
    ball.carrier = target
    ball.passAt = now + ball.f.delay
    self:showBall(ball, now)
    flash(
        from,
        target:GetAbsOrigin(),
        ARC,
        target
    )
end
function ZeusLegends.prototype.showBall(self, ball, now)
    ParticleManager:SetParticleControl(
        ball.marker,
        0,
        ball.carrier:GetAbsOrigin()
    )
    ball.buff = ball.carrier:AddNewModifier(
        self.owner,
        ball.ability,
        fxModifierName(ball.f.key),
        {duration = ball["until"] - now}
    )
end
function ZeusLegends.prototype.clearBallBuff(self, ball)
    if ball.buff ~= nil and not ball.buff:IsNull() then
        ball.buff:Destroy()
    end
    ball.buff = nil
end
function ZeusLegends.prototype.clearBall(self)
    if self.ball == nil then
        return
    end
    self:clearBallBuff(self.ball)
    clearParticle(self.ball.marker)
    self.ball = nil
end
function ZeusLegends.prototype.clearSpring(self)
    if self.spring == nil then
        return
    end
    clearParticle(self.spring.marker)
    self.spring = nil
end
function ZeusLegends.prototype.clear(self)
    self:clearSpring()
    self.landing = nil
    self:clearBall()
end
function ZeusLegends.prototype.tick(self, now)
    self:tickSpring(now)
    local ball = self.ball
    if ball == nil then
        return
    end
    if not livingHero(ball.carrier) then
        self:clearBall()
        return
    end
    local pos = ball.carrier:GetAbsOrigin()
    if now < ball["until"] then
        ParticleManager:SetParticleControl(ball.marker, 0, pos)
        ParticleManager:SetParticleControl(
            ball.marker,
            1,
            Vector(55 + 65 * (ball["until"] - now) / ball.f.dur, 0, 0)
        )
        return
    end
    self:clearBall()
    if not realFighter(ball.carrier) then
        return
    end
    flash(
        Vector(pos.x, pos.y, pos.z + 850),
        pos,
        BOLT,
        ball.carrier
    )
    local ____self = ball.carrier == self.owner
    local amount = ____self and math.min(
        ball.amount,
        self.owner:GetMaxHealth() * 0.25
    ) or ball.amount
    local ____self_strike_5 = self.strike
    local ____ball_carrier_3 = ball.carrier
    local ____ball_f_4 = ball.f
    local ____self_2
    if ____self then
        ____self_2 = DOTA_DAMAGE_FLAG_NON_LETHAL
    else
        ____self_2 = 0
    end
    ____self_strike_5(____ball_carrier_3, amount, ____ball_f_4, ____self_2)
end
function ZeusLegends.prototype.tickSpring(self, now)
    local landing = self.landing
    if landing ~= nil and now >= landing.at then
        self.landing = nil
        if realFighter(self.owner) then
            local pos = self.owner:GetAbsOrigin()
            local foes = FindUnitsInRadius(
                self.owner:GetTeamNumber(),
                pos,
                nil,
                landing.f.range,
                DOTA_UNIT_TARGET_TEAM_ENEMY,
                DOTA_UNIT_TARGET_HERO,
                DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
                FIND_CLOSEST,
                false
            )
            for ____, foe in ipairs(foes) do
                do
                    if not realFighter(foe) then
                        goto __continue37
                    end
                    local to = foe:GetAbsOrigin()
                    flash(
                        Vector(to.x, to.y, to.z + 850),
                        to,
                        BOLT,
                        foe
                    )
                    self.strike(foe, landing.amount, landing.f)
                    break
                end
                ::__continue37::
            end
        end
    end
    local s = self.spring
    if s == nil then
        return
    end
    if now >= s["until"] then
        self:clearSpring()
        return
    end
    if not atMost(
        self.owner:GetAbsOrigin(),
        s.pos,
        s.f.radius + 25
    ) then
        s.ownerLeft = true
    end
    if now < s.armedAt then
        return
    end
    local near = FindUnitsInRadius(
        self.owner:GetTeamNumber(),
        s.pos,
        nil,
        s.f.radius,
        DOTA_UNIT_TARGET_TEAM_BOTH,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
        FIND_CLOSEST,
        false
    )
    for ____, unit in ipairs(near) do
        do
            if not realFighter(unit) or not atMost(
                unit:GetAbsOrigin(),
                s.pos,
                s.f.radius
            ) or unit:IsRooted() or unit:IsStunned() or unit:IsCurrentlyHorizontalMotionControlled() then
                goto __continue44
            end
            local ____temp_6
            if unit == self.owner then
                ____temp_6 = not s.ownerLeft
            else
                ____temp_6 = s.ownerOnly or unit:IsDebuffImmune()
            end
            if ____temp_6 then
                goto __continue44
            end
            local pos = unit:GetAbsOrigin()
            local facing = unit:GetForwardVector()
            unit:AddNewModifier(self.owner, nil, "modifier_knockback", {
                center_x = pos.x - facing.x * 50,
                center_y = pos.y - facing.y * 50,
                center_z = pos.z,
                duration = s.f.delay,
                knockback_duration = s.f.delay,
                knockback_distance = s.f.dist,
                knockback_height = 170,
                should_stun = 0
            })
            EmitSoundOn("Hero_Zuus.HeavenlyJump", unit)
            if unit == self.owner then
                local ability = self.owner:FindAbilityByName(s.f.ab)
                if ability ~= nil then
                    self.landing = {
                        f = s.f,
                        at = now + s.f.delay,
                        amount = ability:GetSpecialValueFor("damage")
                    }
                end
            end
            if s.f.ownerReturn and unit ~= self.owner then
                s.ownerOnly = true
                s.armedAt = now + s.f.arm
                ParticleManager:SetParticleControl(
                    s.marker,
                    2,
                    Vector(180, 120, 255)
                )
            else
                self:clearSpring()
            end
            return
        end
        ::__continue44::
    end
end
return ____exports
