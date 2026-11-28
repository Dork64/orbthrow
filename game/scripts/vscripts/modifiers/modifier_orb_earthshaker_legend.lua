local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local Map = ____lualib.Map
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__StringStartsWith = ____lualib.__TS__StringStartsWith
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArraySome = ____lualib.__TS__ArraySome
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local overrideValue = ____orbstore.overrideValue
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local Q = "earthshaker_fissure"
local W = "earthshaker_enchant_totem"
local E = "earthshaker_aftershock"
local R = "earthshaker_echo_slam"
local PIVOT = "orb_es_pivot"
local STEP = "orb_es_step"
local SEIS = "orb_es_seismograph"
local RING = "particles/ui_mouseactions/range_display.vpcf"
local DUST = "particles/units/heroes/hero_earthshaker/earthshaker_aftershock.vpcf"
local ECHO = "particles/units/heroes/hero_earthshaker/earthshaker_echoslam_start.vpcf"
local CRACK = "particles/units/heroes/hero_earthshaker/earthshaker_echoslam_start_cracks.vpcf"
local ROCK = "models/items/earthshaker/baron_of_the_minotaur_fissure/baron_of_the_minotaur_fissure1.vmdl"
local WALL_TIME = 12
local function time()
    return GameRules:GetGameTime()
end
local rad = math.pi / 180
local function dist(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2)
end
local function ray(a, ang, len)
    return Vector(
        a.x + math.cos(ang) * len,
        a.y + math.sin(ang) * len,
        a.z
    )
end
local function angle(a, b)
    return math.atan2(b.y - a.y, b.x - a.x)
end
local function signedTurn(a, b)
    return math.atan2(
        math.sin(b - a),
        math.cos(b - a)
    )
end
local function within(p)
    return math.abs(p.x) < MAP.bounds - 32 and math.abs(p.y) < MAP.bounds - 32
end
local function walk(p)
    return within(p) and GridNav:IsTraversable(p) and not GridNav:IsBlocked(p)
end
local function live(u)
    return u ~= nil and IsValidEntity(u) and u:IsAlive()
end
local function valid(u)
    return live(u) and u:IsRealHero() and not u:IsIllusion() and not u:IsInvulnerable() and not u:IsOutOfGame()
end
local function magic(u)
    return not u:IsDebuffImmune() and not u:IsMagicImmune()
end
local function clear(m)
    if m ~= nil and not m:IsNull() then
        m:Destroy()
    end
end
local function remove(e)
    if e ~= nil and IsValidEntity(e) then
        UTIL_Remove(e)
    end
end
local function ring(p, radius, color)
    local id = ParticleManager:CreateParticle(RING, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, p)
    ParticleManager:SetParticleControl(
        id,
        1,
        Vector(radius, 0, 0)
    )
    ParticleManager:SetParticleControl(id, 2, color)
    return id
end
local function endFX(id)
    ParticleManager:DestroyParticle(id, true)
    ParticleManager:ReleaseParticleIndex(id)
end
local function burst(path, p, radius)
    local id = ParticleManager:CreateParticle(path, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, p)
    ParticleManager:SetParticleControl(
        id,
        1,
        Vector(radius, 0, 0)
    )
    ParticleManager:ReleaseParticleIndex(id)
end
local function shove(h, u, a, dir, len, dur, height, stun)
    if u:IsCurrentlyHorizontalMotionControlled() or u:IsCurrentlyVerticalMotionControlled() then
        return
    end
    local center = ray(
        u:GetAbsOrigin(),
        dir,
        -80
    )
    u:AddNewModifier(h, a, "modifier_knockback", {
        center_x = center.x,
        center_y = center.y,
        center_z = center.z,
        duration = dur,
        knockback_duration = dur,
        knockback_distance = len,
        knockback_height = height,
        should_stun = stun and 1 or 0
    })
end
local Icon = __TS__Class()
Icon.name = "Icon"
__TS__ClassExtends(Icon, ModBase)
function Icon.prototype.IsHidden(self)
    return false
end
function Icon.prototype.IsPurgable(self)
    return false
end
local PivotIcon = __TS__Class()
PivotIcon.name = "PivotIcon"
__TS__ClassExtends(PivotIcon, Icon)
function PivotIcon.prototype.GetTexture(self)
    return "earthshaker_fissure_alt_gold"
end
local Charged = __TS__Class()
Charged.name = "Charged"
__TS__ClassExtends(Charged, Icon)
function Charged.prototype.GetTexture(self)
    return W
end
local CrackIcon = __TS__Class()
CrackIcon.name = "CrackIcon"
__TS__ClassExtends(CrackIcon, Icon)
function CrackIcon.prototype.GetTexture(self)
    return E
end
local Tracked = __TS__Class()
Tracked.name = "Tracked"
__TS__ClassExtends(Tracked, Icon)
function Tracked.prototype.GetTexture(self)
    return R
end
function Tracked.prototype.IsDebuff(self)
    return true
end
function Tracked.prototype.IgnoreTenacity(self)
    return true
end
local Pathing = __TS__Class()
Pathing.name = "Pathing"
__TS__ClassExtends(Pathing, PivotIcon)
function Pathing.prototype.CheckState(self)
    return {[MODIFIER_STATE_FLYING_FOR_PATHING_PURPOSES_ONLY] = true}
end
____exports.ShakerLegends = __TS__Class()
local ShakerLegends = ____exports.ShakerLegends
ShakerLegends.name = "ShakerLegends"
__TS__ClassExtends(ShakerLegends, ModBase)
function ShakerLegends.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.cracks = {}
    self.nextCrack = 0
    self.spentStep = false
    self.records = __TS__New(Set)
    self.trails = __TS__New(Map)
    self.lastTime = 0
    self.switched = __TS__New(Set)
end
function ShakerLegends.prototype.IsHidden(self)
    return true
end
function ShakerLegends.prototype.IsPurgable(self)
    return false
end
function ShakerLegends.prototype.RemoveOnDeath(self)
    return false
end
function ShakerLegends.prototype.OnCreated(self)
    if IsServer() then
        self.lastTime = time()
        self:StartIntervalThink(0.05)
    end
end
function ShakerLegends.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_EVENT_ON_ATTACK_RECORD,
        MODIFIER_EVENT_ON_ATTACK_RECORD_DESTROY,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_EVENT_ON_DEATH
    }
end
function ShakerLegends.prototype.b(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        time()
    )
end
function ShakerLegends.prototype.have(self, id)
    return (self:b().code[id] or 0) > 0
end
function ShakerLegends.prototype.enemies(self, p, r)
    return __TS__ArrayFilter(
        FindUnitsInRadius(
            self:GetParent():GetTeamNumber(),
            p,
            nil,
            r,
            2,
            1,
            16,
            1,
            false
        ),
        function(____, unit) return valid(unit) end
    )
end
function ShakerLegends.prototype.damage(self, u, a, amt)
    if valid(u) and magic(u) then
        ApplyDamage({
            attacker = self:GetParent(),
            victim = u,
            ability = a,
            damage = amt,
            damage_type = DAMAGE_TYPE_MAGICAL
        })
    end
end
function ShakerLegends.prototype.swap(self, native, alt, on, keep)
    if keep == nil then
        keep = false
    end
    if self.switched:has(alt) == on then
        return
    end
    local h = self:GetParent()
    local n = h:FindAbilityByName(native)
    if n == nil or n:GetLevel() < 1 then
        return
    end
    local x = h:FindAbilityByName(alt) or (on and h:AddAbility(alt) or nil)
    if x == nil then
        return
    end
    if on then
        x:SetLevel(keep and n:GetLevel() or 1)
        h:SwapAbilities(native, alt, keep, true)
        self.switched:add(alt)
    else
        h:SwapAbilities(alt, native, false, true)
        self.switched:delete(alt)
    end
    n:SetHidden(on)
    x:SetHidden(not on)
    n:MarkAbilityButtonDirty()
    x:MarkAbilityButtonDirty()
end
function ShakerLegends.prototype.activate(self, name, on)
    local a = self:GetParent():FindAbilityByName(name)
    if a ~= nil and a:IsActivated() ~= on then
        a:SetActivated(on)
        a:MarkAbilityButtonDirty()
    end
end
function ShakerLegends.prototype.OnAbilityFullyCast(self, e)
    local h = self:GetParent()
    local a = e.ability
    if not IsServer() or not live(h) or a == nil or a:IsItem() then
        return
    end
    if e.unit ~= h then
        if valid(e.unit) and e.unit:GetTeamNumber() ~= h:GetTeamNumber() and dist(
            e.unit:GetAbsOrigin(),
            h:GetAbsOrigin()
        ) <= 550 then
            self:recordCrack(e.unit)
        end
        return
    end
    local n = a:GetAbilityName()
    if n == Q and self:have("es_l_rift") then
        self:makeWall(a)
    end
    if n ~= Q and not __TS__StringStartsWith(n, "orb_") and self.ridge ~= nil and h:HasModifier("modifier_item_aghanims_shard") and not h:PassivesDisabled() then
        self:shardShock(self.ridge)
    end
end
function ShakerLegends.prototype.makeWall(self, skill)
    self:clearRidge()
    local h = self:GetParent()
    local origin = h:GetAbsOrigin()
    local cursor = skill:GetCursorPosition()
    local dir = dist(origin, cursor) > 1 and angle(origin, cursor) or math.atan2(
        h:GetForwardVector().y,
        h:GetForwardVector().x
    )
    local base = skill:GetLevelSpecialValueNoOverride(
        "fissure_duration",
        skill:GetLevel() - 1
    )
    local duration = WALL_TIME + math.max(
        0,
        (overrideValue(
            self:b(),
            Q,
            "fissure_duration",
            base
        ) or base) - base
    )
    local half = math.max(
        150,
        skill:GetCastRange(origin, nil) + h:GetCastRangeBonus()
    ) / 2
    local wall = {
        origin = origin,
        hinge = ray(origin, dir, half),
        half = half,
        dir = dir,
        movingDir = dir,
        ends = time() + duration,
        skill = skill,
        blocks = __TS__New(Map),
        rocks = {},
        hints = {},
        delta = 0,
        pivoted = false,
        swept = __TS__New(Set),
        nextGrid = 0
    }
    local start = ray(origin, dir, 105)
    do
        local d = 105
        while d < 2 * half do
            local rock = SpawnEntityFromTableSynchronous("prop_dynamic", {
                model = ROCK,
                solid = 0,
                disableshadows = 1,
                modelscale = 1.15,
                origin = start
            })
            if rock ~= nil then
                local ____wall_rocks_0 = wall.rocks
                ____wall_rocks_0[#____wall_rocks_0 + 1] = rock
            end
            d = d + 96
        end
    end
    self.ridge = wall
    self:drawWall(wall, true)
    local ____wall_hints_1 = wall.hints
    ____wall_hints_1[#____wall_hints_1 + 1] = ring(
        wall.hinge,
        76,
        Vector(255, 177, 42)
    )
    wall.icon = h:AddNewModifier(h, skill, "modifier_orb_es_pivot", {duration = duration})
    local ____opt_2 = wall.icon
    if ____opt_2 ~= nil then
        ____opt_2:SetStackCount(1)
    end
    self:swap(Q, PIVOT, true)
end
function ShakerLegends.prototype.point(self, w, d)
    return d < w.half and ray(w.origin, w.dir, d) or ray(w.hinge, w.movingDir, d - w.half)
end
function ShakerLegends.prototype.drawWall(self, w, grid)
    local h = self:GetParent()
    do
        local i = 0
        while i < #w.rocks do
            local p = GetGroundPosition(
                self:point(w, 105 + i * 96),
                h
            )
            w.rocks[i + 1]:SetAbsOrigin(Vector(p.x, p.y, p.z + 12))
            w.rocks[i + 1]:SetAngles(0, (105 + i * 96 < w.half and w.dir or w.movingDir) / rad + i % 3 * 20, 0)
            i = i + 1
        end
    end
    if not grid then
        return
    end
    local cells = __TS__New(Map)
    do
        local d = 100
        while d <= 2 * w.half do
            do
                local p = self:point(w, d)
                if not within(p) then
                    goto __continue63
                end
                local x = GridNav:WorldToGridPosX(p.x)
                local y = GridNav:WorldToGridPosY(p.y)
                local key = (tostring(x) .. ":") .. tostring(y)
                cells:set(
                    key,
                    Vector(
                        GridNav:GridPosToWorldCenterX(x),
                        GridNav:GridPosToWorldCenterY(y),
                        GetGroundHeight(p, h)
                    )
                )
            end
            ::__continue63::
            d = d + 28
        end
    end
    for ____, ____value in __TS__Iterator(w.blocks) do
        local key = ____value[1]
        local entity = ____value[2]
        if not cells:has(key) then
            remove(entity)
            w.blocks:delete(key)
        end
    end
    for ____, ____value in __TS__Iterator(cells) do
        local key = ____value[1]
        local p = ____value[2]
        if not w.blocks:has(key) then
            local obstruction = SpawnEntityFromTableSynchronous("point_simple_obstruction", {origin = p, block_fow = 0, block_nav = 1})
            if obstruction ~= nil then
                w.blocks:set(key, obstruction)
            end
        end
    end
end
function ShakerLegends.prototype.Pivot(self, p)
    local w = self.ridge
    if w == nil or w.pivoted or time() >= w.ends or dist(p, w.hinge) < 12 then
        return
    end
    local max = (self:b().awake and 90 or 60) * rad
    w.delta = math.max(
        -max,
        math.min(
            max,
            signedTurn(
                w.dir,
                angle(w.hinge, p)
            )
        )
    )
    if math.abs(w.delta) < 3 * rad then
        return
    end
    w.pivoted = true
    w.start = time()
    w.ends = math.max(w.ends, w.start + 3)
    clear(w.icon)
    self:swap(Q, PIVOT, false)
    do
        local d = 120
        while d < w.half do
            local ____w_hints_4 = w.hints
            ____w_hints_4[#____w_hints_4 + 1] = ring(
                ray(w.hinge, w.dir + w.delta, d),
                40,
                Vector(255, 96, 35)
            )
            d = d + 180
        end
    end
    EmitSoundOn(
        "Hero_EarthShaker.Fissure",
        self:GetParent()
    )
end
function ShakerLegends.prototype.lineDistance(self, p, start, dir, len)
    local projection = math.max(
        0,
        math.min(
            len,
            (p.x - start.x) * math.cos(dir) + (p.y - start.y) * math.sin(dir)
        )
    )
    return dist(
        p,
        ray(start, dir, projection)
    )
end
function ShakerLegends.prototype.ridgeDistance(self, w, p)
    return math.min(
        self:lineDistance(
            p,
            ray(w.origin, w.dir, 100),
            w.dir,
            w.half - 100
        ),
        self:lineDistance(p, w.hinge, w.movingDir, w.half)
    )
end
function ShakerLegends.prototype.shardShock(self, w)
    local h = self:GetParent()
    local e = h:FindAbilityByName(E)
    if not e or e:GetLevel() < 1 then
        return
    end
    local range = e:GetSpecialValueFor("aftershock_range")
    for ____, u in ipairs(self:enemies(w.hinge, w.half + range)) do
        do
            if not magic(u) or dist(
                h:GetAbsOrigin(),
                u:GetAbsOrigin()
            ) <= range or self:ridgeDistance(
                w,
                u:GetAbsOrigin()
            ) > range then
                goto __continue80
            end
            self:damage(
                u,
                e,
                e:GetSpecialValueFor("aftershock_damage")
            )
            u:AddNewModifier(
                h,
                e,
                "modifier_stunned",
                {duration = e:GetSpecialValueFor("AbilityDuration") * w.skill:GetSpecialValueFor("shard_aftershock_stun_duration_pct") / 100 * (1 - u:GetStatusResistance())}
            )
        end
        ::__continue80::
    end
    burst(DUST, w.hinge, range)
end
function ShakerLegends.prototype.tickWall(self, w, t)
    local h = self:GetParent()
    if t >= w.ends then
        self:clearRidge()
        return
    end
    if w.start ~= nil then
        local frac = math.min(1, (t - w.start) / 0.8)
        w.movingDir = w.dir + w.delta * frac
        self:drawWall(w, t >= w.nextGrid or frac >= 1)
        if t >= w.nextGrid then
            w.nextGrid = t + 0.1
        end
        local sweepWidth = 90 + (self:have("es_p_tremor") and 30 or 0)
        for ____, u in ipairs(self:enemies(w.hinge, w.half + sweepWidth)) do
            do
                if not magic(u) or w.swept:has(u) or self:lineDistance(
                    u:GetAbsOrigin(),
                    w.hinge,
                    w.movingDir,
                    w.half
                ) > sweepWidth then
                    goto __continue87
                end
                w.swept:add(u)
                self:damage(
                    u,
                    w.skill,
                    280 + (self:have("es_p_rift") and 70 or 0)
                )
                if live(u) then
                    shove(
                        h,
                        u,
                        w.skill,
                        w.movingDir + (w.delta < 0 and -1 or 1) * math.pi / 2,
                        130,
                        0.18,
                        20,
                        false
                    )
                end
            end
            ::__continue87::
        end
        if frac >= 1 then
            w.start = nil
            for ____, fx in ipairs(w.hints) do
                endFX(fx)
            end
            w.hints = {}
        end
    end
    if h:HasModifier("modifier_item_aghanims_shard") and self:ridgeDistance(
        w,
        h:GetAbsOrigin()
    ) < 100 then
        h:AddNewModifier(h, w.skill, "modifier_orb_es_path", {duration = 0.2})
    end
end
function ShakerLegends.prototype.clearRidge(self)
    local w = self.ridge
    if not w then
        return
    end
    self.ridge = nil
    clear(w.icon)
    self:swap(Q, PIVOT, false)
    for ____, ____value in __TS__Iterator(w.blocks) do
        local e = ____value[2]
        remove(e)
    end
    for ____, e in ipairs(w.rocks) do
        remove(e)
    end
    for ____, fx in ipairs(w.hints) do
        endFX(fx)
    end
end
function ShakerLegends.prototype.OnAttackRecord(self, e)
    if not IsServer() or e.attacker ~= self:GetParent() or not self:have("es_l_faultline") or e.no_attack_cooldown or not valid(e.target) then
        return
    end
    if self.lastBuff ~= nil or self:GetParent():HasModifier("modifier_earthshaker_enchant_totem") then
        self.records:add(e.record)
    end
end
function ShakerLegends.prototype.OnAttackRecordDestroy(self, e)
    if IsServer() and e.attacker == self:GetParent() then
        self.records:delete(e.record)
    end
end
function ShakerLegends.prototype.OnAttackLanded(self, e)
    if not IsServer() then
        return
    end
    local h = self:GetParent()
    if e.target == h and valid(e.attacker) and e.attacker:GetTeamNumber() ~= h:GetTeamNumber() and dist(
        h:GetAbsOrigin(),
        e.attacker:GetAbsOrigin()
    ) <= 550 then
        self:recordCrack(e.attacker)
    end
    if e.attacker ~= h or not self.records:delete(e.record) or not valid(e.target) or not magic(e.target) then
        return
    end
    local u = e.target
    local a = h:FindAbilityByName(W)
    if not a then
        return
    end
    local pos = u:GetAbsOrigin()
    local dir = angle(
        h:GetAbsOrigin(),
        pos
    )
    local travel = 0
    local impact = false
    local other
    local others = __TS__ArrayFilter(
        self:enemies(pos, 445),
        function(____, x) return x ~= u end
    )
    local throwRange = 350 + (self:have("es_p_lifetotem") and 56 or 0)
    do
        local d = 14
        while d <= throwRange do
            local p = ray(pos, dir, d)
            if not walk(p) or math.abs(GetGroundHeight(p, h) - pos.z) > 90 then
                impact = true
                break
            end
            other = __TS__ArrayFind(
                others,
                function(____, x) return dist(
                    x:GetAbsOrigin(),
                    p
                ) <= u:GetHullRadius() + x:GetHullRadius() + 12 end
            )
            if other ~= nil then
                impact = true
                break
            end
            travel = d
            d = d + 14
        end
    end
    shove(
        h,
        u,
        a,
        dir,
        travel,
        0.24,
        32,
        false
    )
    if impact then
        local value = math.min(
            650,
            250 + u:GetMaxHealth() * 0.08
        ) + (self:have("es_p_stoneskin") and 65 or 0)
        self:damage(u, a, value)
        if other ~= nil then
            self:damage(other, a, value)
        end
        burst(
            DUST,
            ray(pos, dir, travel),
            180
        )
    end
end
function ShakerLegends.prototype.Step(self, point)
    local h = self:GetParent()
    local a = h:FindAbilityByName(W)
    if self.spentStep or not a or not self:b().awake or not h:HasModifier("modifier_earthshaker_enchant_totem") or h:IsRooted() or h:IsStunned() or (h:HasModifier("modifier_slark_pounce_leash") or h:HasModifier("modifier_puck_dream_coil")) or h:IsCurrentlyHorizontalMotionControlled() or h:IsCurrentlyVerticalMotionControlled() then
        return
    end
    local pos = h:GetAbsOrigin()
    local dir = angle(pos, point)
    local limit = math.min(
        180,
        dist(pos, point)
    )
    local dest = pos
    do
        local d = 12
        while d <= limit do
            local p = ray(pos, dir, d)
            if not walk(p) or math.abs(GetGroundHeight(p, h) - pos.z) > 80 then
                break
            end
            dest = p
            d = d + 12
        end
    end
    if dest == pos then
        return
    end
    self.spentStep = true
    burst(DUST, pos, 100)
    FindClearSpaceForUnit(h, dest, true)
    self:swap(W, STEP, false)
end
function ShakerLegends.prototype.recordCrack(self, u)
    local h = self:GetParent()
    local a = h:FindAbilityByName(E)
    if not live(h) or not a or a:GetLevel() < 1 or not self:have("es_l_aftershock") or h:PassivesDisabled() or self.fuse or time() < self.nextCrack then
        return
    end
    local p = u:GetAbsOrigin()
    local t = time()
    local window = self:have("es_p_concussion") and 3.7 or 3
    for ____, c in ipairs(self.cracks) do
        if dist(c.pos, p) < 96 then
            c.ends = t + window
            self:crackHUD()
            return
        end
    end
    if #self.cracks >= (self:b().awake and 2 or 1) then
        endFX(table.remove(self.cracks, 1).fx)
    end
    local ____self_cracks_5 = self.cracks
    ____self_cracks_5[#____self_cracks_5 + 1] = {
        pos = p,
        ends = t + window,
        fx = ring(
            p,
            175,
            Vector(255, 190, 72)
        )
    }
    burst(CRACK, p, 175)
    self:crackHUD()
end
function ShakerLegends.prototype.crackHUD(self)
    local h = self:GetParent()
    local a = h:FindAbilityByName(E)
    if #self.cracks == 0 then
        clear(self.crackIcon)
        self.crackIcon = nil
        return
    end
    local duration = math.max(unpack(__TS__ArrayMap(
        self.cracks,
        function(____, crack) return crack.ends end
    ))) - time()
    if self.crackIcon == nil or self.crackIcon:IsNull() then
        self.crackIcon = h:AddNewModifier(h, a, "modifier_orb_es_crack", {duration = duration})
    end
    local ____opt_6 = self.crackIcon
    if ____opt_6 ~= nil then
        ____opt_6:SetDuration(duration, true)
    end
    local ____opt_8 = self.crackIcon
    if ____opt_8 ~= nil then
        ____opt_8:SetStackCount(#self.cracks)
    end
end
function ShakerLegends.prototype.Detonate(self, ability)
    local h = self:GetParent()
    if not self:have("es_l_aftershock") or h:PassivesDisabled() or self.fuse or time() < self.nextCrack then
        return
    end
    local marks = __TS__ArrayFilter(
        self.cracks,
        function(____, m) return m.ends > time() end
    )
    for ____, m in ipairs(self.cracks) do
        if m.ends <= time() then
            endFX(m.fx)
        end
    end
    self.cracks = {}
    self:crackHUD()
    if not #marks then
        return
    end
    for ____, m in ipairs(marks) do
        ParticleManager:SetParticleControl(
            m.fx,
            2,
            Vector(255, 56, 16)
        )
    end
    self.fuse = {
        marks = marks,
        ability = ability,
        ends = time() + 0.5
    }
    self.nextCrack = time() + 7
    ability:StartCooldown(7)
end
function ShakerLegends.prototype.finishFuse(self)
    local f = self.fuse
    if not f then
        return
    end
    self.fuse = nil
    local hit = __TS__New(Set)
    local h = self:GetParent()
    for ____, m in ipairs(f.marks) do
        endFX(m.fx)
        burst(DUST, m.pos, 175)
        for ____, u in ipairs(self:enemies(m.pos, 175)) do
            do
                if hit:has(u) or not magic(u) then
                    goto __continue147
                end
                hit:add(u)
                self:damage(
                    u,
                    f.ability,
                    300 + (self:have("es_p_earthpower") and 65 or 0)
                )
                if live(u) then
                    shove(
                        h,
                        u,
                        f.ability,
                        0,
                        0,
                        0.7 * (1 - u:GetStatusResistance()),
                        150,
                        true
                    )
                end
            end
            ::__continue147::
        end
    end
    EmitSoundOn("Hero_EarthShaker.Aftershock", h)
end
function ShakerLegends.prototype.OnTakeDamage(self, e)
    local h = self:GetParent()
    if not IsServer() or e.attacker ~= h or not live(h) or not e.inflictor or e.inflictor:GetAbilityName() ~= R or e.damage <= 0 or not valid(e.unit) or not magic(e.unit) or e.unit:GetTeamNumber() == h:GetTeamNumber() or self.trails:has(e.unit) or not self:have("es_l_apocalypse") then
        return
    end
    local u = e.unit
    local pos = u:GetAbsOrigin()
    local icon = u:AddNewModifier(h, e.inflictor, "modifier_orb_es_tracked", {})
    self.trails:set(
        u,
        {
            unit = u,
            source = e.inflictor,
            last = pos,
            remaining = 3,
            still = 0,
            grace = time() + 2,
            icon = icon,
            fx = ring(
                pos,
                82,
                Vector(252, 130, 30)
            )
        }
    )
end
function ShakerLegends.prototype.endTrail(self, s)
    clear(s.icon)
    endFX(s.fx)
    self.trails:delete(s.unit)
end
function ShakerLegends.prototype.tickTrail(self, s, dt)
    local u = s.unit
    if not valid(u) or not magic(u) then
        self:endTrail(s)
        return
    end
    local pos = u:GetAbsOrigin()
    ParticleManager:SetParticleControl(s.fx, 0, pos)
    if s.grace > time() and u:IsStunned() then
        s.still = 0
        s.last = pos
        return
    end
    s.grace = 0
    if dist(pos, s.last) <= 1.5 then
        s.still = s.still + dt
    else
        s.still = 0
    end
    s.last = pos
    s.remaining = s.remaining - dt
    local ____opt_10 = s.icon
    if ____opt_10 ~= nil then
        ____opt_10:SetStackCount(math.max(
            1,
            math.ceil(s.remaining)
        ))
    end
    if s.still >= (self:have("es_p_victory") and 0.85 or 0.7) then
        self:endTrail(s)
        return
    end
    if s.remaining > 0 then
        return
    end
    self:endTrail(s)
    burst(ECHO, pos, 280)
    local amt = 320 + (self:have("es_p_echolife") and 70 or 0) + 0.1 * (u:GetMaxHealth() - u:GetHealth())
    local h = self:GetParent()
    local victims = self:b().awake and self:enemies(pos, 280) or ({u})
    for ____, v in ipairs(victims) do
        if magic(v) then
            ApplyDamage({attacker = h, victim = v, damage = amt, damage_type = DAMAGE_TYPE_MAGICAL})
        end
    end
end
function ShakerLegends.prototype.OnIntervalThink(self)
    local h = self:GetParent()
    local t = time()
    local dt = math.max(
        0,
        math.min(0.25, t - self.lastTime)
    )
    self.lastTime = t
    if not live(h) or h:IsIllusion() then
        return
    end
    if self:have("es_l_aftershock") then
        self:swap(E, SEIS, true, true)
        self:activate(
            SEIS,
            not h:PassivesDisabled() and (__TS__ArraySome(
                self.cracks,
                function(____, m) return m.ends > t end
            ) or t < self.nextCrack)
        )
    end
    if self:have("es_l_faultline") then
        local buff = h:FindModifierByName("modifier_earthshaker_enchant_totem")
        if buff ~= self.lastBuff then
            self.lastBuff = buff
            clear(self.charged)
            self.spentStep = false
            self.charged = buff and h:AddNewModifier(
                h,
                h:FindAbilityByName(W),
                "modifier_orb_es_charged",
                {duration = buff:GetRemainingTime()}
            ) or nil
            local ____opt_12 = self.charged
            if ____opt_12 ~= nil then
                ____opt_12:SetStackCount(1)
            end
        end
        local ____self_swap_17 = self.swap
        local ____temp_16 = self:b().awake and buff ~= nil and not self.spentStep
        if ____temp_16 then
            local ____opt_14 = h:FindAbilityByName(W)
            ____temp_16 = (____opt_14 and ____opt_14:GetCooldownTimeRemaining() or 0) > 0.06
        end
        ____self_swap_17(self, W, STEP, ____temp_16)
    end
    if self.ridge then
        self:tickWall(self.ridge, t)
    end
    local current = __TS__ArrayFilter(
        self.cracks,
        function(____, m) return m.ends > t end
    )
    if #current ~= #self.cracks then
        for ____, m in ipairs(self.cracks) do
            if m.ends <= t then
                endFX(m.fx)
            end
        end
        self.cracks = current
        self:crackHUD()
    end
    if self.fuse and t >= self.fuse.ends then
        self:finishFuse()
    end
    for ____, ____value in __TS__Iterator(self.trails) do
        local s = ____value[2]
        self:tickTrail(s, dt)
    end
end
function ShakerLegends.prototype.OnDeath(self, e)
    if not IsServer() then
        return
    end
    if e.unit == self:GetParent() then
        self:cleanup()
    else
        local s = self.trails:get(e.unit)
        if s then
            self:endTrail(s)
        end
    end
end
function ShakerLegends.prototype.cleanup(self)
    self:clearRidge()
    self:swap(W, STEP, false)
    self.records:clear()
    clear(self.charged)
    self.charged = nil
    self.lastBuff = nil
    for ____, c in ipairs(self.cracks) do
        endFX(c.fx)
    end
    self.cracks = {}
    self:crackHUD()
    if self.fuse then
        for ____, c in ipairs(self.fuse.marks) do
            endFX(c.fx)
        end
        self.fuse = nil
    end
    for ____, ____value in __TS__Iterator(self.trails) do
        local s = ____value[2]
        self:endTrail(s)
    end
end
function ShakerLegends.prototype.OnDestroy(self)
    if IsServer() then
        self:cleanup()
        self:swap(E, SEIS, false)
    end
end
modifier_orb_earthshaker_legend = registerModifier("modifier_orb_earthshaker_legend", ____exports.ShakerLegends)
modifier_orb_es_pivot = registerModifier("modifier_orb_es_pivot", PivotIcon)
modifier_orb_es_charged = registerModifier("modifier_orb_es_charged", Charged)
modifier_orb_es_crack = registerModifier("modifier_orb_es_crack", CrackIcon)
modifier_orb_es_tracked = registerModifier("modifier_orb_es_tracked", Tracked)
modifier_orb_es_path = registerModifier("modifier_orb_es_path", Pathing)
return ____exports
