local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArraySome = ____lualib.__TS__ArraySome
local Set = ____lualib.Set
local __TS__StringSubstring = ____lualib.__TS__StringSubstring
local __TS__Number = ____lualib.__TS__Number
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__Iterator = ____lualib.__TS__Iterator
local ____exports = {}
local ____orbstore = require("core.orbstore")
local bonusAbilityCharges = ____orbstore.bonusAbilityCharges
local ____combatpatterns = require("core.combatpatterns")
local advanceCombo = ____combatpatterns.advanceCombo
local insideRing = ____combatpatterns.insideRing
local tetherBand = ____combatpatterns.tetherBand
local ____fxtypes = require("core.fxtypes")
local fxModifierName = ____fxtypes.fxModifierName
local ____fxutil = require("core.fxutil")
local fxNum = ____fxutil.fxNum
local fxOfOrb = ____fxutil.fxOfOrb
local fxView = ____fxutil.fxView
local ____zeuslegends = require("lib.zeuslegends")
local ZeusLegends = ____zeuslegends.ZeusLegends
local ____heromaneuvers = require("lib.heromaneuvers")
local HeroManeuvers = ____heromaneuvers.HeroManeuvers
local CHAIN_PFX = "particles/items_fx/chain_lightning.vpcf"
local STORM_PFX = "particles/units/heroes/hero_zuus/zuus_lightning_bolt.vpcf"
local RING_PFX = "particles/ui_mouseactions/range_display.vpcf"
local WIRE_END_RADIUS = 90
local WIRE_PFX = "particles/units/heroes/hero_razor/razor_static_link.vpcf"
local REWIND_PFX = "particles/units/heroes/hero_weaver/weaver_timelapse.vpcf"
local function length2D(x, y)
    return math.sqrt(x * x + y * y)
end
local function nearWireEnd(pos, ____end)
    return math.abs(pos.z - ____end.z) < 135 and length2D(pos.x - ____end.x, pos.y - ____end.y) <= WIRE_END_RADIUS
end
local function isEnemy(parent, u)
    return u ~= nil and IsValidEntity(u) and u:GetTeamNumber() ~= parent:GetTeamNumber() and not u:IsBuilding()
end
local function damageType(t)
    if t == "phys" then
        return DAMAGE_TYPE_PHYSICAL
    end
    if t == "pure" then
        return DAMAGE_TYPE_PURE
    end
    return DAMAGE_TYPE_MAGICAL
end
____exports.FxEngine = __TS__Class()
local FxEngine = ____exports.FxEngine
FxEngine.name = "FxEngine"
function FxEngine.prototype.____constructor(self, parent)
    self.list = {}
    self.awake = false
    self.lastCast = __TS__New(Map)
    self.lastTarget = __TS__New(Map)
    self.lastPoint = __TS__New(Map)
    self.grantedCharges = __TS__New(Map)
    self.hits = __TS__New(Map)
    self.icd = __TS__New(Map)
    self.pending = {}
    self.stillSince = 0
    self.lastAura = 0
    self.applying = false
    self.traps = {}
    self.trail = {}
    self.lastTrailAt = 0
    self.lastTrailTick = 0
    self.autoAt = __TS__New(Map)
    self.stormAt = __TS__New(Map)
    self.comboStates = __TS__New(Map)
    self.zones = {}
    self.tethers = __TS__New(Map)
    self.marks = __TS__New(Map)
    self.guards = __TS__New(Map)
    self.wireReadyAt = 0
    self.combatEpoch = 0
    self.parent = parent
end
function FxEngine.prototype.maneuverStart(self, ability)
    local ____opt_0 = self.maneuvers
    if ____opt_0 ~= nil then
        ____opt_0:start(
            ability,
            GameRules:GetGameTime()
        )
    end
end
function FxEngine.prototype.rememberWard(self, ward)
    local ____opt_2 = self.maneuvers
    if ____opt_2 ~= nil then
        ____opt_2:rememberWard(ward)
    end
end
function FxEngine.prototype.maneuverOrder(self, kind, target, point)
    local ____opt_4 = self.maneuvers
    local ____temp_6 = ____opt_4 and ____opt_4:order(
        kind,
        target,
        point,
        GameRules:GetGameTime()
    )
    if ____temp_6 == nil then
        ____temp_6 = false
    end
    return ____temp_6
end
function FxEngine.prototype.refresh(self, b)
    if self.listFor == b then
        return
    end
    self.listFor = b
    self.awake = b.awake
    local out = {}
    for id in pairs(b.code) do
        do
            if (b.code[id] or 0) <= 0 then
                goto __continue14
            end
            for ____, f in ipairs(fxOfOrb(id)) do
                out[#out + 1] = fxView(f, b.awake)
            end
        end
        ::__continue14::
    end
    self.list = out
    local plans = __TS__ArrayFilter(
        out,
        function(____, f) return f.t == "maneuver" end
    )
    if #plans > 0 then
        if self.maneuvers == nil then
            self.maneuvers = __TS__New(
                HeroManeuvers,
                self.parent,
                function(victim, amount, effect, magical)
                    local ____self_damage_10 = self.damage
                    local ____victim_8 = victim
                    local ____amount_9 = amount
                    local ____magical_7
                    if magical then
                        ____magical_7 = DAMAGE_TYPE_MAGICAL
                    else
                        ____magical_7 = DAMAGE_TYPE_PHYSICAL
                    end
                    return ____self_damage_10(
                        self,
                        ____victim_8,
                        ____amount_9,
                        ____magical_7,
                        effect
                    )
                end,
                function(target, dir, dist, dur) return self:shove(target, dir, dist, dur) end
            )
        end
        self.maneuvers:configure(plans, b.awake)
    elseif self.maneuvers ~= nil then
        self.maneuvers:clear()
        self.maneuvers = nil
    end
    if not __TS__ArraySome(
        out,
        function(____, f) return f.t == "wire" end
    ) then
        self:clearWire()
    end
    if self.zeus ~= nil and not __TS__ArraySome(
        out,
        function(____, f) return f.t == "spring" or f.t == "thunderball" end
    ) then
        self.zeus:clear()
        self.zeus = nil
    end
end
function FxEngine.prototype.hasAny(self)
    return #self.list > 0
end
function FxEngine.prototype.ab(self, name)
    if name == "" then
        return nil
    end
    return self.parent:FindAbilityByName(name)
end
function FxEngine.prototype.num(self, v, f)
    local ab = self:ab(f.ab)
    return fxNum(
        v,
        function(key) return ab ~= nil and ab:GetSpecialValueFor(key) or 0 end
    )
end
function FxEngine.prototype.inWindow(self, f, win, now)
    if win == nil then
        return true
    end
    local at = self.lastCast:get(f.ab)
    return at ~= nil and now - at <= self:num(win, f) + 0.05
end
function FxEngine.prototype.later(self, delay, run)
    if delay <= 0.01 then
        run()
    else
        local ____self_pending_11 = self.pending
        ____self_pending_11[#____self_pending_11 + 1] = {
            at = GameRules:GetGameTime() + delay,
            run = run
        }
    end
end
function FxEngine.prototype.damage(self, victim, amount, ____type, f, flags)
    if flags == nil then
        flags = 0
    end
    if amount <= 0 or not victim:IsAlive() then
        return 0
    end
    local spell = f.t == "spring" or f.t == "thunderball" or f.t == "mark" or f.t == "guard" or f.t == "zone" or f.t == "tether"
    self.applying = true
    do
        local ____try, ____hasReturned, ____returnValue = pcall(function()
            return true, ApplyDamage({
                victim = victim,
                attacker = self.parent,
                damage = amount,
                damage_type = ____type,
                damage_flags = spell and flags or flags + DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION,
                ability = self:ab(f.ab)
            })
        end)
        do
            self.applying = false
        end
        if ____try and ____hasReturned then
            return ____returnValue
        end
    end
end
function FxEngine.prototype.applyDebuff(self, f, d, victim)
    local name = fxModifierName(f.key)
    local dur = self:num(d.dur, f)
    local max = d.max or 1
    local function go()
        if not IsValidEntity(victim) or not victim:IsAlive() then
            return
        end
        local m = victim:FindModifierByName(name)
        if m ~= nil and m:GetCaster() == self.parent then
            if max > 1 and m:GetStackCount() < max then
                m:IncrementStackCount()
            end
            m:SetDuration(dur, true)
            return
        end
        local nm = victim:AddNewModifier(
            self.parent,
            self:ab(f.ab),
            name,
            {duration = dur}
        )
        if nm ~= nil and max > 1 then
            nm:SetStackCount(1)
        end
    end
    self:later(
        self:num(d.delay, f),
        go
    )
end
function FxEngine.prototype.keep(self, f, on, stacks)
    if stacks == nil then
        stacks = 0
    end
    local name = fxModifierName(f.key)
    local m = self.parent:FindModifierByName(name)
    if not on then
        if m ~= nil then
            m:Destroy()
        end
        return
    end
    local mm = m or self.parent:AddNewModifier(
        self.parent,
        self:ab(f.ab),
        name,
        {}
    )
    if mm ~= nil and stacks > 0 and mm:GetStackCount() ~= stacks then
        mm:SetStackCount(stacks)
    end
end
function FxEngine.prototype.act(self, f, victim, dealt)
    local parent = self.parent
    if f.debuff ~= nil then
        self:applyDebuff(f, f.debuff, victim)
    end
    if f.heal ~= nil then
        local h = dealt * self:num(f.heal, f) / 100
        if h > 0 then
            parent:Heal(
                h,
                self:ab(f.ab)
            )
        end
    end
    if f.mana ~= nil then
        parent:GiveMana(dealt * self:num(f.mana, f) / 100)
    end
    if f.extra ~= nil then
        local x = f.extra
        local amount = dealt * self:num(x.pct, f) / 100
        amount = amount + victim:GetMaxHealth() * self:num(x.maxhp, f) / 100
        amount = amount + victim:GetHealth() * self:num(x.curhp, f) / 100
        amount = amount + parent:GetAverageTrueAttackDamage(victim) * self:num(x.atk, f) / 100
        amount = amount + self:num(x.flat, f)
        self:damage(
            victim,
            amount,
            damageType(x.type),
            f
        )
    end
    if f.chain ~= nil then
        local c = f.chain
        local pct = self:num(c.pct, f)
        local from = victim
        local hit = __TS__New(Set, {victim})
        do
            local j = 0
            while j < c.jumps do
                local near = FindUnitsInRadius(
                    parent:GetTeamNumber(),
                    from:GetAbsOrigin(),
                    nil,
                    c.radius,
                    DOTA_UNIT_TARGET_TEAM_ENEMY,
                    DOTA_UNIT_TARGET_HERO,
                    DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
                    FIND_CLOSEST,
                    false
                )
                local next
                for ____, u in ipairs(near) do
                    if not hit:has(u) and u:IsAlive() and u:IsRealHero() then
                        next = u
                        break
                    end
                end
                if next == nil then
                    break
                end
                hit:add(next)
                local p = ParticleManager:CreateParticle(CHAIN_PFX, PATTACH_CUSTOMORIGIN, from)
                ParticleManager:SetParticleControl(
                    p,
                    0,
                    from:GetAbsOrigin() + Vector(0, 0, 100)
                )
                ParticleManager:SetParticleControl(
                    p,
                    1,
                    next:GetAbsOrigin() + Vector(0, 0, 100)
                )
                ParticleManager:ReleaseParticleIndex(p)
                self:damage(next, dealt * pct / 100, DAMAGE_TYPE_MAGICAL, f)
                from = next
                j = j + 1
            end
        end
    end
    if f.splash ~= nil then
        local s = f.splash
        local pct = self:num(s.pct, f)
        local near = FindUnitsInRadius(
            parent:GetTeamNumber(),
            victim:GetAbsOrigin(),
            nil,
            s.radius,
            DOTA_UNIT_TARGET_TEAM_ENEMY,
            DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
            DOTA_UNIT_TARGET_FLAG_NONE,
            FIND_ANY_ORDER,
            false
        )
        for ____, u in ipairs(near) do
            if u ~= victim then
                self:damage(u, dealt * pct / 100, DAMAGE_TYPE_MAGICAL, f)
            end
        end
    end
    if f.pierce ~= nil then
        local pc = f.pierce
        local a = parent:GetAbsOrigin()
        local b = victim:GetAbsOrigin()
        local dir = (b - a):Normalized()
        local ____end = b + dir * pc.dist
        local units = FindUnitsInLine(
            parent:GetTeamNumber(),
            b,
            ____end,
            nil,
            pc.width,
            DOTA_UNIT_TARGET_TEAM_ENEMY,
            DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
            DOTA_UNIT_TARGET_FLAG_NONE
        )
        for ____, u in ipairs(units) do
            if u ~= victim then
                self:damage(
                    u,
                    dealt * self:num(pc.pct, f) / 100,
                    DAMAGE_TYPE_PHYSICAL,
                    f
                )
            end
        end
    end
    if f.cdr ~= nil then
        self:reduceCooldowns(
            f,
            f.cdr.abs,
            self:num(f.cdr.sec, f)
        )
    end
    if f.addstack ~= nil then
        local st = f.addstack
        local max = self:num(st.max, f)
        local dur = self:num(st.dur, f)
        for ____, m in ipairs(parent:FindAllModifiers()) do
            do
                if (string.find(
                    m:GetName(),
                    st.mod,
                    nil,
                    true
                ) or 0) - 1 < 0 then
                    goto __continue74
                end
                if m:GetStackCount() < max then
                    m:IncrementStackCount()
                end
                if dur > 0 then
                    m:SetDuration(dur, true)
                end
                break
            end
            ::__continue74::
        end
    end
end
function FxEngine.prototype.reduceCooldowns(self, f, names, sec)
    for ____, n in ipairs(names) do
        do
            local a = self:ab(n == "self" and f.ab or n)
            if a == nil then
                goto __continue80
            end
            local left = a:GetCooldownTimeRemaining()
            if left <= 0 then
                goto __continue80
            end
            a:EndCooldown()
            if left > sec then
                a:StartCooldown(left - sec)
            end
        end
        ::__continue80::
    end
end
function FxEngine.prototype.condOk(self, cond, lowhp, t)
    if lowhp ~= nil and t:GetHealthPercent() >= lowhp then
        return false
    end
    if cond ~= nil and (string.find(cond, "own:", nil, true) or 0) - 1 == 0 then
        return self:hasOwnCombatModifier(
            t,
            string.sub(cond, 5)
        )
    end
    if cond ~= nil and (string.find(cond, "has:", nil, true) or 0) - 1 == 0 then
        local part = __TS__StringSubstring(cond, 4)
        for ____, m in ipairs(t:FindAllModifiers()) do
            if (string.find(
                m:GetName(),
                part,
                nil,
                true
            ) or 0) - 1 >= 0 then
                return true
            end
        end
        return false
    end
    if cond == "stunned" then
        return t:IsStunned()
    end
    if cond == "silenced" then
        return t:IsSilenced()
    end
    if cond == "rooted" then
        return t:IsRooted()
    end
    if cond == "slowed" then
        return t:GetIdealSpeed() < t:GetBaseMoveSpeed() - 1
    end
    return true
end
function FxEngine.prototype.hitAllowed(self, f, victim, now)
    if (f.heroOnly or 0) > 0 and not victim:IsRealHero() then
        return false
    end
    if not self:inWindow(f, f.win, now) then
        return false
    end
    if not self:condOk(f.cond, f.lowhp, victim) then
        return false
    end
    if f.icd ~= nil then
        local k = (f.key .. ":") .. tostring(victim:entindex())
        local ____until = self.icd:get(k) or 0
        if now < ____until then
            return false
        end
        self.icd:set(k, now + f.icd)
    end
    if f.chance ~= nil and RandomFloat(0, 100) >= f.chance then
        return false
    end
    return true
end
function FxEngine.prototype.onCast(self, ability, target)
    local parent = self.parent
    local name = ability:GetAbilityName()
    local now = GameRules:GetGameTime()
    self.lastCast:set(name, now)
    if target ~= nil then
        self.lastTarget:set(name, target)
    else
        self.lastTarget:delete(name)
    end
    self.lastPoint:set(
        name,
        ability:GetCursorPosition()
    )
    local ____opt_12 = self.maneuvers
    if ____opt_12 ~= nil then
        ____opt_12:cast(ability, target, now)
    end
    for ____, f in ipairs(self.list) do
        do
            if f.t == "combo" then
                self:comboCast(f, name, now)
                goto __continue106
            end
            if f.ab ~= name then
                goto __continue106
            end
            if f.t == "spring" or f.t == "thunderball" then
                local ____self_14, ____zeus_15 = self, "zeus"
                if ____self_14[____zeus_15] == nil then
                    ____self_14[____zeus_15] = __TS__New(
                        ZeusLegends,
                        parent,
                        function(victim, amount, effect, flags) return self:damage(
                            victim,
                            amount,
                            DAMAGE_TYPE_MAGICAL,
                            effect,
                            flags
                        ) end
                    )
                end
                local zeus = self.zeus
                if f.t == "spring" then
                    zeus:castSpring(f, now)
                elseif self.listFor ~= nil then
                    zeus:castBall(f, ability, self.listFor, now)
                end
                goto __continue106
            end
            if f.t == "wire" then
                self:castWire(f, now)
                goto __continue106
            end
            if f.t == "zone" then
                self:startZone(f, ability, target)
                goto __continue106
            end
            if f.t == "tether" then
                self:startTether(f, target)
                goto __continue106
            end
            if f.t == "mark" and f.by == "cast" and target ~= nil then
                self:markHit(
                    f,
                    target,
                    name,
                    now,
                    true
                )
                goto __continue106
            end
            if f.t == "guard" then
                local state = self.guards:get(f.key) or ({["until"] = 0, readyAt = 0, damage = 0})
                if now >= state.readyAt then
                    state.damage = 0
                    state["until"] = now + f.win
                    self.guards:set(f.key, state)
                end
                goto __continue106
            end
            if f.t == "buff" then
                if (f.dispel or 0) > 0 then
                    parent:Purge(
                        false,
                        true,
                        false,
                        false,
                        false
                    )
                end
                parent:AddNewModifier(
                    parent,
                    ability,
                    fxModifierName(f.key),
                    {duration = self:num(f.dur, f)}
                )
                if f.shield ~= nil then
                    local hero = parent:IsHero() and parent or nil
                    local str = hero ~= nil and hero:GetStrength() or 0
                    local amount = self:num(f.shield.base, f) + self:num(f.shield.str, f) * str
                    parent:AddNewModifier(
                        parent,
                        ability,
                        "modifier_orb_battle_shield",
                        {
                            duration = self:num(f.shield.dur, f),
                            amount = math.floor(amount)
                        }
                    )
                end
            elseif f.t == "refund" then
                if RandomFloat(0, 100) < f.chance then
                    local left = ability:GetCooldownTimeRemaining()
                    local pct = self:num(f.cdpct, f)
                    ability:EndCooldown()
                    if pct < 100 and left > 0 then
                        ability:StartCooldown(left * (1 - pct / 100))
                    end
                    if f.mana ~= nil then
                        parent:GiveMana(ability:GetManaCost(math.max(
                            0,
                            ability:GetLevel() - 1
                        )) * self:num(f.mana, f) / 100)
                    end
                end
            elseif f.t == "blast" then
                self:blast(f, ability, target)
            elseif f.t == "multi" then
                self:multicast(f, ability, target)
            elseif f.t == "dash" then
                self:dash(f, ability, target)
            elseif f.t == "pull" then
                self:pull(f, ability, target)
            elseif f.t == "illusion" then
                self:illusions(f)
            elseif f.t == "trap" then
                self:plantTrap(f, ability, target)
            elseif f.t == "summon" then
                self:summon(f, ability)
            elseif f.t == "swap" then
                self:swap(target)
            elseif f.t == "rewind" then
                self:rewind(f)
            end
        end
        ::__continue106::
    end
end
function FxEngine.prototype.freeCast(self, ability, target, point)
    local parent = self.parent
    if not IsValidEntity(parent) or not parent:IsAlive() or ability:GetLevel() <= 0 then
        return
    end
    local targetOk = target ~= nil and IsValidEntity(target) and target:IsAlive()
    if not targetOk and bit.band(
        __TS__Number(ability:GetBehavior()),
        DOTA_ABILITY_BEHAVIOR_UNIT_TARGET
    ) ~= 0 then
        return
    end
    if targetOk then
        parent:SetCursorCastTarget(target)
        parent:SetCursorPosition(target:GetAbsOrigin())
    else
        parent:SetCursorCastTarget(nil)
        if point ~= nil then
            parent:SetCursorPosition(point)
        end
    end
    ability:OnSpellStart()
end
function FxEngine.prototype.multicast(self, f, ability, target)
    local parent = self.parent
    local chance = self:num(f.chance, f)
    local point = ability:GetCursorPosition()
    local times = 0
    local max = f.times or 1
    while times < max and RandomFloat(0, 100) < chance do
        times = times + 1
    end
    do
        local i = 1
        while i <= times do
            self:later(
                (f.delay or 0.35) * i,
                function()
                    self:freeCast(ability, target, point)
                    if IsValidEntity(parent) then
                        SendOverheadEventMessage(
                            nil,
                            OVERHEAD_ALERT_MAGICAL_BLOCK,
                            parent,
                            i + 1,
                            nil
                        )
                        EmitSoundOn(
                            "Hero_OgreMagi.Fireblast.x" .. tostring(math.min(3, i + 1)),
                            parent
                        )
                    end
                end
            )
            i = i + 1
        end
    end
end
function FxEngine.prototype.shove(self, u, dir, dist, dur, height)
    if height == nil then
        height = 0
    end
    local o = u:GetAbsOrigin()
    local c = o - dir * 50
    u:AddNewModifier(self.parent, nil, "modifier_knockback", {
        center_x = c.x,
        center_y = c.y,
        center_z = c.z,
        duration = dur,
        knockback_duration = dur,
        knockback_distance = dist,
        knockback_height = height,
        should_stun = 0
    })
end
function FxEngine.prototype.dash(self, f, ability, target)
    local parent = self.parent
    local from = parent:GetAbsOrigin()
    local to = f.to == "target" and target ~= nil and target:GetAbsOrigin() or ability:GetCursorPosition()
    local dir = to - from
    dir.z = 0
    if dir:Length2D() < 10 then
        dir = parent:GetForwardVector()
    end
    dir = dir:Normalized()
    if f.to == "back" then
        dir = dir * -1
    end
    local dist = self:num(f.dist, f)
    if f.to ~= "back" then
        dist = math.min(
            dist,
            math.max(
                150,
                (to - from):Length2D() - 100
            )
        )
    end
    self:later(
        0.05,
        function() return self:shove(
            parent,
            dir,
            dist,
            0.25,
            40
        ) end
    )
end
function FxEngine.prototype.pull(self, f, ability, target)
    local parent = self.parent
    local radius = self:num(f.radius, f)
    local dist = self:num(f.dist, f)
    local dmg = self:num(f.dmg, f)
    local ____temp_17
    if f.at == "self" then
        ____temp_17 = nil
    else
        ____temp_17 = f.at == "target" and target ~= nil and target:GetAbsOrigin() or ability:GetCursorPosition()
    end
    local center = ____temp_17
    self:later(
        self:num(f.delay, f),
        function()
            if not IsValidEntity(parent) then
                return
            end
            local c = center or parent:GetAbsOrigin()
            if f.pfx ~= nil then
                local p = ParticleManager:CreateParticle(f.pfx, PATTACH_WORLDORIGIN, nil)
                ParticleManager:SetParticleControl(p, 0, c)
                ParticleManager:SetParticleControl(
                    p,
                    1,
                    Vector(radius, radius, radius)
                )
                ParticleManager:ReleaseParticleIndex(p)
            end
            local units = FindUnitsInRadius(
                parent:GetTeamNumber(),
                c,
                nil,
                radius,
                DOTA_UNIT_TARGET_TEAM_ENEMY,
                DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
                DOTA_UNIT_TARGET_FLAG_NONE,
                FIND_ANY_ORDER,
                false
            )
            for ____, u in ipairs(units) do
                do
                    if not u:IsAlive() then
                        goto __continue157
                    end
                    local v = c - u:GetAbsOrigin()
                    local d = v:Length2D()
                    if d > 60 then
                        self:shove(
                            u,
                            v:Normalized(),
                            math.min(dist, d - 50),
                            0.3,
                            20
                        )
                    end
                    if dmg > 0 then
                        self:damage(
                            u,
                            dmg,
                            damageType(f.type),
                            f
                        )
                    end
                end
                ::__continue157::
            end
        end
    )
end
function FxEngine.prototype.illusions(self, f)
    local parent = self.parent
    if not parent:IsRealHero() then
        return
    end
    local dur = self:num(f.dur, f)
    local keys = {
        outgoing_damage = self:num(f.out, f),
        incoming_damage = self:num(f.inc, f),
        duration = dur,
        bounty_base = 0,
        bounty_growth = 0
    }
    local list = CreateIllusions(
        parent,
        parent,
        keys,
        f.n,
        90,
        true,
        true
    )
    if list ~= nil then
        for ____, ill in ipairs(list) do
            ill:AddNewModifier(parent, nil, "modifier_kill", {duration = dur})
        end
    end
    local foes = FindUnitsInRadius(
        parent:GetTeamNumber(),
        parent:GetAbsOrigin(),
        nil,
        1200,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
        FIND_CLOSEST,
        false
    )
    if list ~= nil then
        for ____, ill in ipairs(list) do
            if #foes > 0 then
                ill:MoveToTargetToAttack(foes[1])
            end
        end
    end
end
function FxEngine.prototype.plantTrap(self, f, ability, target)
    local parent = self.parent
    local pos = f.at == "self" and parent:GetAbsOrigin() or (f.at == "target" and target ~= nil and target:GetAbsOrigin() or ability:GetCursorPosition())
    local now = GameRules:GetGameTime()
    local mine = __TS__ArrayFilter(
        self.traps,
        function(____, t) return t.f.key == f.key end
    )
    if #mine >= f.max then
        self:removeTrap(mine[1])
    end
    local mark = ParticleManager:CreateParticleForTeam(
        RING_PFX,
        PATTACH_WORLDORIGIN,
        nil,
        parent:GetTeamNumber()
    )
    ParticleManager:SetParticleControl(mark, 0, pos)
    ParticleManager:SetParticleControl(
        mark,
        1,
        Vector(f.radius, 0, 0)
    )
    local ____self_traps_18 = self.traps
    ____self_traps_18[#____self_traps_18 + 1] = {
        f = f,
        pos = pos,
        armAt = now + f.arm,
        ["until"] = now + f.life,
        mark = mark
    }
end
function FxEngine.prototype.removeTrap(self, t)
    if t.mark ~= nil then
        ParticleManager:DestroyParticle(t.mark, true)
        ParticleManager:ReleaseParticleIndex(t.mark)
    end
    local i = __TS__ArrayIndexOf(self.traps, t)
    if i >= 0 then
        __TS__ArraySplice(self.traps, i, 1)
    end
end
function FxEngine.prototype.summon(self, f, ability)
    local parent = self.parent
    local pid = parent:GetPlayerOwnerID()
    local minute = math.max(
        0,
        GameRules:GetDOTATime(false, false) / 60
    )
    local dur = self:num(f.dur, f)
    do
        local i = 0
        while i < f.n do
            do
                local a = RandomFloat(0, math.pi * 2)
                local pos = parent:GetAbsOrigin() + Vector(
                    math.cos(a) * 150,
                    math.sin(a) * 150,
                    0
                )
                local u = CreateUnitByName(
                    f.unit,
                    pos,
                    true,
                    parent,
                    parent,
                    parent:GetTeamNumber()
                )
                if u == nil then
                    goto __continue178
                end
                u:SetOwner(parent)
                if pid >= 0 then
                    u:SetControllableByPlayer(pid, true)
                end
                local k = 1 + 0.07 * minute
                u:SetBaseMaxHealth(math.floor(u:GetMaxHealth() * k))
                u:SetMaxHealth(math.floor(u:GetMaxHealth() * k))
                u:SetHealth(u:GetMaxHealth())
                u:SetBaseDamageMin(math.floor(u:GetBaseDamageMin() * k))
                u:SetBaseDamageMax(math.floor(u:GetBaseDamageMax() * k))
                u:AddNewModifier(parent, ability, "modifier_kill", {duration = dur})
                local foes = FindUnitsInRadius(
                    parent:GetTeamNumber(),
                    pos,
                    nil,
                    900,
                    DOTA_UNIT_TARGET_TEAM_ENEMY,
                    DOTA_UNIT_TARGET_HERO,
                    DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
                    FIND_CLOSEST,
                    false
                )
                if #foes > 0 then
                    u:MoveToTargetToAttack(foes[1])
                end
            end
            ::__continue178::
            i = i + 1
        end
    end
end
function FxEngine.prototype.swap(self, target)
    local parent = self.parent
    if target == nil or not IsValidEntity(target) or not target:IsAlive() or target == parent then
        return
    end
    local a = parent:GetAbsOrigin()
    local b = target:GetAbsOrigin()
    FindClearSpaceForUnit(parent, b, true)
    FindClearSpaceForUnit(target, a, true)
    EmitSoundOn("Hero_VengefulSpirit.NetherSwap", parent)
end
function FxEngine.prototype.rewind(self, f)
    local parent = self.parent
    local pos = parent:GetAbsOrigin()
    local hp = parent:GetHealth()
    self:later(
        f.delay,
        function()
            if not IsValidEntity(parent) or not parent:IsAlive() then
                return
            end
            local p = ParticleManager:CreateParticle(REWIND_PFX, PATTACH_ABSORIGIN, parent)
            ParticleManager:ReleaseParticleIndex(p)
            FindClearSpaceForUnit(parent, pos, true)
            local lost = hp - parent:GetHealth()
            if lost > 0 then
                parent:Heal(
                    lost * self:num(f.heal, f) / 100,
                    self:ab(f.ab)
                )
            end
            EmitSoundOn("Hero_Weaver.TimeLapse", parent)
        end
    )
end
function FxEngine.prototype.blast(self, f, ability, target)
    local parent = self.parent
    local center
    if f.at == "self" then
        center = parent:GetAbsOrigin()
    elseif f.at == "target" and target ~= nil then
        center = target:GetAbsOrigin()
    else
        center = ability:GetCursorPosition()
    end
    local radius = self:num(f.radius, f)
    local dmg = self:num(f.dmg, f)
    local function fire()
        if not IsValidEntity(parent) then
            return
        end
        local c = f.at == "self" and parent:GetAbsOrigin() or center
        if f.pfx ~= nil then
            local p = ParticleManager:CreateParticle(f.pfx, PATTACH_WORLDORIGIN, nil)
            ParticleManager:SetParticleControl(p, 0, c)
            ParticleManager:SetParticleControl(
                p,
                1,
                Vector(radius, radius, radius)
            )
            ParticleManager:ReleaseParticleIndex(p)
        end
        local units = FindUnitsInRadius(
            parent:GetTeamNumber(),
            c,
            nil,
            radius,
            DOTA_UNIT_TARGET_TEAM_ENEMY,
            DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
            DOTA_UNIT_TARGET_FLAG_NONE,
            FIND_ANY_ORDER,
            false
        )
        for ____, u in ipairs(units) do
            do
                if not u:IsAlive() then
                    goto __continue195
                end
                self:damage(
                    u,
                    dmg,
                    damageType(f.type),
                    f
                )
                if f.debuff ~= nil then
                    self:applyDebuff(f, f.debuff, u)
                end
            end
            ::__continue195::
        end
    end
    self:later(
        self:num(f.delay, f),
        fire
    )
end
function FxEngine.prototype.onDealt(self, e)
    if self.applying then
        return
    end
    local parent = self.parent
    local victim = e.unit
    if not isEnemy(parent, victim) or e.damage <= 0 then
        return
    end
    if bit.band(e.damage_flags, DOTA_DAMAGE_FLAG_REFLECTION) ~= 0 then
        return
    end
    local inflictor = e.inflictor
    if inflictor == nil or inflictor:IsItem() then
        return
    end
    local name = inflictor:GetAbilityName()
    local now = GameRules:GetGameTime()
    if name == "zuus_lightning_bolt" then
        local ____opt_19 = self.zeus
        if ____opt_19 ~= nil then
            ____opt_19:bolt(victim, now)
        end
    end
    local ____opt_21 = self.maneuvers
    if ____opt_21 ~= nil then
        ____opt_21:spellHit(victim, inflictor, now)
    end
    for ____, f in ipairs(self.list) do
        do
            if f.t == "mark" then
                self:markHit(f, victim, name, now)
                goto __continue205
            end
            if f.ab ~= name then
                goto __continue205
            end
            if f.t == "hit" and f.by == "ab" then
                if self:hitAllowed(f, victim, now) then
                    self:act(f, victim, e.damage)
                end
            elseif f.t == "echo" then
                local pct = self:num(f.pct, f)
                local amount = e.damage * pct / 100
                local ____type = e.damage_type
                for ____, d in ipairs(f.delays) do
                    self:later(
                        d,
                        function()
                            if IsValidEntity(victim) and victim:IsAlive() and IsValidEntity(parent) then
                                self:damage(victim, amount, ____type, f)
                            end
                        end
                    )
                end
            end
        end
        ::__continue205::
    end
end
function FxEngine.prototype.onObservedAttack(self, e)
    if self.zeus ~= nil then
        self.zeus:attack(
            e,
            GameRules:GetGameTime()
        )
    end
end
function FxEngine.prototype.onAttack(self, e)
    local parent = self.parent
    local t = e.target
    if not isEnemy(parent, t) then
        return
    end
    local now = GameRules:GetGameTime()
    local ____opt_23 = self.maneuvers
    if ____opt_23 ~= nil then
        ____opt_23:attack(e, now)
    end
    for ____, f in ipairs(self.list) do
        do
            if f.t == "mark" then
                self:markHit(f, t, "attack", now)
                goto __continue220
            end
            if f.t ~= "hit" or f.by ~= "attack" then
                goto __continue220
            end
            if f.ab ~= "" then
                local a = self:ab(f.ab)
                if a == nil or a:GetLevel() <= 0 then
                    goto __continue220
                end
            end
            if f.every ~= nil and f.every > 1 then
                local k = (f.key .. ":") .. tostring(t:entindex())
                local n = (self.hits:get(k) or 0) + 1
                if n < f.every then
                    self.hits:set(k, n)
                    goto __continue220
                end
                self.hits:set(k, 0)
            end
            if self:hitAllowed(f, t, now) then
                self:act(f, t, e.damage)
            end
        end
        ::__continue220::
    end
end
function FxEngine.prototype.onTaken(self, e)
    if self.applying then
        return
    end
    local parent = self.parent
    local a = e.attacker
    if not isEnemy(parent, a) or not a:IsRealHero() or e.damage <= 0 then
        return
    end
    if bit.band(e.damage_flags, DOTA_DAMAGE_FLAG_REFLECTION) ~= 0 then
        return
    end
    local now = GameRules:GetGameTime()
    local ____opt_25 = self.maneuvers
    if ____opt_25 ~= nil then
        ____opt_25:taken(e, now)
    end
    for ____, f in ipairs(self.list) do
        do
            if f.t == "guard" then
                self:guardHit(f, e.damage, now)
                goto __continue233
            end
            if f.t ~= "taken" or not self:inWindow(f, f.win, now) then
                goto __continue233
            end
            self:damage(
                a,
                e.damage * self:num(f.reflect, f) / 100,
                DAMAGE_TYPE_PURE,
                f,
                DOTA_DAMAGE_FLAG_REFLECTION
            )
        end
        ::__continue233::
    end
end
function FxEngine.prototype.onKill(self, victim, inflictor)
    local parent = self.parent
    if not isEnemy(parent, victim) or not victim:IsRealHero() then
        return
    end
    local now = GameRules:GetGameTime()
    local iname = inflictor ~= nil and inflictor:GetAbilityName() or ""
    for ____, f in ipairs(self.list) do
        do
            if f.t ~= "kill" then
                goto __continue239
            end
            if f.by == "ab" and iname ~= f.ab then
                goto __continue239
            end
            if f.by == "win" and not self:inWindow(f, f.win, now) then
                goto __continue239
            end
            if f.refresh ~= nil then
                for ____, n in ipairs(f.refresh) do
                    local a = self:ab(n == "self" and f.ab or n)
                    if a ~= nil then
                        a:EndCooldown()
                    end
                end
            end
            if f.cdpct ~= nil then
                local a = self:ab(f.ab)
                if a ~= nil then
                    local left = a:GetCooldownTimeRemaining()
                    if left > 0 then
                        a:EndCooldown()
                        a:StartCooldown(left * (1 - self:num(f.cdpct, f) / 100))
                    end
                end
            end
            if f.heal ~= nil then
                parent:Heal(
                    parent:GetMaxHealth() * self:num(f.heal, f) / 100,
                    self:ab(f.ab)
                )
            end
            if f.manapct ~= nil then
                parent:GiveMana(parent:GetMaxMana() * self:num(f.manapct, f) / 100)
            end
            if f.ext ~= nil then
                local sec = self:num(f.ext.sec, f)
                for ____, m in ipairs(parent:FindAllModifiers()) do
                    local n = m:GetName()
                    for ____, part in ipairs(f.ext.parts) do
                        if (string.find(n, part, nil, true) or 0) - 1 >= 0 and m:GetDuration() > 0 then
                            m:SetDuration(
                                m:GetRemainingTime() + sec,
                                true
                            )
                            break
                        end
                    end
                end
                local at = self.lastCast:get(f.ab)
                if at ~= nil then
                    self.lastCast:set(f.ab, at + sec)
                end
            end
            if f.stack ~= nil then
                local name = fxModifierName(f.key)
                local m = parent:FindModifierByName(name) or parent:AddNewModifier(
                    parent,
                    self:ab(f.ab),
                    name,
                    {}
                )
                if m ~= nil and m:GetStackCount() < f.stack.max then
                    m:IncrementStackCount()
                end
            end
        end
        ::__continue239::
    end
end
function FxEngine.prototype.crit(self, t)
    if t == nil or not isEnemy(self.parent, t) then
        return 0
    end
    local now = GameRules:GetGameTime()
    local best = 0
    for ____, f in ipairs(self.list) do
        do
            if f.t ~= "crit" then
                goto __continue264
            end
            if (f.heroOnly or 0) > 0 and not t:IsRealHero() then
                goto __continue264
            end
            if not self:inWindow(f, f.win, now) then
                goto __continue264
            end
            if f.lowhp ~= nil and t:GetHealthPercent() >= f.lowhp then
                goto __continue264
            end
            if RandomFloat(0, 100) >= self:num(f.chance, f) then
                goto __continue264
            end
            best = math.max(
                best,
                self:num(f.mult, f)
            )
        end
        ::__continue264::
    end
    return best
end
function FxEngine.prototype.outgoing(self, t, inflictor)
    if t == nil or not isEnemy(self.parent, t) then
        return 0
    end
    local pct = 0
    for ____, f in ipairs(self.list) do
        do
            if f.t ~= "vs" then
                goto __continue273
            end
            if (f.attackOnly or 0) > 0 and inflictor ~= nil then
                goto __continue273
            end
            if not self:condOk(f.cond, f.lowhp, t) then
                goto __continue273
            end
            pct = pct + self:num(f.pct, f)
        end
        ::__continue273::
    end
    return pct
end
function FxEngine.prototype.syncCharges(self)
    local b = self.listFor
    if b == nil then
        return
    end
    do
        local i = 0
        while i < self.parent:GetAbilityCount() do
            do
                local ability = self.parent:GetAbilityByIndex(i)
                if ability == nil or ability:IsPassive() or ability:GetLevel() <= 0 then
                    goto __continue280
                end
                local extra = bonusAbilityCharges(
                    b,
                    ability:GetAbilityName(),
                    ability:GetAbilityType() == 1
                )
                local granted = self.grantedCharges:get(ability) or 0
                if extra <= granted then
                    goto __continue280
                end
                local level = ability:GetLevel() - 1
                local nativeMax = ability:GetMaxAbilityCharges(level)
                if nativeMax <= 0 then
                    goto __continue280
                end
                local converting = granted == 0 and ability:GetLevelSpecialValueNoOverride("AbilityCharges", level) <= 0
                local oldCooldown = converting and ability:GetCooldownTimeRemaining() or 0
                local readyCast = converting and oldCooldown <= 0 and 1 or 0
                ability:SetCurrentAbilityCharges(math.min(
                    nativeMax,
                    ability:GetCurrentAbilityCharges() + extra - granted + readyCast
                ))
                if oldCooldown > 0 then
                    ability:EndCooldown()
                end
                ability:MarkAbilityButtonDirty()
                self.grantedCharges:set(ability, extra)
            end
            ::__continue280::
            i = i + 1
        end
    end
end
function FxEngine.prototype.think(self)
    local parent = self.parent
    local now = GameRules:GetGameTime()
    if #self.pending > 0 then
        local due = __TS__ArrayFilter(
            self.pending,
            function(____, p) return p.at <= now end
        )
        if #due > 0 then
            self.pending = __TS__ArrayFilter(
                self.pending,
                function(____, p) return p.at > now end
            )
            for ____, p in ipairs(due) do
                p:run()
            end
        end
    end
    self:syncCharges()
    self:combatTick(now)
    local alive = parent:IsAlive()
    local pos = parent:GetAbsOrigin()
    if self.lastPos == nil or (pos - self.lastPos):Length2D() > 5 then
        self.stillSince = now
    end
    self.lastPos = pos
    local auraTick = now - self.lastAura >= 0.5
    if auraTick then
        self.lastAura = now
    end
    for ____, f in ipairs(self.list) do
        if f.t == "passive" then
            local a = self:ab(f.ab)
            local lvl = a ~= nil and a:GetLevel() or 1
            local on = f.ab == "" or lvl > 0
            self:keep(f, on, (f.perlvl or 0) > 0 and lvl or 0)
        elseif f.t == "lowhp" then
            self:keep(
                f,
                alive and parent:GetHealthPercent() < f.thr
            )
        elseif f.t == "stacks" then
            local n = 0
            for ____, m in ipairs(parent:FindAllModifiers()) do
                if (string.find(
                    m:GetName(),
                    f.mod,
                    nil,
                    true
                ) or 0) - 1 >= 0 and (string.find(
                    m:GetName(),
                    "modifier_orb_",
                    nil,
                    true
                ) or 0) - 1 < 0 then
                    n = math.max(
                        n,
                        m:GetStackCount()
                    )
                end
            end
            local on = alive and n >= self:num(f.min, f) and n > 0
            self:keep(f, on, (f.perstack or 0) > 0 and n or 0)
        elseif f.t == "still" then
            self:keep(f, alive and now - self.stillSince >= f.delay)
        elseif f.t == "auto" and alive then
            self:autoTick(f, now)
        elseif f.t == "storm" and alive and self:inWindow(f, f.win, now) then
            self:stormTick(f, now)
        else
            local ____temp_29 = f.t == "trail" and alive and self:inWindow(f, f.win, now)
            if ____temp_29 then
                local ____opt_27 = self:ab(f.ab)
                ____temp_29 = (____opt_27 and ____opt_27:GetLevel() or 1) > 0
            end
            if ____temp_29 then
                if now - self.lastTrailAt >= 0.3 and self.lastPos ~= nil and now - self.stillSince < 0.15 then
                    self.lastTrailAt = now
                    local fx
                    if f.pfx ~= nil then
                        fx = ParticleManager:CreateParticle(f.pfx, PATTACH_WORLDORIGIN, nil)
                        ParticleManager:SetParticleControl(fx, 0, pos)
                        ParticleManager:SetParticleControl(
                            fx,
                            1,
                            Vector(f.radius, f.radius, f.radius)
                        )
                    end
                    local ____self_trail_30 = self.trail
                    ____self_trail_30[#____self_trail_30 + 1] = {f = f, pos = pos, ["until"] = now + f.life, fx = fx}
                end
            elseif f.t == "aura" and auraTick and alive and self:inWindow(f, f.win, now) then
                local r = self:num(f.radius, f)
                local ____FindUnitsInRadius_34 = FindUnitsInRadius
                local ____temp_32 = parent:GetTeamNumber()
                local ____DOTA_UNIT_TARGET_TEAM_ENEMY_33 = DOTA_UNIT_TARGET_TEAM_ENEMY
                local ____temp_31
                if (f.heroOnly or 0) > 0 then
                    ____temp_31 = DOTA_UNIT_TARGET_HERO
                else
                    ____temp_31 = DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC
                end
                local units = ____FindUnitsInRadius_34(
                    ____temp_32,
                    pos,
                    nil,
                    r,
                    ____DOTA_UNIT_TARGET_TEAM_ENEMY_33,
                    ____temp_31,
                    DOTA_UNIT_TARGET_FLAG_NONE,
                    FIND_ANY_ORDER,
                    false
                )
                for ____, u in ipairs(units) do
                    if u:IsAlive() and ((f.heroOnly or 0) <= 0 or u:IsRealHero() and not u:IsDebuffImmune()) then
                        u:AddNewModifier(
                            parent,
                            self:ab(f.ab),
                            fxModifierName(f.key),
                            {duration = 0.6}
                        )
                    end
                end
            end
        end
    end
    self:trailTick(now)
    self:trapTick(now)
end
function FxEngine.prototype.autoTick(self, f, now)
    local parent = self.parent
    local at = self.autoAt:get(f.key) or now + 2
    if not self.autoAt:has(f.key) then
        self.autoAt:set(f.key, at)
    end
    if now < at then
        return
    end
    local ability = self:ab(f.ab)
    if ability == nil or ability:GetLevel() <= 0 or parent:IsStunned() or parent:IsSilenced() or parent:IsInvisible() then
        return
    end
    local range = self:num(f.range, f)
    local ____temp_35
    if (f.heroOnly or 0) > 0 then
        ____temp_35 = DOTA_UNIT_TARGET_HERO
    else
        ____temp_35 = DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC
    end
    local ____type = ____temp_35
    local foes = FindUnitsInRadius(
        parent:GetTeamNumber(),
        parent:GetAbsOrigin(),
        nil,
        range,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        ____type,
        DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
        FIND_CLOSEST,
        false
    )
    local t
    for ____, u in ipairs(foes) do
        if u:IsAlive() and not u:IsInvulnerable() then
            t = u
            break
        end
    end
    if t == nil then
        return
    end
    self.autoAt:set(
        f.key,
        now + self:num(f.every, f)
    )
    self:freeCast(
        ability,
        t,
        t:GetAbsOrigin()
    )
end
function FxEngine.prototype.stormTick(self, f, now)
    local parent = self.parent
    local at = self.stormAt:get(f.key) or 0
    if now < at then
        return
    end
    self.stormAt:set(f.key, now + f.every)
    local foes = FindUnitsInRadius(
        parent:GetTeamNumber(),
        parent:GetAbsOrigin(),
        nil,
        self:num(f.radius, f),
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE,
        FIND_ANY_ORDER,
        false
    )
    local alive = __TS__ArrayFilter(
        foes,
        function(____, u) return u:IsAlive() end
    )
    if #alive == 0 then
        return
    end
    local heroes = __TS__ArrayFilter(
        alive,
        function(____, u) return u:IsRealHero() end
    )
    local pool = #heroes > 0 and heroes or alive
    local t = pool[RandomInt(0, #pool - 1) + 1]
    local p = ParticleManager:CreateParticle(STORM_PFX, PATTACH_WORLDORIGIN, nil)
    local tp = t:GetAbsOrigin()
    ParticleManager:SetParticleControl(
        p,
        0,
        Vector(tp.x, tp.y, tp.z + 1000)
    )
    ParticleManager:SetParticleControl(p, 1, tp)
    ParticleManager:ReleaseParticleIndex(p)
    EmitSoundOn("Hero_Zuus.LightningBolt", t)
    self:damage(
        t,
        self:num(f.dmg, f),
        damageType(f.type),
        f
    )
    if f.debuff ~= nil then
        self:applyDebuff(f, f.debuff, t)
    end
end
function FxEngine.prototype.trailTick(self, now)
    if #self.trail == 0 then
        return
    end
    local parent = self.parent
    local keep = {}
    for ____, tp in ipairs(self.trail) do
        if now < tp["until"] then
            keep[#keep + 1] = tp
        elseif tp.fx ~= nil then
            ParticleManager:DestroyParticle(tp.fx, false)
            ParticleManager:ReleaseParticleIndex(tp.fx)
        end
    end
    self.trail = keep
    if now - self.lastTrailTick < 0.5 or #keep == 0 then
        return
    end
    self.lastTrailTick = now
    local hit = __TS__New(Set)
    for ____, tp in ipairs(keep) do
        local units = FindUnitsInRadius(
            parent:GetTeamNumber(),
            tp.pos,
            nil,
            tp.f.radius,
            DOTA_UNIT_TARGET_TEAM_ENEMY,
            DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
            DOTA_UNIT_TARGET_FLAG_NONE,
            FIND_ANY_ORDER,
            false
        )
        for ____, u in ipairs(units) do
            do
                if hit:has(u) or not u:IsAlive() then
                    goto __continue334
                end
                hit:add(u)
                self:damage(
                    u,
                    self:num(tp.f.dps, tp.f) * 0.5,
                    damageType(tp.f.type),
                    tp.f
                )
                if tp.f.debuff ~= nil then
                    self:applyDebuff(tp.f, tp.f.debuff, u)
                end
            end
            ::__continue334::
        end
    end
end
function FxEngine.prototype.trapTick(self, now)
    if #self.traps == 0 then
        return
    end
    local parent = self.parent
    for ____, t in ipairs(__TS__ArraySlice(self.traps)) do
        do
            if now >= t["until"] then
                self:removeTrap(t)
                goto __continue341
            end
            if now < t.armAt then
                goto __continue341
            end
            local foes = FindUnitsInRadius(
                parent:GetTeamNumber(),
                t.pos,
                nil,
                t.f.radius,
                DOTA_UNIT_TARGET_TEAM_ENEMY,
                DOTA_UNIT_TARGET_HERO,
                DOTA_UNIT_TARGET_FLAG_NONE,
                FIND_ANY_ORDER,
                false
            )
            if not __TS__ArraySome(
                foes,
                function(____, u) return u:IsAlive() and u:IsRealHero() end
            ) then
                goto __continue341
            end
            self:removeTrap(t)
            if t.f.pfx ~= nil then
                local p = ParticleManager:CreateParticle(t.f.pfx, PATTACH_WORLDORIGIN, nil)
                ParticleManager:SetParticleControl(p, 0, t.pos)
                ParticleManager:SetParticleControl(
                    p,
                    1,
                    Vector(t.f.radius, t.f.radius, t.f.radius)
                )
                ParticleManager:ReleaseParticleIndex(p)
            end
            StartSoundEventFromPosition("Hero_Techies.LandMine.Detonate", t.pos)
            local all = FindUnitsInRadius(
                parent:GetTeamNumber(),
                t.pos,
                nil,
                t.f.radius * 1.4,
                DOTA_UNIT_TARGET_TEAM_ENEMY,
                DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
                DOTA_UNIT_TARGET_FLAG_NONE,
                FIND_ANY_ORDER,
                false
            )
            for ____, u in ipairs(all) do
                do
                    if not u:IsAlive() then
                        goto __continue347
                    end
                    self:damage(
                        u,
                        self:num(t.f.dmg, t.f),
                        damageType(t.f.type),
                        t.f
                    )
                    if t.f.debuff ~= nil then
                        self:applyDebuff(t.f, t.f.debuff, u)
                    end
                end
                ::__continue347::
            end
        end
        ::__continue341::
    end
end
function FxEngine.prototype.comboCast(self, f, name, now)
    local state = self.comboStates:get(f.key) or ({casts = {}, readyAt = 0})
    self.comboStates:set(f.key, state)
    if not advanceCombo(
        state,
        f.abs,
        f.need,
        f.within,
        f.icd,
        name,
        now
    ) then
        return
    end
    local parent = self.parent
    if not parent:IsAlive() then
        return
    end
    parent:AddNewModifier(
        parent,
        self:ab(f.ab),
        fxModifierName(f.key),
        {duration = self:num(f.dur, f)}
    )
    local radius = self:num(f.radius, f)
    local amount = self:num(f.dmg, f)
    if radius <= 0 or amount <= 0 then
        return
    end
    local units = FindUnitsInRadius(
        parent:GetTeamNumber(),
        parent:GetAbsOrigin(),
        nil,
        radius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_ANY_ORDER,
        false
    )
    for ____, u in ipairs(units) do
        if u:IsAlive() and u:IsRealHero() then
            self:damage(u, amount, DAMAGE_TYPE_MAGICAL, f)
        end
    end
    local fx = ParticleManager:CreateParticle(STORM_PFX, PATTACH_ABSORIGIN_FOLLOW, parent)
    ParticleManager:SetParticleControl(
        fx,
        0,
        parent:GetAbsOrigin() + Vector(0, 0, 300)
    )
    ParticleManager:SetParticleControl(
        fx,
        1,
        parent:GetAbsOrigin()
    )
    ParticleManager:ReleaseParticleIndex(fx)
end
function FxEngine.prototype.removeZone(self, zone)
    for ____, fx in ipairs(zone.rings) do
        ParticleManager:DestroyParticle(fx, true)
        ParticleManager:ReleaseParticleIndex(fx)
    end
    self.zones = __TS__ArrayFilter(
        self.zones,
        function(____, z) return z ~= zone end
    )
end
function FxEngine.prototype.startZone(self, f, ability, target)
    for ____, zone in ipairs(__TS__ArraySlice(self.zones)) do
        if zone.f.key == f.key then
            self:removeZone(zone)
        end
    end
    if f.group ~= nil then
        local previous = __TS__ArrayFind(
            self.zones,
            function(____, z) return z.f.group == f.group end
        )
        if previous ~= nil then
            if self:num(previous.f.entryDmg, previous.f) > self:num(f.entryDmg, f) then
                return
            end
            self:removeZone(previous)
        end
    end
    local pos = f.at == "self" and self.parent:GetAbsOrigin() or (f.at == "target" and target ~= nil and target:GetAbsOrigin() or ability:GetCursorPosition())
    local rings = {}
    for ____, radius in ipairs({f.radius, f.inner or 0}) do
        do
            if radius <= 0 then
                goto __continue371
            end
            local fx = ParticleManager:CreateParticle(RING_PFX, PATTACH_WORLDORIGIN, nil)
            ParticleManager:SetParticleControl(fx, 0, pos)
            ParticleManager:SetParticleControl(
                fx,
                1,
                Vector(radius, 0, 0)
            )
            ParticleManager:SetParticleControl(
                fx,
                2,
                Vector(160, 120, 60)
            )
            rings[#rings + 1] = fx
        end
        ::__continue371::
    end
    local now = GameRules:GetGameTime()
    local ____self_zones_36 = self.zones
    ____self_zones_36[#____self_zones_36 + 1] = {
        f = f,
        pos = pos,
        ["until"] = now + self:num(f.dur, f),
        next = now + f.every,
        rings = rings,
        entered = __TS__New(Set)
    }
end
function FxEngine.prototype.startTether(self, f, castTarget)
    local epoch = self.combatEpoch
    local acquire
    acquire = function(retries)
        local parent = self.parent
        if epoch ~= self.combatEpoch or not IsValidEntity(parent) or not parent:IsAlive() then
            return
        end
        local target = castTarget
        if target == nil then
            local units = FindUnitsInRadius(
                parent:GetTeamNumber(),
                parent:GetAbsOrigin(),
                nil,
                f.range,
                DOTA_UNIT_TARGET_TEAM_ENEMY,
                DOTA_UNIT_TARGET_HERO,
                DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE + DOTA_UNIT_TARGET_FLAG_NO_INVIS,
                FIND_CLOSEST,
                false
            )
            target = __TS__ArrayFind(
                units,
                function(____, u) return u:IsRealHero() and u:IsAlive() and self:hasOwnCombatModifier(u, f.targetMod) end
            )
        end
        if not isEnemy(parent, target) or not target:IsRealHero() or not target:IsAlive() then
            if castTarget == nil and f.targetMod ~= nil and retries > 0 then
                self:later(
                    0.15,
                    function() return acquire(retries - 1) end
                )
            end
            return
        end
        local now = GameRules:GetGameTime()
        self.tethers:set(
            f.key,
            {
                f = f,
                target = target,
                ["until"] = now + self:num(f.dur, f),
                next = now + f.every,
                streak = 0,
                finished = false
            }
        )
    end
    self:later(
        f.delay or 0,
        function() return acquire(6) end
    )
end
function FxEngine.prototype.hasOwnCombatModifier(self, unit, name)
    return name == nil or __TS__ArraySome(
        unit:FindAllModifiers(),
        function(____, mod) return mod:GetName() == name and mod:GetCaster() == self.parent end
    )
end
function FxEngine.prototype.markHit(self, f, target, source, now, cast)
    if cast == nil then
        cast = false
    end
    if not isEnemy(self.parent, target) or not target:IsAlive() or not target:IsRealHero() or target:IsInvulnerable() or target:IsDebuffImmune() then
        return
    end
    local consume = not cast and __TS__ArrayIncludes(f.consume, source)
    local ____temp_38 = f.ab == source
    if ____temp_38 then
        local ____cast_37
        if cast then
            ____cast_37 = f.by == "cast"
        else
            ____cast_37 = f.by == "ab"
        end
        ____temp_38 = ____cast_37
    end
    local place = ____temp_38 or source == "attack" and f.nativeMark ~= nil and self:hasOwnCombatModifier(target, f.nativeMark)
    if not consume and not place then
        return
    end
    local set = self.marks:get(f.key) or __TS__New(Map)
    self.marks:set(f.key, set)
    local active = 0
    for ____, ____value in __TS__Iterator(set) do
        local id = ____value[1]
        local m = ____value[2]
        if now - m.at >= f.icd then
            set:delete(id)
        elseif not m.spent and now - m.at < f.dur and not m.mod:IsNull() then
            active = active + 1
        end
    end
    local id = target:entindex()
    local mark = set:get(id)
    if mark ~= nil then
        local newCast = not f.nextCast or (self.lastCast:get(source) or -1) > (mark.castAt or -1)
        if consume and newCast and not mark.spent and now - mark.at >= (f.arm or 0) and now - mark.at < f.dur and not mark.mod:IsNull() then
            mark.spent = true
            mark.mod:Destroy()
            local dealt = self:damage(
                target,
                self:num(f.dmg, f),
                DAMAGE_TYPE_MAGICAL,
                f
            )
            if dealt > 0 and (f.heal or 0) > 0 and self.parent:IsAlive() then
                self.parent:Heal(
                    self.parent:GetMaxHealth() * (f.heal or 0) / 100,
                    self:ab(f.ab)
                )
            end
        end
        return
    end
    if not place or active >= f.max then
        return
    end
    local mod = target:AddNewModifier(
        self.parent,
        self:ab(f.ab),
        fxModifierName(f.key),
        {duration = f.dur}
    )
    if mod ~= nil then
        set:set(
            id,
            {
                at = now,
                castAt = self.lastCast:get(f.ab),
                mod = mod,
                spent = false
            }
        )
    end
end
function FxEngine.prototype.guardHit(self, f, damage, now)
    local state = self.guards:get(f.key)
    local parent = self.parent
    if state == nil or now >= state["until"] or now < state.readyAt or not parent:IsAlive() then
        return
    end
    state.damage = state.damage + damage
    if state.damage < parent:GetMaxHealth() * f.thr / 100 then
        return
    end
    state["until"] = 0
    state.readyAt = now + f.icd
    parent:AddNewModifier(
        parent,
        self:ab(f.ab),
        fxModifierName(f.key),
        {duration = f.dur}
    )
    if f.heal ~= nil then
        parent:Heal(
            parent:GetMaxHealth() * f.heal / 100,
            self:ab(f.ab)
        )
    end
    local amount = self:num(f.dmg, f)
    if amount <= 0 then
        return
    end
    local units = FindUnitsInRadius(
        parent:GetTeamNumber(),
        parent:GetAbsOrigin(),
        nil,
        f.radius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_ANY_ORDER,
        false
    )
    for ____, u in ipairs(units) do
        if u:IsAlive() and u:IsRealHero() then
            self:damage(u, amount, DAMAGE_TYPE_MAGICAL, f)
        end
    end
end
function FxEngine.prototype.wireMarker(self, pos)
    local fx = ParticleManager:CreateParticle(RING_PFX, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(fx, 0, pos)
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(WIRE_END_RADIUS, 0, 0)
    )
    ParticleManager:SetParticleControl(
        fx,
        2,
        Vector(110, 185, 255)
    )
    return fx
end
function FxEngine.prototype.clearWire(self)
    local ____opt_39 = self.wire
    local particles = ____opt_39 and ____opt_39.particles or (self.wireAnchor == nil and ({}) or ({self.wireAnchor.marker}))
    for ____, fx in ipairs(particles) do
        ParticleManager:DestroyParticle(fx, true)
        ParticleManager:ReleaseParticleIndex(fx)
    end
    self.wireAnchor = nil
    self.wire = nil
end
function FxEngine.prototype.castWire(self, f, now)
    local parent = self.parent
    local pos = parent:GetAbsOrigin()
    local ____now_46 = now
    local ____opt_41 = self.wire
    local ____temp_45 = ____opt_41 and ____opt_41["until"]
    if ____temp_45 == nil then
        local ____opt_43 = self.wireAnchor
        ____temp_45 = ____opt_43 and ____opt_43["until"]
    end
    if ____now_46 >= (____temp_45 or math.huge) then
        self:clearWire()
    end
    local wire = self.wire
    if wire ~= nil then
        if now < wire.armAt or not wire.leftEnds or parent:IsRooted() or parent:HasModifier("modifier_slark_pounce_leash") or parent:HasModifier("modifier_puck_dream_coil") then
            return
        end
        local destination = nearWireEnd(pos, wire.start) and wire["end"] or (nearWireEnd(pos, wire["end"]) and wire.start or nil)
        if destination == nil then
            return
        end
        self:clearWire()
        FindClearSpaceForUnit(parent, destination, true)
        return
    end
    if now < self.wireReadyAt then
        return
    end
    local anchor = self.wireAnchor
    if anchor == nil then
        self.wireAnchor = {
            pos = pos,
            ["until"] = now + f.within,
            marker = self:wireMarker(pos)
        }
        return
    end
    local span = length2D(pos.x - anchor.pos.x, pos.y - anchor.pos.y)
    if span < f.minDist or span > f.maxDist or math.abs(pos.z - anchor.pos.z) >= 220 then
        return
    end
    local beam = ParticleManager:CreateParticle(WIRE_PFX, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(
        beam,
        0,
        Vector(anchor.pos.x, anchor.pos.y, anchor.pos.z + 70)
    )
    ParticleManager:SetParticleControl(
        beam,
        1,
        Vector(pos.x, pos.y, pos.z + 70)
    )
    self.wire = {
        start = anchor.pos,
        ["end"] = pos,
        f = f,
        armAt = now + f.arm,
        ["until"] = now + f.dur,
        charges = f.max,
        particles = {
            anchor.marker,
            beam,
            self:wireMarker(pos)
        },
        hit = __TS__New(Set),
        leftEnds = false
    }
    self.wireAnchor = nil
    self.wireReadyAt = now + f.icd
end
function FxEngine.prototype.tickWire(self, now)
    local ____now_52 = now
    local ____opt_47 = self.wire
    local ____temp_51 = ____opt_47 and ____opt_47["until"]
    if ____temp_51 == nil then
        local ____opt_49 = self.wireAnchor
        ____temp_51 = ____opt_49 and ____opt_49["until"]
    end
    if ____now_52 >= (____temp_51 or math.huge) then
        self:clearWire()
    end
    local wire = self.wire
    if wire == nil then
        return
    end
    local start = wire.start
    local ____end = wire["end"]
    local f = wire.f
    local pos = self.parent:GetAbsOrigin()
    if not nearWireEnd(pos, start) and not nearWireEnd(pos, ____end) then
        wire.leftEnds = true
    end
    if now < wire.armAt then
        return
    end
    local dx = ____end.x - start.x
    local dy = ____end.y - start.y
    local length = length2D(dx, dy)
    local center = Vector((start.x + ____end.x) / 2, (start.y + ____end.y) / 2, (start.z + ____end.z) / 2)
    local targets = FindUnitsInRadius(
        self.parent:GetTeamNumber(),
        center,
        nil,
        length / 2 + f.radius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE + DOTA_UNIT_TARGET_FLAG_NO_INVIS,
        FIND_CLOSEST,
        false
    )
    for ____, target in ipairs(targets) do
        do
            if not target:IsRealHero() or not target:IsAlive() or target:IsInvulnerable() or target:IsDebuffImmune() or wire.hit:has(target:entindex()) then
                goto __continue422
            end
            local p = target:GetAbsOrigin()
            local along = math.max(
                0,
                math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / (length * length))
            )
            local nx = p.x - (start.x + along * dx)
            local ny = p.y - (start.y + along * dy)
            local d = length2D(nx, ny)
            if d > f.radius or math.abs(p.z - (start.z + along * (____end.z - start.z))) > 135 then
                goto __continue422
            end
            local direction = d > 0.01 and Vector(nx / d, ny / d, 0) or Vector(-dy / length, dx / length, 0)
            wire.hit:add(target:entindex())
            wire.charges = wire.charges - 1
            self:shove(target, direction, f.dist, 0.25)
            self:applyDebuff(f, f.debuff, target)
            EmitSoundOn("Hero_Zuus.LightningBolt", target)
            if wire.charges <= 0 then
                self:clearWire()
                return
            end
        end
        ::__continue422::
    end
end
function FxEngine.prototype.combatTick(self, now)
    local parent = self.parent
    if not parent:IsAlive() then
        self:clearCombat()
        return
    end
    self:tickWire(now)
    local ____opt_53 = self.zeus
    if ____opt_53 ~= nil then
        ____opt_53:tick(now)
    end
    local ____opt_55 = self.maneuvers
    if ____opt_55 ~= nil then
        ____opt_55:tick(now)
    end
    for ____, zone in ipairs(__TS__ArraySlice(self.zones)) do
        do
            if now >= zone["until"] then
                self:removeZone(zone)
                goto __continue429
            end
            if now < zone.next then
                goto __continue429
            end
            zone.next = now + zone.f.every
            local f = zone.f
            local units = FindUnitsInRadius(
                parent:GetTeamNumber(),
                zone.pos,
                nil,
                f.radius,
                DOTA_UNIT_TARGET_TEAM_ENEMY,
                DOTA_UNIT_TARGET_HERO,
                DOTA_UNIT_TARGET_FLAG_NONE,
                FIND_ANY_ORDER,
                false
            )
            for ____, u in ipairs(units) do
                do
                    if not u:IsAlive() or not u:IsRealHero() or not insideRing(
                        (u:GetAbsOrigin() - zone.pos):Length2D(),
                        f.inner or 0,
                        f.radius
                    ) then
                        goto __continue432
                    end
                    local id = u:entindex()
                    local entry = not zone.entered:has(id) and self:num(f.entryDmg, f) or 0
                    zone.entered:add(id)
                    self:damage(
                        u,
                        self:num(f.dmg, f) + entry,
                        DAMAGE_TYPE_MAGICAL,
                        f
                    )
                    if f.debuff ~= nil and not u:IsDebuffImmune() then
                        self:applyDebuff(f, f.debuff, u)
                    end
                end
                ::__continue432::
            end
        end
        ::__continue429::
    end
    for ____, ____value in __TS__Iterator(self.tethers) do
        local key = ____value[1]
        local link = ____value[2]
        do
            local f = link.f
            local target = link.target
            if now >= link["until"] or not IsValidEntity(target) or not target:IsAlive() or f.ownerMod ~= nil and not self:hasOwnCombatModifier(parent, f.ownerMod) and not self:hasOwnCombatModifier(target, f.ownerMod) or not self:hasOwnCombatModifier(target, f.targetMod) then
                self.tethers:delete(key)
                goto __continue437
            end
            local band = tetherBand(
                (target:GetAbsOrigin() - parent:GetAbsOrigin()):Length2D(),
                f.minDist or 0,
                f.maxDist,
                f.breakRange
            )
            if band == "broken" then
                self.tethers:delete(key)
                goto __continue437
            end
            if band ~= "active" or target:IsInvulnerable() or target:IsDebuffImmune() then
                link.streak = 0
                goto __continue437
            end
            if now < link.next then
                goto __continue437
            end
            link.next = now + f.every
            if f.isolated ~= nil then
                local nearby = FindUnitsInRadius(
                    parent:GetTeamNumber(),
                    target:GetAbsOrigin(),
                    nil,
                    f.isolated,
                    DOTA_UNIT_TARGET_TEAM_ENEMY,
                    DOTA_UNIT_TARGET_HERO,
                    DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES + DOTA_UNIT_TARGET_FLAG_INVULNERABLE,
                    FIND_ANY_ORDER,
                    false
                )
                if __TS__ArraySome(
                    nearby,
                    function(____, u) return u ~= target and u:IsAlive() and u:IsRealHero() end
                ) then
                    link.streak = 0
                    goto __continue437
                end
            end
            link.streak = link.streak + 1
            local amount = self:num(f.dmg, f)
            if not link.finished and f.finishTicks ~= nil and link.streak >= f.finishTicks then
                link.finished = true
                amount = amount + self:num(f.finishDmg, f)
            end
            local dealt = self:damage(target, amount, DAMAGE_TYPE_MAGICAL, f)
            if f.heal ~= nil and dealt > 0 then
                parent:Heal(
                    dealt * f.heal / 100,
                    self:ab(f.ab)
                )
            end
            local fx = ParticleManager:CreateParticle(CHAIN_PFX, PATTACH_CUSTOMORIGIN, parent)
            ParticleManager:SetParticleControl(
                fx,
                0,
                parent:GetAbsOrigin()
            )
            ParticleManager:SetParticleControl(
                fx,
                1,
                target:GetAbsOrigin()
            )
            ParticleManager:ReleaseParticleIndex(fx)
        end
        ::__continue437::
    end
end
function FxEngine.prototype.clearCombat(self)
    self.combatEpoch = self.combatEpoch + 1
    self:clearWire()
    local ____opt_57 = self.zeus
    if ____opt_57 ~= nil then
        ____opt_57:clear()
    end
    local ____opt_59 = self.maneuvers
    if ____opt_59 ~= nil then
        ____opt_59:clear()
    end
    for ____, zone in ipairs(__TS__ArraySlice(self.zones)) do
        self:removeZone(zone)
    end
    self.tethers:clear()
    for ____, set in __TS__Iterator(self.marks:values()) do
        for ____, mark in __TS__Iterator(set:values()) do
            if not mark.spent and not mark.mod:IsNull() then
                mark.mod:Destroy()
            end
        end
    end
    self.marks:clear()
    for ____, state in __TS__Iterator(self.guards:values()) do
        state["until"] = 0
    end
    for ____, state in __TS__Iterator(self.comboStates:values()) do
        state.casts = {}
    end
end
function FxEngine.prototype.clear(self)
    self:clearCombat()
    for ____, t in ipairs(__TS__ArraySlice(self.traps)) do
        self:removeTrap(t)
    end
    for ____, tp in ipairs(self.trail) do
        if tp.fx ~= nil then
            ParticleManager:DestroyParticle(tp.fx, true)
            ParticleManager:ReleaseParticleIndex(tp.fx)
        end
    end
    self.trail = {}
end
return ____exports
