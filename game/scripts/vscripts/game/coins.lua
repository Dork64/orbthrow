local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local ____exports = {}
local coinLandingPoint, specialGold
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____state = require("game.state")
local State = ____state.State
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____courier = require("game.courier")
local CHEST_ITEM = ____courier.CHEST_ITEM
local onChestPicked = ____courier.onChestPicked
local ____util = require("game.util")
local isValid = ____util.isValid
local randomPointInRing = ____util.randomPointInRing
function ____exports.throwCoin()
    local boss = Entities:FindByName(nil, "@overboss")
    if isValid(boss) then
        local anim = boss:FindAbilityByName("dota_ability_throw_coin")
        if anim ~= nil then
            boss:CastAbilityNoTarget(anim, -1)
        end
    end
    local start = Vector(0, 0, 300)
    local target = coinLandingPoint()
    local item = CreateItem("item_bag_of_gold", nil, nil)
    if item == nil then
        return
    end
    local drop = CreateItemOnPositionForLaunch(start, item)
    item:LaunchLootInitialHeight(
        false,
        300,
        400,
        0.75,
        target
    )
    Timers:after(
        CONFIG.coinLifetime,
        "исчезновение монеты",
        function() return ____exports.expireLoot(item, drop) end
    )
end
function coinLandingPoint()
    do
        local i = 0
        while i < 20 do
            local p = randomPointInRing(
                Vector(0, 0, 0),
                CONFIG.coinMinRadius,
                CONFIG.coinMaxRadius
            )
            if GridNav:IsTraversable(p) and not GridNav:IsBlocked(p) then
                return GetGroundPosition(p, nil)
            end
            i = i + 1
        end
    end
    local a = RandomFloat(0, math.pi * 2)
    local r = (CONFIG.coinMinRadius + CONFIG.coinMaxRadius) / 2
    return GetGroundPosition(
        Vector(
            math.cos(a) * r,
            math.sin(a) * r,
            0
        ),
        nil
    )
end
--- Убрать неподобранную монету или мешок: и лежащий предмет, и сам предмет (иначе копятся сущности).
function ____exports.expireLoot(item, drop)
    if not isValid(drop) then
        return
    end
    if isValid(item) then
        specialGold:delete(item:entindex())
        UTIL_Remove(item)
    end
    if isValid(drop) then
        UTIL_Remove(drop)
    end
end
function ____exports.coinTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    if RandomFloat(0, 1) >= CONFIG.coinChancePerSecond then
        return
    end
    ____exports.throwCoin()
end
specialGold = __TS__New(Map)
function ____exports.registerSpecialGold(item, gold)
    specialGold:set(
        item:entindex(),
        gold
    )
end
--- Подбор монеты или мешка: золото и удаление предмета. Сундук — отдельно (courier.ts).
function ____exports.onItemPickedUp(e)
    local item = EntIndexToHScript(e.ItemEntityIndex)
    local ____temp_0
    if e.HeroEntityIndex ~= nil then
        ____temp_0 = EntIndexToHScript(e.HeroEntityIndex)
    else
        ____temp_0 = nil
    end
    local hero = ____temp_0
    if e.itemname == CHEST_ITEM then
        if isValid(hero) and hero:IsRealHero() then
            return onChestPicked(hero, item)
        end
        return false
    end
    if e.itemname ~= "item_bag_of_gold" then
        return false
    end
    local gold = specialGold:get(e.ItemEntityIndex) or CONFIG.coinGold
    specialGold:delete(e.ItemEntityIndex)
    if isValid(hero) and hero:IsRealHero() then
        PlayerResource:ModifyGold(
            hero:GetPlayerOwnerID(),
            gold,
            true,
            DOTA_ModifyGold_Unspecified
        )
        SendOverheadEventMessage(
            nil,
            OVERHEAD_ALERT_GOLD,
            hero,
            gold,
            nil
        )
    end
    if isValid(item) then
        UTIL_Remove(item)
    end
    return true
end
return ____exports
