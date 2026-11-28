local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local Set = ____lualib.Set
local __TS__ObjectAssign = ____lualib.__TS__ObjectAssign
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local __TS__StringStartsWith = ____lualib.__TS__StringStartsWith
local __TS__ArraySome = ____lualib.__TS__ArraySome
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local Q = "mirana_starfall"
local W = "mirana_arrow"
local E = "mirana_leap"
local R = "mirana_invis"
local THROW = "orb_mirana_star"
local BANK = "orb_mirana_arrow"
local TURN = "orb_mirana_turn"
local SWAP = "orb_mirana_swap"
local STAR = "particles/units/heroes/hero_mirana/mirana_starfall_ground_glow.vpcf"
local MOON = "particles/units/heroes/hero_mirana/mirana_moonlight_ray.vpcf"
local SHINE = "particles/units/heroes/hero_mirana/mirana_starfall_moonray.vpcf"
local BURST = "particles/units/heroes/hero_mirana/mirana_shard_impact.vpcf"
local ARROW = "particles/units/heroes/hero_mirana/mirana_spell_arrow.vpcf"
local STAR_SHOT = "particles/units/heroes/hero_mirana/mirana_base_attack.vpcf"
local ARROW_MODEL = "models/projectiles/mirana_arrow.vmdl"
local RING = "particles/ui_mouseactions/range_display.vpcf"
local function clock()
    return GameRules:GetGameTime()
end
local function color()
    return Vector(165, 210, 255)
end
local function dist(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2)
end
local function aim(a, b, fallback)
    local n = dist(a, b)
    return n < 1 and fallback or Vector((b.x - a.x) / n, (b.y - a.y) / n, 0)
end
local function step(p, dir, n)
    return Vector(p.x + dir.x * n, p.y + dir.y * n, p.z)
end
local function spin(v, a)
    return Vector(
        v.x * math.cos(a) - v.y * math.sin(a),
        v.x * math.sin(a) + v.y * math.cos(a),
        0
    )
end
local function legal(p)
    return math.abs(p.x) < MAP.bounds - 32 and math.abs(p.y) < MAP.bounds - 32 and GridNav:IsTraversable(p) and not GridNav:IsBlocked(p)
end
local function alive(unit)
    return unit ~= nil and IsValidEntity(unit) and unit:IsAlive()
end
local function enemy(hero, unit)
    return alive(unit) and unit:GetTeamNumber() ~= hero:GetTeamNumber() and not unit:IsOutOfGame() and not unit:IsInvulnerable()
end
local function real(unit)
    return unit:IsRealHero() and not unit:IsIllusion()
end
local function effect(path, p)
    local fx = ParticleManager:CreateParticle(path, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(fx, 0, p)
    return fx
end
local function ring(p, r)
    local id = effect(RING, p)
    ParticleManager:SetParticleControl(
        id,
        1,
        Vector(r, 0, 0)
    )
    ParticleManager:SetParticleControl(
        id,
        2,
        color()
    )
    return id
end
local function burst(path, p)
    ParticleManager:ReleaseParticleIndex(effect(path, p))
end
local function stop(id)
    if id == nil then
        return
    end
    ParticleManager:DestroyParticle(id, true)
    ParticleManager:ReleaseParticleIndex(id)
end
local function remove(mod)
    if mod ~= nil and not mod:IsNull() then
        mod:Destroy()
    end
end
local function validTree(tree)
    return IsValidEntity(tree) and tree:IsStanding()
end
local function treeOnLine(p, dir, length, ignore)
    local trees = GridNav:GetAllTreesAroundPoint(
        step(p, dir, length / 2),
        length / 2 + 40,
        true
    )
    local best
    for ____, tree in ipairs(trees) do
        do
            if tree == ignore or not validTree(tree) then
                goto __continue21
            end
            local c = tree:GetAbsOrigin()
            local dx = c.x - p.x
            local dy = c.y - p.y
            local along = dx * dir.x + dy * dir.y
            local side = math.abs(dx * dir.y - dy * dir.x)
            if along <= 0 or along > length or side > 36 then
                goto __continue21
            end
            local reach = math.max(
                1,
                along - math.sqrt(36 * 36 - side * side)
            )
            if best == nil or reach < best.distance then
                best = {tree = tree, distance = reach}
            end
        end
        ::__continue21::
    end
    return best
end
local Status = __TS__Class()
Status.name = "Status"
__TS__ClassExtends(Status, ModBase)
function Status.prototype.IsHidden(self)
    return false
end
function Status.prototype.IsPurgable(self)
    return false
end
local StarStatus = __TS__Class()
StarStatus.name = "StarStatus"
__TS__ClassExtends(StarStatus, Status)
function StarStatus.prototype.GetTexture(self)
    return "mirana/pulsar_remnant/mirana_starfall"
end
local ArrowStatus = __TS__Class()
ArrowStatus.name = "ArrowStatus"
__TS__ClassExtends(ArrowStatus, Status)
function ArrowStatus.prototype.GetTexture(self)
    return "mirana/meoth/meoth_sacred_arrow"
end
local TurnStatus = __TS__Class()
TurnStatus.name = "TurnStatus"
__TS__ClassExtends(TurnStatus, Status)
function TurnStatus.prototype.GetTexture(self)
    return "mirana_leap_secondary"
end
local MoonStatus = __TS__Class()
MoonStatus.name = "MoonStatus"
__TS__ClassExtends(MoonStatus, Status)
function MoonStatus.prototype.GetTexture(self)
    return "mirana_nightveil"
end
local Decoy = __TS__Class()
Decoy.name = "Decoy"
__TS__ClassExtends(Decoy, MoonStatus)
function Decoy.prototype.GetPriority(self)
    return MODIFIER_PRIORITY_SUPER_ULTRA
end
function Decoy.prototype.CheckState(self)
    return {
        [MODIFIER_STATE_NO_UNIT_COLLISION] = true,
        [MODIFIER_STATE_INVISIBLE] = false,
        [MODIFIER_STATE_DISARMED] = true,
        [MODIFIER_STATE_SILENCED] = true,
        [MODIFIER_STATE_MUTED] = true
    }
end
function Decoy.prototype.DeclareFunctions(self)
    return {MODIFIER_EVENT_ON_ATTACK_LANDED}
end
function Decoy.prototype.OnAttackLanded(self, e)
    if IsServer() and e.target == self:GetParent() and alive(e.attacker) and e.attacker:IsHero() and e.attacker:GetTeamNumber() ~= self:GetParent():GetTeamNumber() then
        self:GetParent():ForceKill(false)
    end
end
local Moonshot = __TS__Class()
Moonshot.name = "Moonshot"
__TS__ClassExtends(Moonshot, Status)
function Moonshot.prototype.GetTexture(self)
    return "mirana_celestial_quiver"
end
function Moonshot.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_PREATTACK_CRITICALSTRIKE, MODIFIER_EVENT_ON_ATTACK}
end
function Moonshot.prototype.GetModifierPreAttack_CriticalStrike(self, e)
    if IsServer() and not e.no_attack_cooldown and enemy(
        self:GetParent(),
        e.target
    ) and real(e.target) then
        return 180
    end
    return 0
end
function Moonshot.prototype.OnAttack(self, e)
    if IsServer() and e.attacker == self:GetParent() and not e.no_attack_cooldown and enemy(e.attacker, e.target) and real(e.target) then
        self:Destroy()
    end
end
local MoonReach = __TS__Class()
MoonReach.name = "MoonReach"
__TS__ClassExtends(MoonReach, Status)
function MoonReach.prototype.GetTexture(self)
    return "mirana_invis"
end
function MoonReach.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_ATTACK_RANGE_BONUS}
end
function MoonReach.prototype.GetModifierAttackRangeBonus(self)
    return 90
end
____exports.MiranaLegends = __TS__Class()
local MiranaLegends = ____exports.MiranaLegends
MiranaLegends.name = "MiranaLegends"
__TS__ClassExtends(MiranaLegends, ModBase)
function MiranaLegends.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.seq = 0
    self.qPending = 0
    self.qCastAt = -5
    self.stars = __TS__New(Map)
    self.fans = __TS__New(Map)
    self.clones = {}
    self.armedMoon = 0
    self.swapped = __TS__New(Set)
end
function MiranaLegends.prototype.IsHidden(self)
    return true
end
function MiranaLegends.prototype.IsPurgable(self)
    return false
end
function MiranaLegends.prototype.RemoveOnDeath(self)
    return false
end
function MiranaLegends.prototype.OnCreated(self)
    if IsServer() then
        self:StartIntervalThink(0.03)
    end
end
function MiranaLegends.prototype.owned(self, id)
    return (bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        clock()
    ).code[id] or 0) > 0
end
function MiranaLegends.prototype.awake(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        clock()
    ).awake
end
function MiranaLegends.prototype.GetPriority(self)
    return MODIFIER_PRIORITY_SUPER_ULTRA
end
function MiranaLegends.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_START,
        MODIFIER_EVENT_ON_ABILITY_EXECUTED,
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_PROPERTY_OVERRIDE_ABILITY_SPECIAL,
        MODIFIER_PROPERTY_OVERRIDE_ABILITY_SPECIAL_VALUE,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_EVENT_ON_DEATH
    }
end
function MiranaLegends.prototype.swap(self, native, alt, show)
    if self.swapped:has(alt) == show then
        return
    end
    local h = self:GetParent()
    local a = h:FindAbilityByName(native)
    local b = h:FindAbilityByName(alt) or (show and h:AddAbility(alt) or nil)
    if not a or not b then
        return
    end
    if show then
        b:SetLevel(1)
        h:SwapAbilities(native, alt, false, true)
        self.swapped:add(alt)
    else
        h:SwapAbilities(alt, native, false, true)
        self.swapped:delete(alt)
    end
    a:SetHidden(show)
    b:SetHidden(not show)
    a:MarkAbilityButtonDirty()
    b:MarkAbilityButtonDirty()
end
function MiranaLegends.prototype.icon(self, name, skill, duration, count)
    if count == nil then
        count = 1
    end
    local h = self:GetParent()
    local m = h:AddNewModifier(h, skill, "modifier_orb_mirana_" .. name, {duration = duration})
    if m ~= nil then
        m:SetStackCount(count)
    end
    return m
end
function MiranaLegends.prototype.projectile(self, ability, from, dir, speed, range, radius, fx, id, creeps)
    if creeps == nil then
        creeps = false
    end
    return ProjectileManager:CreateLinearProjectile({
        Ability = ability,
        Source = self:GetParent(),
        vSpawnOrigin = from,
        vVelocity = Vector(dir.x * speed, dir.y * speed, 0),
        fDistance = range,
        fStartRadius = radius,
        fEndRadius = radius,
        EffectName = fx,
        iUnitTargetTeam = DOTA_UNIT_TARGET_TEAM_ENEMY,
        iUnitTargetType = creeps and bit.bor(DOTA_UNIT_TARGET_HERO, DOTA_UNIT_TARGET_BASIC) or DOTA_UNIT_TARGET_HERO,
        iUnitTargetFlags = DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES,
        bIgnoreSource = true,
        bVisibleToEnemies = true,
        bProvidesVision = true,
        iVisionRadius = 150,
        iVisionTeamNumber = self:GetParent():GetTeamNumber(),
        ExtraData = {id = id}
    })
end
function MiranaLegends.prototype.OnAbilityStart(self, e)
    if not IsServer() or e.unit ~= self:GetParent() or e.ability:GetAbilityName() ~= W or not self:owned("mir_l_arrow") then
        return
    end
    self.arrowPlan = nil
    local a = e.ability
    local origin = e.unit:GetAbsOrigin()
    local dir = aim(
        origin,
        a:GetCursorPosition(),
        e.unit:GetForwardVector()
    )
    local budget = a:GetSpecialValueFor("arrow_range")
    local hit = treeOnLine(origin, dir, budget)
    if hit then
        self.arrowPlan = __TS__ObjectAssign(
            {},
            hit,
            {
                origin = origin,
                dir = dir,
                budget = budget,
                expires = clock() + a:GetCastPoint() + 0.25,
                skill = a
            }
        )
    end
end
function MiranaLegends.prototype.GetModifierOverrideAbilitySpecial(self, e)
    return IsServer() and self.arrowPlan ~= nil and self.arrowPlan.expires >= clock() and validTree(self.arrowPlan.tree) and e.ability == self.arrowPlan.skill and e.ability_special_value == "arrow_range" and 1 or 0
end
function MiranaLegends.prototype.GetModifierOverrideAbilitySpecialValue(self)
    local ____opt_2 = self.arrowPlan
    return ____opt_2 and ____opt_2.distance or 0
end
function MiranaLegends.prototype.watchStarfall(self, e)
    if e.ability:GetAbilityName() ~= Q or not self:owned("mir_l_starstorm") or self.held or self.pickup or clock() - self.qCastAt < 0.05 then
        return
    end
    self.qCastAt = clock()
    self.qPending = clock() + 1.6
end
function MiranaLegends.prototype.OnAbilityExecuted(self, e)
    if IsServer() and e.unit == self:GetParent() and alive(e.unit) and real(e.unit) then
        self:watchStarfall(e)
    end
end
function MiranaLegends.prototype.OnAbilityFullyCast(self, e)
    if not IsServer() or e.unit ~= self:GetParent() or not alive(e.unit) or not real(e.unit) then
        return
    end
    local a = e.ability
    local n = a:GetAbilityName()
    if n == Q then
        self:watchStarfall(e)
    end
    if n == W and self.arrowPlan and validTree(self.arrowPlan.tree) then
        local plan = self.arrowPlan
        self.nativeArrow = __TS__ObjectAssign(
            {},
            plan,
            {expires = clock() + plan.distance / math.max(
                1,
                a:GetSpecialValueFor("arrow_speed")
            )}
        )
        plan.expires = clock() + 0.022
    end
    if n == E and self:owned("mir_l_starhunt") then
        self:beginLeap(a)
    end
    if n == R and self:owned("mir_l_moon") then
        self:clearMoons()
        self.armedMoon = clock() + a:GetSpecialValueFor("fade_delay") + 2
    end
end
function MiranaLegends.prototype.OnTakeDamage(self, e)
    local h = self:GetParent()
    if not IsServer() or e.attacker ~= h or not alive(h) or not e.inflictor then
        return
    end
    local n = e.inflictor:GetAbilityName()
    if n == W and self.nativeArrow then
        self.nativeArrow = nil
    end
    if n ~= Q or self.qPending <= clock() or self.pickup or self.held or not e.unit:IsHero() or not real(e.unit) or e.unit:GetTeamNumber() == h:GetTeamNumber() then
        return
    end
    self.qPending = 0
    local pos = e.unit:GetAbsOrigin()
    local back = aim(
        pos,
        h:GetAbsOrigin(),
        h:GetForwardVector()
    )
    local point = step(pos, back, 145)
    if not legal(point) then
        point = pos
    end
    point = GetGroundPosition(point, h)
    self.pickup = {
        point = point,
        ends = clock() + 4,
        ring = ring(point, 84),
        beam = effect(MOON, point)
    }
    burst(SHINE, point)
end
function MiranaLegends.prototype.clearPickup(self)
    local ____stop_6 = stop
    local ____opt_4 = self.pickup
    ____stop_6(____opt_4 and ____opt_4.ring)
    local ____stop_9 = stop
    local ____opt_7 = self.pickup
    ____stop_9(____opt_7 and ____opt_7.beam)
    self.pickup = nil
end
function MiranaLegends.prototype.clearHeld(self)
    local ____remove_12 = remove
    local ____opt_10 = self.held
    ____remove_12(____opt_10 and ____opt_10.icon)
    self.held = nil
    self:swap(Q, THROW, false)
end
function MiranaLegends.prototype.ThrowStar(self, a, point)
    local h = self:GetParent()
    if not self.held or self.held.ends < clock() or not alive(h) then
        return
    end
    local base = h:FindAbilityByName(Q)
    self:clearHeld()
    if not base then
        return
    end
    local ____self_13, ____seq_14 = self, "seq"
    local ____self_seq_15 = ____self_13[____seq_14] + 1
    ____self_13[____seq_14] = ____self_seq_15
    local id = ____self_seq_15
    self.stars:set(
        id,
        {
            damage = 2 * base:GetSpecialValueFor("damage") + (self:owned("mir_p_starlight") and 70 or 0),
            hits = self:awake() and 2 or 1,
            ["until"] = clock() + 3,
            hit = __TS__New(Set)
        }
    )
    self:projectile(
        a,
        h:GetAbsOrigin(),
        aim(
            h:GetAbsOrigin(),
            point,
            h:GetForwardVector()
        ),
        1150,
        self:owned("mir_p_meteor") and 1350 or 1150,
        90,
        STAR_SHOT,
        id
    )
    EmitSoundOn("Ability.Starfall", h)
end
function MiranaLegends.prototype.StarHit(self, target, id)
    local s = self.stars:get(id)
    local h = self:GetParent()
    if not s or not target then
        self.stars:delete(id)
        return true
    end
    if not enemy(h, target) or not real(target) or s.hit:has(target:entindex()) then
        return false
    end
    s.hit:add(target:entindex())
    if not target:IsDebuffImmune() then
        ApplyDamage({
            attacker = h,
            victim = target,
            damage = s.damage,
            damage_type = DAMAGE_TYPE_MAGICAL,
            ability = h:FindAbilityByName(THROW)
        })
        burst(
            SHINE,
            target:GetAbsOrigin()
        )
    end
    local ____s_16, ____hits_17 = s, "hits"
    local ____s_hits_18 = ____s_16[____hits_17] - 1
    ____s_16[____hits_17] = ____s_hits_18
    if ____s_hits_18 <= 0 then
        self.stars:delete(id)
        return true
    end
    return false
end
function MiranaLegends.prototype.lodge(self, tree, dir, travelled, left, turns, skill)
    self:clearPin()
    if left < 50 or not validTree(tree) then
        return
    end
    local h = self:GetParent()
    local p = tree:GetAbsOrigin()
    local model = SpawnEntityFromTableSynchronous("prop_dynamic", {model = ARROW_MODEL, solid = 0, disableshadows = 1, modelscale = 1.25})
    if model then
        model:SetAbsOrigin(Vector(p.x - dir.x * 20, p.y - dir.y * 20, p.z + 100))
        model:SetForwardVector(dir)
    end
    local window = self:owned("mir_p_quiver") and 2.8 or 2
    self.pin = {
        tree = tree,
        point = p,
        travelled = travelled,
        left = left,
        turns = turns,
        skill = skill,
        model = model,
        deadline = clock() + window,
        glow = effect(MOON, p),
        icon = self:icon("arrow", skill, window, turns)
    }
    self:swap(W, BANK, true)
    AddFOWViewer(
        h:GetTeamNumber(),
        p,
        190,
        window,
        false
    )
end
function MiranaLegends.prototype.clearPin(self)
    local p = self.pin
    if not p then
        return
    end
    stop(p.glow)
    remove(p.icon)
    if p.model and IsValidEntity(p.model) then
        UTIL_Remove(p.model)
    end
    self.pin = nil
    self:swap(W, BANK, false)
end
function MiranaLegends.prototype.Redirect(self, a, point)
    local pin = self.pin
    local h = self:GetParent()
    if not pin or pin.deadline < clock() or not validTree(pin.tree) or not alive(h) then
        self:clearPin()
        return
    end
    local dir = aim(
        pin.point,
        point,
        h:GetForwardVector()
    )
    local from = step(pin.point, dir, 38)
    local ____self_19, ____seq_20 = self, "seq"
    local ____self_seq_21 = ____self_19[____seq_20] + 1
    ____self_19[____seq_20] = ____self_seq_21
    local id = ____self_seq_21
    self:clearPin()
    local projectile = self:projectile(
        a,
        from,
        dir,
        pin.skill:GetSpecialValueFor("arrow_speed"),
        pin.left,
        pin.skill:GetSpecialValueFor("arrow_width"),
        ARROW,
        id,
        true
    )
    self.arrowFlight = {
        projectile = projectile,
        id = id,
        from = from,
        dir = dir,
        left = pin.left,
        travelled = pin.travelled,
        turns = pin.turns - 1,
        previous = pin.tree,
        skill = pin.skill,
        last = from
    }
    StartSoundEventFromPosition("Hero_Mirana.ArrowCast", pin.point)
end
function MiranaLegends.prototype.ArrowThink(self, point, id)
    local f = self.arrowFlight
    if not f or f.id ~= id or f.turns <= 0 then
        return
    end
    local hit = treeOnLine(
        f.last,
        f.dir,
        dist(f.last, point),
        f.previous
    )
    local old = f.last
    f.last = point
    if not hit then
        return
    end
    local delta = dist(f.from, old) + hit.distance
    self.arrowFlight = nil
    ProjectileManager:DestroyLinearProjectile(f.projectile)
    self:lodge(
        hit.tree,
        f.dir,
        f.travelled + delta,
        f.left - delta,
        f.turns,
        f.skill
    )
end
function MiranaLegends.prototype.ArrowHit(self, target, point, id)
    local f = self.arrowFlight
    local h = self:GetParent()
    if not f or f.id ~= id then
        return true
    end
    if not target then
        self.arrowFlight = nil
        return true
    end
    if not enemy(h, target) then
        return false
    end
    self.arrowFlight = nil
    if target:IsDebuffImmune() then
        return true
    end
    if target:IsCreep() and not target:IsAncient() and not target:IsConsideredHero() then
        target:Kill(f.skill, h)
        return true
    end
    local a = f.skill
    local pct = math.min(
        1,
        (f.travelled + dist(point, f.from)) / math.max(
            1,
            a:GetSpecialValueFor("arrow_max_stunrange")
        )
    )
    local min = a:GetSpecialValueFor("arrow_min_stun")
    local max = a:GetSpecialValueFor("arrow_max_stun")
    target:AddNewModifier(
        h,
        a,
        "modifier_stunned",
        {duration = (min + (max - min) * pct) * (1 - target:GetStatusResistance())}
    )
    local baseDamage = a:GetSpecialValueFor("AbilityDamage")
    local damage = baseDamage > 0 and baseDamage or a:GetAbilityDamage()
    ApplyDamage({
        attacker = h,
        victim = target,
        ability = a,
        damage_type = DAMAGE_TYPE_MAGICAL,
        damage = damage + a:GetSpecialValueFor("arrow_bonus_damage") * pct
    })
    if h:HasScepter() then
        local q = h:FindAbilityByName(Q)
        if q and q:GetLevel() > 0 then
            ApplyDamage({
                attacker = h,
                victim = target,
                ability = a,
                damage_type = DAMAGE_TYPE_MAGICAL,
                damage = q:GetSpecialValueFor("damage") * a:GetSpecialValueFor("scepter_starstorm_target_pct") / 100
            })
            burst(SHINE, point)
        end
    end
    return true
end
function MiranaLegends.prototype.beginLeap(self, skill)
    self:clearLeap()
    local h = self:GetParent()
    local start = h:GetAbsOrigin()
    local direction = h:GetForwardVector()
    local range = skill:GetSpecialValueFor("leap_distance")
    local speed = math.max(
        1,
        skill:GetSpecialValueFor("leap_speed")
    )
    local life = math.max(
        0.32,
        math.min(1.1, range / speed)
    )
    self.leap = {
        start = start,
        direction = direction,
        skill = skill,
        ends = clock() + life,
        icon = self:icon("turn", skill, life),
        shadow = ring(
            step(start, direction, range),
            90
        )
    }
    self:swap(E, TURN, true)
end
function MiranaLegends.prototype.clearLeap(self)
    local jump = self.leap
    if not jump then
        return
    end
    self.leap = nil
    stop(jump.shadow)
    remove(jump.icon)
    self:swap(E, TURN, false)
    if jump.turn and alive(self:GetParent()) then
        FindClearSpaceForUnit(
            self:GetParent(),
            self:GetParent():GetAbsOrigin(),
            true
        )
    end
end
function MiranaLegends.prototype.Turn(self, _ability, point)
    local j = self.leap
    local h = self:GetParent()
    if not j or j.turn or j.ends <= clock() or h:IsStunned() or h:IsRooted() then
        return
    end
    local pos = h:GetAbsOrigin()
    local dir = aim(pos, point, j.direction)
    local left = math.max(
        120,
        math.min(
            360,
            j.skill:GetSpecialValueFor("leap_distance") - dist(pos, j.start)
        )
    )
    local to = step(
        pos,
        dir,
        math.min(
            left,
            math.max(
                100,
                dist(pos, point)
            )
        )
    )
    if not legal(to) then
        return
    end
    to = GetGroundPosition(to, h)
    local height = math.max(
        0,
        pos.z - GetGroundPosition(pos, h).z
    )
    h:InterruptMotionControllers(false)
    for ____, m in ipairs(h:FindAllModifiers()) do
        if m:GetName() == "modifier_mirana_leap" and m:GetAbility() == j.skill then
            m:Destroy()
        end
    end
    j.turn = {
        from = pos,
        to = to,
        at = clock(),
        height = height,
        last = pos
    }
    j.direction = dir
    j.ends = clock() + math.max(
        0.15,
        dist(pos, to) / 1100
    )
    ParticleManager:SetParticleControl(j.shadow, 0, to)
    self:swap(E, TURN, false)
    remove(j.icon)
    j.icon = nil
end
function MiranaLegends.prototype.trackLeapCharges(self)
    local skill = self:GetParent():FindAbilityByName(E)
    if not skill or skill:GetLevel() <= 0 or not self:owned("mir_l_starhunt") then
        return
    end
    local count = skill:GetCurrentAbilityCharges()
    local max = skill:GetMaxAbilityCharges(skill:GetLevel() - 1)
    if max <= 0 or count >= max then
        self.recharge = nil
        return
    end
    local r = self.recharge
    if not r or r.skill ~= skill or count > r.count then
        self.recharge = {
            skill = skill,
            count = count,
            since = clock()
        }
        return
    end
    r.count = count
    if r.accelerated ~= nil and clock() >= r.accelerated then
        skill:SetCurrentAbilityCharges(max)
        skill:SetCurrentAbilityCharges(math.min(max, count + 1))
        self.recharge = count + 1 < max and ({
            skill = skill,
            count = count + 1,
            since = clock()
        }) or nil
        skill:MarkAbilityButtonDirty()
    end
end
function MiranaLegends.prototype.land(self)
    local j = self.leap
    local h = self:GetParent()
    if not j then
        return
    end
    local dir = j.direction
    local skill = j.skill
    local point = h:GetAbsOrigin()
    self:clearLeap()
    local a = h:FindAbilityByName(TURN)
    if not a then
        return
    end
    burst(BURST, point)
    local ____self_22, ____seq_23 = self, "seq"
    local ____self_seq_24 = ____self_22[____seq_23] + 1
    ____self_22[____seq_23] = ____self_seq_24
    local id = ____self_seq_24
    self.fans:set(
        id,
        {
            hits = __TS__New(Map),
            ["until"] = clock() + 1.4,
            skill = skill,
            damage = 60 + (self:owned("mir_p_pounce") and 24 or 0) + 0.5 * h:GetAverageTrueAttackDamage(h),
            awake = self:awake(),
            refunded = false
        }
    )
    for ____, angle in ipairs({-0.22, 0, 0.22}) do
        self:projectile(
            a,
            point,
            spin(dir, angle),
            1200,
            self:owned("mir_p_blur") and 660 or 550,
            46,
            ARROW,
            id
        )
    end
end
function MiranaLegends.prototype.FanHit(self, target, id)
    local f = self.fans:get(id)
    local h = self:GetParent()
    if not f or not target then
        return true
    end
    if not enemy(h, target) or not real(target) then
        return false
    end
    if target:IsAttackImmune() then
        return true
    end
    local hits = (f.hits:get(target:entindex()) or 0) + 1
    f.hits:set(
        target:entindex(),
        hits
    )
    ApplyDamage({
        attacker = h,
        victim = target,
        ability = h:FindAbilityByName(TURN),
        damage = f.damage,
        damage_type = DAMAGE_TYPE_PHYSICAL
    })
    if hits == 3 and f.awake and not f.refunded then
        f.refunded = true
        local recharge = __TS__ArrayFind(
            h:FindAllModifiers(),
            function(____, m) return m:GetAbility() == f.skill and m:GetName() == "modifier_charges" end
        )
        if recharge and recharge:GetRemainingTime() > 0 then
            local remaining = recharge:GetRemainingTime()
            local half = f.skill:GetAbilityChargeRestoreTime(math.max(
                0,
                f.skill:GetLevel() - 1
            )) / 2
            recharge:SetDuration(
                math.max(0.03, remaining - half),
                true
            )
            recharge:StartIntervalThink(math.max(0.03, remaining - half))
        elseif f.skill:GetCooldownTimeRemaining() > 0 then
            local remaining = f.skill:GetCooldownTimeRemaining()
            local half = f.skill:GetAbilityChargeRestoreTime(math.max(
                0,
                f.skill:GetLevel() - 1
            )) / 2
            f.skill:EndCooldown()
            if remaining > half then
                f.skill:StartCooldown(remaining - half)
            elseif f.skill:GetCurrentAbilityCharges() == 0 then
                f.skill:SetCurrentAbilityCharges(1)
            end
        else
            self:trackLeapCharges()
            local timer = self.recharge
            if timer and timer.skill == f.skill then
                local seconds = f.skill:GetAbilityChargeRestoreTime(math.max(
                    0,
                    f.skill:GetLevel() - 1
                )) * self:GetParent():GetCooldownReduction()
                timer.accelerated = math.max(
                    clock(),
                    (timer.accelerated or timer.since + seconds) - seconds / 2
                )
                self:trackLeapCharges()
            end
        end
    end
    return true
end
function MiranaLegends.prototype.createMoons(self)
    local h = self:GetParent()
    local r = h:FindAbilityByName(R)
    if not r then
        return
    end
    self:clearMoons()
    local duration = self:owned("mir_p_shadow") and 5 or 4
    local keys = {
        outgoing_damage = -100,
        incoming_damage = 0,
        bounty_base = 0,
        bounty_growth = 0,
        duration = duration
    }
    local clones = CreateIllusions(
        h,
        h,
        keys,
        2,
        36,
        false,
        true
    )
    do
        local i = 0
        while i < #clones do
            do
                local clone = clones[i + 1]
                if not alive(clone) then
                    goto __continue145
                end
                local dir = spin(
                    h:GetForwardVector(),
                    i == 0 and 0.9 or -0.9
                )
                clone:AddNewModifier(h, r, "modifier_orb_mirana_decoy", {duration = duration})
                for ____, mod in ipairs(clone:FindAllModifiers()) do
                    if __TS__StringStartsWith(
                        mod:GetName(),
                        "modifier_mirana_moonlight_shadow"
                    ) then
                        mod:Destroy()
                    end
                end
                clone:SetControllableByPlayer(-1, false)
                local goal = step(
                    h:GetAbsOrigin(),
                    dir,
                    1050
                )
                clone:MoveToPosition(goal)
                local ____self_clones_25 = self.clones
                ____self_clones_25[#____self_clones_25 + 1] = clone
            end
            ::__continue145::
            i = i + 1
        end
    end
    if #self.clones > 0 then
        self.moons = {
            ends = clock() + duration,
            icon = self:icon("moons", r, duration, #self.clones)
        }
        self:swap(R, SWAP, true)
    end
end
function MiranaLegends.prototype.clearMoons(self)
    local old = self.clones
    self.clones = {}
    local ____remove_28 = remove
    local ____opt_26 = self.moons
    ____remove_28(____opt_26 and ____opt_26.icon)
    self.moons = nil
    self:swap(R, SWAP, false)
    for ____, clone in ipairs(old) do
        if alive(clone) then
            clone:ForceKill(false)
        end
    end
end
function MiranaLegends.prototype.SwapMoon(self, point)
    local h = self:GetParent()
    if not self.moons or self.moons.ends < clock() or not alive(h) or h:IsRooted() or h:IsStunned() or (h:HasModifier("modifier_slark_pounce_leash") or h:HasModifier("modifier_puck_dream_coil")) then
        return
    end
    local origin = h:GetAbsOrigin()
    local dir = aim(
        origin,
        point,
        h:GetForwardVector()
    )
    local best
    local score = -2
    for ____, c in ipairs(self.clones) do
        do
            if not alive(c) or not legal(c:GetAbsOrigin()) then
                goto __continue157
            end
            local towards = aim(
                origin,
                c:GetAbsOrigin(),
                dir
            )
            local dot = towards.x * dir.x + towards.y * dir.y
            if dot > score then
                best = c
                score = dot
            end
        end
        ::__continue157::
    end
    if not best or score < 0 then
        return
    end
    local dest = best:GetAbsOrigin()
    FindClearSpaceForUnit(h, dest, true)
    FindClearSpaceForUnit(best, origin, true)
    burst(STAR, origin)
    burst(STAR, dest)
    self:clearMoons()
    local ultimate = h:FindAbilityByName(R)
    if self:awake() then
        h:AddNewModifier(h, ultimate, "modifier_orb_mirana_shot", {duration = 4})
    end
    if self:owned("mir_p_ambush") then
        h:AddNewModifier(h, ultimate, "modifier_orb_mirana_reach", {duration = 2})
    end
end
function MiranaLegends.prototype.OnIntervalThink(self)
    local h = self:GetParent()
    local t = clock()
    if not alive(h) or not real(h) then
        return
    end
    self:trackLeapCharges()
    if self.arrowPlan and self.arrowPlan.expires < t then
        self.arrowPlan = nil
    end
    local path = self.nativeArrow
    if path then
        local speed = math.max(
            1,
            path.skill:GetSpecialValueFor("arrow_speed")
        )
        local tip = step(
            path.origin,
            path.dir,
            math.min(
                path.distance,
                math.max(0, path.distance - (path.expires - t) * speed)
            )
        )
        local blockers = FindUnitsInRadius(
            h:GetTeamNumber(),
            tip,
            nil,
            path.skill:GetSpecialValueFor("arrow_width"),
            DOTA_UNIT_TARGET_TEAM_ENEMY,
            bit.bor(DOTA_UNIT_TARGET_HERO, DOTA_UNIT_TARGET_BASIC),
            DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES,
            FIND_ANY_ORDER,
            false
        )
        if __TS__ArraySome(
            blockers,
            function(____, u) return enemy(h, u) end
        ) then
            self.nativeArrow = nil
        elseif t >= path.expires then
            self.nativeArrow = nil
            self:lodge(
                path.tree,
                path.dir,
                path.distance,
                path.budget - path.distance,
                self:awake() and 2 or 1,
                path.skill
            )
        end
    end
    if self.pin and (not validTree(self.pin.tree) or t >= self.pin.deadline) then
        self:clearPin()
    end
    local pick = self.pickup
    if pick then
        local near = __TS__ArrayFind(
            FindUnitsInRadius(
                h:GetTeamNumber(),
                pick.point,
                nil,
                84,
                3,
                1,
                16,
                1,
                false
            ),
            function(____, u) return alive(u) and real(u) and (u == h or u:GetTeamNumber() ~= h:GetTeamNumber()) and not u:IsOutOfGame() end
        )
        if t >= pick.ends or near then
            self:clearPickup()
        end
        if near == h and t < pick.ends then
            local q = h:FindAbilityByName(Q)
            if q then
                self.held = {
                    ends = t + 4,
                    icon = self:icon("star", q, 4)
                }
                self:swap(Q, THROW, true)
            end
        end
    end
    if self.held and self.held.ends <= t then
        self:clearHeld()
    end
    for ____, ____value in __TS__Iterator(self.stars) do
        local id = ____value[1]
        local s = ____value[2]
        if s["until"] < t then
            self.stars:delete(id)
        end
    end
    for ____, ____value in __TS__Iterator(self.fans) do
        local id = ____value[1]
        local f = ____value[2]
        if f["until"] < t then
            self.fans:delete(id)
        end
    end
    local j = self.leap
    if j then
        if h:IsStunned() or h:IsRooted() or h:IsHexed() then
            self:clearLeap()
        elseif j.turn then
            local move = j.turn
            if dist(
                h:GetAbsOrigin(),
                move.last
            ) > 130 or h:IsCurrentlyHorizontalMotionControlled() then
                self:clearLeap()
            else
                local k = math.min(1, (t - move.at) / (j.ends - move.at))
                local ground = GetGroundPosition(
                    step(
                        move.from,
                        j.direction,
                        dist(move.from, move.to) * k
                    ),
                    h
                )
                move.last = Vector(ground.x, ground.y, ground.z + move.height * (1 - k) + 80 * 4 * k * (1 - k))
                h:SetAbsOrigin(move.last)
                if k >= 1 then
                    self:land()
                end
            end
        elseif t >= j.ends and (not h:IsCurrentlyHorizontalMotionControlled() or t > j.ends + 0.3) then
            self:land()
        end
    end
    if self.armedMoon > 0 then
        local skill = h:FindAbilityByName(R)
        local gained = h:IsInvisible() and __TS__ArraySome(
            h:FindAllModifiers(),
            function(____, m) return __TS__StringStartsWith(
                m:GetName(),
                "modifier_mirana_moonlight_shadow"
            ) or __TS__StringStartsWith(
                m:GetName(),
                "modifier_mirana_"
            ) and skill ~= nil and m:GetAbility() == skill end
        )
        if gained or t >= self.armedMoon then
            self.armedMoon = 0
            if gained then
                self:createMoons()
            end
        end
    end
    if self.moons then
        self.clones = __TS__ArrayFilter(
            self.clones,
            function(____, c) return alive(c) end
        )
        if self.moons.icon and not self.moons.icon:IsNull() then
            self.moons.icon:SetStackCount(#self.clones)
        end
        if #self.clones == 0 or t >= self.moons.ends then
            self:clearMoons()
        end
    end
end
function MiranaLegends.prototype.reset(self)
    self.recharge = nil
    self.armedMoon = 0
    self.qPending = 0
    self.arrowPlan = nil
    self.nativeArrow = nil
    self:clearPickup()
    self:clearHeld()
    self:clearPin()
    self:clearLeap()
    self:clearMoons()
    if self.arrowFlight then
        ProjectileManager:DestroyLinearProjectile(self.arrowFlight.projectile)
        self.arrowFlight = nil
    end
    self.stars:clear()
    self.fans:clear()
end
function MiranaLegends.prototype.OnDeath(self, e)
    if IsServer() and e.unit == self:GetParent() then
        self:reset()
    end
end
function MiranaLegends.prototype.OnDestroy(self)
    if IsServer() then
        self:reset()
    end
end
modifier_orb_mirana_legend = registerModifier("modifier_orb_mirana_legend", ____exports.MiranaLegends)
modifier_orb_mirana_star = registerModifier("modifier_orb_mirana_star", StarStatus)
modifier_orb_mirana_arrow = registerModifier("modifier_orb_mirana_arrow", ArrowStatus)
modifier_orb_mirana_turn = registerModifier("modifier_orb_mirana_turn", TurnStatus)
modifier_orb_mirana_moons = registerModifier("modifier_orb_mirana_moons", MoonStatus)
modifier_orb_mirana_decoy = registerModifier("modifier_orb_mirana_decoy", Decoy)
modifier_orb_mirana_shot = registerModifier("modifier_orb_mirana_shot", Moonshot)
modifier_orb_mirana_reach = registerModifier("modifier_orb_mirana_reach", MoonReach)
return ____exports
