local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local Set = ____lualib.Set
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local CLEAVE = "sven_great_cleave"
local WARCRY = "sven_warcry"
local GOD = "sven_gods_strength"
local REDIRECT = "orb_sven_redirect"
local WEIGHT = "orb_sven_weight"
local BLADE_ICON = "modifier_orb_sven_blade_ready"
local RAM_BUILD = "modifier_orb_sven_ram_build"
local RAM_READY = "modifier_orb_sven_ram_ready"
local WEIGHT_ICON = "modifier_orb_sven_weight_ready"
local WINDUP = "modifier_orb_sven_weight_windup"
local RAM_BUFF = "modifier_sven_warcry"
local GOD_BUFF = "modifier_sven_gods_strength"
local ARMOR_CUT = "modifier_orb_sven_armor_cut"
local CLEAVE_FX = "particles/units/heroes/hero_sven/sven_spell_great_cleave.vpcf"
local HEAVY_FX = "particles/units/heroes/hero_sven/sven_spell_great_cleave_gods_strength_crit.vpcf"
local WAR_FX = "particles/units/heroes/hero_sven/sven_spell_warcry_wave.vpcf"
local EDGE_FX = "particles/units/heroes/hero_juggernaut/juggernaut_omni_dash.vpcf"
local SWORD_MODEL = "models/heroes/sven/sven_sword_alt.vmdl"
local THINK = 0.05
local LAUNCH_LIFE = 1.6
local CATCH = 450
local RAM_TIME = 0.28
local HALF_CONE = 42 * math.pi / 180
local WINDUP_TIME = 0.6
local function now()
    return GameRules:GetGameTime()
end
local function delta(a, b)
    return Vector(a.x - b.x, a.y - b.y, 0)
end
local function length(v)
    return math.sqrt(v.x * v.x + v.y * v.y)
end
local function normal(v)
    local d = math.max(
        0.01,
        length(v)
    )
    return Vector(v.x / d, v.y / d, 0)
end
local function dot(a, b)
    return a.x * b.x + a.y * b.y
end
local function shift(a, dir, d, height)
    if height == nil then
        height = 0
    end
    return Vector(a.x + dir.x * d, a.y + dir.y * d, a.z + height)
end
local function rotate(a, angle)
    return Vector(
        a.x * math.cos(angle) - a.y * math.sin(angle),
        a.x * math.sin(angle) + a.y * math.cos(angle),
        0
    )
end
local function alive(u)
    return u ~= nil and IsValidEntity(u) and u:IsAlive()
end
local function clear(m)
    if m ~= nil and not m:IsNull() then
        m:Destroy()
    end
end
local function clearFX(id)
    ParticleManager:DestroyParticle(id, true)
    ParticleManager:ReleaseParticleIndex(id)
end
local function flash(path, from, dir, length)
    local p = ParticleManager:CreateParticle(path, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(p, 0, from)
    ParticleManager:SetParticleControl(
        p,
        1,
        shift(from, dir, length)
    )
    ParticleManager:SetParticleControlForward(p, 0, dir)
    return p
end
local function free(p)
    return math.abs(p.x) < MAP.bounds - 40 and math.abs(p.y) < MAP.bounds - 40 and GridNav:IsTraversable(p) and not GridNav:IsBlocked(p)
end
local function canMove(u)
    return not u:IsStunned() and not u:IsRooted() and not u:IsCurrentlyHorizontalMotionControlled() and not u:HasModifier("modifier_slark_pounce_leash") and not u:HasModifier("modifier_puck_dream_coil")
end
local ArmorCut = __TS__Class()
ArmorCut.name = "ArmorCut"
__TS__ClassExtends(ArmorCut, ModBase)
function ArmorCut.prototype.IsHidden(self)
    return false
end
function ArmorCut.prototype.IsDebuff(self)
    return true
end
function ArmorCut.prototype.IsPurgable(self)
    return true
end
function ArmorCut.prototype.GetTexture(self)
    return GOD
end
function ArmorCut.prototype.DeclareFunctions(self)
    return {MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS}
end
function ArmorCut.prototype.GetModifierPhysicalArmorBonus(self)
    return -2.5 * self:GetStackCount()
end
local BladeReady = __TS__Class()
BladeReady.name = "BladeReady"
__TS__ClassExtends(BladeReady, ModBase)
function BladeReady.prototype.IsHidden(self)
    return false
end
function BladeReady.prototype.IsPurgable(self)
    return false
end
function BladeReady.prototype.GetTexture(self)
    return CLEAVE
end
local RamBuild = __TS__Class()
RamBuild.name = "RamBuild"
__TS__ClassExtends(RamBuild, ModBase)
function RamBuild.prototype.IsHidden(self)
    return false
end
function RamBuild.prototype.IsPurgable(self)
    return false
end
function RamBuild.prototype.GetTexture(self)
    return WARCRY
end
local RamReady = __TS__Class()
RamReady.name = "RamReady"
__TS__ClassExtends(RamReady, RamBuild)
function RamReady.prototype.GetTexture(self)
    return "sven_storm_bolt_secondary"
end
function RamReady.prototype.GetEffectName(self)
    return "particles/units/heroes/hero_sven/sven_warcry_buff.vpcf"
end
function RamReady.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
local WeightReady = __TS__Class()
WeightReady.name = "WeightReady"
__TS__ClassExtends(WeightReady, ModBase)
function WeightReady.prototype.IsHidden(self)
    return false
end
function WeightReady.prototype.IsPurgable(self)
    return false
end
function WeightReady.prototype.GetTexture(self)
    return "sven_wrath_of_god"
end
local WeightWindup = __TS__Class()
WeightWindup.name = "WeightWindup"
__TS__ClassExtends(WeightWindup, WeightReady)
function WeightWindup.prototype.GetEffectName(self)
    return "particles/units/heroes/hero_sven/sven_spell_gods_strength_glow.vpcf"
end
function WeightWindup.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
____exports.SvenLegends = __TS__Class()
local SvenLegends = ____exports.SvenLegends
SvenLegends.name = "SvenLegends"
__TS__ClassExtends(SvenLegends, ModBase)
function SvenLegends.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.bladeCooldown = 0
    self.cleaveShown = false
    self.weightShown = false
    self.weightSpent = false
    self.godHits = __TS__New(Map)
    self.godAdded = 0
end
function SvenLegends.prototype.IsHidden(self)
    return true
end
function SvenLegends.prototype.IsPurgable(self)
    return false
end
function SvenLegends.prototype.RemoveOnDeath(self)
    return false
end
function SvenLegends.prototype.OnCreated(self)
    if IsServer() then
        self:StartIntervalThink(THINK)
    end
end
function SvenLegends.prototype.DeclareFunctions(self)
    return {MODIFIER_EVENT_ON_ATTACK_LANDED, MODIFIER_EVENT_ON_ABILITY_FULLY_CAST, MODIFIER_EVENT_ON_DEATH}
end
function SvenLegends.prototype.bonuses(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        now()
    )
end
function SvenLegends.prototype.swap(self, native, alt, show)
    local hero = self:GetParent()
    local original = hero:FindAbilityByName(native)
    local extra = hero:FindAbilityByName(alt) or (show and hero:AddAbility(alt) or nil)
    if original == nil or extra == nil then
        return false
    end
    if show then
        extra:SetLevel(native == CLEAVE and original:GetLevel() or 1)
        hero:SwapAbilities(native, alt, native == CLEAVE, true)
    else
        hero:SwapAbilities(alt, native, false, true)
    end
    original:SetHidden(show)
    extra:SetHidden(not show)
    original:MarkAbilityButtonDirty()
    extra:MarkAbilityButtonDirty()
    return show
end
function SvenLegends.prototype.enemies(self, point, radius)
    local hero = self:GetParent()
    return __TS__ArrayFilter(
        FindUnitsInRadius(
            hero:GetTeamNumber(),
            point,
            nil,
            radius,
            2,
            1,
            16,
            1,
            false
        ),
        function(____, unit) return self:enemy(unit) end
    )
end
function SvenLegends.prototype.enemy(self, u)
    return alive(u) and u:IsRealHero() and not u:IsIllusion() and not u:IsOutOfGame() and not u:IsInvulnerable() and u:GetTeamNumber() ~= self:GetParent():GetTeamNumber()
end
function SvenLegends.prototype.hit(self, u, ability, amount)
    if u:IsAttackImmune() then
        return
    end
    ApplyDamage({
        victim = u,
        attacker = self:GetParent(),
        ability = ability,
        damage = amount,
        damage_type = DAMAGE_TYPE_PHYSICAL,
        damage_flags = DOTA_DAMAGE_FLAG_NO_SPELL_AMPLIFICATION
    })
end
function SvenLegends.prototype.godAttack(self, target)
    local hero = self:GetParent()
    local b = self:bonuses()
    local shred = (b.code.sven_p_untamed or 0) > 0
    local extend = (b.code.sven_p_eternal or 0) > 0
    if not shred and not extend then
        return
    end
    local god = self:syncGod()
    if god == nil or god:GetRemainingTime() <= 0 then
        return
    end
    local ability = hero:FindAbilityByName(GOD)
    local id = target:entindex()
    local hits = self.godHits:get(id) or 0
    if shred and hits < 2 and not target:IsDebuffImmune() then
        self.godHits:set(id, hits + 1)
        local ____opt_0 = target:AddNewModifier(hero, ability, ARMOR_CUT, {duration = 5})
        if ____opt_0 ~= nil then
            ____opt_0:SetStackCount(hits + 1)
        end
    end
    if extend and self.godAdded < 3 then
        self.godAdded = self.godAdded + 0.5
        god:SetDuration(
            god:GetRemainingTime() + 0.5,
            true
        )
    end
end
function SvenLegends.prototype.OnAttackLanded(self, e)
    local hero = self:GetParent()
    local at = now()
    if not IsServer() or e.attacker ~= hero or e.no_attack_cooldown or e.damage <= 0 or not self:enemy(e.target) then
        return
    end
    self:godAttack(e.target)
    if not self.cleaveShown or hero:PassivesDisabled() or self.blade ~= nil or at < self.bladeCooldown then
        return
    end
    local ability = hero:FindAbilityByName(CLEAVE)
    if ability == nil or ability:GetLevel() == 0 then
        return
    end
    local target = e.target:GetAbsOrigin()
    local offset = delta(
        target,
        hero:GetAbsOrigin()
    )
    local dir = length(offset) > 5 and normal(offset) or hero:GetForwardVector()
    local pos = GetGroundPosition(
        shift(target, dir, 125),
        hero
    )
    if math.abs(pos.x) >= MAP.bounds or math.abs(pos.y) >= MAP.bounds then
        return
    end
    local model = SpawnEntityFromTableSynchronous("prop_dynamic", {model = SWORD_MODEL, solid = 0, disableshadows = 1})
    self.blade = {
        pos = pos,
        dir = dir,
        last = at,
        ends = at + LAUNCH_LIFE,
        nextFlash = at,
        redirected = false,
        struck = __TS__New(
            Set,
            {e.target:entindex()}
        ),
        model = model,
        ability = ability,
        icon = hero:AddNewModifier(hero, ability, BLADE_ICON, {duration = LAUNCH_LIFE})
    }
    self.bladeCooldown = at + 7
    self:drawBlade(self.blade, at)
end
function SvenLegends.prototype.CanRedirect(self, point)
    local blade = self.blade
    local hero = self:GetParent()
    return blade ~= nil and not blade.redirected and now() < blade.ends and not hero:PassivesDisabled() and length(delta(
        blade.pos,
        hero:GetAbsOrigin()
    )) <= CATCH and math.abs(blade.pos.z - hero:GetAbsOrigin().z) <= 160 and length(delta(point, blade.pos)) > 35
end
function SvenLegends.prototype.Redirect(self, point)
    local blade = self.blade
    if blade == nil or not self:CanRedirect(point) then
        return
    end
    local at = now()
    blade.redirected = true
    blade.dir = normal(delta(point, blade.pos))
    blade.ends = at + (self:bonuses().awake and 1.25 or 1.05)
    blade.last = at
    blade.nextFlash = at
    blade.struck:clear()
    clear(blade.icon)
    blade.icon = nil
    self:drawBlade(blade, at)
    EmitSoundOn(
        "Hero_Sven.Attack",
        self:GetParent()
    )
end
function SvenLegends.prototype.drawBlade(self, blade, at)
    if blade.model ~= nil and IsValidEntity(blade.model) then
        blade.model:SetAbsOrigin(shift(blade.pos, blade.dir, 0, 64))
        blade.model:SetAngles(
            0,
            math.atan2(blade.dir.y, blade.dir.x) * 180 / math.pi,
            85
        )
    end
    if at >= blade.nextFlash then
        blade.nextFlash = at + 0.14
        local p = flash(
            blade.redirected and HEAVY_FX or CLEAVE_FX,
            shift(blade.pos, blade.dir, 0, 48),
            blade.dir,
            130
        )
        ParticleManager:ReleaseParticleIndex(p)
    end
end
function SvenLegends.prototype.clearBlade(self)
    local ____clear_4 = clear
    local ____opt_2 = self.blade
    ____clear_4(____opt_2 and ____opt_2.icon)
    local ____opt_5 = self.blade
    local model = ____opt_5 and ____opt_5.model
    if model ~= nil and IsValidEntity(model) then
        UTIL_Remove(model)
    end
    self.blade = nil
end
function SvenLegends.prototype.tickBlade(self, at)
    local blade = self.blade
    if blade == nil then
        return
    end
    local hero = self:GetParent()
    local pos = GetGroundPosition(
        shift(
            blade.pos,
            blade.dir,
            (blade.redirected and 700 or 260) * (math.min(at, blade.ends) - blade.last)
        ),
        hero
    )
    if math.abs(pos.x) >= MAP.bounds or math.abs(pos.y) >= MAP.bounds then
        self:clearBlade()
        return
    end
    local foes = FindUnitsInLine(
        hero:GetTeamNumber(),
        blade.pos,
        pos,
        nil,
        blade.redirected and 135 or 105,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES
    )
    for ____, foe in ipairs(foes) do
        do
            if not self:enemy(foe) or blade.struck:has(foe:entindex()) or math.abs(foe:GetAbsOrigin().z - pos.z) > 160 then
                goto __continue73
            end
            blade.struck:add(foe:entindex())
            local damage = hero:GetAverageTrueAttackDamage(foe)
            self:hit(
                foe,
                blade.ability,
                blade.redirected and math.min(950, 1.55 * damage + 110) or math.min(500, 0.72 * damage + 80)
            )
        end
        ::__continue73::
    end
    blade.pos = pos
    blade.last = at
    if at >= blade.ends then
        self:clearBlade()
    else
        self:drawBlade(blade, at)
    end
end
function SvenLegends.prototype.OnAbilityFullyCast(self, e)
    local hero = self:GetParent()
    if not IsServer() or e.unit ~= hero or e.ability == nil then
        return
    end
    local name = e.ability:GetAbilityName()
    local b = self:bonuses()
    if name == WARCRY and (b.code.sven_l_steeltempo or 0) > 0 then
        self:clearRun()
        self.run = {
            ability = e.ability,
            grace = now() + 0.15,
            last = hero:GetAbsOrigin(),
            stride = 0,
            armed = false
        }
    end
    if name == GOD then
        self.weightSpent = false
        self.godHits:clear()
        self.godAdded = 0
    end
end
function SvenLegends.prototype.clearRun(self)
    local ____clear_9 = clear
    local ____opt_7 = self.run
    ____clear_9(____opt_7 and ____opt_7.icon)
    self.run = nil
end
function SvenLegends.prototype.tickRun(self, at, awakened)
    local s = self.run
    local hero = self:GetParent()
    if s == nil then
        return
    end
    local buff = hero:FindModifierByName(RAM_BUFF)
    if buff == nil then
        if at > s.grace then
            self:clearRun()
        end
        return
    end
    if s.icon == nil then
        s.icon = hero:AddNewModifier(
            hero,
            s.ability,
            RAM_BUILD,
            {duration = buff:GetRemainingTime()}
        )
    end
    local p = hero:GetAbsOrigin()
    local motion = delta(p, s.last)
    local step = length(motion)
    s.last = p
    local running = step >= 3 and step <= 100 and hero:IsMoving() and canMove(hero)
    local dir = normal(motion)
    if not running or s.dir ~= nil and dot(dir, s.dir) < 0.86 then
        if s.armed then
            clear(s.icon)
            s.icon = hero:AddNewModifier(
                hero,
                s.ability,
                RAM_BUILD,
                {duration = buff:GetRemainingTime()}
            )
        end
        s.stride = 0
        s.dir = nil
        s.armed = false
    end
    if not running then
        return
    end
    if s.dir == nil then
        s.dir = dir
    end
    s.stride = s.stride + step
    if s.stride < (awakened and 150 or 220) then
        return
    end
    if not s.armed then
        s.armed = true
        clear(s.icon)
        s.icon = hero:AddNewModifier(
            hero,
            s.ability,
            RAM_READY,
            {duration = buff:GetRemainingTime()}
        )
        ParticleManager:ReleaseParticleIndex(flash(WAR_FX, p, dir, 135))
    end
    local victim = __TS__ArrayFind(
        self:enemies(p, 175),
        function(____, foe) return not foe:IsDebuffImmune() and not foe:IsAttackImmune() and not foe:IsCurrentlyHorizontalMotionControlled() and dot(
            dir,
            normal(delta(
                foe:GetAbsOrigin(),
                p
            ))
        ) > 0.66 and math.abs(foe:GetAbsOrigin().z - p.z) < 120 end
    )
    if victim ~= nil then
        self:ram(victim, s.ability, dir)
    end
end
function SvenLegends.prototype.ram(self, victim, ability, dir)
    local hero = self:GetParent()
    local start = victim:GetAbsOrigin()
    local origin = hero:GetAbsOrigin()
    local room = 0
    local wall = false
    do
        local d = 40
        while d <= 360 do
            local p = GetGroundPosition(
                shift(start, dir, d + 36),
                victim
            )
            if not free(p) or math.abs(p.z - start.z) > 100 then
                wall = true
                break
            end
            room = d
            d = d + 40
        end
    end
    self:clearRun()
    local function push(unit, amount)
        if amount <= 0 then
            return
        end
        local p = shift(
            unit:GetAbsOrigin(),
            dir,
            -60
        )
        unit:AddNewModifier(hero, ability, "modifier_knockback", {
            duration = RAM_TIME,
            knockback_duration = RAM_TIME,
            center_x = p.x,
            center_y = p.y,
            center_z = p.z,
            knockback_distance = amount,
            knockback_height = 0,
            should_stun = 0
        })
    end
    push(victim, room)
    local gap = math.max(
        0,
        math.min(
            55,
            dot(
                delta(start, origin),
                dir
            ) - 105
        )
    )
    local follow = room + gap
    local ____end = GetGroundPosition(
        shift(origin, dir, follow),
        hero
    )
    if free(____end) and GridNav:CanFindPath(origin, ____end) then
        push(hero, follow)
    end
    ParticleManager:ReleaseParticleIndex(flash(
        WAR_FX,
        start,
        dir,
        math.max(70, room)
    ))
    self:hit(
        victim,
        ability,
        wall and math.min(
            1100,
            2.1 * hero:GetAverageTrueAttackDamage(victim) + 180
        ) or math.min(
            540,
            hero:GetAverageTrueAttackDamage(victim) + 75
        )
    )
    if wall and alive(victim) then
        victim:AddNewModifier(hero, ability, "modifier_stunned", {duration = 0.9 + (room > 0 and RAM_TIME or 0)})
        ParticleManager:ReleaseParticleIndex(flash(
            HEAVY_FX,
            shift(start, dir, room),
            dir,
            160
        ))
    end
    EmitSoundOn("Hero_Sven.StormBoltImpact", victim)
end
function SvenLegends.prototype.weightCost(self)
    return self:bonuses().awake and 5 or 7
end
function SvenLegends.prototype.CanSwing(self)
    local hero = self:GetParent()
    local ____temp_12 = self.weightShown and not self.weightSpent and not hero:IsDisarmed()
    if ____temp_12 then
        local ____opt_10 = self.god
        ____temp_12 = (____opt_10 and ____opt_10:GetRemainingTime() or 0) >= self:weightCost() + WINDUP_TIME
    end
    return ____temp_12
end
function SvenLegends.prototype.BeginSwing(self, point, ability)
    if not IsServer() or not self:CanSwing() then
        return false
    end
    self:CancelSwing()
    local hero = self:GetParent()
    local origin = hero:GetAbsOrigin()
    local offset = delta(point, origin)
    local dir = length(offset) > 10 and normal(offset) or hero:GetForwardVector()
    local range = self:bonuses().awake and 725 or 625
    local marks = {}
    for ____, angle in ipairs({-HALF_CONE, 0, HALF_CONE}) do
        marks[#marks + 1] = flash(
            EDGE_FX,
            shift(origin, dir, 0, 35),
            rotate(dir, angle),
            range
        )
    end
    self.swing = {
        dir = dir,
        range = range,
        marks = marks,
        ability = ability,
        cost = self:weightCost(),
        icon = hero:AddNewModifier(hero, ability, WINDUP, {duration = WINDUP_TIME})
    }
    return true
end
function SvenLegends.prototype.CancelSwing(self)
    if self.swing == nil then
        return
    end
    for ____, p in ipairs(self.swing.marks) do
        clearFX(p)
    end
    clear(self.swing.icon)
    self.swing = nil
end
function SvenLegends.prototype.Swing(self)
    local s = self.swing
    local hero = self:GetParent()
    local god = self.god
    self:CancelSwing()
    if s == nil or god == nil or god:IsNull() or hero:IsDisarmed() or self.weightSpent or god:GetRemainingTime() < s.cost or hero:FindModifierByName(GOD_BUFF) ~= god then
        return
    end
    self.weightSpent = true
    god:SetDuration(
        god:GetRemainingTime() - s.cost,
        true
    )
    self:hideWeight()
    local origin = hero:GetAbsOrigin()
    for ____, angle in ipairs({-HALF_CONE / 2, 0, HALF_CONE / 2}) do
        ParticleManager:ReleaseParticleIndex(flash(
            HEAVY_FX,
            origin,
            rotate(s.dir, angle),
            s.range
        ))
    end
    EmitSoundOn("Hero_Sven.Attack", hero)
    local main = true
    for ____, foe in ipairs(self:enemies(origin, s.range)) do
        do
            local p = foe:GetAbsOrigin()
            local gap = delta(p, origin)
            if foe:IsAttackImmune() or math.abs(p.z - origin.z) > 160 or length(gap) > 18 and dot(
                s.dir,
                normal(gap)
            ) < math.cos(HALF_CONE) then
                goto __continue116
            end
            self:hit(
                foe,
                s.ability,
                math.min(
                    1550,
                    2.6 * hero:GetAverageTrueAttackDamage(foe) + 100
                ) * (main and 1 or 0.55)
            )
            main = false
        end
        ::__continue116::
    end
end
function SvenLegends.prototype.hideWeight(self)
    self:CancelSwing()
    clear(self.weightIcon)
    self.weightIcon = nil
    if self.weightShown then
        self.weightShown = self:swap(GOD, WEIGHT, false)
    end
end
function SvenLegends.prototype.syncGod(self)
    local god = self:GetParent():FindModifierByName(GOD_BUFF)
    if self.god ~= god then
        self:hideWeight()
        self.god = god
        self.weightSpent = false
        self.godHits:clear()
        self.godAdded = 0
    end
    return god
end
function SvenLegends.prototype.tickWeight(self, enabled)
    local hero = self:GetParent()
    local god = self:syncGod()
    local time = (god and god:GetRemainingTime() or 0) - self:weightCost()
    if not enabled or self.weightSpent or time < (self.swing == nil and WINDUP_TIME or 0) then
        self:hideWeight()
    elseif not self.weightShown then
        self.weightShown = self:swap(GOD, WEIGHT, true)
        if self.weightShown then
            self.weightIcon = hero:AddNewModifier(
                hero,
                hero:FindAbilityByName(GOD),
                WEIGHT_ICON,
                {duration = time - WINDUP_TIME}
            )
        end
    elseif self.swing == nil and self.weightIcon ~= nil and not self.weightIcon:IsNull() then
        local remaining = time - WINDUP_TIME
        if math.abs(self.weightIcon:GetRemainingTime() - remaining) > 0.2 then
            self.weightIcon:SetDuration(remaining, true)
        end
    end
end
function SvenLegends.prototype.OnIntervalThink(self)
    if not IsServer() or not alive(self:GetParent()) then
        return
    end
    local b = self:bonuses()
    local at = now()
    local w = (b.code.sven_l_cleave or 0) > 0
    if w ~= self.cleaveShown then
        self.cleaveShown = self:swap(CLEAVE, REDIRECT, w)
    end
    if w then
        self:tickBlade(at)
    else
        self:clearBlade()
    end
    if (b.code.sven_l_steeltempo or 0) > 0 then
        self:tickRun(at, b.awake)
    else
        self:clearRun()
    end
    self:tickWeight((b.code.sven_l_avatar or 0) > 0)
end
function SvenLegends.prototype.clearCombat(self)
    self:clearBlade()
    self:clearRun()
    self:hideWeight()
    self.god = nil
    self.weightSpent = false
    self.godHits:clear()
    self.godAdded = 0
end
function SvenLegends.prototype.OnDeath(self, e)
    if IsServer() and e.unit == self:GetParent() then
        self:clearCombat()
    end
end
function SvenLegends.prototype.OnDestroy(self)
    if not IsServer() then
        return
    end
    self:clearCombat()
    if self.cleaveShown then
        self.cleaveShown = self:swap(CLEAVE, REDIRECT, false)
    end
end
modifier_orb_sven_armor_cut = registerModifier("modifier_orb_sven_armor_cut", ArmorCut)
modifier_orb_sven_legend = registerModifier("modifier_orb_sven_legend", ____exports.SvenLegends)
modifier_orb_sven_blade_ready = registerModifier("modifier_orb_sven_blade_ready", BladeReady)
modifier_orb_sven_ram_build = registerModifier("modifier_orb_sven_ram_build", RamBuild)
modifier_orb_sven_ram_ready = registerModifier("modifier_orb_sven_ram_ready", RamReady)
modifier_orb_sven_weight_ready = registerModifier("modifier_orb_sven_weight_ready", WeightReady)
modifier_orb_sven_weight_windup = registerModifier("modifier_orb_sven_weight_windup", WeightWindup)
return ____exports
