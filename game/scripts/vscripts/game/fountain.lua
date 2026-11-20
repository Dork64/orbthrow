local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local ____teams = require("game.teams")
local ALL_TEAMS = ____teams.ALL_TEAMS
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local FOUNTAIN_MOD = "modifier_orb_fountain"
--- Дальше этого от фонтана застревание не проверяем.
local CHECK_RADIUS = 900
local fountainCache = __TS__New(Map)
--- Где фонтан команды: по сущности фонтана, иначе по данным карты.
function ____exports.fountainOf(p)
    local cached = fountainCache:get(p.team)
    if cached ~= nil then
        return cached
    end
    local pos
    for ____, f in ipairs(Entities:FindAllByClassname("ent_dota_fountain")) do
        if f:GetTeamNumber() == p.team then
            pos = f:GetAbsOrigin()
        end
    end
    if pos == nil then
        local b = MAP.bases[p.baseIndex + 1] or MAP.bases[1]
        pos = Vector(b.fountain.x, b.fountain.y, 0)
    end
    fountainCache:set(p.team, pos)
    return pos
end
function ____exports.spawnPointOf(p)
    local b = MAP.bases[p.baseIndex + 1] or MAP.bases[1]
    return GetGroundPosition(
        Vector(b.spawn.x, b.spawn.y, 0),
        nil
    )
end
local function attach(p, hero)
    if hero:HasModifier(FOUNTAIN_MOD) then
        return
    end
    local f = ____exports.fountainOf(p)
    hero:AddNewModifier(hero, nil, FOUNTAIN_MOD, {
        x = f.x,
        y = f.y,
        r = CONFIG.fountainRadius,
        regen = CONFIG.fountainFastRegen,
        calm = CONFIG.fountainCalmSeconds,
        hd = CONFIG.fountainHasteDuration,
        hp = CONFIG.fountainHastePct
    })
end
--- Магазин на всей базе: предметы из тайника (ячейки 9-14) переносятся в свободные ячейки инвентаря.
local function stashToInventory(h)
    do
        local st = 9
        while st <= 14 do
            do
                local it = h:GetItemInSlot(st)
                if it == nil then
                    goto __continue12
                end
                local free = -1
                do
                    local i = 0
                    while i <= 8 do
                        if h:GetItemInSlot(i) == nil then
                            free = i
                            break
                        end
                        i = i + 1
                    end
                end
                if free < 0 then
                    return
                end
                h:SwapItems(st, free)
            end
            ::__continue12::
            st = st + 1
        end
    end
end
--- Каждые 0.5 с: магазин на базе; герой за фонтаном или без пути к выходу — на точку появления.
function ____exports.fountainTick()
    if State.phase ~= "game" and State.phase ~= "overtime" and State.phase ~= "pregame" then
        return
    end
    for ____, p in ipairs(allPlayers()) do
        do
            local h = PlayerResource:GetSelectedHeroEntity(p.id)
            if not isValid(h) or not h:IsAlive() then
                goto __continue19
            end
            attach(p, h)
            local o = h:GetAbsOrigin()
            local f = ____exports.fountainOf(p)
            local d = math.sqrt((o.x - f.x) ^ 2 + (o.y - f.y) ^ 2)
            if d <= CONFIG.fountainRadius then
                stashToInventory(h)
            end
            if d > CHECK_RADIUS then
                goto __continue19
            end
            local spawn = ____exports.spawnPointOf(p)
            local stuck = not GridNav:IsTraversable(o) or GridNav:IsBlocked(o) or not GridNav:CanFindPath(o, spawn)
            if not stuck then
                goto __continue19
            end
            FindClearSpaceForUnit(h, spawn, true)
            h:Stop()
            log("герой", p.id, "застрял у фонтана — перенесен на точку появления")
        end
        ::__continue19::
    end
end
function ____exports.initFountain()
    local ____Hooks_onHeroSpawned_0 = Hooks.onHeroSpawned
    ____Hooks_onHeroSpawned_0[#____Hooks_onHeroSpawned_0 + 1] = function(p, hero) return attach(p, hero) end
    local ____Hooks_onGameStart_1 = Hooks.onGameStart
    ____Hooks_onGameStart_1[#____Hooks_onGameStart_1 + 1] = function()
        for ____, t in ipairs(ALL_TEAMS) do
            GameRules:SetItemStockCount(1, t, "item_aghanims_shard", -1)
        end
        for ____, b in ipairs(MAP.bases) do
            local dx = b.tower.x - b.fountain.x
            local dy = b.tower.y - b.fountain.y
            for ____, k in ipairs({0.3, 0.6, 1, 1.4}) do
                GridNav:DestroyTreesAroundPoint(
                    Vector(b.fountain.x + dx * k, b.fountain.y + dy * k, 0),
                    220,
                    true
                )
            end
        end
    end
end
return ____exports
