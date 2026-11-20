local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____modbase = require("lib.modbase")
local AbilityBase = ____modbase.AbilityBase
local ____registry = require("lib.registry")
local registerAbility = ____registry.registerAbility
local OBSERVER_LIFE = 360
local SENTRY_LIFE = 420
local SMOKE_DURATION = 35
local DUST_RADIUS = 1050
local DUST_DURATION = 12
--- Есть ли заряд. Решает только сервер: на клиенте фильтр всегда пропускает приказ.
-- Раньше клиент читал заряды из сетевой таблицы, и у части игроков (таблица на клиенте
-- еще не пришла или ключ не совпал) Дота отбрасывала приказ еще до сервера — варды «не ставились».
local function hasCharge(caster, kind)
    if not IsServer() then
        return true
    end
    local store = _G.ORBTHROW_SLOTS
    return store ~= nil and store.count(
        caster:GetPlayerOwnerID(),
        kind
    ) > 0
end
--- Списать заряд (только сервер).
local function take(caster, kind)
    local store = _G.ORBTHROW_SLOTS
    return store ~= nil and store.take(
        caster:GetPlayerOwnerID(),
        kind
    )
end
local function placeWard(ability, sentry)
    local caster = ability:GetCaster()
    if not take(caster, sentry and "se" or "ob") then
        return
    end
    local pos = ability:GetCursorPosition()
    local unitName = sentry and "npc_dota_sentry_wards" or "npc_dota_observer_wards"
    local ward = CreateUnitByName(
        unitName,
        pos,
        true,
        caster,
        caster,
        caster:GetTeamNumber()
    )
    if ward == nil then
        return
    end
    local life = sentry and SENTRY_LIFE or OBSERVER_LIFE
    ward:AddNewModifier(caster, ability, "modifier_orb_ward", {sentry = sentry and 1 or 0})
    ward:AddNewModifier(caster, ability, "modifier_kill", {duration = life})
    EmitSoundOnLocationWithCaster(pos, sentry and "DOTA_Item.SentryWard.Activate" or "DOTA_Item.ObserverWard.Activate", caster)
end
____exports.OrbSlotObserver = __TS__Class()
local OrbSlotObserver = ____exports.OrbSlotObserver
OrbSlotObserver.name = "OrbSlotObserver"
__TS__ClassExtends(OrbSlotObserver, AbilityBase)
function OrbSlotObserver.prototype.CastFilterResultLocation(self)
    local ____hasCharge_result_0
    if hasCharge(
        self:GetCaster(),
        "ob"
    ) then
        ____hasCharge_result_0 = UF_SUCCESS
    else
        ____hasCharge_result_0 = UF_FAIL_CUSTOM
    end
    return ____hasCharge_result_0
end
function OrbSlotObserver.prototype.GetCustomCastErrorLocation(self)
    return "#orb_slot_empty"
end
function OrbSlotObserver.prototype.OnSpellStart(self)
    placeWard(self, false)
end
____exports.OrbSlotSentry = __TS__Class()
local OrbSlotSentry = ____exports.OrbSlotSentry
OrbSlotSentry.name = "OrbSlotSentry"
__TS__ClassExtends(OrbSlotSentry, AbilityBase)
function OrbSlotSentry.prototype.CastFilterResultLocation(self)
    local ____hasCharge_result_1
    if hasCharge(
        self:GetCaster(),
        "se"
    ) then
        ____hasCharge_result_1 = UF_SUCCESS
    else
        ____hasCharge_result_1 = UF_FAIL_CUSTOM
    end
    return ____hasCharge_result_1
end
function OrbSlotSentry.prototype.GetCustomCastErrorLocation(self)
    return "#orb_slot_empty"
end
function OrbSlotSentry.prototype.OnSpellStart(self)
    placeWard(self, true)
end
____exports.OrbSlotSmoke = __TS__Class()
local OrbSlotSmoke = ____exports.OrbSlotSmoke
OrbSlotSmoke.name = "OrbSlotSmoke"
__TS__ClassExtends(OrbSlotSmoke, AbilityBase)
function OrbSlotSmoke.prototype.CastFilterResult(self)
    local ____hasCharge_result_2
    if hasCharge(
        self:GetCaster(),
        "sm"
    ) then
        ____hasCharge_result_2 = UF_SUCCESS
    else
        ____hasCharge_result_2 = UF_FAIL_CUSTOM
    end
    return ____hasCharge_result_2
end
function OrbSlotSmoke.prototype.GetCustomCastError(self)
    return "#orb_slot_empty"
end
function OrbSlotSmoke.prototype.OnSpellStart(self)
    local caster = self:GetCaster()
    if not take(caster, "sm") then
        return
    end
    local fx = ParticleManager:CreateParticle("particles/items2_fx/smoke_of_deceit.vpcf", PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(
        fx,
        0,
        caster:GetAbsOrigin()
    )
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(1200, 1, 1200)
    )
    ParticleManager:ReleaseParticleIndex(fx)
    EmitSoundOn("DOTA_Item.SmokeOfDeceit.Activate", caster)
    caster:AddNewModifier(caster, self, "modifier_orb_smoke", {duration = SMOKE_DURATION})
end
____exports.OrbSlotDust = __TS__Class()
local OrbSlotDust = ____exports.OrbSlotDust
OrbSlotDust.name = "OrbSlotDust"
__TS__ClassExtends(OrbSlotDust, AbilityBase)
function OrbSlotDust.prototype.CastFilterResult(self)
    local ____hasCharge_result_3
    if hasCharge(
        self:GetCaster(),
        "du"
    ) then
        ____hasCharge_result_3 = UF_SUCCESS
    else
        ____hasCharge_result_3 = UF_FAIL_CUSTOM
    end
    return ____hasCharge_result_3
end
function OrbSlotDust.prototype.GetCustomCastError(self)
    return "#orb_slot_empty"
end
function OrbSlotDust.prototype.OnSpellStart(self)
    local caster = self:GetCaster()
    if not take(caster, "du") then
        return
    end
    local fx = ParticleManager:CreateParticle("particles/items_fx/dust_of_appearance.vpcf", PATTACH_ABSORIGIN_FOLLOW, caster)
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(DUST_RADIUS, DUST_RADIUS, DUST_RADIUS)
    )
    ParticleManager:ReleaseParticleIndex(fx)
    EmitSoundOn("DOTA_Item.DustOfAppearance.Activate", caster)
    local enemies = FindUnitsInRadius(
        caster:GetTeamNumber(),
        caster:GetAbsOrigin(),
        nil,
        DUST_RADIUS,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_INVULNERABLE + DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES,
        FIND_ANY_ORDER,
        false
    )
    for ____, u in ipairs(enemies) do
        u:AddNewModifier(caster, self, "modifier_orb_dust", {duration = DUST_DURATION})
    end
end
orb_slot_observer = registerAbility("orb_slot_observer", ____exports.OrbSlotObserver)
orb_slot_sentry = registerAbility("orb_slot_sentry", ____exports.OrbSlotSentry)
orb_slot_smoke = registerAbility("orb_slot_smoke", ____exports.OrbSlotSmoke)
orb_slot_dust = registerAbility("orb_slot_dust", ____exports.OrbSlotDust)
return ____exports
