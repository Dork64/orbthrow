local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local __TS__ObjectAssign = ____lualib.__TS__ObjectAssign
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local __TS__Iterator = ____lualib.__TS__Iterator
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
local ____orbstore = require("core.orbstore")
local bonusesOf = ____orbstore.bonusesOf
local FIREBLAST = "ogre_magi_fireblast"
local IGNITE = "ogre_magi_ignite"
local BLOODLUST = "ogre_magi_bloodlust"
local MULTICAST = "ogre_magi_multicast"
local CLUB = "orb_ogre_club"
local LOADED_DIE = "orb_ogre_loaded_die"
local CLUB_READY = "modifier_orb_ogre_club_ready"
local POTATO = "modifier_orb_ogre_potato"
local CHALLENGE = "orb_ogre_challenge"
local DUEL_READY = "modifier_orb_ogre_duel_ready"
local DUEL = "modifier_orb_ogre_duel"
local DIE_READY = "modifier_orb_ogre_die_ready"
local DIE_BET = "modifier_orb_ogre_die_bet"
local NATIVE_STUN = "modifier_ogre_magi_fireblast"
local NATIVE_IGNITE = "modifier_ogre_magi_ignite"
local NATIVE_LUST = "modifier_ogre_magi_bloodlust"
local FIRE_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_fireblast.vpcf"
local IGNITE_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_ignite.vpcf"
local LUST_FX = "particles/units/heroes/hero_ogre_magi/ogre_magi_bloodlust_buff.vpcf"
local RING_FX = "particles/ui_mouseactions/drag_selected_ring.vpcf"
local THINK = 0.04
local CLUB_MODEL = "models/heroes/ogre_magi/ogre_magi_weapon.vmdl"
local POT_MODEL = "models/items/wards/fall20_cauldron_ward/fall20_cauldron_ward.vmdl"
local DUEL_FX = "particles/units/heroes/hero_legion_commander/legion_commander_duel_ring.vpcf"
local CLUB_WINDOW = 6
local CLUB_RANGE = 825
local CLUB_RADIUS = 290
local CLUB_CENTER = 150
local CLUB_FLIGHT = 0.65
local CLUB_BOUNCE = 400
local POTATO_FUSE = 4
local POTATO_RADIUS = 325
local DUEL_WINDOW = 2.4
local CHALLENGE_WINDOW = 5
local CHALLENGE_RANGE = 375
local BET_WINDOW = 4
local ROLLED_AT = 0.75
local function time()
    return GameRules:GetGameTime()
end
local function alive(unit)
    return unit ~= nil and IsValidEntity(unit) and unit:IsAlive()
end
local function hero(unit)
    return alive(unit) and unit:IsRealHero() and not unit:IsIllusion() and not unit:IsOutOfGame()
end
local function distance(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2)
end
local function clear(icon)
    if icon ~= nil and not icon:IsNull() then
        icon:Destroy()
    end
end
local function clearParticle(particle)
    ParticleManager:DestroyParticle(particle, true)
    ParticleManager:ReleaseParticleIndex(particle)
end
local function atPoint(path, point)
    local id = ParticleManager:CreateParticle(path, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(id, 0, point)
    ParticleManager:SetParticleControl(id, 1, point)
    return id
end
local function attached(path, unit)
    ParticleManager:ReleaseParticleIndex(ParticleManager:CreateParticle(path, PATTACH_ABSORIGIN_FOLLOW, unit))
end
local function warning(point, radius)
    local p = atPoint(RING_FX, point)
    ParticleManager:SetParticleControl(
        p,
        1,
        Vector(radius, 0, 0)
    )
    ParticleManager:SetParticleControl(
        p,
        2,
        Vector(255, 100, 30)
    )
    return p
end
local ClubReady = __TS__Class()
ClubReady.name = "ClubReady"
__TS__ClassExtends(ClubReady, ModBase)
function ClubReady.prototype.IsHidden(self)
    return false
end
function ClubReady.prototype.IsPurgable(self)
    return false
end
function ClubReady.prototype.GetTexture(self)
    return FIREBLAST
end
local HotPotato = __TS__Class()
HotPotato.name = "HotPotato"
__TS__ClassExtends(HotPotato, ClubReady)
function HotPotato.prototype.IsDebuff(self)
    return true
end
function HotPotato.prototype.GetTexture(self)
    return IGNITE
end
function HotPotato.prototype.GetEffectName(self)
    return IGNITE_FX
end
function HotPotato.prototype.GetEffectAttachType(self)
    return PATTACH_OVERHEAD_FOLLOW
end
local DuelReady = __TS__Class()
DuelReady.name = "DuelReady"
__TS__ClassExtends(DuelReady, ClubReady)
function DuelReady.prototype.GetTexture(self)
    return BLOODLUST
end
local DuelScore = __TS__Class()
DuelScore.name = "DuelScore"
__TS__ClassExtends(DuelScore, DuelReady)
function DuelScore.prototype.IsDebuff(self)
    return self:GetParent() ~= self:GetCaster()
end
function DuelScore.prototype.IgnoreTenacity(self)
    return true
end
function DuelScore.prototype.CheckState(self)
    return {[MODIFIER_STATE_TAUNTED] = true, [MODIFIER_STATE_SILENCED] = true, [MODIFIER_STATE_MUTED] = true}
end
function DuelScore.prototype.GetEffectName(self)
    return LUST_FX
end
function DuelScore.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
local DieReady = __TS__Class()
DieReady.name = "DieReady"
__TS__ClassExtends(DieReady, ClubReady)
function DieReady.prototype.GetTexture(self)
    return MULTICAST
end
local DieBet = __TS__Class()
DieBet.name = "DieBet"
__TS__ClassExtends(DieBet, DieReady)
function DieBet.prototype.IsDebuff(self)
    return self:GetParent() ~= self:GetCaster()
end
function DieBet.prototype.GetEffectName(self)
    return IGNITE_FX
end
function DieBet.prototype.GetEffectAttachType(self)
    return PATTACH_OVERHEAD_FOLLOW
end
____exports.OgreMagiLegends = __TS__Class()
local OgreMagiLegends = ____exports.OgreMagiLegends
OgreMagiLegends.name = "OgreMagiLegends"
__TS__ClassExtends(OgreMagiLegends, ModBase)
function OgreMagiLegends.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.clubShown = false
    self.dieShown = false
    self.challengeShown = false
    self.dieProgress = 0
    self.casts = {}
    self.orbFreeCast = false
    self.suppressFloor = false
end
function OgreMagiLegends.prototype.IsHidden(self)
    return true
end
function OgreMagiLegends.prototype.IsPurgable(self)
    return false
end
function OgreMagiLegends.prototype.RemoveOnDeath(self)
    return false
end
function OgreMagiLegends.prototype.OnCreated(self)
    if IsServer() then
        self:StartIntervalThink(THINK)
    end
end
function OgreMagiLegends.prototype.DeclareFunctions(self)
    return {
        MODIFIER_EVENT_ON_ABILITY_START,
        MODIFIER_EVENT_ON_ABILITY_EXECUTED,
        MODIFIER_EVENT_ON_ABILITY_FULLY_CAST,
        MODIFIER_EVENT_ON_MODIFIER_ADDED,
        MODIFIER_EVENT_ON_TAKEDAMAGE,
        MODIFIER_EVENT_ON_ATTACK_LANDED,
        MODIFIER_EVENT_ON_DEATH
    }
end
function OgreMagiLegends.prototype.bonuses(self)
    return bonusesOf(
        self:GetParent():GetPlayerOwnerID(),
        true,
        time()
    )
end
function OgreMagiLegends.prototype.owns(self, id)
    return (self:bonuses().code[id] or 0) > 0
end
function OgreMagiLegends.prototype.enemy(self, unit)
    return hero(unit) and not unit:IsInvulnerable() and unit:GetTeamNumber() ~= self:GetParent():GetTeamNumber()
end
function OgreMagiLegends.prototype.swap(self, native, alt, show)
    local caster = self:GetParent()
    local original = caster:FindAbilityByName(native)
    local extra = caster:FindAbilityByName(alt) or (show and caster:AddAbility(alt) or nil)
    if original == nil or extra == nil then
        return false
    end
    if show then
        extra:SetLevel(1)
    end
    if show then
        caster:SwapAbilities(native, alt, true, true)
    else
        caster:SwapAbilities(alt, native, false, true)
    end
    original:SetHidden(show)
    extra:SetHidden(not show)
    original:MarkAbilityButtonDirty()
    extra:MarkAbilityButtonDirty()
    return show
end
function OgreMagiLegends.prototype.enemies(self, point, radius)
    local caster = self:GetParent()
    return __TS__ArrayFilter(
        FindUnitsInRadius(
            caster:GetTeamNumber(),
            point,
            nil,
            radius,
            2,
            1,
            0,
            1,
            false
        ),
        function(____, u) return self:enemy(u) and not u:IsDebuffImmune() end
    )
end
function OgreMagiLegends.prototype.magic(self, victim, ability, damage)
    ApplyDamage({
        attacker = self:GetParent(),
        victim = victim,
        ability = ability,
        damage = damage,
        damage_type = DAMAGE_TYPE_MAGICAL
    })
end
function OgreMagiLegends.prototype.clearClub(self)
    local ____clear_2 = clear
    local ____opt_0 = self.club
    ____clear_2(____opt_0 and ____opt_0.icon)
    self.club = nil
    if self.clubShown then
        self.clubShown = self:swap(FIREBLAST, CLUB, false)
    end
end
function OgreMagiLegends.prototype.armClub(self, ability, target)
    self:clearClub()
    local caster = self:GetParent()
    self.clubShown = self:swap(FIREBLAST, CLUB, true)
    if not self.clubShown then
        return
    end
    local window = CLUB_WINDOW + (self:owns("ogre_p_dizzy") and 0.75 or 0)
    self.club = {
        ability = ability,
        target = target,
        ends = time() + window,
        icon = caster:AddNewModifier(caster, ability, CLUB_READY, {duration = window})
    }
end
function OgreMagiLegends.prototype.CanThrowClub(self, point)
    return self.club ~= nil and time() < self.club.ends and distance(
        point,
        self:GetParent():GetAbsOrigin()
    ) <= CLUB_RANGE + self:GetParent():GetCastRangeBonus() + 32
end
function OgreMagiLegends.prototype.ThrowClub(self, point, ability)
    local window = self.club
    local caster = self:GetParent()
    if window == nil or not self:CanThrowClub(point) then
        return
    end
    local origin = caster:GetAbsOrigin()
    local direction = distance(point, origin) > 1 and Vector(
        (point.x - origin.x) / distance(point, origin),
        (point.y - origin.y) / distance(point, origin),
        0
    ) or caster:GetForwardVector()
    local target = window.target
    local stunEnded = not alive(target) or not target:FindModifierByNameAndCaster(NATIVE_STUN, caster) and not target:IsStunned()
    self:clearClub()
    self:clearLanding()
    self.landing = {
        point = point,
        ability = ability,
        origin = origin,
        launched = time(),
        model = self:spawnModel(CLUB_MODEL, 1.6),
        centerDamage = (stunEnded and 500 or 380) + (self:owns("ogre_p_bigblast") and 65 or 0),
        lands = time() + CLUB_FLIGHT,
        marker = warning(point, CLUB_RADIUS),
        hit = __TS__New(Set),
        bounce = self:bonuses().awake and GetGroundPosition(
            Vector(point.x + direction.x * CLUB_BOUNCE, point.y + direction.y * CLUB_BOUNCE, point.z),
            caster
        ) or nil
    }
    self:moveClub(
        self.landing,
        time()
    )
    local trace = atPoint(IGNITE_FX, origin)
    ParticleManager:SetParticleControl(trace, 1, point)
    ParticleManager:ReleaseParticleIndex(trace)
    EmitSoundOn("Hero_OgreMagi.Ignite.Cast", caster)
end
function OgreMagiLegends.prototype.spawnModel(self, path, scale)
    return SpawnEntityFromTableSynchronous("prop_dynamic", {model = path, modelscale = scale, solid = 0, disableshadows = 1})
end
function OgreMagiLegends.prototype.dropModel(self, model)
    if model ~= nil and IsValidEntity(model) then
        UTIL_Remove(model)
    end
end
function OgreMagiLegends.prototype.clearLanding(self)
    if self.landing == nil then
        return
    end
    clearParticle(self.landing.marker)
    self:dropModel(self.landing.model)
    self.landing = nil
end
function OgreMagiLegends.prototype.moveClub(self, drop, at)
    if drop.model == nil then
        return
    end
    local t = math.max(
        0,
        math.min(1, (at - drop.launched) / CLUB_FLIGHT)
    )
    local a = drop.origin
    local b = drop.point
    drop.model:SetAbsOrigin(Vector(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t + 55 * (1 - t) + 220 * 4 * t * (1 - t)))
    drop.model:SetAngles(45 + t * 500, 360 * t, 0)
end
function OgreMagiLegends.prototype.landClub(self)
    local drop = self.landing
    if drop == nil then
        return
    end
    clearParticle(drop.marker)
    ParticleManager:ReleaseParticleIndex(atPoint(FIRE_FX, drop.point))
    EmitSoundOnLocationWithCaster(
        drop.point,
        "Hero_OgreMagi.Fireblast.Target",
        self:GetParent()
    )
    for ____, victim in ipairs(self:enemies(drop.point, CLUB_RADIUS)) do
        do
            if drop.hit:has(victim:entindex()) then
                goto __continue62
            end
            drop.hit:add(victim:entindex())
            self:magic(
                victim,
                drop.ability,
                distance(
                    victim:GetAbsOrigin(),
                    drop.point
                ) <= CLUB_CENTER and drop.centerDamage or drop.centerDamage * 0.5
            )
        end
        ::__continue62::
    end
    if drop.bounce == nil then
        self:dropModel(drop.model)
        self.landing = nil
    else
        self.landing = __TS__ObjectAssign(
            {},
            drop,
            {
                origin = drop.point,
                point = drop.bounce,
                bounce = nil,
                launched = time(),
                lands = time() + CLUB_FLIGHT,
                marker = warning(drop.bounce, CLUB_RADIUS)
            }
        )
        self:moveClub(
            self.landing,
            time()
        )
    end
end
function OgreMagiLegends.prototype.placePotato(self, spell, unit)
    if spell.potUsed or self.potato ~= nil or time() > spell.ignitionEnds or not self:enemy(unit) or unit:IsDebuffImmune() or not self:owns("ogre_l_ignite") then
        return
    end
    spell.potUsed = true
    local potato = {
        owner = unit,
        last = unit:GetAbsOrigin(),
        ability = spell.ability,
        ends = time() + POTATO_FUSE,
        transfers = 0,
        awake = self:bonuses().awake,
        model = self:spawnModel(POT_MODEL, 0.72)
    }
    self.potato = potato
    self:potatoMark(potato, unit)
end
function OgreMagiLegends.prototype.potatoMark(self, potato, unit)
    clear(potato.icon)
    potato.owner = unit
    potato.last = unit:GetAbsOrigin()
    potato.icon = unit:AddNewModifier(
        self:GetParent(),
        potato.ability,
        POTATO,
        {duration = math.max(
            0.01,
            potato.ends - time()
        )}
    )
    local ____opt_3 = potato.icon
    if ____opt_3 ~= nil then
        ____opt_3:SetStackCount(1 + potato.transfers)
    end
    self:movePotato(potato)
end
function OgreMagiLegends.prototype.movePotato(self, potato)
    local p = potato.last
    local ____opt_5 = potato.model
    if ____opt_5 ~= nil then
        ____opt_5:SetAbsOrigin(Vector(p.x, p.y, p.z + 145))
    end
end
function OgreMagiLegends.prototype.burstPotato(self)
    local potato = self.potato
    if potato == nil then
        return
    end
    self.potato = nil
    clear(potato.icon)
    self:dropModel(potato.model)
    local point = alive(potato.owner) and potato.owner:GetAbsOrigin() or potato.last
    local damage = 400 + (self:owns("ogre_p_napalm") and 65 or 0) + (potato.awake and 80 * math.min(2, potato.transfers) or 0)
    ParticleManager:ReleaseParticleIndex(atPoint(FIRE_FX, point))
    EmitSoundOnLocationWithCaster(
        point,
        "Hero_OgreMagi.Fireblast.Target",
        self:GetParent()
    )
    for ____, victim in ipairs(self:enemies(
        point,
        POTATO_RADIUS + (self:owns("ogre_p_wildfire") and 65 or 0)
    )) do
        self:magic(victim, potato.ability, damage)
    end
    local caster = self:GetParent()
    if potato.owner == caster and alive(caster) and not caster:IsDebuffImmune() and not caster:IsInvulnerable() then
        self:magic(caster, potato.ability, damage)
    end
end
function OgreMagiLegends.prototype.clearChallenge(self)
    local ____clear_9 = clear
    local ____opt_7 = self.challenge
    ____clear_9(____opt_7 and ____opt_7.icon)
    self.challenge = nil
    if self.challengeShown then
        self.challengeShown = self:swap(BLOODLUST, CHALLENGE, false)
    end
end
function OgreMagiLegends.prototype.armChallenge(self, ability)
    if self.duel ~= nil then
        return
    end
    self:clearChallenge()
    local caster = self:GetParent()
    self.challengeShown = self:swap(BLOODLUST, CHALLENGE, true)
    if self.challengeShown then
        self.challenge = {
            ends = time() + CHALLENGE_WINDOW,
            icon = caster:AddNewModifier(caster, ability, DUEL_READY, {duration = CHALLENGE_WINDOW})
        }
    end
end
function OgreMagiLegends.prototype.CanChallenge(self, target)
    local caster = self:GetParent()
    return self.challenge ~= nil and time() < self.challenge.ends and self.duel == nil and alive(caster) and self:enemy(target) and not target:IsDebuffImmune() and distance(
        caster:GetAbsOrigin(),
        target:GetAbsOrigin()
    ) <= CHALLENGE_RANGE + caster:GetCastRangeBonus() + 32 and caster:FindModifierByNameAndCaster(NATIVE_LUST, caster) ~= nil
end
function OgreMagiLegends.prototype.StartChallenge(self, target, ability)
    if target == nil or not self:CanChallenge(target) then
        return
    end
    self:clearChallenge()
    if target:TriggerSpellAbsorb(ability) then
        return
    end
    local caster = self:GetParent()
    local window = DUEL_WINDOW + (self:bonuses().awake and 0.55 or 0) + (self:owns("ogre_p_hide") and 0.6 or 0)
    local center = GetGroundPosition(
        target:GetAbsOrigin(),
        caster
    )
    self.duel = {
        target = target,
        ends = time() + window,
        ring = atPoint(DUEL_FX, center),
        scoreOgre = caster:AddNewModifier(caster, ability, DUEL, {duration = window}),
        scoreEnemy = target:AddNewModifier(caster, ability, DUEL, {duration = window})
    }
    caster:SetForceAttackTarget(target)
    target:SetForceAttackTarget(caster)
    caster:MoveToTargetToAttack(target)
    target:MoveToTargetToAttack(caster)
end
function OgreMagiLegends.prototype.clearDuel(self)
    local duel = self.duel
    if duel == nil then
        return
    end
    self.duel = nil
    clear(duel.scoreOgre)
    clear(duel.scoreEnemy)
    clearParticle(duel.ring)
    local caster = self:GetParent()
    if caster:GetForceAttackTarget() == duel.target then
        caster:SetForceAttackTarget(nil)
    end
    if IsValidEntity(duel.target) and duel.target:GetForceAttackTarget() == caster then
        duel.target:SetForceAttackTarget(nil)
    end
end
function OgreMagiLegends.prototype.ordinary(self, e)
    return not e.no_attack_cooldown and e.inflictor == nil and e.attacker:GetTeamNumber() ~= e.target:GetTeamNumber()
end
function OgreMagiLegends.prototype.OnAttackLanded(self, e)
    if not IsServer() or not hero(e.attacker) or not hero(e.target) or not self:ordinary(e) then
        return
    end
    local caster = self:GetParent()
    local potato = self.potato
    if potato ~= nil and potato.owner == e.attacker and time() < potato.ends and not e.target:IsInvulnerable() then
        potato.transfers = potato.transfers + 1
        self:potatoMark(potato, e.target)
    end
end
function OgreMagiLegends.prototype.targetOf(self, e)
    return e.target or e.ability:GetCursorTarget()
end
function OgreMagiLegends.prototype.isTracked(self, ability)
    local name = ability:GetAbilityName()
    return name == FIREBLAST or name == IGNITE
end
function OgreMagiLegends.prototype.SetOrbFreeCast(self, active)
    self.orbFreeCast = active
end
function OgreMagiLegends.prototype.OnAbilityStart(self, e)
    if not IsServer() or e.unit ~= self:GetParent() or e.ability == nil or self.orbFreeCast then
        return
    end
    self.suppressFloor = true
    local ____opt_10 = self.pending
    if (____opt_10 and ____opt_10.at) == nil then
        clear(self.targetBet)
    end
    self.pending = nil
    if not self:isTracked(e.ability) then
        return
    end
    local target = self:targetOf(e)
    if not alive(target) or target:GetTeamNumber() == self:GetParent():GetTeamNumber() then
        return
    end
    local bet = self.dieBet
    local multiplier = bet ~= nil and self:enemy(target) and time() < bet.ends and not self:GetParent():PassivesDisabled() and bet.multiplier or nil
    self.suppressFloor = false
    self.pending = {
        ability = e.ability,
        target = target,
        starts = time(),
        repeated = false,
        eligible = false,
        committed = false,
        ignitionEnds = time() + 3.6,
        igniteCandidates = __TS__New(Set),
        potUsed = false,
        nativeObserved = false,
        multiplier = multiplier
    }
    if multiplier ~= nil then
        clear(self.targetBet)
        self.targetBet = target:AddNewModifier(
            self:GetParent(),
            e.ability,
            DIE_BET,
            {duration = 2.4}
        )
        local ____opt_12 = self.targetBet
        if ____opt_12 ~= nil then
            ____opt_12:SetStackCount(multiplier)
        end
    end
end
function OgreMagiLegends.prototype.nativeCast(self, e)
    local cast = self.pending
    if cast == nil or e.ability ~= cast.ability then
        return
    end
    if not cast.committed then
        cast.committed = true
        if cast.at == nil then
            cast.at = time()
        end
        if cast.multiplier ~= nil and (self.dieBet == nil or cast.at >= self.dieBet.ends) then
            cast.multiplier = nil
            clear(self.targetBet)
        end
        local ____temp_16 = self:owns("ogre_l_multicast") and cast.multiplier == nil and self:enemy(cast.target) and self.dieProgress < 2 and self.dieBet == nil and not self:GetParent():PassivesDisabled()
        if ____temp_16 then
            local ____opt_14 = self:GetParent():FindAbilityByName(MULTICAST)
            ____temp_16 = (____opt_14 and ____opt_14:GetLevel() or 0) > 0
        end
        cast.eligible = ____temp_16
        local ____self_casts_17 = self.casts
        ____self_casts_17[#____self_casts_17 + 1] = cast
    end
    return cast
end
function OgreMagiLegends.prototype.OnAbilityExecuted(self, e)
    if not IsServer() or e.unit ~= self:GetParent() or e.ability == nil or self.orbFreeCast then
        return
    end
    self:nativeCast(e)
end
function OgreMagiLegends.prototype.OnAbilityFullyCast(self, e)
    if not IsServer() or e.unit ~= self:GetParent() or e.ability == nil or self.orbFreeCast then
        return
    end
    if e.ability:GetAbilityName() == BLOODLUST and self:targetOf(e) == self:GetParent() and self:owns("ogre_l_bloodlust") then
        self:armChallenge(e.ability)
    end
    local cast = self:nativeCast(e)
    if cast == nil then
        return
    end
    if cast.ability:GetAbilityName() == FIREBLAST and self:owns("ogre_l_fireblast") and self:enemy(cast.target) then
        self:armClub(cast.ability, cast.target)
    end
    if cast.multiplier ~= nil and self.dieBet ~= nil then
        clear(self.dieBet.icon)
        self.dieBet = nil
        clear(self.targetBet)
        self.targetBet = self:enemy(cast.target) and cast.target:AddNewModifier(
            self:GetParent(),
            cast.ability,
            DIE_BET,
            {duration = 1.8}
        ) or nil
        local ____opt_18 = self.targetBet
        if ____opt_18 ~= nil then
            ____opt_18:SetStackCount(cast.multiplier)
        end
    end
end
function OgreMagiLegends.prototype.currentCast(self, ability)
    local pending = self.pending
    if pending ~= nil and pending.ability == ability and (pending.at ~= nil or time() - pending.starts < 0.8) then
        return pending
    end
    do
        local i = #self.casts - 1
        while i >= 0 do
            if self.casts[i + 1].ability == ability then
                return self.casts[i + 1]
            end
            i = i - 1
        end
    end
    return nil
end
function OgreMagiLegends.prototype.observeRepeat(self, cast, min)
    if cast.at == nil then
        return
    end
    local elapsed = time() - cast.at
    if elapsed >= min and elapsed <= ROLLED_AT then
        cast.repeated = true
    end
end
function OgreMagiLegends.prototype.ObserveIgniteProjectile(self, ability, target)
    if self.orbFreeCast or ability:GetAbilityName() ~= IGNITE then
        return
    end
    local cast = self:currentCast(ability)
    if cast == nil then
        return
    end
    if cast.at == nil then
        cast.at = time()
    end
    cast.nativeObserved = true
    self:observeRepeat(cast, 0.54)
    if self:enemy(target) then
        cast.igniteCandidates:add(target)
    end
end
function OgreMagiLegends.prototype.OnModifierAdded(self, e)
    if not IsServer() or self.orbFreeCast or e.added_buff == nil or e.added_buff:GetCaster() ~= self:GetParent() then
        return
    end
    local name = e.added_buff:GetName()
    if name ~= NATIVE_IGNITE and name ~= NATIVE_STUN then
        return
    end
    local ability = e.added_buff:GetAbility()
    if ability == nil then
        return
    end
    local cast = self:currentCast(ability)
    if cast == nil then
        return
    end
    if name == NATIVE_IGNITE then
        self:placePotato(cast, e.unit)
    elseif e.unit == cast.target then
        self:observeFireblast(cast)
    end
end
function OgreMagiLegends.prototype.OnTakeDamage(self, e)
    if not IsServer() or e.attacker ~= self:GetParent() then
        return
    end
    local ____self_orbFreeCast_22 = self.orbFreeCast
    if not ____self_orbFreeCast_22 then
        local ____opt_20 = e.inflictor
        ____self_orbFreeCast_22 = (____opt_20 and ____opt_20:GetAbilityName()) ~= FIREBLAST
    end
    if ____self_orbFreeCast_22 then
        return
    end
    local cast = self:currentCast(e.inflictor)
    if cast ~= nil and e.unit == cast.target then
        self:observeFireblast(cast)
    end
end
function OgreMagiLegends.prototype.observeFireblast(self, cast)
    if cast.at == nil then
        cast.at = time()
    end
    cast.nativeObserved = true
    self:observeRepeat(cast, 0.54)
end
function OgreMagiLegends.prototype.CanLoadDie(self)
    return self.dieProgress == 2 and self.dieBet == nil and not self:GetParent():PassivesDisabled()
end
function OgreMagiLegends.prototype.LoadDie(self)
    if not self:CanLoadDie() then
        return
    end
    self.dieProgress = 0
    for ____, cast in ipairs(self.casts) do
        cast.eligible = false
    end
    self:syncDie()
    local caster = self:GetParent()
    local multiplier = self:bonuses().awake and 4 or 3
    local window = BET_WINDOW + (self:owns("ogre_p_doublehit") and 1.5 or 0)
    if self:owns("ogre_p_jackpot") then
        caster:GiveMana(caster:GetMaxMana() * 0.12)
    end
    local icon = caster:AddNewModifier(
        caster,
        caster:FindAbilityByName(MULTICAST),
        DIE_BET,
        {duration = window}
    )
    if icon ~= nil then
        icon:SetStackCount(multiplier)
    end
    self.dieBet = {
        ends = time() + window,
        multiplier = multiplier,
        icon = icon
    }
end
function OgreMagiLegends.prototype.GetMulticastChanceFloor(self, key)
    local cast = self.pending
    if (cast and cast.multiplier) == nil or self.orbFreeCast or self.suppressFloor or self:GetParent():PassivesDisabled() or not alive(self:GetParent()) then
        return nil
    end
    local at = time()
    if cast.at == nil and (at >= cast.starts + 0.8 or self.dieBet == nil or at >= self.dieBet.ends or at >= cast.starts + 0.08 and not cast.ability:IsInAbilityPhase()) then
        return nil
    end
    if cast.at ~= nil and at > cast.at + 0.06 then
        return nil
    end
    if key == "multicast_2_times" or key == "multicast_3_times" or key == "multicast_4_times" and cast.multiplier == 4 then
        return 100
    end
    return nil
end
function OgreMagiLegends.prototype.syncDie(self)
    local caster = self:GetParent()
    local native = caster:FindAbilityByName(MULTICAST)
    local show = self.dieProgress >= 2 and native ~= nil and native:GetLevel() > 0 and not caster:PassivesDisabled() and alive(caster)
    if show ~= self.dieShown then
        self.dieShown = self:swap(MULTICAST, LOADED_DIE, show)
    end
    if self.dieProgress <= 0 then
        clear(self.dieIcon)
        self.dieIcon = nil
    else
        if self.dieIcon == nil then
            self.dieIcon = caster:AddNewModifier(caster, native, DIE_READY, {})
        end
        local ____opt_27 = self.dieIcon
        if ____opt_27 ~= nil then
            ____opt_27:SetStackCount(self.dieProgress)
        end
    end
end
function OgreMagiLegends.prototype.settleRolls(self, at)
    local caster = self:GetParent()
    do
        local i = 0
        while i < #self.casts do
            do
                local cast = self.casts[i + 1]
                local started = cast.at or at
                if cast.eligible and at - started >= ROLLED_AT then
                    cast.eligible = false
                    if self.dieProgress < 2 and cast.repeated then
                        self.dieProgress = 0
                    elseif self.dieProgress < 2 and cast.nativeObserved and (cast.ability:GetAbilityName() ~= FIREBLAST or self:enemy(cast.target) and not cast.target:IsDebuffImmune()) then
                        self.dieProgress = math.min(2, self.dieProgress + 1)
                    end
                    self:syncDie()
                end
                if at >= cast.ignitionEnds then
                    local ____self_casts_30 = self.casts
                    local ____i_29 = i
                    i = ____i_29 - 1
                    __TS__ArraySplice(____self_casts_30, ____i_29, 1)
                    goto __continue153
                end
                if not cast.potUsed and self.potato == nil and cast.ability:GetAbilityName() == IGNITE then
                    for ____, target in __TS__Iterator(cast.igniteCandidates) do
                        do
                            if not self:enemy(target) then
                                goto __continue159
                            end
                            local burn = target:FindModifierByNameAndCaster(NATIVE_IGNITE, caster)
                            if burn ~= nil and burn:GetElapsedTime() < THINK * 2 then
                                self:placePotato(cast, target)
                            end
                            if cast.potUsed then
                                break
                            end
                        end
                        ::__continue159::
                    end
                end
            end
            ::__continue153::
            i = i + 1
        end
    end
end
function OgreMagiLegends.prototype.OnIntervalThink(self)
    if not IsServer() then
        return
    end
    local at = time()
    local caster = self:GetParent()
    local cast = self.pending
    if self.club ~= nil and at >= self.club.ends then
        self:clearClub()
    end
    if self.landing ~= nil then
        if at >= self.landing.lands then
            self:landClub()
        else
            self:moveClub(self.landing, at)
        end
    end
    if self.potato ~= nil then
        if alive(self.potato.owner) then
            self.potato.last = self.potato.owner:GetAbsOrigin()
        end
        if at >= self.potato.ends then
            self:burstPotato()
        else
            self:movePotato(self.potato)
        end
    end
    if self.challenge ~= nil and at >= self.challenge.ends then
        self:clearChallenge()
    end
    local duel = self.duel
    if duel ~= nil and (at >= duel.ends or not self:enemy(duel.target) or duel.target:IsDebuffImmune() or distance(
        caster:GetAbsOrigin(),
        duel.target:GetAbsOrigin()
    ) > 600) then
        self:clearDuel()
    end
    if self.dieBet ~= nil and at >= self.dieBet.ends then
        clear(self.dieBet.icon)
        self.dieBet = nil
    end
    local ____temp_32 = cast ~= nil
    if ____temp_32 then
        local ____temp_31
        if cast.at ~= nil then
            ____temp_31 = at > cast.at + 0.1
        else
            ____temp_31 = at > cast.starts + 0.8 or at > cast.starts + 0.08 and not cast.ability:IsInAbilityPhase()
        end
        ____temp_32 = ____temp_31
    end
    if ____temp_32 then
        if cast.at == nil then
            clear(self.targetBet)
        end
        self.pending = nil
    end
    self:settleRolls(at)
    if self.dieProgress >= 2 and self.dieShown == caster:PassivesDisabled() then
        self:syncDie()
    end
end
function OgreMagiLegends.prototype.OnDeath(self, e)
    if not IsServer() then
        return
    end
    local caster = self:GetParent()
    local potato = self.potato
    if potato ~= nil and e.unit == potato.owner then
        potato.last = e.unit:GetAbsOrigin()
        clear(potato.icon)
        potato.owner = nil
    end
    local ____e_unit_35 = e.unit
    local ____opt_33 = self.duel
    if ____e_unit_35 == (____opt_33 and ____opt_33.target) then
        if e.attacker == caster and alive(caster) then
            local reward = (self:bonuses().awake and 18 or 12) + (self:owns("ogre_p_thirst") and 8 or 0)
            caster:Heal(
                caster:GetMaxHealth() * reward / 100,
                caster:FindAbilityByName(BLOODLUST)
            )
            attached(LUST_FX, caster)
        end
        self:clearDuel()
    end
    if e.unit ~= caster then
        return
    end
    self:clearClub()
    self:clearLanding()
    self:clearChallenge()
    self:clearDuel()
    local ____clear_38 = clear
    local ____opt_36 = self.dieBet
    ____clear_38(____opt_36 and ____opt_36.icon)
    clear(self.targetBet)
    self.dieBet = nil
    self.pending = nil
    self.casts = {}
    self.dieProgress = 0
    self:syncDie()
end
modifier_orb_ogre_magi_legend = registerModifier("modifier_orb_ogre_magi_legend", ____exports.OgreMagiLegends)
modifier_orb_ogre_club_ready = registerModifier("modifier_orb_ogre_club_ready", ClubReady)
modifier_orb_ogre_potato = registerModifier("modifier_orb_ogre_potato", HotPotato)
modifier_orb_ogre_duel = registerModifier("modifier_orb_ogre_duel", DuelScore)
modifier_orb_ogre_duel_ready = registerModifier("modifier_orb_ogre_duel_ready", DuelReady)
modifier_orb_ogre_die_ready = registerModifier("modifier_orb_ogre_die_ready", DieReady)
modifier_orb_ogre_die_bet = registerModifier("modifier_orb_ogre_die_bet", DieBet)
return ____exports
