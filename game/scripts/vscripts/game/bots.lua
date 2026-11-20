local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayConcat = ____lualib.__TS__ArrayConcat
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local __TS__StringStartsWith = ____lualib.__TS__StringStartsWith
local __TS__Number = ____lualib.__TS__Number
local __TS__Iterator = ____lualib.__TS__Iterator
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____heroes = require("core.heroes")
local HERO_POOL = ____heroes.HERO_POOL
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____bossorbs = require("game.bossorbs")
local landedBossOrbs = ____bossorbs.landedBossOrbs
local ____courier = require("game.courier")
local chestOnGroundNow = ____courier.chestOnGroundNow
local ____goblin = require("game.goblin")
local currentGoblin = ____goblin.currentGoblin
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local newPlayer = ____state.newPlayer
local gameNow = ____state.gameNow
local ____teams = require("game.teams")
local BASE_COLORS = ____teams.BASE_COLORS
local baseIndexOfTeam = ____teams.baseIndexOfTeam
local fountainOf = ____teams.fountainOf
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local randomPointInCircle = ____util.randomPointInCircle
local safe = ____util.safe
local HERO_BUILDS = {
    npc_dota_hero_puck = {
        "item_arcane_boots",
        "item_witch_blade",
        "item_blink",
        "item_cyclone",
        "item_black_king_bar",
        "item_octarine_core",
        "item_sheepstick"
    },
    npc_dota_hero_slark = {
        "item_power_treads",
        "item_diffusal_blade",
        "item_echo_sabre",
        "item_black_king_bar",
        "item_skadi",
        "item_basher",
        "item_abyssal_blade"
    },
    npc_dota_hero_razor = {
        "item_phase_boots",
        "item_falcon_blade",
        "item_black_king_bar",
        "item_sange_and_yasha",
        "item_shivas_guard",
        "item_satanic",
        "item_refresher"
    },
    npc_dota_hero_necrolyte = {
        "item_arcane_boots",
        "item_kaya_and_sange",
        "item_blink",
        "item_shivas_guard",
        "item_black_king_bar",
        "item_octarine_core",
        "item_sheepstick"
    },
    npc_dota_hero_sand_king = {
        "item_arcane_boots",
        "item_blink",
        "item_kaya_and_sange",
        "item_black_king_bar",
        "item_shivas_guard",
        "item_octarine_core",
        "item_refresher"
    }
}
local brains = __TS__New(Map)
local botCounter = 0
--- Герои, уже обещанные ботам (загрузка героя асинхронная, без этого боты берут одинаковых).
local reservedHeroes = {}
--- Простые сборки по основному атрибуту: бот покупает по порядку, когда хватает золота.
local BUILDS = {{
    "item_phase_boots",
    "item_vanguard",
    "item_blink",
    "item_black_king_bar",
    "item_assault",
    "item_heart",
    "item_abyssal_blade"
}, {
    "item_power_treads",
    "item_mask_of_madness",
    "item_manta",
    "item_black_king_bar",
    "item_butterfly",
    "item_satanic",
    "item_skadi"
}, {
    "item_arcane_boots",
    "item_glimmer_cape",
    "item_cyclone",
    "item_black_king_bar",
    "item_octarine_core",
    "item_sheepstick",
    "item_refresher"
}, {
    "item_phase_boots",
    "item_maelstrom",
    "item_kaya_and_sange",
    "item_black_king_bar",
    "item_mjollnir",
    "item_greater_crit",
    "item_satanic"
}}
local function takenHeroes()
    local list = {}
    do
        local i = 0
        while i < 24 do
            local id = i
            if PlayerResource:IsValidPlayerID(id) then
                local n = PlayerResource:GetSelectedHeroName(id)
                if n ~= "" then
                    list[#list + 1] = n
                end
            end
            i = i + 1
        end
    end
    return list
end
--- Добавить бота в свободную зарезервированную команду.
function ____exports.spawnBot(team)
    local taken = __TS__ArrayConcat(
        takenHeroes(),
        reservedHeroes
    )
    local free = __TS__ArrayFilter(
        HERO_POOL,
        function(____, h) return not __TS__ArrayIncludes(taken, h) end
    )
    local heroName = #free > 0 and free[RandomInt(0, #free - 1) + 1] or HERO_POOL[RandomInt(0, #HERO_POOL - 1) + 1]
    reservedHeroes[#reservedHeroes + 1] = heroName
    botCounter = botCounter + 1
    local botName = "Бот " .. tostring(botCounter)
    PrecacheUnitByNameAsync(
        heroName,
        function()
            safe(
                "создание бота",
                function()
                    local hero = GameRules:AddBotPlayerWithEntityScript(
                        heroName,
                        botName,
                        team,
                        "",
                        false
                    )
                    if hero == nil then
                        log("не удалось создать бота", heroName, "в команде", team)
                        return
                    end
                    local id = hero:GetPlayerOwnerID()
                    local baseIndex = baseIndexOfTeam(team)
                    newPlayer(id, team, baseIndex, true)
                    local c = BASE_COLORS[baseIndex + 1]
                    PlayerResource:SetCustomPlayerColor(id, c[1], c[2], c[3])
                    brains:set(id, {
                        id = id,
                        mode = "ring",
                        ["until"] = 0,
                        lastKey = "",
                        lastAt = -100,
                        buyIndex = 0,
                        nextShop = 0
                    })
                    log(
                        "бот",
                        botName,
                        heroName,
                        "команда",
                        team
                    )
                    for ____, f in ipairs(Hooks.onHeroSpawned) do
                        safe(
                            "появление героя",
                            function() return f(
                                State.players:get(id),
                                hero,
                                false
                            ) end
                        )
                    end
                end
            )
        end
    )
end
function ____exports.spawnReservedBots()
    local teams = __TS__ArraySlice(State.reservedBotTeams)
    State.reservedBotTeams = {}
    __TS__ArrayForEach(
        teams,
        function(____, t, i) return Timers:after(
            0.3 * i,
            "бот",
            function() return ____exports.spawnBot(t) end
        ) end
    )
end
function ____exports.isBot(id)
    return brains:has(id)
end
local function nearestEnemyHero(h, radius)
    local units = FindUnitsInRadius(
        h:GetTeamNumber(),
        h:GetAbsOrigin(),
        nil,
        radius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO,
        bit.bor(DOTA_UNIT_TARGET_FLAG_NO_INVIS, DOTA_UNIT_TARGET_FLAG_FOW_VISIBLE),
        FIND_CLOSEST,
        false
    )
    for ____, u in ipairs(units) do
        if u:IsAlive() and not u:IsInvulnerable() then
            return u
        end
    end
    return nil
end
local function nearestCreep(h, radius)
    local units = FindUnitsInRadius(
        h:GetTeamNumber(),
        h:GetAbsOrigin(),
        nil,
        radius,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_CLOSEST,
        false
    )
    for ____, u in ipairs(units) do
        if u:IsAlive() and u:GetTeamNumber() == DOTA_TEAM_NEUTRALS then
            return u
        end
    end
    return nil
end
local BEHAVIOR_NO_TARGET = 4
local BEHAVIOR_UNIT_TARGET = 8
local BEHAVIOR_POINT = 16
local BEHAVIOR_PASSIVE = 2
local BEHAVIOR_TOGGLE = 512
local BEHAVIOR_AUTOCAST = 4096
--- Приказ без повторов: тот же приказ не чаще раза в 2.5 с.
local function issue(b, key, fn)
    local now = GameRules:GetGameTime()
    if b.lastKey == key and now - b.lastAt < 2.5 then
        return
    end
    b.lastKey = key
    b.lastAt = now
    fn()
end
local function attack(b, h, target)
    if not isValid(target) or not target:IsAlive() then
        return
    end
    issue(
        b,
        "attack:" .. tostring(target:entindex()),
        function() return h:MoveToTargetToAttack(target) end
    )
end
local function moveTo(b, h, pos, aggressive)
    if aggressive == nil then
        aggressive = false
    end
    if (h:GetAbsOrigin() - pos):Length2D() < 80 then
        return
    end
    local key = (((aggressive and "amove:" or "move:") .. tostring(math.floor(pos.x / 100))) .. ":") .. tostring(math.floor(pos.y / 100))
    issue(
        b,
        key,
        function()
            local ____aggressive_0
            if aggressive then
                ____aggressive_0 = h:MoveToPositionAggressive(pos)
            else
                ____aggressive_0 = h:MoveToPosition(pos)
            end
            return ____aggressive_0
        end
    )
end
local function tryCast(h, enemy)
    if not isValid(enemy) or not enemy:IsAlive() or enemy:IsInvulnerable() then
        return false
    end
    do
        local i = 0
        while i < h:GetAbilityCount() do
            do
                local a = h:GetAbilityByIndex(i)
                if a == nil or a:GetLevel() <= 0 or a:IsHidden() or a:IsPassive() then
                    goto __continue36
                end
                local name = a:GetAbilityName()
                if name == "puck_ethereal_jaunt" then
                    goto __continue36
                end
                if name == "puck_phase_shift" and h:GetHealthPercent() > 50 then
                    goto __continue36
                end
                if name == "necrolyte_ghost_shroud" and h:GetHealthPercent() > 70 then
                    goto __continue36
                end
                if __TS__StringStartsWith(
                    a:GetAbilityName(),
                    "orb_slot_"
                ) then
                    goto __continue36
                end
                if not a:IsFullyCastable() or not a:IsCooldownReady() or a:IsInAbilityPhase() then
                    goto __continue36
                end
                local b = __TS__Number(a:GetBehavior())
                if bit.band(b, BEHAVIOR_PASSIVE) ~= 0 or bit.band(b, BEHAVIOR_TOGGLE) ~= 0 or bit.band(b, BEHAVIOR_AUTOCAST) ~= 0 and name ~= "slark_saltwater_shiv" then
                    goto __continue36
                end
                local range = math.max(
                    250,
                    a:GetEffectiveCastRange(
                        enemy:GetAbsOrigin(),
                        enemy
                    )
                )
                local d = (enemy:GetAbsOrigin() - h:GetAbsOrigin()):Length2D()
                if bit.band(b, BEHAVIOR_UNIT_TARGET) ~= 0 then
                    if d <= range + 100 and bit.band(
                        a:GetAbilityTargetTeam(),
                        DOTA_UNIT_TARGET_TEAM_ENEMY
                    ) ~= 0 then
                        h:CastAbilityOnTarget(
                            enemy,
                            a,
                            h:GetPlayerOwnerID()
                        )
                        return true
                    end
                elseif bit.band(b, BEHAVIOR_POINT) ~= 0 then
                    if d <= range + 100 then
                        h:CastAbilityOnPosition(
                            enemy:GetAbsOrigin(),
                            a,
                            h:GetPlayerOwnerID()
                        )
                        return true
                    end
                elseif bit.band(b, BEHAVIOR_NO_TARGET) ~= 0 then
                    if d <= 350 then
                        h:CastAbilityNoTarget(
                            a,
                            h:GetPlayerOwnerID()
                        )
                        return true
                    end
                end
            end
            ::__continue36::
            i = i + 1
        end
    end
    return false
end
local function levelUp(h)
    local guard = 0
    while true do
        local ____temp_2 = h:GetAbilityPoints() > 0
        if ____temp_2 then
            local ____guard_1 = guard
            guard = ____guard_1 + 1
            ____temp_2 = ____guard_1 < 10
        end
        if not ____temp_2 then
            break
        end
        local pick
        do
            local i = 0
            while i < math.min(
                6,
                h:GetAbilityCount()
            ) do
                do
                    local a = h:GetAbilityByIndex(i)
                    if a == nil or a:IsHidden() or a:GetLevel() >= a:GetMaxLevel() then
                        goto __continue52
                    end
                    if a:GetHeroLevelRequiredToUpgrade() > h:GetLevel() then
                        goto __continue52
                    end
                    if a:GetAbilityType() == ABILITY_TYPE_ULTIMATE then
                        pick = a
                        break
                    end
                    if pick == nil or a:GetLevel() < pick:GetLevel() then
                        pick = a
                    end
                end
                ::__continue52::
                i = i + 1
            end
        end
        if pick == nil then
            break
        end
        h:UpgradeAbility(pick)
    end
end
--- Покупка следующего предмета сборки, когда хватает золота (боты не ходят в магазин).
local function shop(b, h)
    local now = GameRules:GetGameTime()
    if now < b.nextShop then
        return
    end
    b.nextShop = now + 5
    local build = HERO_BUILDS[h:GetUnitName()] or BUILDS[(b.id + __TS__Number(h:GetPrimaryAttribute())) % #BUILDS + 1]
    if b.buyIndex >= #build then
        return
    end
    local free = false
    do
        local slot = 0
        while slot <= 5 do
            if h:GetItemInSlot(slot) == nil then
                free = true
            end
            slot = slot + 1
        end
    end
    if not free then
        return
    end
    local name = build[b.buyIndex + 1]
    local cost = GetItemCost(name)
    if cost <= 0 or PlayerResource:GetGold(b.id) < cost then
        return
    end
    PlayerResource:SpendGold(b.id, cost, DOTA_ModifyGold_PurchaseItem)
    h:AddItemByName(name)
    b.buyIndex = b.buyIndex + 1
end
local function think(b)
    local h = PlayerResource:GetSelectedHeroEntity(b.id)
    if not isValid(h) or not h:IsAlive() then
        return
    end
    if h:HasModifier("modifier_orb_pregame") or h:IsChanneling() then
        return
    end
    levelUp(h)
    shop(b, h)
    local now = gameNow()
    local hpPct = h:GetHealthPercent()
    local home = fountainOf(h:GetTeamNumber())
    if b.mode == "retreat" then
        if hpPct >= 85 then
            b.mode = "ring"
        else
            moveTo(b, h, home)
            return
        end
    end
    if hpPct < 25 then
        b.mode = "retreat"
        moveTo(b, h, home)
        return
    end
    local enemy = nearestEnemyHero(h, 1100)
    if enemy ~= nil and (hpPct > 45 or enemy:GetHealthPercent() < 30) then
        b.mode = "fight"
        if not tryCast(h, enemy) then
            attack(b, h, enemy)
        end
        return
    end
    if now >= b["until"] or b.target == nil then
        if RandomFloat(0, 1) < 0.55 then
            b.mode = "ring"
            b.target = randomPointInCircle(
                Vector(0, 0, 128),
                CONFIG.ringRadius * 0.7
            )
        else
            b.mode = "farm"
            local o = h:GetAbsOrigin()
            local best = MAP.camps[1]
            local bd = 1000000000000000000
            for ____, c in ipairs(MAP.camps) do
                local d = (c.x - o.x) ^ 2 + (c.y - o.y) ^ 2 + RandomFloat(0, 4000000)
                if d < bd then
                    bd = d
                    best = c
                end
            end
            b.target = Vector(best.x, best.y, 128)
        end
        b["until"] = now + RandomFloat(15, 25)
    end
    local o = h:GetAbsOrigin()
    local chest = chestOnGroundNow()
    if chest ~= nil and (chest - o):Length2D() < 2000 then
        moveTo(b, h, chest)
        return
    end
    local goblin = currentGoblin()
    if goblin ~= nil and (goblin:GetAbsOrigin() - o):Length2D() < 1500 then
        attack(b, h, goblin)
        return
    end
    for ____, p in ipairs(landedBossOrbs()) do
        if (p - o):Length2D() < 1800 then
            moveTo(b, h, p)
            return
        end
    end
    local creep = nearestCreep(h, 600)
    if creep ~= nil then
        if not tryCast(h, creep) then
            attack(b, h, creep)
        end
        return
    end
    if b.target ~= nil then
        moveTo(b, h, b.target, true)
    end
end
function ____exports.botsTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    for ____, ____value in __TS__Iterator(brains) do
        local b = ____value[2]
        safe(
            "бот",
            function() return think(b) end
        )
    end
end
function ____exports.botsCount()
    return #__TS__ArrayFilter(
        allPlayers(),
        function(____, p) return p.isBot end
    )
end
return ____exports
