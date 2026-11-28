local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local __TS__ArrayUnshift = ____lualib.__TS__ArrayUnshift
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__StringStartsWith = ____lualib.__TS__StringStartsWith
local __TS__ArraySome = ____lualib.__TS__ArraySome
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__Number = ____lualib.__TS__Number
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ObjectAssign = ____lualib.__TS__ObjectAssign
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local __TS__ArrayFind = ____lualib.__TS__ArrayFind
local ____exports = {}
local rng, heroNameOf, heroOf, openNext, legendSlotsOf, pushCatalog, fmt, unitText, cardValues, pushPlayer, players
local ____orbs = require("core.orbs")
local ORB = ____orbs.ORB
local addBarPoints = ____orbs.addBarPoints
local assistPurplePoints = ____orbs.assistPurplePoints
local blueDef = ____orbs.blueDef
local blueNeed = ____orbs.blueNeed
local candidates = ____orbs.candidates
local heroUpgrades = ____orbs.heroUpgrades
local diminishing = ____orbs.diminishing
local greyDef = ____orbs.greyDef
local greyRate = ____orbs.greyRate
local upDef = ____orbs.upDef
local killPurplePoints = ____orbs.killPurplePoints
local makeOffer = ____orbs.makeOffer
local maxStacks = ____orbs.maxStacks
local purpleNeed = ____orbs.purpleNeed
local rerollCost = ____orbs.rerollCost
local ____orbstore = require("core.orbstore")
local computeBonuses = ____orbstore.computeBonuses
local greyValue = ____orbstore.greyValue
local overrideValue = ____orbstore.overrideValue
local setBonuses = ____orbstore.setBonuses
local ____camps = require("game.camps")
local campOfUnit = ____camps.campOfUnit
local ____orbicons = require("core.orbicons")
local orbIcon = ____orbicons.orbIcon
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____state = require("game.state")
local State = ____state.State
local activePlayers = ____state.activePlayers
local gameNow = ____state.gameNow
local inFight = ____state.inFight
local placesNow = ____state.placesNow
local toast = ____state.toast
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local safe = ____util.safe
function rng(n)
    return RandomInt(0, n - 1)
end
function ____exports.orbPlayer(pid)
    local op = players:get(pid)
    if op == nil then
        op = {
            pid = pid,
            grey = {points = 0, count = 0},
            blue = {points = 0, count = 0},
            purple = {points = 0, count = 0},
            queue = {},
            queueAt = {},
            seq = 0,
            stacks = {},
            order = {},
            freeRerolls = ORB.freeRerolls,
            paidRerolls = 0,
            randomBonusGiven = false,
            version = 1,
            primaryAttr = 0,
            disabled = {},
            dirty = true,
            lastPush = -100,
            legendQueued = false,
            legendsQueued = 0,
            rage = false,
            farmPoints = 0
        }
        players:set(pid, op)
    end
    return op
end
function heroNameOf(pid)
    return PlayerResource:GetSelectedHeroName(pid)
end
function heroOf(pid)
    local h = PlayerResource:GetSelectedHeroEntity(pid)
    return isValid(h) and h or nil
end
function ____exports.enqueue(pid, rarity, count)
    if count == nil then
        count = 1
    end
    local op = ____exports.orbPlayer(pid)
    do
        local i = 0
        while i < count do
            local ____op_queue_0 = op.queue
            ____op_queue_0[#____op_queue_0 + 1] = rarity
            local ____op_queueAt_1 = op.queueAt
            ____op_queueAt_1[#____op_queueAt_1 + 1] = gameNow()
            i = i + 1
        end
    end
    openNext(op)
    op.dirty = true
end
function openNext(op)
    local guard = 0
    while true do
        local ____temp_8 = op.offer == nil and #op.queue > 0
        if ____temp_8 then
            local ____guard_7 = guard
            guard = ____guard_7 + 1
            ____temp_8 = ____guard_7 < 20
        end
        if not ____temp_8 then
            break
        end
        do
            local asked = op.queue[1]
            local o = makeOffer(
                asked,
                heroNameOf(op.pid),
                op.stacks,
                rng,
                op.mainBranch,
                {},
                op.disabled,
                legendSlotsOf(op)
            )
            if o.kind == "gold" then
                table.remove(op.queue, 1)
                table.remove(op.queueAt, 1)
                PlayerResource:ModifyGold(op.pid, o.gold, true, DOTA_ModifyGold_Unspecified)
                local h = heroOf(op.pid)
                if h ~= nil then
                    SendOverheadEventMessage(
                        nil,
                        OVERHEAD_ALERT_GOLD,
                        h,
                        o.gold,
                        nil
                    )
                end
                goto __continue15
            end
            op.seq = op.seq + 1
            local queuedAt = op.queueAt[1] or gameNow()
            op.offer = {
                seq = op.seq,
                asked = asked,
                rarity = o.rarity,
                cards = o.cards,
                openedAt = math.min(
                    gameNow(),
                    queuedAt
                )
            }
        end
        ::__continue15::
    end
    op.dirty = true
end
function legendSlotsOf(_op)
    return gameNow() >= ORB.secondLegendTime and 2 or 1
end
function ____exports.addPurple(pid, pts)
    if pts <= 0 then
        return
    end
    local op = ____exports.orbPlayer(pid)
    local n = addBarPoints(op.purple, pts, purpleNeed)
    if n > 0 then
        ____exports.enqueue(pid, "purple", n)
    end
    op.dirty = true
end
function pushCatalog(op, hero)
    local cards = {}
    local rarities = {"legend", "purple", "blue", "grey"}
    local index = 0
    for ____, rarity in ipairs(rarities) do
        for ____, card in ipairs(candidates(
            rarity,
            hero,
            {},
            op.disabled,
            math.huge
        )) do
            local ____temp_14 = card.branch == "G"
            if not ____temp_14 then
                local ____opt_12 = upDef(card.id)
                ____temp_14 = (____opt_12 and ____opt_12.hero) == "*"
            end
            local common = ____temp_14
            local ____tostring_15 = tostring
            index = index + 1
            cards[____tostring_15(index)] = {
                id = card.id,
                br = common and "G" or card.branch,
                rr = rarity,
                ic = orbIcon(card.id),
                m = card.mech == true and 1 or nil
            }
        end
    end
    CustomNetTables:SetTableValue(
        "orb_catalog",
        tostring(op.pid),
        {hero = hero, cards = cards}
    )
end
function fmt(x)
    local r = math.floor(x * 10 + 0.5) / 10
    return r == math.floor(r) and tostring(math.floor(r)) or tostring(r)
end
function unitText(unit)
    if unit == "%" then
        return "%"
    end
    if unit == "s" then
        return "s"
    end
    return ""
end
function cardValues(op, id)
    local n = op.stacks[id] or 0
    local g = greyDef(id)
    if g ~= nil then
        local sign = id == "g_cdr" and "−" or "+"
        return {
            (sign .. fmt(greyValue(id, n))) .. unitText(g.unit),
            (sign .. fmt(greyValue(id, n + 1))) .. unitText(g.unit)
        }
    end
    local d = blueDef(id)
    if d == nil then
        return {"", ""}
    end
    local h = heroOf(op.pid)
    local ab = h and h:FindAbilityByName(d.ability)
    local lvl = ab ~= nil and math.max(
        1,
        ab:GetLevel()
    ) or 1
    if d.cd > 0 then
        local function cut(k)
            return diminishing(k, d.cd, ORB.blueCdCap)
        end
        return {
            ("−" .. fmt(cut(n))) .. "%",
            ("−" .. fmt(cut(n + 1))) .. "%"
        }
    end
    if d.code or #d.mods ~= 1 or d.rarity ~= "blue" then
        return {"", ""}
    end
    local m = d.mods[1]
    local base = ab ~= nil and ab:GetLevelSpecialValueNoOverride(m.key, lvl - 1) or m.base
    local current = computeBonuses(op.stacks, op.primaryAttr)
    local nextStacks = __TS__ObjectAssign({}, op.stacks, {[id] = n + 1})
    local next = computeBonuses(nextStacks, op.primaryAttr)
    local function value(bonuses)
        return fmt(overrideValue(bonuses, d.ability, m.key, base) or base) .. unitText(m.unit)
    end
    return {
        value(current),
        value(next)
    }
end
function pushPlayer(op, force)
    local now = gameNow()
    if not force and not op.dirty and now - op.lastPush < 1 then
        return
    end
    op.dirty = false
    op.lastPush = now
    local active = activePlayers()
    local places = placesNow()
    local q = {grey = 0, blue = 0, purple = 0, legend = 0}
    for ____, r in ipairs(op.queue) do
        q[r] = (q[r] or 0) + 1
    end
    local offer
    if op.offer ~= nil then
        local cards = {}
        __TS__ArrayForEach(
            op.offer.cards,
            function(____, c, i)
                local nowText, nextText = unpack(cardValues(op, c.id))
                cards[tostring(i + 1)] = {
                    id = c.id,
                    br = c.branch,
                    st = op.stacks[c.id] or 0,
                    mx = maxStacks(c.id),
                    now = nowText,
                    nx = nextText,
                    ic = orbIcon(c.id),
                    m = c.mech == true and 1 or 0,
                    rr = c.rarity
                }
            end
        )
        offer = {
            seq = op.offer.seq,
            r = op.offer.rarity,
            a = op.offer.asked,
            c = cards,
            t = math.max(
                0,
                math.ceil(ORB.autoPickSeconds - (now - op.offer.openedAt))
            ),
            test = op.offer.test and 1 or nil
        }
    end
    local net = {
        v = op.version,
        pa = op.primaryAttr,
        st = op.stacks,
        g = math.floor(op.grey.points),
        gn = ORB.greyNeed,
        gr = math.floor(greyRate(
            places:get(op.pid) or #active,
            math.max(1, #active)
        ) * 10) / 10,
        b = math.floor(op.blue.points * 10) / 10,
        bn = blueNeed(op.blue.count),
        p = op.purple.points,
        pn = purpleNeed(op.purple.count),
        q = q,
        fr = op.freeRerolls,
        cost = rerollCost(op.paidRerolls),
        o = offer,
        fi = inFight(op.pid) and 1 or 0
    }
    CustomNetTables:SetTableValue(
        "orb_spheres",
        tostring(op.pid),
        net
    )
end
local CONTROLLER = "modifier_orb_controller"
players = __TS__New(Map)
local lastTick = -1
--- В редакторе следующая легендарка доступна сразу и не заменяется сферой другой редкости.
function ____exports.offerTestLegend(pid)
    local op = ____exports.orbPlayer(pid)
    local cards = candidates(
        "legend",
        heroNameOf(pid),
        op.stacks,
        op.disabled,
        math.huge
    )
    if #cards == 0 then
        return false
    end
    local queued = __TS__ArrayIndexOf(op.queue, "legend")
    if queued >= 0 then
        __TS__ArraySplice(op.queue, queued, 1)
        __TS__ArraySplice(op.queueAt, queued, 1)
    end
    local now = gameNow()
    __TS__ArrayUnshift(op.queue, "legend")
    __TS__ArrayUnshift(op.queueAt, now)
    local ____op_2, ____seq_3 = op, "seq"
    local ____op_seq_4 = ____op_2[____seq_3] + 1
    ____op_2[____seq_3] = ____op_seq_4
    op.offer = {
        seq = ____op_seq_4,
        asked = "legend",
        rarity = "legend",
        cards = __TS__ArraySlice(cards, 0, ORB.legendCards),
        openedAt = now,
        test = true
    }
    local picked = #__TS__ArrayFilter(
        op.order,
        function(____, id)
            local ____opt_5 = upDef(id)
            return (____opt_5 and ____opt_5.rarity) == "legend"
        end
    )
    op.legendsQueued = math.max(op.legendsQueued, picked + 1)
    op.legendQueued = true
    pushPlayer(op, true)
    return true
end
function ____exports.resetTestOrbs(pid)
    local previous = ____exports.orbPlayer(pid)
    players:delete(pid)
    local op = ____exports.orbPlayer(pid)
    op.seq = previous.seq
    op.version = previous.version + 1
    setBonuses(pid, op.stacks, op.primaryAttr, op.version)
    pushPlayer(op, true)
end
--- Постоянный исполнитель геройских эффектов сфер.
local function ensureExtras(op, h)
    if h:GetUnitName() == "npc_dota_hero_tusk" and not h:HasModifier("modifier_orb_tusk") then
        h:AddNewModifier(h, nil, "modifier_orb_tusk", {})
    end
    if h:GetUnitName() == "npc_dota_hero_juggernaut" and not h:HasModifier("modifier_orb_jugg_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_jugg_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_pudge" and not h:HasModifier("modifier_orb_pudge_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_pudge_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_mirana" and not h:HasModifier("modifier_orb_mirana_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_mirana_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_earthshaker" and not h:HasModifier("modifier_orb_earthshaker_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_earthshaker_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_ogre_magi" and not h:HasModifier("modifier_orb_ogre_magi_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_ogre_magi_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_necrolyte" and not h:HasModifier("modifier_orb_necro_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_necro_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_sven" and not h:HasModifier("modifier_orb_sven_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_sven_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_lich" and not h:HasModifier("modifier_orb_lich_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_lich_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_snapfire" and not h:HasModifier("modifier_orb_snapfire_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_snapfire_legend", {})
    end
    if h:GetUnitName() == "npc_dota_hero_tidehunter" and not h:HasModifier("modifier_orb_tidehunter_legend") then
        h:AddNewModifier(h, nil, "modifier_orb_tidehunter_legend", {})
    end
    if not h:HasModifier("modifier_orb_hero") then
        h:AddNewModifier(h, nil, "modifier_orb_hero", {})
    end
end
local function applyCard(op, id)
    op.stacks[id] = (op.stacks[id] or 0) + 1
    local ____op_order_9 = op.order
    ____op_order_9[#____op_order_9 + 1] = id
    op.version = op.version + 1
    local d = upDef(id)
    if d ~= nil and d.rarity == "legend" and d.branch ~= "H" then
        op.mainBranch = d.branch
    end
    setBonuses(op.pid, op.stacks, op.primaryAttr, op.version)
    local h = heroOf(op.pid)
    if h ~= nil then
        if not h:HasModifier(CONTROLLER) then
            h:AddNewModifier(h, nil, CONTROLLER, {})
        end
        ensureExtras(op, h)
        h:CalculateStatBonus(true)
    end
end
local function checkLevels(op)
    local h = heroOf(op.pid)
    if h == nil then
        return
    end
    local lvl = h:GetLevel()
    local want = lvl >= ORB.legendLevel and legendSlotsOf(op) or 0
    if op.legendsQueued < want then
        op.legendsQueued = op.legendsQueued + 1
        op.legendQueued = true
        local at = op.offer ~= nil and 1 or 0
        __TS__ArraySplice(op.queue, at, 0, "legend")
        __TS__ArraySplice(
            op.queueAt,
            at,
            0,
            gameNow()
        )
        openNext(op)
        toast(
            "event",
            op.legendsQueued >= 2 and "#orb_toast_legend2" or "#orb_toast_legend",
            h:GetUnitName(),
            nil,
            nil,
            op.pid
        )
    end
    if lvl >= ORB.awakeningLevel and (op.stacks.awake or 0) == 0 then
        op.stacks.awake = 1
        op.version = op.version + 1
        setBonuses(op.pid, op.stacks, op.primaryAttr, op.version)
        h:CalculateStatBonus(true)
        toast(
            "event",
            "#orb_toast_awake",
            h:GetUnitName(),
            nil,
            nil,
            op.pid
        )
        op.dirty = true
    end
end
local function addFerocity(pid)
    local op = players:get(pid)
    if op == nil or (op.stacks.p_ferocity or 0) <= 0 then
        return
    end
    local h = heroOf(pid)
    if h == nil or not h:IsAlive() then
        return
    end
    local mod = h:FindModifierByName("modifier_orb_ferocity") or h:AddNewModifier(h, nil, "modifier_orb_ferocity", {})
    if mod ~= nil and mod:GetStackCount() < 5 * (op.stacks.p_ferocity or 1) then
        mod:IncrementStackCount()
    end
end
--- Кровавый пир (общая фиолетовая): за убийство и помощь — здоровье, мана и перезарядки.
local function bloodFeast(pid)
    local op = players:get(pid)
    local n = op ~= nil and (op.stacks.p_feast or 0) or 0
    if n <= 0 then
        return
    end
    local h = heroOf(pid)
    if h == nil or not h:IsAlive() then
        return
    end
    local share = math.min(0.75, 0.3 + 0.15 * (n - 1))
    h:Heal(
        h:GetMaxHealth() * share,
        nil
    )
    h:GiveMana(h:GetMaxMana() * share)
    do
        local i = 0
        while i < h:GetAbilityCount() do
            do
                local a = h:GetAbilityByIndex(i)
                if a == nil or a:GetAbilityType() == ABILITY_TYPE_ULTIMATE or __TS__StringStartsWith(
                    a:GetAbilityName(),
                    "orb_slot_"
                ) then
                    goto __continue47
                end
                local left = a:GetCooldownTimeRemaining()
                if left <= 0 then
                    goto __continue47
                end
                a:EndCooldown()
                a:StartCooldown(left * math.max(0.1, 1 - share - 0.2))
            end
            ::__continue47::
            i = i + 1
        end
    end
    EmitSoundOn("Hero_LifeStealer.Consume", h)
end
--- Чит -mech: все механики своего героя и общие фиолетовые-механики (проверка в редакторе и симуляторе).
function ____exports.grantMechanics(pid)
    local op = players:get(pid)
    local h = heroOf(pid)
    if op == nil or h == nil then
        return 0
    end
    local n = 0
    for ____, u in ipairs(heroUpgrades(h:GetUnitName())) do
        do
            if u.rarity ~= "purple" or u.mech ~= true or (op.stacks[u.id] or 0) > 0 then
                goto __continue52
            end
            applyCard(op, u.id)
            n = n + 1
        end
        ::__continue52::
    end
    for ____, id in ipairs({
        "p_grave",
        "p_feast",
        "p_meteor",
        "p_hunter",
        "p_martyr",
        "p_vanish"
    }) do
        do
            if (op.stacks[id] or 0) > 0 then
                goto __continue55
            end
            applyCard(op, id)
            n = n + 1
        end
        ::__continue55::
    end
    pushPlayer(op, true)
    return n
end
--- Последний залп (общая фиолетовая): при смерти — взрыв вокруг героя.
local function lastSalvo(pid)
    local op = players:get(pid)
    local n = op ~= nil and (op.stacks.p_martyr or 0) or 0
    if n <= 0 then
        return
    end
    local h = heroOf(pid)
    if h == nil or h:IsReincarnating() then
        return
    end
    local pos = h:GetAbsOrigin()
    local dmg = h:GetMaxHealth() * math.min(0.6, 0.2 + 0.1 * (n - 1))
    local fx = ParticleManager:CreateParticle("particles/units/heroes/hero_techies/techies_land_mine_explode.vpcf", PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(fx, 0, pos)
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(450, 450, 450)
    )
    ParticleManager:ReleaseParticleIndex(fx)
    StartSoundEventFromPosition("Hero_Techies.LandMine.Detonate", pos)
    local enemies = FindUnitsInRadius(
        h:GetTeamNumber(),
        pos,
        nil,
        450,
        DOTA_UNIT_TARGET_TEAM_ENEMY,
        DOTA_UNIT_TARGET_HERO + DOTA_UNIT_TARGET_BASIC,
        DOTA_UNIT_TARGET_FLAG_NONE,
        FIND_ANY_ORDER,
        false
    )
    for ____, u in ipairs(enemies) do
        if u:IsAlive() then
            ApplyDamage({victim = u, attacker = h, damage = dmg, damage_type = DAMAGE_TYPE_MAGICAL})
        end
    end
end
--- Множитель скорости захвата сфер и сундуков (Охотник за сокровищами).
function ____exports.captureSpeed(pid)
    local ____opt_10 = players:get(pid)
    local n = ____opt_10 and ____opt_10.stacks.p_hunter or 0
    return n > 0 and 1 + 0.75 * n or 1
end
--- Выбор карточки. Сервер проверяет номер предложения и карточку: двойной клик не дает две сферы.
function ____exports.pick(pid, seq, id)
    if State.phase == "ended" then
        return false
    end
    local op = players:get(pid)
    if op == nil or op.offer == nil then
        return false
    end
    if op.offer.seq ~= seq then
        return false
    end
    if not __TS__ArraySome(
        op.offer.cards,
        function(____, c) return c.id == id end
    ) then
        return false
    end
    applyCard(op, id)
    table.remove(op.queue, 1)
    table.remove(op.queueAt, 1)
    op.offer = nil
    openNext(op)
    pushPlayer(op, true)
    return true
end
function ____exports.reroll(pid, seq)
    if State.phase == "ended" then
        return "ended"
    end
    local op = players:get(pid)
    if op == nil or op.offer == nil or op.offer.seq ~= seq then
        return "stale"
    end
    if op.offer.rarity == "legend" then
        return "legend"
    end
    if op.freeRerolls > 0 then
        op.freeRerolls = op.freeRerolls - 1
    else
        local cost = rerollCost(op.paidRerolls)
        if PlayerResource:GetGold(op.pid) < cost then
            return "gold"
        end
        PlayerResource:SpendGold(op.pid, cost, DOTA_ModifyGold_Unspecified)
        op.paidRerolls = op.paidRerolls + 1
    end
    local old = op.offer
    local o = makeOffer(
        old.asked,
        heroNameOf(op.pid),
        op.stacks,
        rng,
        op.mainBranch,
        __TS__ArrayMap(
            old.cards,
            function(____, c) return c.id end
        ),
        op.disabled,
        legendSlotsOf(op)
    )
    if o.kind == "cards" then
        op.seq = op.seq + 1
        op.offer = {
            seq = op.seq,
            asked = old.asked,
            rarity = o.rarity,
            cards = o.cards,
            openedAt = old.openedAt
        }
    end
    pushPlayer(op, true)
    return nil
end
function ____exports.addBlue(pid, pts)
    if pts <= 0 then
        return
    end
    local op = ____exports.orbPlayer(pid)
    op.farmPoints = op.farmPoints + pts
    local n = addBarPoints(op.blue, pts, blueNeed)
    if n > 0 then
        ____exports.enqueue(pid, "blue", n)
    end
    op.dirty = true
end
function ____exports.addPurpleRage(pid)
    ____exports.orbPlayer(pid).rage = true
end
--- Очки боя с учетом «Ярости».
local function addFightPoints(pid, pts)
    local op = ____exports.orbPlayer(pid)
    if op.rage then
        op.rage = false
        pts = pts + 3
    end
    ____exports.addPurple(pid, pts)
end
local function onUnitKilled(e)
    local camp = campOfUnit:get(e.entindex_killed)
    if camp == nil then
        return
    end
    local killed = EntIndexToHScript(e.entindex_killed)
    if killed == nil or __TS__ArrayIndexOf(camp.units, killed) < 0 then
        return
    end
    campOfUnit:delete(e.entindex_killed)
    if e.entindex_attacker == nil then
        return
    end
    local attacker = EntIndexToHScript(e.entindex_attacker)
    if not isValid(attacker) then
        return
    end
    local pid = attacker:GetPlayerOwnerID()
    if pid < 0 or not State.players:has(pid) then
        return
    end
    local size = math.max(1, #camp.ids)
    ____exports.addBlue(pid, (ORB.campPoints[camp.type] or 0) / size)
    for ____, f in ipairs(Hooks.onCampCreepKilled) do
        safe(
            "лесной крип",
            function() return f(pid, camp.type) end
        )
    end
end
local function onHeroSpawned(p, hero)
    local op = ____exports.orbPlayer(p.id)
    op.primaryAttr = __TS__Number(hero:GetPrimaryAttribute())
    if not op.randomBonusGiven and PlayerResource:HasRandomed(p.id) then
        op.randomBonusGiven = true
        op.freeRerolls = op.freeRerolls + 1
    end
    for ____, d in ipairs(heroUpgrades(hero:GetUnitName())) do
        do
            if d.code or d.ability == "" then
                goto __continue100
            end
            if op.disabled[d.id] == nil then
                local ab = hero:FindAbilityByName(d.ability)
                op.disabled[d.id] = ab == nil
                if ab == nil then
                    log("сфера выключена: у героя нет способности", d.ability, d.id)
                end
            end
        end
        ::__continue100::
    end
    pushCatalog(
        op,
        hero:GetUnitName()
    )
    setBonuses(op.pid, op.stacks, op.primaryAttr, op.version)
    if not hero:HasModifier(CONTROLLER) then
        hero:AddNewModifier(hero, nil, CONTROLLER, {})
    end
    ensureExtras(op, hero)
    hero:CalculateStatBonus(true)
    openNext(op)
    pushPlayer(op, true)
end
--- Каждые 0.25 с: серая шкала, автовыбор, отправка таблиц.
function ____exports.orbsTick()
    local now = gameNow()
    local inGame = State.phase == "game" or State.phase == "overtime"
    local dt = lastTick < 0 and 0 or math.max(
        0,
        math.min(1, now - lastTick)
    )
    lastTick = now
    if inGame and now >= 0 then
        local active = activePlayers()
        local places = placesNow()
        for ____, p in ipairs(active) do
            local op = ____exports.orbPlayer(p.id)
            local rate = greyRate(
                places:get(p.id) or #active,
                #active
            )
            local n = addBarPoints(
                op.grey,
                rate * dt,
                function() return ORB.greyNeed end
            )
            if n > 0 then
                ____exports.enqueue(p.id, "grey", n)
            end
        end
    end
    for ____, ____value in __TS__Iterator(players) do
        local op = ____value[2]
        do
            local p = State.players:get(op.pid)
            if inGame then
                checkLevels(op)
            end
            if op.offer ~= nil and State.phase ~= "ended" then
                local timeout = now - op.offer.openedAt >= ORB.autoPickSeconds
                if timeout or p ~= nil and (p.left or p.isBot) then
                    ____exports.pick(op.pid, op.offer.seq, op.offer.cards[1].id)
                    goto __continue112
                end
            end
            if op.dirty or now - op.lastPush >= 1 then
                pushPlayer(op, false)
            end
        end
        ::__continue112::
    end
end
function ____exports.initOrbs()
    local ____Hooks_onHeroSpawned_18 = Hooks.onHeroSpawned
    ____Hooks_onHeroSpawned_18[#____Hooks_onHeroSpawned_18 + 1] = function(p, hero, respawn)
        if not respawn or not hero:HasModifier(CONTROLLER) then
            onHeroSpawned(p, hero)
        end
    end
    local ____Hooks_onHeroDeath_19 = Hooks.onHeroDeath
    ____Hooks_onHeroDeath_19[#____Hooks_onHeroDeath_19 + 1] = function(vp) return lastSalvo(vp.id) end
    local ____Hooks_onHeroKill_20 = Hooks.onHeroKill
    ____Hooks_onHeroKill_20[#____Hooks_onHeroKill_20 + 1] = function(k)
        addFightPoints(
            k.killer.id,
            killPurplePoints(k.victimKillsBefore, k.killerKillsBefore, k.victimWasHunted)
        )
        for ____, a in ipairs(k.assisters) do
            addFightPoints(
                a.id,
                assistPurplePoints(k.victimWasHunted)
            )
        end
        addFerocity(k.killer.id)
        for ____, a in ipairs(k.assisters) do
            addFerocity(a.id)
        end
        bloodFeast(k.killer.id)
        for ____, a in ipairs(k.assisters) do
            bloodFeast(a.id)
        end
    end
    local ____Hooks_onWealthRune_21 = Hooks.onWealthRune
    ____Hooks_onWealthRune_21[#____Hooks_onWealthRune_21 + 1] = function(p) return ____exports.addBlue(p.id, ORB.runePoints) end
    ListenToGameEvent(
        "entity_killed",
        function(e) return safe(
            "очки лагеря",
            function() return onUnitKilled(e) end
        ) end,
        nil
    )
    CustomGameEventManager:RegisterListener(
        "orb_pick",
        function(_, e)
            safe(
                "выбор сферы",
                function() return ____exports.pick(
                    e.PlayerID,
                    tonumber(e.seq) or -1,
                    tostring(e.id)
                ) end
            )
        end
    )
    CustomGameEventManager:RegisterListener(
        "orb_reroll",
        function(_, e)
            safe(
                "переброс сферы",
                function()
                    local err = ____exports.reroll(
                        e.PlayerID,
                        tonumber(e.seq) or -1
                    )
                    if err == "gold" then
                        local player = PlayerResource:GetPlayer(e.PlayerID)
                        if player ~= nil then
                            CustomGameEventManager:Send_ServerToPlayer(player, "orb_toast", {kind = "info", text = "#orb_reroll_no_gold"})
                        end
                    end
                end
            )
        end
    )
end
--- Для итогов: взятые улучшения по порядку и легендарка.
function ____exports.orbSummary(pid)
    local op = players:get(pid)
    if op == nil then
        return {order = {}, legend = "", farm = 0}
    end
    local legend = __TS__ArrayFind(
        op.order,
        function(____, id)
            local ____opt_22 = upDef(id)
            return (____opt_22 and ____opt_22.rarity) == "legend"
        end
    ) or ""
    return {
        order = __TS__ArraySlice(op.order),
        legend = legend,
        farm = math.floor(op.farmPoints)
    }
end
function ____exports.orbsDump(pid)
    local op = players:get(pid)
    if op == nil then
        return "нет данных"
    end
    local parts = {}
    for ____, id in ipairs(op.order) do
        parts[#parts + 1] = id
    end
    return (((((((((((("серая " .. tostring(math.floor(op.grey.points))) .. " синяя ") .. tostring(op.blue.points)) .. "/") .. tostring(blueNeed(op.blue.count))) .. " фиол. ") .. tostring(op.purple.points)) .. "/") .. tostring(purpleNeed(op.purple.count))) .. " очередь ") .. table.concat(op.queue, ",")) .. " взято: ") .. table.concat(parts, ",")
end
return ____exports
