local ____lualib = require("lualib_bundle")
local __TS__ObjectKeys = ____lualib.__TS__ObjectKeys
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local ____exports = {}
local orderFilter, forceHeroes, startGame, makeTowersInvulnerable, endGame, checkLastPlayer, writeHeroList, lastPlayerTimer
local ____itemsnet = require("game.itemsnet")
local resetItemsNet = ____itemsnet.resetItemsNet
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local TIMINGS = ____config.TIMINGS
local ____version = require("core.version")
local BUILD_VERSION = ____version.BUILD_VERSION
local ____heroes = require("core.heroes")
local HERO_POOL = ____heroes.HERO_POOL
local ____rules = require("core.rules")
local checkVictory = ____rules.checkVictory
local ____bots = require("game.bots")
local botsTick = ____bots.botsTick
local spawnReservedBots = ____bots.spawnReservedBots
local ____camps = require("game.camps")
local campsTick = ____camps.campsTick
local initCamps = ____camps.initCamps
local ____runes = require("game.runes")
local bountyRuneFilter = ____runes.bountyRuneFilter
local logRuneSpawners = ____runes.logRuneSpawners
local onRuneActivated = ____runes.onRuneActivated
local runesTick = ____runes.runesTick
local ____orbs = require("game.orbs")
local initOrbs = ____orbs.initOrbs
local orbsTick = ____orbs.orbsTick
local ____bossorbs = require("game.bossorbs")
local bossOrbsTick = ____bossorbs.bossOrbsTick
local ____courier = require("game.courier")
local courierTick = ____courier.courierTick
local CHEST_ITEM = ____courier.CHEST_ITEM
local ____goblin = require("game.goblin")
local goblinTick = ____goblin.goblinTick
local initGoblin = ____goblin.initGoblin
local ____catchup = require("game.catchup")
local catchupTick = ____catchup.catchupTick
local initCatchup = ____catchup.initCatchup
local revengeDamage = ____catchup.revengeDamage
local ____endscreen = require("game.endscreen")
local initEndscreen = ____endscreen.initEndscreen
local publishFinal = ____endscreen.publishFinal
local ____selftest = require("game.selftest")
local modifierSelfTest = ____selftest.modifierSelfTest
local ____lobby = require("game.lobby")
local beginSetup = ____lobby.beginSetup
local finishSetup = ____lobby.finishSetup
local initLobby = ____lobby.initLobby
local ____cheats = require("game.cheats")
local initTestPanel = ____cheats.initTestPanel
local onPlayerChat = ____cheats.onPlayerChat
local ____coins = require("game.coins")
local coinTick = ____coins.coinTick
local onItemPickedUp = ____coins.onItemPickedUp
local ____economy = require("game.economy")
local economyTick = ____economy.economyTick
local goldFilter = ____economy.goldFilter
local resetExperience = ____economy.resetExperience
local xpFilter = ____economy.xpFilter
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____fountain = require("game.fountain")
local fountainTick = ____fountain.fountainTick
local initFountain = ____fountain.initFountain
local ____slots = require("game.slots")
local initSlots = ____slots.initSlots
local slotsItemFilter = ____slots.slotsItemFilter
local slotsTick = ____slots.slotsTick
local ____arenaevents = require("game.arenaevents")
local arenaEventsTick = ____arenaevents.arenaEventsTick
local initArenaEvents = ____arenaevents.initArenaEvents
local ____neutrals = require("game.neutrals")
local initNeutrals = ____neutrals.initNeutrals
local neutralsTick = ____neutrals.neutralsTick
local ____kills = require("game.kills")
local onEntityKilled = ____kills.onEntityKilled
local recordDamage = ____kills.recordDamage
local ____leavers = require("game.leavers")
local leaversTick = ____leavers.leaversTick
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local currentLeaderId = ____state.currentLeaderId
local gameNow = ____state.gameNow
local pushNet = ____state.pushNet
local scoreRows = ____state.scoreRows
local toast = ____state.toast
local ____teams = require("game.teams")
local ALL_TEAMS = ____teams.ALL_TEAMS
local initTeamRules = ____teams.initTeamRules
local syncRealTeams = ____teams.syncRealTeams
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local safe = ____util.safe
function orderFilter(e)
    local selected = __TS__ObjectKeys(e.units)
    if #selected == 1 then
        local unit = EntIndexToHScript(e.units[selected[1]])
        if isValid(unit) and unit:GetPlayerOwnerID() == e.issuer_player_id_const then
            if unit:GetUnitName() == "npc_dota_hero_tusk" then
                local tusk = unit:FindModifierByName("modifier_orb_tusk")
                if tusk and not tusk:order(e) then
                    return false
                end
            elseif unit:GetUnitName() == "npc_dota_hero_pudge" and e.order_type == DOTA_UNIT_ORDER_MOVE_TO_POSITION then
                local pudge = unit:FindModifierByName("modifier_orb_pudge_legend")
                if pudge and not pudge:order(e) then
                    return false
                end
            end
        end
    end
    if e.order_type ~= DOTA_UNIT_ORDER_PICKUP_ITEM then
        return true
    end
    local phys = EntIndexToHScript(e.entindex_target)
    if not isValid(phys) then
        return true
    end
    local item = phys:GetContainedItem()
    if item == nil then
        return true
    end
    local name = item:GetAbilityName()
    if name ~= CHEST_ITEM and name ~= "item_bag_of_gold" then
        return true
    end
    for k in pairs(e.units) do
        local u = EntIndexToHScript(e.units[k])
        if isValid(u) and not u:IsRealHero() then
            return false
        end
    end
    return true
end
function forceHeroes()
    do
        local i = 0
        while i < 24 do
            do
                local id = i
                if not PlayerResource:IsValidPlayerID(id) or PlayerResource:IsFakeClient(id) then
                    goto __continue38
                end
                if PlayerResource:HasSelectedHero(id) then
                    goto __continue38
                end
                local player = PlayerResource:GetPlayer(id)
                if player == nil then
                    goto __continue38
                end
                player:MakeRandomHeroSelection()
                log("игрок", id, "не выбрал героя — случайный")
            end
            ::__continue38::
            i = i + 1
        end
    end
end
function startGame()
    State.phase = "game"
    State.started = true
    for ____, p in ipairs(allPlayers()) do
        local h = PlayerResource:GetSelectedHeroEntity(p.id)
        if isValid(h) then
            h:RemoveModifierByName("modifier_orb_pregame")
        end
    end
    makeTowersInvulnerable()
    logRuneSpawners()
    for ____, t in ipairs(ALL_TEAMS) do
        AddFOWViewer(
            t,
            Vector(0, 0, 0),
            CONFIG.centerVisionRadius,
            99999,
            false
        )
    end
    for ____, f in ipairs(Hooks.onGameStart) do
        safe("старт партии", f)
    end
    toast(
        "goal",
        "#orb_toast_start",
        tostring(State.goal)
    )
    pushNet()
    local tips = {
        {6, "#orb_tip_bars"},
        {15, "#orb_tip_slots"},
        {25, "#orb_tip_ring"},
        {TIMINGS.bossOrbFirst - 10, "#orb_tip_boss"},
        {TIMINGS.courierFirst - 25, "#orb_tip_courier"}
    }
    for ____, ____value in ipairs(tips) do
        local t = ____value[1]
        local text = ____value[2]
        Timers:after(
            t,
            "подсказка",
            function() return toast("tip", text) end
        )
    end
end
function makeTowersInvulnerable()
    local towers = Entities:FindAllByClassname("npc_dota_tower")
    for ____, t in ipairs(towers) do
        if isValid(t) then
            t:AddNewModifier(t, nil, "modifier_invulnerable", {})
        end
    end
end
function endGame(winnerId, reason)
    if State.phase == "ended" then
        return
    end
    State.phase = "ended"
    State.winner = winnerId
    local p = State.players:get(winnerId)
    log("победа:", winnerId, reason)
    toast(
        "goal",
        "#orb_toast_winner",
        PlayerResource:GetSelectedHeroName(winnerId),
        reason
    )
    safe(
        "итоги",
        function() return publishFinal(winnerId, reason) end
    )
    pushNet()
    if p ~= nil then
        GameRules:SetCustomVictoryMessage("#orb_victory_" .. reason)
        GameRules:SetGameWinner(p.team)
    end
end
function checkLastPlayer()
    if IsInToolsMode() then
        return
    end
    local active = __TS__ArrayFilter(
        allPlayers(),
        function(____, p) return not p.left end
    )
    if #active == 1 and lastPlayerTimer < 0 then
        local id = active[1].id
        lastPlayerTimer = Timers:after(
            CONFIG.lastPlayerWinDelay,
            "последний игрок",
            function()
                local still = __TS__ArrayFilter(
                    allPlayers(),
                    function(____, p) return not p.left end
                )
                if #still == 1 and still[1].id == id then
                    endGame(id, "lastPlayer")
                end
                lastPlayerTimer = -1
            end
        )
    end
end
function writeHeroList()
    log("пул героев:", #HERO_POOL)
end
local lastLeader = -1
lastPlayerTimer = -1
local function configureGameRules()
    local mode = GameRules:GetGameModeEntity()
    GameRules:SetHeroSelectionTime(CONFIG.heroSelectionTime)
    GameRules:SetHeroSelectPenaltyTime(0)
    GameRules:SetStrategyTime(0)
    GameRules:SetShowcaseTime(0)
    GameRules:SetPreGameTime(CONFIG.preGameTime)
    GameRules:SetPostGameTime(60)
    GameRules:SetHeroRespawnEnabled(true)
    GameRules:SetUseUniversalShopMode(true)
    GameRules:SetSameHeroSelectionEnabled(false)
    GameRules:SetGoldPerTick(0)
    GameRules:SetStartingGold(CONFIG.startGold)
    GameRules:SetCustomGameEndDelay(0)
    GameRules:SetCustomVictoryMessageDuration(10)
    GameRules:SetHideKillMessageHeaders(false)
    GameRules:SetUseBaseGoldBountyOnHeroes(false)
    mode:SetLoseGoldOnDeath(false)
    mode:SetBuybackEnabled(false)
    mode:SetTopBarTeamValuesOverride(true)
    mode:SetTopBarTeamValuesVisible(false)
    mode:SetFreeCourierModeEnabled(true)
    mode:SetUseTurboCouriers(true)
    mode:SetCanSellAnywhere(true)
    mode:SetAllowNeutralItemDrops(false)
    mode:SetNeutralStashEnabled(false)
    mode:SetBotThinkingEnabled(false)
    mode:SetGiveFreeTPOnDeath(false)
    mode:SetFountainPercentageHealthRegen(4)
    mode:SetFountainPercentageManaRegen(4)
    mode:SetRuneEnabled(DOTA_RUNE_BOUNTY, false)
    mode:SetRuneEnabled(DOTA_RUNE_WATER, false)
    mode:SetRuneEnabled(DOTA_RUNE_XP, false)
    mode:SetDaynightCycleDisabled(false)
    mode:SetAnnouncerDisabled(false)
    mode:SetModifyGoldFilter(
        function(____, e)
            local ____safe_result_0 = safe(
                "фильтр золота",
                function() return goldFilter(e) end
            )
            if ____safe_result_0 == nil then
                ____safe_result_0 = true
            end
            return ____safe_result_0
        end,
        {}
    )
    mode:SetModifyExperienceFilter(
        function(____, e)
            local ____safe_result_1 = safe(
                "фильтр опыта",
                function() return xpFilter(e) end
            )
            if ____safe_result_1 == nil then
                ____safe_result_1 = true
            end
            return ____safe_result_1
        end,
        {}
    )
    mode:SetBountyRunePickupFilter(
        function(____, e)
            local r = safe(
                "руна богатства",
                function() return bountyRuneFilter(e) end
            )
            return r ~= false
        end,
        {}
    )
    mode:SetDamageFilter(
        function(____, e)
            safe(
                "месть",
                function() return revengeDamage(e) end
            )
            safe(
                "учет урона",
                function() return recordDamage(e) end
            )
            return true
        end,
        {}
    )
    mode:SetExecuteOrderFilter(
        function(____, e)
            local ____safe_result_2 = safe(
                "фильтр приказов",
                function() return orderFilter(e) end
            )
            if ____safe_result_2 == nil then
                ____safe_result_2 = true
            end
            return ____safe_result_2
        end,
        {}
    )
    mode:SetItemAddedToInventoryFilter(
        function(____, e)
            local ____safe_result_3 = safe(
                "фильтр предметов",
                function() return slotsItemFilter(e) end
            )
            if ____safe_result_3 == nil then
                ____safe_result_3 = true
            end
            return ____safe_result_3
        end,
        {}
    )
end
local function onStateChange()
    local s = GameRules:State_Get()
    log("состояние игры:", s)
    if s == DOTA_GAMERULES_STATE_CUSTOM_GAME_SETUP then
        safe("самопроверка", modifierSelfTest)
        beginSetup()
    elseif s == DOTA_GAMERULES_STATE_HERO_SELECTION then
        if not State.setupDone then
            finishSetup()
        end
    elseif s == DOTA_GAMERULES_STATE_STRATEGY_TIME then
        forceHeroes()
    elseif s == DOTA_GAMERULES_STATE_PRE_GAME then
        forceHeroes()
        State.phase = "pregame"
        syncRealTeams()
        spawnReservedBots()
        pushNet()
    elseif s == DOTA_GAMERULES_STATE_GAME_IN_PROGRESS then
        startGame()
    end
end
local function onNpcSpawned(e)
    local unit = EntIndexToHScript(e.entindex)
    if not isValid(unit) or not unit:IsRealHero() then
        return
    end
    local hero = unit
    local p = State.players:get(hero:GetPlayerOwnerID())
    if p == nil then
        return
    end
    Timers:after(
        0.05,
        "появление героя",
        function()
            if not isValid(hero) then
                return
            end
            if State.phase == "pregame" or GameRules:State_Get() < DOTA_GAMERULES_STATE_GAME_IN_PROGRESS then
                hero:AddNewModifier(hero, nil, "modifier_orb_pregame", {})
            end
            if p.left then
                hero:AddNewModifier(hero, nil, "modifier_orb_left", {})
            else
                local o = hero:GetAbsOrigin()
                hero:AddNewModifier(hero, nil, "modifier_orb_spawn_protection", {x = o.x, y = o.y, r = CONFIG.spawnProtectionRadius})
            end
            for ____, fn in ipairs(Hooks.onHeroSpawned) do
                safe(
                    "появление героя",
                    function() return fn(p, hero, e.is_respawn == 1) end
                )
            end
        end
    )
end
--- Каждые 0.5 с: победа, овертайм, смена лидера, сетевые таблицы.
local function mainTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        pushNet()
        return
    end
    local rows = scoreRows()
    local v = checkVictory(
        rows,
        State.goal,
        gameNow(),
        State.phase == "overtime",
        State.timeLimit
    )
    if v.kind == "winner" then
        endGame(v.id, v.reason)
        return
    end
    if v.kind == "overtime" and State.phase ~= "overtime" then
        State.phase = "overtime"
        toast("goal", "#orb_toast_overtime")
    end
    local leader = currentLeaderId()
    if leader ~= lastLeader then
        local old = lastLeader
        lastLeader = leader
        for ____, f in ipairs(Hooks.onLeaderChanged) do
            safe(
                "смена лидера",
                function() return f(leader, old) end
            )
        end
    end
    checkLastPlayer()
    pushNet()
end
____exports.Arena = {
    Init = function(self)
        log(
            "ORBTHROW загружается, сборка",
            BUILD_VERSION,
            "редактор:",
            IsInToolsMode()
        )
        resetExperience()
        initTeamRules()
        configureGameRules()
        writeHeroList()
        initCamps()
        initOrbs()
        initGoblin()
        initCatchup()
        initEndscreen()
        initLobby()
        initTestPanel()
        initFountain()
        resetItemsNet()
        initSlots()
        initNeutrals()
        initArenaEvents()
        ListenToGameEvent(
            "game_rules_state_change",
            function() return safe("смена состояния", onStateChange) end,
            nil
        )
        ListenToGameEvent(
            "npc_spawned",
            function(e) return safe(
                "появление",
                function() return onNpcSpawned(e) end
            ) end,
            nil
        )
        ListenToGameEvent(
            "entity_killed",
            function(e) return safe(
                "убийство",
                function() return onEntityKilled(e) end
            ) end,
            nil
        )
        ListenToGameEvent(
            "player_chat",
            function(e) return safe(
                "чат",
                function() return onPlayerChat(e) end
            ) end,
            nil
        )
        ListenToGameEvent(
            "dota_item_picked_up",
            function(e) return safe(
                "подбор предмета",
                function() return onItemPickedUp(e) end
            ) end,
            nil
        )
        ListenToGameEvent(
            "dota_rune_activated_server",
            function(e) return safe(
                "руна",
                function() return onRuneActivated(e) end
            ) end,
            nil
        )
        Timers:start()
        Timers:every(0.5, "главный цикл", mainTick, 1)
        Timers:every(1, "экономика", economyTick, 1)
        Timers:every(1, "монеты", coinTick, 1)
        Timers:every(1, "ливеры", leaversTick, 2)
        Timers:every(0.4, "боты", botsTick, 1)
        Timers:every(0.5, "лагеря", campsTick, 1)
        Timers:every(0.5, "руны", runesTick, 1)
        Timers:every(0.25, "сферы", orbsTick, 1)
        Timers:every(0.1, "сферы Повелителя", bossOrbsTick, 1)
        Timers:every(0.1, "курьер", courierTick, 1)
        Timers:every(0.5, "фонтан", fountainTick, 1)
        Timers:every(0.5, "нейтральные предметы", neutralsTick, 1)
        Timers:every(0.5, "слоты", slotsTick, 1)
        Timers:every(0.3, "Гоблин", goblinTick, 1)
        Timers:every(0.5, "отстающие", catchupTick, 1)
        Timers:every(0.5, "события арены", arenaEventsTick, 1)
    end,
    Reload = function(self)
        log("скрипты перезагружены")
    end
}
return ____exports
