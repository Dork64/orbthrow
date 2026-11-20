local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local __TS__Number = ____lualib.__TS__Number
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local ____exports = {}
local emitToPlayer
local ____neutrals = require("core.neutrals")
local makeNeutralOffer = ____neutrals.makeNeutralOffer
local nextCraft = ____neutrals.nextCraft
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____itemsnet = require("game.itemsnet")
local addItemsNetPart = ____itemsnet.addItemsNetPart
local markItemsDirty = ____itemsnet.markItemsDirty
local pushItemsNet = ____itemsnet.pushItemsNet
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local gameNow = ____state.gameNow
local toast = ____state.toast
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local safe = ____util.safe
function emitToPlayer(pid)
    local player = PlayerResource:GetPlayer(pid)
    if player ~= nil then
        EmitSoundOnClient("Item.PickUpRingShop", player)
    end
end
local AUTO_PICK = 60
local ACTIVE_SLOT = 16
local PASSIVE_SLOT = 17
--- Жетонов за лесного крипа; у древних — больше.
local TOKENS = {small = 1, medium = 1, large = 1, ancient = 2}
local players = __TS__New(Map)
local seqCounter = 0
local function np(pid)
    local p = players:get(pid)
    if p == nil then
        p = {tokens = 0, owned = 0, lastTrinket = ""}
        players:set(pid, p)
    end
    return p
end
local function netPart(pid)
    local p = np(pid)
    local now = math.max(
        0,
        gameNow()
    )
    local next = nextCraft(p.owned, now)
    local out = {nk = p.tokens, nn = next.cost, nx = next.tier, na = next.at}
    if p.open ~= nil then
        local o = p.open
        local tr = {}
        __TS__ArrayForEach(
            o.offer.trinkets,
            function(____, t, i)
                tr[tostring(i + 1)] = t
            end
        )
        local en = {}
        local levels = {}
        __TS__ArrayForEach(
            o.offer.enhancements,
            function(____, ____bindingPattern0, i)
                local level
                local name
                name = ____bindingPattern0[1]
                level = ____bindingPattern0[2]
                en[tostring(i + 1)] = name
                levels[name] = level
            end
        )
        out.no = {
            seq = o.seq,
            tier = o.offer.tier,
            tr = tr,
            en = en,
            levels = levels,
            pt = o.trinket,
            pe = o.enh,
            t = math.max(
                0,
                math.ceil(AUTO_PICK - (now - o.openedAt))
            )
        }
    end
    return out
end
--- Поставить предмет в нужную нейтральную ячейку.
local function placeIn(h, item, slot)
    if item == nil or not isValid(item) then
        return
    end
    local cur = item:GetItemSlot()
    if cur >= 0 and cur ~= slot then
        h:SwapItems(cur, slot)
    end
end
local function clearSlot(h, slot)
    local it = h:GetItemInSlot(slot)
    if it ~= nil and isValid(it) then
        h:RemoveItem(it)
        if isValid(it) then
            UTIL_Remove(it)
        end
    end
end
local function grant(pid)
    local p = np(pid)
    local o = p.open
    if o == nil or o.trinket == "" or o.enh == "" then
        return
    end
    p.open = nil
    p.owned = math.max(p.owned, o.offer.tier)
    p.lastTrinket = o.trinket
    local h = PlayerResource:GetSelectedHeroEntity(pid)
    if isValid(h) then
        clearSlot(h, ACTIVE_SLOT)
        clearSlot(h, PASSIVE_SLOT)
        local t = h:AddItemByName(o.trinket)
        placeIn(h, t, ACTIVE_SLOT)
        local e = h:AddItemByName(o.enh)
        if e ~= nil and isValid(e) and o.lv > 1 then
            e:SetLevel(o.lv)
        end
        placeIn(h, e, PASSIVE_SLOT)
        EmitSoundOn("Item.PickUpGemShop", h)
        toast(
            "event",
            "#orb_toast_neutral",
            h:GetUnitName(),
            o.trinket,
            tostring(o.offer.tier),
            pid
        )
    end
    log(
        "нейтральный предмет:",
        pid,
        o.trinket,
        o.enh,
        "тир",
        o.offer.tier
    )
    markItemsDirty(pid)
    pushItemsNet(pid)
end
--- Открыть выбор, если жетонов хватает и тир открыт.
local function tryOpen(pid)
    local p = np(pid)
    if p.open ~= nil then
        return
    end
    local now = math.max(
        0,
        gameNow()
    )
    local next = nextCraft(p.owned, now)
    if next.tier == 0 or next.at > now or p.tokens < next.cost then
        return
    end
    local h = PlayerResource:GetSelectedHeroEntity(pid)
    if not isValid(h) then
        return
    end
    p.tokens = p.tokens - next.cost
    local tier = next.tier
    local offer = makeNeutralOffer(
        tier,
        __TS__Number(h:GetPrimaryAttribute()),
        function(n) return RandomInt(0, n - 1) end
    )
    seqCounter = seqCounter + 1
    p.open = {
        seq = seqCounter,
        offer = offer,
        openedAt = now,
        trinket = "",
        enh = "",
        lv = 1
    }
    local ps = State.players:get(pid)
    if ps ~= nil and ps.isBot then
        p.open.trinket = offer.trinkets[1]
        p.open.enh = offer.enhancements[1][1]
        p.open.lv = offer.enhancements[1][2]
        grant(pid)
        return
    end
    emitToPlayer(pid)
    markItemsDirty(pid)
    pushItemsNet(pid)
end
local function onPick(pid, seq, kind, name)
    local p = np(pid)
    local o = p.open
    if o == nil or o.seq ~= seq then
        return
    end
    if kind == "trinket" and __TS__ArrayIncludes(o.offer.trinkets, name) then
        o.trinket = name
    end
    if kind == "enh" then
        for ____, e in ipairs(o.offer.enhancements) do
            if e[1] == name then
                o.enh = e[1]
                o.lv = e[2]
            end
        end
    end
    markItemsDirty(pid)
    if o.trinket ~= "" and o.enh ~= "" then
        grant(pid)
    else
        pushItemsNet(pid)
    end
end
--- Каждые 0.5 с: открыть выбор, автовыбор по таймеру, таблица.
function ____exports.neutralsTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    local now = gameNow()
    for ____, ps in ipairs(allPlayers()) do
        local p = np(ps.id)
        if p.open ~= nil and (now - p.open.openedAt >= AUTO_PICK or ps.left) then
            local o = p.open
            if o.trinket == "" then
                o.trinket = o.offer.trinkets[1]
            end
            if o.enh == "" then
                o.enh = o.offer.enhancements[1][1]
                o.lv = o.offer.enhancements[1][2]
            end
            grant(ps.id)
        end
        tryOpen(ps.id)
        markItemsDirty(ps.id)
    end
end
function ____exports.initNeutrals()
    addItemsNetPart(netPart)
    local ____Hooks_onCampCreepKilled_0 = Hooks.onCampCreepKilled
    ____Hooks_onCampCreepKilled_0[#____Hooks_onCampCreepKilled_0 + 1] = function(pid, campType)
        local p = np(pid)
        p.tokens = p.tokens + (TOKENS[campType] or 1)
        markItemsDirty(pid)
        tryOpen(pid)
    end
    CustomGameEventManager:RegisterListener(
        "orb_neutral_pick",
        function(_, e) return safe(
            "выбор нейтралки",
            function() return onPick(
                e.PlayerID,
                tonumber(e.seq) or -1,
                tostring(e.kind),
                tostring(e.name)
            ) end
        ) end
    )
end
--- Чит: жетоны.
function ____exports.neutralTokensCheat(pid, n)
    local ____np_result_1, ____tokens_2 = np(pid), "tokens"
    ____np_result_1[____tokens_2] = ____np_result_1[____tokens_2] + n
    markItemsDirty(pid)
    tryOpen(pid)
end
return ____exports
