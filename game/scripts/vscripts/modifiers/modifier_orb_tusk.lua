local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local Q = "tusk_ice_shards"
local W = "tusk_snowball"
local E = "tusk_tag_team"
local R = "tusk_walrus_punch"
local STANCE = "modifier_orb_tusk_stance"
local STEP = 0.05
local ROLL = 1
local READY = 2
local GUARD = 3
local WINDUP = 4
local function now()
    return GameRules:GetGameTime()
end
local function distance(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2)
end
local function enemy(hero, unit)
    return unit ~= nil and IsValidEntity(unit) and unit:IsRealHero() and unit:IsAlive() and not unit:IsIllusion() and unit:GetTeamNumber() ~= hero:GetTeamNumber() and not unit:IsInvulnerable()
end
local function hit(hero, victim, ability, damage, ____type)
    ApplyDamage({
        attacker = hero,
        victim = victim,
        ability = ability,
        damage = damage,
        damage_type = ____type
    })
end
local TuskStance = __TS__Class()
TuskStance.name = "TuskStance"
__TS__ClassExtends(TuskStance, ModBase)
function TuskStance.prototype.IsPurgable(self)
    return false
end
function TuskStance.prototype.GetTexture(self)
    return ({
        "",
        W,
        E,
        E,
        R
    })[self:GetStackCount() + 1] or E
end
function TuskStance.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_MODEL_CHANGE}
end
function TuskStance.prototype.CheckState(self)
    return self:GetStackCount() == ROLL and ({[MODIFIER_STATE_DISARMED] = true, [MODIFIER_STATE_SILENCED] = true}) or ({})
end
function TuskStance.prototype.GetModifierModelChange(self)
    return self:GetStackCount() == ROLL and "models/particle/snowball.vmdl" or ""
end
____exports.TuskOrbs = __TS__Class()
local TuskOrbs = ____exports.TuskOrbs
TuskOrbs.name = "TuskOrbs"
__TS__ClassExtends(TuskOrbs, ModBase)
function TuskOrbs.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.posts = {}
    self.rollUntil = 0
    self.tagEnd = 0
    self.swings = 0
    self.ready = 0
    self.guard = 0
    self.releasing = false
    self.landings = {}
    self.lastStep = 0
end
function TuskOrbs.prototype.IsHidden(self)
    return true
end
function TuskOrbs.prototype.IsPurgable(self)
    return false
end
function TuskOrbs.prototype.RemoveOnDeath(self)
    return false
end
function TuskOrbs.prototype.bonuses(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        now()
    )
end
function TuskOrbs.prototype.owns(self, id)
    return (self:bonuses().code["tusk_l_" .. id] or 0) > 0
end
function TuskOrbs.prototype.stance(self, mode, duration)
    local hero = self:GetParent()
    hero:RemoveModifierByName(STANCE)
    if duration > 0 then
        local ____opt_0 = hero:AddNewModifier(hero, nil, STANCE, {duration = duration})
        if ____opt_0 ~= nil then
            ____opt_0:SetStackCount(mode)
        end
    end
end
function TuskOrbs.prototype.OnCreated(self)
    if IsServer() then
        self.lastStep = now()
        self:StartIntervalThink(STEP)
    end
end
function TuskOrbs.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_PROPERTY_ABSORB_SPELL,
        MODIFIER_PROPERTY_AVOID_DAMAGE,
        MODIFIER_EVENT_ON_DEATH
    }
end
function TuskOrbs.prototype.removePost(self, p)
    ParticleManager:DestroyParticle(p.particle, false)
    ParticleManager:ReleaseParticleIndex(p.particle)
    local index = __TS__ArrayIndexOf(self.posts, p)
    if index >= 0 then
        __TS__ArraySplice(self.posts, index, 1)
    end
    local ____opt_2 = self.flight
    if (____opt_2 and ____opt_2.post) == p then
        self.flight = nil
    end
end
function TuskOrbs.prototype.clear(self)
    for ____, p in ipairs({unpack(self.posts)}) do
        self:removePost(p)
    end
    self:endRoll()
    self.windup = nil
    self.charged = nil
    self.landings = {}
    self.rollUntil = 0
    self.swings = 0
    self.guard = 0
    self.ready = 0
    self.tagEnd = 0
    self:stance(0, 0)
end
function TuskOrbs.prototype.OnDestroy(self)
    if IsServer() then
        self:clear()
    end
end
function TuskOrbs.prototype.OnDeath(self, e)
    if IsServer() and e.unit == self:GetParent() then
        self:clear()
    end
end
function TuskOrbs.prototype.OnAbilityFullyCast(self, e)
    local hero = self:GetParent()
    if not IsServer() or e.unit ~= hero or not e.ability then
        return
    end
    local ab = e.ability
    local name = ab:GetAbilityName()
    if name == Q and self:owns("wall") then
        local pos = ab:GetCursorPosition()
        local from = hero:GetAbsOrigin()
        local d = math.max(
            1,
            distance(pos, from)
        )
        local speed = math.max(
            1,
            ab:GetSpecialValueFor("shard_speed")
        )
        local arm = now() + d / speed
        local particle = ParticleManager:CreateParticle("particles/ui_mouseactions/range_display.vpcf", PATTACH_WORLDORIGIN, hero)
        ParticleManager:SetParticleControl(particle, 0, pos)
        ParticleManager:SetParticleControl(
            particle,
            1,
            Vector(85, 0, 0)
        )
        local post = {
            pos = pos,
            arm = arm,
            expires = arm + ab:GetSpecialValueFor("shard_duration"),
            particle = particle
        }
        if #self.posts >= 2 then
            self:removePost(self.posts[1])
        end
        local ____self_posts_4 = self.posts
        ____self_posts_4[#____self_posts_4 + 1] = post
        self.flight = {
            from = from,
            dir = Vector((pos.x - from.x) / d, (pos.y - from.y) / d, 0),
            at = now(),
            post = post,
            speed = speed
        }
    elseif name == "tusk_ice_shards_stop" and self.flight and now() < self.flight.post.arm then
        local f = self.flight
        local travel = (now() - f.at) * f.speed
        f.post.pos = Vector(f.from.x + travel * f.dir.x, f.from.y + travel * f.dir.y, f.from.z)
        local ____f_post_5, ____expires_6 = f.post, "expires"
        ____f_post_5[____expires_6] = ____f_post_5[____expires_6] - (f.post.arm - now())
        f.post.arm = now()
        ParticleManager:SetParticleControl(f.post.particle, 0, f.post.pos)
    elseif name == W then
        self.launchFrom = hero:GetAbsOrigin()
        self.rollUntil = self:owns("roll") and now() + ab:GetSpecialValueFor("snowball_windup") + ab:GetSpecialValueFor("snowball_duration") + 1 or 0
    elseif name == E and self:owns("counter") then
        self.tagEnd = now() + ab:GetSpecialValueFor("debuff_duration")
        self.swings = 0
    end
end
function TuskOrbs.prototype.wall(self, target, from)
    local h = self:GetParent()
    local ab = h:FindAbilityByName(Q)
    if not ab or target:IsDebuffImmune() then
        return
    end
    local origin = from or h:GetAbsOrigin()
    local pos = target:GetAbsOrigin()
    local d = math.max(
        1,
        distance(origin, pos)
    )
    local dx = (pos.x - origin.x) / d
    local dy = (pos.y - origin.y) / d
    for ____, p in ipairs(self.posts) do
        do
            local x = p.pos.x - pos.x
            local y = p.pos.y - pos.y
            local along = x * dx + y * dy
            if now() < p.arm or now() > p.expires or along < 0 or along > (self:bonuses().awake and 300 or 220) or math.abs(x * dy - y * dx) > 85 then
                goto __continue40
            end
            self:removePost(p)
            target:AddNewModifier(h, ab, "modifier_knockback", {
                center_x = origin.x,
                center_y = origin.y,
                center_z = origin.z,
                duration = 0.2,
                knockback_duration = 0.2,
                knockback_distance = along,
                knockback_height = 30,
                should_stun = 0
            })
            hit(
                h,
                target,
                ab,
                2 * h:GetAverageTrueAttackDamage(target),
                DAMAGE_TYPE_PHYSICAL
            )
            if target:IsAlive() then
                hit(
                    h,
                    target,
                    ab,
                    ab:GetSpecialValueFor("shard_damage"),
                    DAMAGE_TYPE_MAGICAL
                )
            end
            break
        end
        ::__continue40::
    end
end
function TuskOrbs.prototype.OnAttackLanded(self, e)
    local h = self:GetParent()
    local t = e.target
    if not IsServer() or e.attacker ~= h or not enemy(h, t) then
        return
    end
    if #self.posts > 0 then
        self:wall(t)
    end
    local ____opt_7 = self.charged
    if (____opt_7 and ____opt_7.target) == t and self.charged.at >= now() then
        self.charged = nil
        local ab = h:FindAbilityByName(R)
        if ab and t:IsAlive() then
            hit(
                h,
                t,
                ab,
                (h:GetAverageTrueAttackDamage(t) + ab:GetSpecialValueFor("bonus_damage")) * ab:GetSpecialValueFor("crit_multiplier") / 100,
                DAMAGE_TYPE_PHYSICAL
            )
            local ____self_landings_9 = self.landings
            ____self_landings_9[#____self_landings_9 + 1] = {
                target = t,
                at = now() + ab:GetSpecialValueFor("air_time")
            }
        end
    end
    local ____temp_13 = self.tagEnd > now()
    if ____temp_13 then
        local ____self_10, ____swings_11 = self, "swings"
        local ____self_swings_12 = ____self_10[____swings_11] + 1
        ____self_10[____swings_11] = ____self_swings_12
        ____temp_13 = ____self_swings_12 >= (self:bonuses().awake and 2 or 3)
    end
    if ____temp_13 then
        self.swings = 0
        self.ready = now() + 1.5
        self:stance(READY, 1.5)
    end
end
function TuskOrbs.prototype.parry(self, attacker)
    local h = self:GetParent()
    if not IsServer() or self.guard <= now() or not enemy(h, attacker) then
        return false
    end
    self.guard = 0
    self:stance(0, 0)
    local ab = h:FindAbilityByName(E)
    if ab and distance(
        h:GetAbsOrigin(),
        attacker:GetAbsOrigin()
    ) <= ab:GetSpecialValueFor("radius") * 2 then
        local p = attacker:GetAbsOrigin()
        local origin = h:GetAbsOrigin()
        local d = math.max(
            1,
            distance(p, origin)
        )
        FindClearSpaceForUnit(
            h,
            Vector(p.x + 75 * (origin.x - p.x) / d, p.y + 75 * (origin.y - p.y) / d, p.z),
            true
        )
        hit(
            h,
            attacker,
            ab,
            2 * h:GetAverageTrueAttackDamage(attacker) + ab:GetSpecialValueFor("bonus_damage"),
            DAMAGE_TYPE_PHYSICAL
        )
    end
    return true
end
function TuskOrbs.prototype.GetAbsorbSpell(self, e)
    return e.ability and self:parry(e.ability:GetCaster()) and 1 or 0
end
function TuskOrbs.prototype.GetModifierAvoidDamage(self, e)
    return not e.inflictor and self:parry(e.attacker) and 1 or 0
end
function TuskOrbs.prototype.OnTakeDamage(self, e)
    local h = self:GetParent()
    local ____temp_16 = not IsServer() or e.attacker ~= h or not enemy(h, e.unit)
    if not ____temp_16 then
        local ____opt_14 = e.inflictor
        ____temp_16 = (____opt_14 and ____opt_14:GetAbilityName()) ~= W
    end
    if ____temp_16 then
        return
    end
    if #self.posts > 0 and self.launchFrom and not self.rolling then
        self:wall(e.unit, self.launchFrom)
    end
    if self.rollUntil <= now() then
        return
    end
    self.rollUntil = 0
    local p = h:GetAbsOrigin()
    local f = h:GetForwardVector()
    local duration = self:bonuses().awake and 5 or 4
    self.rolling = {
        ends = now() + duration,
        heading = math.atan2(f.y, f.x),
        goal = Vector(p.x + 500 * f.x, p.y + 500 * f.y, p.z),
        inside = __TS__New(
            Set,
            {e.unit:entindex()}
        ),
        hits = 1
    }
    self:stance(ROLL, duration)
end
function TuskOrbs.prototype.endRoll(self)
    if not self.rolling then
        return
    end
    self.rolling = nil
    local h = self:GetParent()
    FindClearSpaceForUnit(
        h,
        h:GetAbsOrigin(),
        true
    )
    self:stance(0, 0)
end
function TuskOrbs.prototype.stepRoll(self, r, dt)
    local h = self:GetParent()
    local ab = h:FindAbilityByName(W)
    if not ab or r.ends <= now() or h:IsStunned() or h:IsRooted() or h:IsHexed() then
        self:endRoll()
        return
    end
    if h:IsOutOfGame() or h:IsInvulnerable() then
        return
    end
    local p = h:GetAbsOrigin()
    local desired = math.atan2(r.goal.y - p.y, r.goal.x - p.x)
    local angle = desired - r.heading
    local maxTurn = dt * (self:bonuses().awake and 5 or 3.8)
    r.heading = r.heading + math.max(
        -maxTurn,
        math.min(
            maxTurn,
            math.atan2(
                math.sin(angle),
                math.cos(angle)
            )
        )
    )
    local dx = math.cos(r.heading)
    local dy = math.sin(r.heading)
    local step = dt * ab:GetSpecialValueFor("snowball_speed")
    local dest = Vector(p.x + dx * step, p.y + dy * step, p.z)
    if GridNav:IsBlocked(dest) or not GridNav:IsTraversable(dest) then
        self:endRoll()
        return
    end
    h:SetAbsOrigin(GetGroundPosition(dest, h))
    h:SetForwardVector(Vector(dx, dy, 0))
    local units = FindUnitsInRadius(
        h:GetTeamNumber(),
        dest,
        nil,
        ab:GetSpecialValueFor("snowball_radius"),
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_CLOSEST,
        false
    )
    local inside = __TS__New(Set)
    for ____, t in ipairs(units) do
        do
            if not enemy(h, t) then
                goto __continue65
            end
            inside:add(t:entindex())
            if r.inside:has(t:entindex()) then
                goto __continue65
            end
            r.hits = r.hits + 1
            hit(
                h,
                t,
                ab,
                ab:GetSpecialValueFor("snowball_damage") * (0.5 + r.hits * 0.5),
                DAMAGE_TYPE_MAGICAL
            )
            if r.hits >= 3 then
                self:endRoll()
                return
            end
        end
        ::__continue65::
    end
    r.inside = inside
end
function TuskOrbs.prototype.order(self, e)
    local h = self:GetParent()
    local kind = e.order_type
    if self.rolling then
        if kind == DOTA_UNIT_ORDER_STOP or kind == DOTA_UNIT_ORDER_HOLD_POSITION then
            self:endRoll()
            return false
        end
        local ____temp_17
        if e.entindex_target > 0 then
            ____temp_17 = EntIndexToHScript(e.entindex_target)
        else
            ____temp_17 = nil
        end
        local target = ____temp_17
        if kind == DOTA_UNIT_ORDER_MOVE_TO_POSITION or kind == DOTA_UNIT_ORDER_ATTACK_MOVE then
            self.rolling.goal = Vector(e.position_x, e.position_y, e.position_z)
        elseif target and (kind == DOTA_UNIT_ORDER_ATTACK_TARGET or kind == DOTA_UNIT_ORDER_MOVE_TO_TARGET) then
            self.rolling.goal = target:GetAbsOrigin()
        end
        return false
    end
    if (kind == DOTA_UNIT_ORDER_STOP or kind == DOTA_UNIT_ORDER_HOLD_POSITION) and self.ready > now() then
        self.ready = 0
        self.guard = now() + 1
        self:stance(GUARD, 1)
        return true
    end
    if self.releasing or kind ~= DOTA_UNIT_ORDER_CAST_TARGET or not self:owns("ko") or e.entindex_ability <= 0 then
        return true
    end
    local ab = h:FindAbilityByName(R)
    if not ab or e.entindex_ability ~= ab:entindex() or not ab:IsFullyCastable() then
        return true
    end
    local target = EntIndexToHScript(e.entindex_target)
    if not enemy(h, target) then
        return true
    end
    if self.windup then
        self.windup = nil
        self:stance(0, 0)
        return true
    end
    if h:IsStunned() or h:IsHexed() or h:IsSilenced() then
        return false
    end
    self.windup = {
        target = target,
        at = now()
    }
    self:stance(WINDUP, 3)
    h:EmitSound("Hero_Tusk.WalrusPunch.Cast")
    return false
end
function TuskOrbs.prototype.OnIntervalThink(self)
    local h = self:GetParent()
    local time = now()
    local dt = math.min(0.12, time - self.lastStep)
    self.lastStep = time
    if not h:IsAlive() then
        return
    end
    for ____, p in ipairs({unpack(self.posts)}) do
        if p.expires <= time then
            self:removePost(p)
        end
    end
    if self.rolling then
        self:stepRoll(self.rolling, dt)
    end
    local w = self.windup
    if w then
        local ab = h:FindAbilityByName(R)
        if not enemy(h, w.target) or not (ab and ab:IsFullyCastable()) or h:IsStunned() or h:IsHexed() or h:IsSilenced() or h:IsDisarmed() or time - w.at > 3 then
            self.windup = nil
            self:stance(0, 0)
        elseif time - w.at >= (self:bonuses().awake and 1.1 or 1.5) and distance(
            h:GetAbsOrigin(),
            w.target:GetAbsOrigin()
        ) <= h:Script_GetAttackRange() + 55 then
            self.windup = nil
            self:stance(0, 0)
            self.charged = {target = w.target, at = time + 0.8}
            self.releasing = true
            h:CastAbilityOnTarget(
                w.target,
                ab,
                h:GetPlayerOwnerID()
            )
            self.releasing = false
        end
    end
    if self.charged and self.charged.at < time then
        self.charged = nil
    end
    for ____, l in ipairs({unpack(self.landings)}) do
        do
            if l.at > time then
                goto __continue91
            end
            __TS__ArraySplice(
                self.landings,
                __TS__ArrayIndexOf(self.landings, l),
                1
            )
            local ab = h:FindAbilityByName(R)
            if ab and enemy(h, l.target) then
                hit(
                    h,
                    l.target,
                    ab,
                    0.15 * (l.target:GetMaxHealth() - l.target:GetHealth()),
                    DAMAGE_TYPE_PHYSICAL
                )
            end
        end
        ::__continue91::
    end
end
modifier_orb_tusk = registerModifier("modifier_orb_tusk", ____exports.TuskOrbs)
modifier_orb_tusk_stance = registerModifier("modifier_orb_tusk_stance", TuskStance)
return ____exports
