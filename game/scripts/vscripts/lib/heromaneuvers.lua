local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArraySome = ____lualib.__TS__ArraySome
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local ____exports = {}
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____fxtypes = require("core.fxtypes")
local fxModifierName = ____fxtypes.fxModifierName
local RING = "particles/ui_mouseactions/range_display.vpcf"
local SWING = "particles/items_fx/battlefury_cleave.vpcf"
local WIND = "particles/units/heroes/hero_windrunner/windrunner_spell_powershot.vpcf"
local JUGG_OMNI = "modifier_juggernaut_omnislash"
local SVEN_GOD = "modifier_sven_gods_strength"
local PA_BLUR = "modifier_phantom_assassin_blur_active"
local function delta(a, b)
    return Vector(a.x - b.x, a.y - b.y, 0)
end
local function length(v)
    return math.sqrt(v.x * v.x + v.y * v.y)
end
local function norm(v)
    local d = math.max(
        0.01,
        length(v)
    )
    return Vector(v.x / d, v.y / d, 0)
end
local function dot(a, b)
    return a.x * b.x + a.y * b.y
end
local function shift(p, dir, n)
    return Vector(p.x + dir.x * n, p.y + dir.y * n, p.z)
end
local function distance(a, b)
    return length(delta(a, b))
end
local function alive(unit)
    return unit ~= nil and IsValidEntity(unit) and unit:IsAlive()
end
local function fighter(unit)
    return alive(unit) and unit:IsRealHero() and not unit:IsOutOfGame() and not unit:IsInvulnerable()
end
local function movable(u)
    return not u:IsRooted() and not u:IsStunned() and not u:IsCurrentlyHorizontalMotionControlled() and not u:HasModifier("modifier_slark_pounce_leash") and not u:HasModifier("modifier_puck_dream_coil")
end
local function ring(pos, radius, r, g, b)
    if r == nil then
        r = 178
    end
    if g == nil then
        g = 215
    end
    if b == nil then
        b = 255
    end
    local id = ParticleManager:CreateParticle(RING, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, pos)
    ParticleManager:SetParticleControl(
        id,
        1,
        Vector(radius, 0, 0)
    )
    ParticleManager:SetParticleControl(
        id,
        2,
        Vector(r, g, b)
    )
    return id
end
local function flash(pos, pfx)
    if pfx == nil then
        pfx = SWING
    end
    local id = ParticleManager:CreateParticle(pfx, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, pos)
    ParticleManager:SetParticleControl(id, 1, pos)
    ParticleManager:ReleaseParticleIndex(id)
end
--- Ветки этих героев используют штатные приказы, атаки и способности; один независимый объект на ветку.
____exports.HeroManeuvers = __TS__Class()
local HeroManeuvers = ____exports.HeroManeuvers
HeroManeuvers.name = "HeroManeuvers"
function HeroManeuvers.prototype.____constructor(self, owner, strike, push)
    self.owner = owner
    self.strike = strike
    self.push = push
    self.defs = __TS__New(Map)
    self.states = __TS__New(Map)
    self.ready = __TS__New(Map)
    self.lastMove = 0
    self.starts = __TS__New(Map)
    self.awake = false
end
function HeroManeuvers.prototype.configure(self, effects, awake)
    self.awake = awake
    self.defs:clear()
    for ____, f in ipairs(effects) do
        self.defs:set(f.mode, f)
    end
    for ____, mode in __TS__Iterator(self.states:keys()) do
        if not self.defs:has(mode) then
            self:clearMode(mode)
        end
    end
end
function HeroManeuvers.prototype.rememberWard(self, unit)
    self.ward = unit
end
function HeroManeuvers.prototype.ability(self, f)
    return self.owner:FindAbilityByName(f.ab)
end
function HeroManeuvers.prototype.learned(self, f)
    local ____opt_0 = self:ability(f)
    return (____opt_0 and ____opt_0:GetLevel() or 0) > 0
end
function HeroManeuvers.prototype.enemies(self, pos, range)
    return __TS__ArrayFilter(
        FindUnitsInRadius(
            self.owner:GetTeamNumber(),
            pos,
            nil,
            range,
            2,
            1,
            256 + 128,
            1,
            false
        ),
        function(____, u) return fighter(u) end
    )
end
function HeroManeuvers.prototype.line(self, a, b, width)
    return __TS__ArrayFilter(
        FindUnitsInLine(
            self.owner:GetTeamNumber(),
            a,
            b,
            nil,
            width,
            2,
            1,
            256 + 128
        ),
        function(____, u) return fighter(u) end
    )
end
function HeroManeuvers.prototype.stage(self, f, now, dur, pos, radius)
    if radius == nil then
        radius = 0
    end
    self:clearMode(f.mode)
    local s = {f = f, ["until"] = now + dur, arm = now, pos = pos}
    if radius > 0 then
        s.marker = ring(pos, radius)
    end
    self.states:set(f.mode, s)
    return s
end
function HeroManeuvers.prototype.clearMode(self, mode)
    local s = self.states:get(mode)
    if s == nil then
        return
    end
    self.states:delete(mode)
    for ____, marker in ipairs({s.marker, s.endMarker}) do
        do
            if marker == nil then
                goto __continue31
            end
            ParticleManager:DestroyParticle(marker, true)
            ParticleManager:ReleaseParticleIndex(marker)
        end
        ::__continue31::
    end
    if s.buff ~= nil and not s.buff:IsNull() then
        s.buff:Destroy()
    end
end
function HeroManeuvers.prototype.clear(self)
    for ____, mode in __TS__Iterator(self.states:keys()) do
        self:clearMode(mode)
    end
    self.ward = nil
    self.pendingDagger = nil
    self.starts:clear()
    self.lastPos = nil
    self.movingSince = nil
end
function HeroManeuvers.prototype.isReady(self, mode, now)
    return now >= (self.ready:get(mode) or 0)
end
function HeroManeuvers.prototype.cooldown(self, mode, now, cd)
    self.ready:set(mode, now + cd)
end
function HeroManeuvers.prototype.pin(self, u, f, duration)
    if u ~= self.owner and u:IsDebuffImmune() then
        return nil
    end
    return u:AddNewModifier(
        self.owner,
        self:ability(f),
        fxModifierName(f.key),
        {duration = duration}
    )
end
function HeroManeuvers.prototype.nearMap(self, pos)
    return math.abs(pos.x) < MAP.bounds - 32 and math.abs(pos.y) < MAP.bounds - 32
end
function HeroManeuvers.prototype.start(self, a, now)
    local ab = a:GetAbilityName()
    if ab ~= "juggernaut_omni_slash" and ab ~= "ursa_earthshock" and ab ~= "phantom_assassin_phantom_strike" then
        return
    end
    self.starts:set(
        ab,
        {
            at = now,
            pos = self.owner:GetAbsOrigin()
        }
    )
end
function HeroManeuvers.prototype.cast(self, a, target, now)
    if not alive(self.owner) then
        return
    end
    local ab = a:GetAbilityName()
    local pos = self.owner:GetAbsOrigin()
    local started = self.starts:get(ab)
    self.starts:delete(ab)
    local from = started ~= nil and now - started.at < 1.5 and started.pos or nil
    local blinked = from == nil or distance(pos, from) >= 32
    for ____, f in __TS__Iterator(self.defs:values()) do
        do
            if f.mode == "dagger" and ab == "phantom_assassin_phantom_strike" and blinked then
                local s = self.states:get("dagger")
                if s ~= nil and s.unit == target and fighter(target) and now < s["until"] and distance(
                    pos,
                    target:GetAbsOrigin()
                ) <= 195 and distance(
                    target:GetAbsOrigin(),
                    s.pos
                ) >= 170 and distance(
                    target:GetAbsOrigin(),
                    s.pos
                ) <= 650 then
                    self:clearMode("dagger")
                    FindClearSpaceForUnit(self.owner, s.pos, true)
                end
            end
            if f.mode == "blade" and ab == "phantom_assassin_phantom_strike" and blinked and self:learned(f) and self:isReady("blade", now) and fighter(target) and target:GetTeamNumber() ~= self.owner:GetTeamNumber() then
                if distance(
                    pos,
                    target:GetAbsOrigin()
                ) <= 195 then
                    local s = self:stage(
                        f,
                        now,
                        self.awake and 5 or 4,
                        pos,
                        90
                    )
                    s.unit = target
                    s.dir = norm(delta(
                        pos,
                        target:GetAbsOrigin()
                    ))
                    self:cooldown("blade", now, 9)
                end
            end
            if f.ab ~= ab then
                goto __continue47
            end
            if f.mode == "dagger" and fighter(target) then
                self.pendingDagger = {unit = target, ability = a, ["until"] = now + 1.75}
            end
            repeat
                local ____switch54 = f.mode
                local ____cond54 = ____switch54 == "ward"
                if ____cond54 then
                    self.ward = nil
                    self:stage(f, now, 26, pos)
                    break
                end
                ____cond54 = ____cond54 or ____switch54 == "omni"
                if ____cond54 then
                    self:stage(
                        f,
                        now,
                        math.max(
                            1,
                            a:GetSpecialValueFor("duration")
                        ) + 0.9,
                        from or pos,
                        115
                    )
                    break
                end
                ____cond54 = ____cond54 or ____switch54 == "ram"
                if ____cond54 then
                    self:stage(f, now, 5.5, pos)
                    break
                end
                ____cond54 = ____cond54 or ____switch54 == "sword"
                if ____cond54 then
                    self:stage(
                        f,
                        now,
                        math.max(
                            1,
                            a:GetSpecialValueFor("AbilityDuration") or 30
                        ),
                        pos
                    )
                    break
                end
                ____cond54 = ____cond54 or ____switch54 == "blindside"
                if ____cond54 then
                    self:stage(f, now, f.seconds or 7, pos)
                    break
                end
                ____cond54 = ____cond54 or ____switch54 == "burrow"
                if ____cond54 then
                    do
                        local s = self:stage(f, now, 1.35, from or pos)
                        s.dir = self.owner:GetForwardVector()
                        s.arm = now + 0.35
                        break
                    end
                end
                ____cond54 = ____cond54 or ____switch54 == "sidestep"
                if ____cond54 then
                    self:stage(f, now, 8, pos)
                    break
                end
                ____cond54 = ____cond54 or ____switch54 == "windlane"
                if ____cond54 then
                    do
                        local dir = norm(delta(
                            a:GetCursorPosition(),
                            pos
                        ))
                        if length(dir) < 0.5 then
                            break
                        end
                        local s = self:stage(f, now, 5, pos)
                        s.dir = dir
                        s["end"] = shift(pos, dir, self.awake and 1080 or 880)
                        break
                    end
                end
                ____cond54 = ____cond54 or ____switch54 == "vault"
                if ____cond54 then
                    self:stage(
                        f,
                        now,
                        math.max(
                            1,
                            a:GetSpecialValueFor("AbilityDuration") or 5
                        ),
                        pos
                    )
                    break
                end
                ____cond54 = ____cond54 or ____switch54 == "reel"
                if ____cond54 then
                    if fighter(target) then
                        local s = self:stage(
                            f,
                            now,
                            2,
                            target:GetAbsOrigin()
                        )
                        s.unit = target
                    end
                    break
                end
            until true
        end
        ::__continue47::
    end
end
function HeroManeuvers.prototype.spellHit(self, target, ability, now)
    if not alive(self.owner) then
        return
    end
    local f = self.defs:get("dagger")
    if f == nil or ability:GetAbilityName() ~= f.ab or not fighter(target) or not self:isReady("dagger", now) then
        return
    end
    self.pendingDagger = nil
    local s = self:stage(
        f,
        now,
        self.awake and 7 or 5,
        target:GetAbsOrigin(),
        105
    )
    s.unit = target
    self:cooldown("dagger", now, 7)
end
function HeroManeuvers.prototype.attack(self, e, now)
    local victim = e.target
    local ____temp_3 = not alive(self.owner) or not fighter(victim) or victim:GetTeamNumber() == self.owner:GetTeamNumber()
    if not ____temp_3 then
        local ____e_no_attack_cooldown_2 = e.no_attack_cooldown
        if ____e_no_attack_cooldown_2 == nil then
            ____e_no_attack_cooldown_2 = false
        end
        ____temp_3 = ____e_no_attack_cooldown_2
    end
    if ____temp_3 then
        return
    end
    local pos = self.owner:GetAbsOrigin()
    local to = victim:GetAbsOrigin()
    local cleave = self.defs:get("rift")
    if cleave ~= nil and self:learned(cleave) then
        local s = self.states:get("rift")
        if s ~= nil and now >= s.arm and now < s["until"] and s["end"] ~= nil and s.dir ~= nil then
            local a = s.pos
            local b = s["end"]
            local dir = s.dir
            self:clearMode("rift")
            for ____, u in ipairs(self:line(a, b, 115)) do
                if not u:IsDebuffImmune() then
                    self.push(u, dir, self.awake and 330 or 245, 0.31)
                end
                self.strike(
                    u,
                    self.owner:GetAverageTrueAttackDamage(u) * 0.65,
                    cleave
                )
            end
            flash(a)
        elseif s == nil and self:isReady("rift", now) then
            local dir = norm(delta(to, pos))
            local n = self:stage(
                cleave,
                now,
                4,
                to,
                115
            )
            n.arm = now + 0.35
            n.dir = dir
            n["end"] = shift(to, dir, self.awake and 670 or 525)
            n.endMarker = ring(
                n["end"],
                95,
                230,
                165,
                75
            )
            self:cooldown("rift", now, 7)
        end
    end
    local blade = self.states:get("blade")
    if blade ~= nil and blade.unit == victim and now < blade["until"] and blade.dir ~= nil and distance(pos, blade.pos) >= 170 and distance(pos, blade.pos) <= 660 and dot(
        blade.dir,
        norm(delta(pos, to))
    ) < 0.25 then
        self:clearMode("blade")
        flash(blade.pos)
        self.strike(
            victim,
            self.owner:GetAverageTrueAttackDamage(victim) * 0.85,
            blade.f
        )
    end
    local track = self.defs:get("trailhunt")
    if track ~= nil and self:learned(track) and self:isReady("trailhunt", now) then
        local s = self.states:get("trailhunt")
        if s == nil or s.unit ~= victim or now >= s["until"] then
            s = self:stage(track, now, 4, to)
            s.unit = victim
        end
        s.hits = (s.hits or 0) + 1
        if s.hits == 3 then
            s.pos = to
            s["until"] = now + (self.awake and 6 or 4.5)
            s.marker = ring(
                to,
                110,
                255,
                150,
                85
            )
            self:cooldown("trailhunt", now, 8)
        end
    end
    local reel = self.states:get("reel")
    if reel ~= nil and reel.unit == victim and reel.phase == 1 and now < reel["until"] and distance(pos, to) >= 285 and movable(self.owner) then
        self:clearMode("reel")
        self.push(
            self.owner,
            norm(delta(to, pos)),
            math.min(
                distance(pos, to) - 135,
                self.awake and 540 or 410
            ),
            0.32
        )
    end
end
function HeroManeuvers.prototype.taken(self, e, now)
    local s = self.states:get("parry")
    local foe = e.attacker
    if s == nil or not fighter(self.owner) or not fighter(foe) or foe:GetTeamNumber() == self.owner:GetTeamNumber() or e.damage_category ~= DOTA_DAMAGE_CATEGORY_ATTACK or not movable(self.owner) or now >= s["until"] then
        return
    end
    local pos = self.owner:GetAbsOrigin()
    local to = foe:GetAbsOrigin()
    local dir = norm(delta(to, pos))
    if distance(pos, to) > 330 or dot(
        dir,
        self.owner:GetForwardVector()
    ) < 0.45 then
        return
    end
    self:clearMode("parry")
    self:cooldown("parry", now, 8)
    local side = Vector(-dir.y, dir.x, 0)
    local landing = shift(to, side, 115)
    if self:nearMap(landing) then
        FindClearSpaceForUnit(self.owner, landing, true)
    end
    flash(to)
    self:pin(foe, s.f, self.awake and 1.45 or 0.9)
    self.strike(
        foe,
        self.owner:GetAverageTrueAttackDamage(foe),
        s.f
    )
end
function HeroManeuvers.prototype.order(self, kind, target, point, now)
    local parent = self.owner
    if not alive(parent) then
        return false
    end
    local pos = parent:GetAbsOrigin()
    local ward = self.states:get("ward")
    if kind == DOTA_UNIT_ORDER_MOVE_TO_TARGET and ward ~= nil and now < ward["until"] and target == self.ward and alive(target) and movable(parent) and not parent:IsChanneling() then
        local to = target:GetAbsOrigin()
        local dist = distance(pos, to)
        if dist >= 240 and dist <= (self.awake and 1100 or 850) then
            self:clearMode("ward")
            FindClearSpaceForUnit(target, pos, true)
            FindClearSpaceForUnit(parent, to, true)
            flash(to)
            return true
        end
    end
    local omni = self.states:get("omni")
    if kind == DOTA_UNIT_ORDER_MOVE_TO_POSITION and omni ~= nil and now < omni["until"] and distance(point, omni.pos) <= 115 then
        local native = parent:FindModifierByName(JUGG_OMNI)
        if native ~= nil or self.awake and omni.phase == 2 and now < omni.arm then
            if native ~= nil then
                native:Destroy()
            end
            parent:RemoveModifierByName("modifier_juggernaut_omnislash_invulnerability")
            self:clearMode("omni")
            FindClearSpaceForUnit(parent, omni.pos, true)
            flash(omni.pos)
            return true
        end
    end
    local sword = self.states:get("sword")
    if sword ~= nil and now < sword["until"] and parent:HasModifier(SVEN_GOD) then
        if kind == DOTA_UNIT_ORDER_ATTACK_MOVE and distance(pos, point) <= 145 and sword.phase == nil and movable(parent) then
            sword.pos = pos
            sword.marker = ring(
                pos,
                155,
                255,
                160,
                60
            )
            sword.phase = 1
            sword.arm = now + 0.65
            sword["until"] = math.min(sword["until"], now + 4.5)
            sword.buff = self:pin(parent, sword.f, sword["until"] - now)
            return true
        end
        if kind == DOTA_UNIT_ORDER_MOVE_TO_POSITION and sword.phase == 1 and now >= sword.arm and distance(point, sword.pos) <= 155 and distance(pos, sword.pos) <= (self.awake and 780 or 620) and movable(parent) then
            local to = sword.pos
            self:clearMode("sword")
            FindClearSpaceForUnit(parent, to, true)
            flash(to)
            for ____, foe in ipairs(self:enemies(to, 315)) do
                if not foe:IsDebuffImmune() then
                    self.push(
                        foe,
                        norm(delta(
                            foe:GetAbsOrigin(),
                            to
                        )),
                        250,
                        0.34
                    )
                end
                self.strike(foe, 180, sword.f)
            end
            return true
        end
    end
    return false
end
function HeroManeuvers.prototype.tick(self, now)
    local owner = self.owner
    local pos = owner:GetAbsOrigin()
    local motion = self.lastPos == nil and Vector(0, 0, 0) or delta(pos, self.lastPos)
    local speed = length(motion)
    self.lastPos = pos
    if speed > 13 and speed < 115 then
        self.lastMove = now
        if self.movingSince == nil then
            self.movingSince = now
        end
    else
        self.movingSince = nil
    end
    local dagger = self.pendingDagger
    if dagger ~= nil then
        if not fighter(dagger.unit) or now >= dagger["until"] then
            self.pendingDagger = nil
        elseif __TS__ArraySome(
            dagger.unit:FindAllModifiers(),
            function(____, m) return m:GetName() == "modifier_phantom_assassin_stiflingdagger" and m:GetCaster() == owner end
        ) then
            self:spellHit(dagger.unit, dagger.ability, now)
        end
    end
    local parry = self.defs:get("parry")
    if parry ~= nil and self:learned(parry) and not self.states:has("parry") and self:isReady("parry", now) and now - self.lastMove >= 0.55 and now - self.lastMove <= 0.75 and #self:enemies(pos, 360) > 0 and movable(owner) then
        self:stage(
            parry,
            now,
            0.8,
            pos,
            135
        )
        self:cooldown("parry", now, 5)
    end
    for ____, ____value in __TS__Iterator(self.states) do
        local mode = ____value[1]
        local s = ____value[2]
        do
            if now >= s["until"] then
                self:clearMode(mode)
                goto __continue100
            end
            repeat
                local ____switch102 = mode
                local ____cond102 = ____switch102 == "parry"
                if ____cond102 then
                    if speed > 16 then
                        self:clearMode(mode)
                    end
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "omni"
                if ____cond102 then
                    if owner:HasModifier(JUGG_OMNI) then
                        s.phase = 1
                    elseif s.phase == 1 then
                        if not self.awake then
                            self:clearMode(mode)
                        else
                            s.phase = 2
                            s.arm = math.min(s["until"], now + 0.85)
                        end
                    elseif s.phase == 2 and now >= s.arm then
                        self:clearMode(mode)
                    end
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "ram"
                if ____cond102 then
                    self:tickRam(s, pos, motion, now)
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "sword"
                if ____cond102 then
                    if s.phase == 1 and (not owner:HasModifier(SVEN_GOD) or now >= s.arm + 0.65 and #self:enemies(s.pos, 125) > 0) then
                        self:clearMode(mode)
                    end
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "dagger"
                if ____cond102 then
                    if not fighter(s.unit) then
                        self:clearMode(mode)
                        break
                    end
                    if distance(
                        s.unit:GetAbsOrigin(),
                        s.pos
                    ) > 155 then
                        s.phase = 1
                    end
                    if s.phase == 1 and #self:enemies(s.pos, 90) > 0 then
                        self:clearMode(mode)
                    end
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "blindside"
                if ____cond102 then
                    if not owner:HasModifier(PA_BLUR) then
                        break
                    end
                    for ____, foe in ipairs(self:enemies(pos, self.awake and 385 or 460)) do
                        if dot(
                            foe:GetForwardVector(),
                            norm(delta(
                                pos,
                                foe:GetAbsOrigin()
                            ))
                        ) > 0.52 then
                            owner:RemoveModifierByName(PA_BLUR)
                            self:clearMode(mode)
                            break
                        end
                    end
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "burrow"
                if ____cond102 then
                    self:tickBurrow(s, pos, now)
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "sidestep"
                if ____cond102 then
                    self:tickSidestep(s, pos, motion)
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "trailhunt"
                if ____cond102 then
                    self:tickTrail(s, pos, motion)
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "reel"
                if ____cond102 then
                    if s.phase == nil and fighter(s.unit) and __TS__ArraySome(
                        s.unit:FindAllModifiers(),
                        function(____, m) return m:GetName() == "modifier_windrunner_shackle_shot" and m:GetCaster() == owner end
                    ) then
                        s.phase = 1
                        s["until"] = now + (self.awake and 4.2 or 3)
                        s.marker = ring(
                            s.unit:GetAbsOrigin(),
                            115
                        )
                    end
                    if s.marker ~= nil and fighter(s.unit) then
                        ParticleManager:SetParticleControl(
                            s.marker,
                            0,
                            s.unit:GetAbsOrigin()
                        )
                    end
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "windlane"
                if ____cond102 then
                    self:tickWind(s, now)
                    break
                end
                ____cond102 = ____cond102 or ____switch102 == "vault"
                if ____cond102 then
                    self:tickVault(s, pos, motion)
                    break
                end
            until true
        end
        ::__continue100::
    end
end
function HeroManeuvers.prototype.tickRam(self, s, pos, motion, now)
    local running = self.movingSince ~= nil and movable(self.owner)
    local dir = norm(motion)
    if not running or s.dir == nil or dot(s.dir, dir) < 0.82 then
        if s.marker ~= nil then
            ParticleManager:DestroyParticle(s.marker, true)
            ParticleManager:ReleaseParticleIndex(s.marker)
            s.marker = nil
        end
        s.dir = running and dir or nil
        s.arm = now + (self.awake and 0.45 or 0.63)
        return
    end
    if now < s.arm then
        return
    end
    if s.marker == nil then
        s.marker = ring(
            pos,
            105,
            255,
            170,
            65
        )
    else
        ParticleManager:SetParticleControl(s.marker, 0, pos)
    end
    local foe = __TS__ArrayFind(
        self:enemies(pos, 170),
        function(____, u) return not u:IsDebuffImmune() and dot(
            dir,
            norm(delta(
                u:GetAbsOrigin(),
                pos
            ))
        ) > 0.45 end
    )
    if foe == nil then
        return
    end
    self:clearMode("ram")
    self.push(foe, dir, 380, 0.42)
    self.push(self.owner, dir, 270, 0.42)
    flash(pos)
end
function HeroManeuvers.prototype.tickBurrow(self, s, pos, now)
    if now < s.arm or s.dir == nil then
        return
    end
    if s["end"] == nil then
        local center = distance(s.pos, pos) >= 70 and pos or shift(s.pos, s.dir, 205)
        s["end"] = center
        s.arm = now + 0.4
        s.marker = ring(
            center,
            200,
            225,
            159,
            95
        )
        return
    end
    local center = s["end"]
    local dir = s.dir
    local max = self.awake and 2 or 1
    self:clearMode("burrow")
    local moved = 0
    for ____, foe in ipairs(self:enemies(center, 200)) do
        do
            if foe:IsDebuffImmune() or dot(
                dir,
                norm(delta(
                    foe:GetAbsOrigin(),
                    s.pos
                ))
            ) < 0.3 then
                goto __continue132
            end
            self.push(
                foe,
                Vector(-dir.x, -dir.y, 0),
                365,
                0.33
            )
            moved = moved + 1
            if moved >= max then
                break
            end
        end
        ::__continue132::
    end
end
function HeroManeuvers.prototype.tickSidestep(self, s, pos, motion)
    if length(motion) < 18 or length(motion) > 115 or self.owner:IsAttacking() or not movable(self.owner) then
        return
    end
    local mod = self.owner:FindModifierByName("modifier_ursa_overpower")
    if mod == nil or mod:GetStackCount() <= 0 then
        return
    end
    local dir = norm(motion)
    local foe = __TS__ArrayFind(
        self:enemies(pos, self.awake and 255 or 205),
        function(____, u) return math.abs(dot(
            dir,
            norm(delta(
                u:GetAbsOrigin(),
                pos
            ))
        )) < 0.5 end
    )
    if foe == nil then
        return
    end
    self:clearMode("sidestep")
    if mod:GetStackCount() <= 1 then
        mod:Destroy()
    else
        mod:DecrementStackCount()
    end
    flash(foe:GetAbsOrigin())
    self.strike(
        foe,
        self.owner:GetAverageTrueAttackDamage(foe),
        s.f
    )
end
function HeroManeuvers.prototype.tickTrail(self, s, pos, motion)
    if (s.hits or 0) < 3 or not fighter(s.unit) then
        return
    end
    local to = s.unit:GetAbsOrigin()
    if s["end"] == nil and distance(s.pos, to) >= 230 and distance(s.pos, to) <= 625 and __TS__ArrayIncludes(
        self:enemies(s.pos, 650),
        s.unit
    ) then
        s["end"] = to
        s.endMarker = ring(
            to,
            90,
            255,
            150,
            85
        )
    end
    if s["end"] == nil or distance(pos, s.pos) > 105 or length(motion) < 12 or length(motion) > 115 or not movable(self.owner) then
        return
    end
    local dir = norm(delta(s["end"], s.pos))
    if dot(
        dir,
        norm(motion)
    ) < 0.6 then
        return
    end
    self:clearMode("trailhunt")
    self.push(
        self.owner,
        dir,
        math.min(
            distance(pos, s["end"]),
            500
        ),
        0.35
    )
end
function HeroManeuvers.prototype.tickWind(self, s, now)
    if s.dir == nil or s["end"] == nil or self.owner:IsChanneling() then
        return
    end
    if s.phase == nil then
        s.phase = 1
        s.arm = now + 0.35
        s["until"] = now + 3.2
        s.marker = ring(
            shift(s.pos, s.dir, 265),
            120,
            155,
            245,
            180
        )
        s.endMarker = ring(
            s["end"],
            125,
            155,
            245,
            180
        )
        local fx = ParticleManager:CreateParticle(WIND, PATTACH_WORLDORIGIN, nil)
        ParticleManager:SetParticleControl(fx, 0, s.pos)
        ParticleManager:SetParticleControl(fx, 1, s["end"])
        ParticleManager:ReleaseParticleIndex(fx)
        return
    end
    if now < s.arm then
        return
    end
    local units = FindUnitsInLine(
        self.owner:GetTeamNumber(),
        s.pos,
        s["end"],
        nil,
        125,
        DOTA_UNIT_TARGET_TEAM_BOTH,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_NO_INVIS + DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE
    )
    for ____, u in ipairs(units) do
        do
            if not fighter(u) or not movable(u) or not u:IsMoving() or dot(
                u:GetForwardVector(),
                s.dir
            ) < 0.76 then
                goto __continue152
            end
            local dir = s.dir
            self:clearMode("windlane")
            self.push(u, dir, self.awake and 535 or 420, 0.36)
            return
        end
        ::__continue152::
    end
end
function HeroManeuvers.prototype.tickVault(self, s, pos, motion)
    if length(motion) < 5 or length(motion) > 110 or not movable(self.owner) or not self.owner:HasModifier("modifier_windrunner_windrun") then
        return
    end
    local dir = norm(motion)
    local function passable(p)
        return self:nearMap(p) and GridNav:IsTraversable(p) and not GridNav:IsBlocked(p)
    end
    local function vaultTo(to)
        if math.abs(to.z - pos.z) > 150 or not passable(to) or not passable(shift(to, dir, 40)) then
            return false
        end
        self:clearMode("vault")
        FindClearSpaceForUnit(self.owner, to, true)
        flash(to)
        return true
    end
    local inWay = __TS__ArrayFind(
        self:enemies(pos, 130),
        function(____, u) return dot(
            dir,
            norm(delta(
                u:GetAbsOrigin(),
                pos
            ))
        ) > 0.87 end
    )
    if inWay ~= nil and vaultTo(GetGroundPosition(
        shift(
            inWay:GetAbsOrigin(),
            dir,
            165
        ),
        self.owner
    )) then
        return
    end
    if passable(shift(pos, dir, 65)) then
        return
    end
    do
        local d = 155
        while d <= (self.awake and 375 or 285) do
            local to = GetGroundPosition(
                shift(pos, dir, d),
                self.owner
            )
            if vaultTo(to) then
                return
            end
            d = d + 55
        end
    end
end
return ____exports
