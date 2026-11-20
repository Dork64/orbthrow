--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____economy = require("game.economy")
local grantArenaExperience = ____economy.grantArenaExperience
local ____config = require("core.config")
local TIMINGS = ____config.TIMINGS
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____state = require("game.state")
local State = ____state.State
local gameNow = ____state.gameNow
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local nextAt = TIMINGS.runesFirst
local current = {}
function ____exports.wealthGold(minute)
    return 40 + 3 * minute
end
function ____exports.wealthXp(minute)
    return 50 + 5 * minute
end
local function spawnRunes()
    for ____, r in ipairs(current) do
        if isValid(r) then
            UTIL_Remove(r)
        end
    end
    current = {}
    for ____, s in ipairs(MAP.runeSpots) do
        local pos = Vector(
            s.x,
            s.y,
            GetGroundHeight(
                Vector(s.x, s.y, 0),
                nil
            )
        )
        local rune = CreateRune(pos, DOTA_RUNE_BOUNTY)
        if rune ~= nil then
            current[#current + 1] = rune
        end
    end
    log("руны богатства:", #current)
end
--- Свои руны богатства выключены (просьба автора 04.11).
local WEALTH_RUNES_ENABLED = false
function ____exports.runesTick()
    if not WEALTH_RUNES_ENABLED then
        return
    end
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    if gameNow() < nextAt then
        return
    end
    nextAt = nextAt + TIMINGS.runesEvery
    while nextAt <= gameNow() do
        nextAt = nextAt + TIMINGS.runesEvery
    end
    spawnRunes()
end
--- Фильтр бонусной руны: своя награда вместо стандартной.
function ____exports.bountyRuneFilter(e)
    local minute = math.max(
        0,
        math.floor(gameNow() / 60)
    )
    e.gold_bounty = ____exports.wealthGold(minute)
    e.xp_bounty = 0
    local hero = PlayerResource:GetSelectedHeroEntity(e.player_id_const)
    if hero ~= nil and IsValidEntity(hero) then
        grantArenaExperience(
            hero,
            ____exports.wealthXp(minute)
        )
    end
    local p = State.players:get(e.player_id_const)
    if p ~= nil then
        for ____, f in ipairs(Hooks.onWealthRune) do
            f(p)
        end
    end
    return true
end
function ____exports.logRuneSpawners()
    local a = #Entities:FindAllByClassname("dota_item_rune_spawner_powerup")
    local b = #Entities:FindAllByClassname("dota_item_rune_spawner_bounty")
    local c = #Entities:FindAllByClassname("dota_item_rune_spawner")
    log(
        "спаунеры рун на карте: усиления",
        a,
        "бонусные",
        b,
        "прочие",
        c
    )
end
--- Подбор любой руны Доты: очки синей шкалы (как раньше за руну богатства).
function ____exports.onRuneActivated(e)
    local p = State.players:get(e.PlayerID)
    if p == nil then
        return
    end
    for ____, f in ipairs(Hooks.onWealthRune) do
        f(p)
    end
end
return ____exports
