local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local gameNow = ____state.gameNow
local ____util = require("game.util")
local isValid = ____util.isValid
local RING_MOD = "modifier_orb_ring"
local grantingXp = false
local actionRemainder = __TS__New(Map)
function ____exports.resetExperience()
    actionRemainder:clear()
end
local function scaleActionXp(pid, amount)
    local total = amount * CONFIG.actionXpMultiplier + (actionRemainder:get(pid) or 0)
    local whole = math.floor(total)
    actionRemainder:set(pid, total - whole)
    return whole
end
--- AddExperience бывает источником фильтра. Наши выдачи уже содержат нужный множитель.
function ____exports.grantArenaExperience(hero, xp, rateAlreadyApplied)
    if rateAlreadyApplied == nil then
        rateAlreadyApplied = false
    end
    local amount = rateAlreadyApplied and xp or scaleActionXp(
        hero:GetPlayerOwnerID(),
        xp
    )
    local previous = grantingXp
    grantingXp = true
    do
        pcall(function()
            hero:AddExperience(
                amount,
                DOTA_ModifyXP_Unspecified,
                false,
                true,
                0
            )
        end)
        do
            grantingXp = previous
        end
    end
end
local function growth()
    local m = math.max(
        0,
        math.min(
            CONFIG.neutralGrowthCapMin,
            gameNow() / 60
        )
    )
    return 1 + CONFIG.neutralBountyGrowthPerMin * m
end
--- Каждую секунду: пассивный доход, кольцо и метка истинного зрения.
function ____exports.economyTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    if gameNow() < 0 then
        return
    end
    local center = Vector(0, 0, 0)
    for ____, p in ipairs(allPlayers()) do
        do
            if p.left then
                goto __continue11
            end
            local h = PlayerResource:GetSelectedHeroEntity(p.id)
            if not isValid(h) then
                goto __continue11
            end
            local gold = CONFIG.passiveGpm / 60
            local xp = CONFIG.passiveXpm / 60
            local o = h:GetAbsOrigin()
            p.inRing = h:IsAlive() and (o.x - center.x) ^ 2 + (o.y - center.y) ^ 2 <= CONFIG.ringRadius ^ 2
            if p.inRing then
                gold = gold + CONFIG.ringGpm / 60
                xp = xp + CONFIG.ringXpm / 60
                if not h:HasModifier(RING_MOD) then
                    h:AddNewModifier(h, nil, RING_MOD, {r = CONFIG.ringRadius})
                end
            end
            p.goldFrac = p.goldFrac + gold
            p.xpFrac = p.xpFrac + xp
            local g = math.floor(p.goldFrac)
            local x = math.floor(p.xpFrac)
            if g > 0 then
                PlayerResource:ModifyGold(p.id, g, true, DOTA_ModifyGold_Unspecified)
                p.goldFrac = p.goldFrac - g
            end
            if x > 0 then
                ____exports.grantArenaExperience(h, x, true)
                p.xpFrac = p.xpFrac - x
            end
        end
        ::__continue11::
    end
end
--- Фильтр золота: стандартную награду за героя заменяем своей, нейтралы растут со временем.
function ____exports.goldFilter(e)
    local r = e.reason_const
    if r == DOTA_ModifyGold_HeroKill or r == DOTA_ModifyGold_Death or r == DOTA_ModifyGold_Building then
        return false
    end
    if r == DOTA_ModifyGold_CreepKill or r == DOTA_ModifyGold_NeutralKill then
        e.gold = math.floor(e.gold * growth())
    end
    return true
end
function ____exports.xpFilter(e)
    local r = e.reason_const
    if r == DOTA_ModifyXP_HeroKill or r == DOTA_ModifyXP_CatchUp then
        return false
    end
    if not grantingXp and e.experience > 0 then
        local amount = r == DOTA_ModifyXP_CreepKill and math.floor(e.experience * growth()) or e.experience
        e.experience = scaleActionXp(e.player_id_const, amount)
    end
    return true
end
return ____exports
