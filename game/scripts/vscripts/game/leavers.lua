local ____lualib = require("lualib_bundle")
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local ____exports = {}
local markReturned
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local ____rules = require("core.rules")
local goalAfterAbandon = ____rules.goalAfterAbandon
local ____hooks = require("game.hooks")
local Hooks = ____hooks.Hooks
local ____state = require("game.state")
local State = ____state.State
local allPlayers = ____state.allPlayers
local pushNet = ____state.pushNet
local toast = ____state.toast
local ____teams = require("game.teams")
local fountainOf = ____teams.fountainOf
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local safe = ____util.safe
function ____exports.markLeft(id)
    local p = State.players:get(id)
    if p == nil or p.left then
        return
    end
    p.left = true
    local leader = math.max(
        0,
        unpack(__TS__ArrayMap(
            __TS__ArrayFilter(
                allPlayers(),
                function(____, q) return not q.left end
            ),
            function(____, q) return q.kills end
        ))
    )
    State.goal = goalAfterAbandon(State.goal, leader)
    local h = PlayerResource:GetSelectedHeroEntity(id)
    if isValid(h) then
        if h:IsAlive() then
            FindClearSpaceForUnit(
                h,
                fountainOf(p.team),
                true
            )
            h:AddNewModifier(h, nil, "modifier_orb_left", {})
        end
    end
    log("игрок покинул партию:", id, "новый лимит", State.goal)
    toast(
        "info",
        "#orb_toast_left",
        PlayerResource:GetPlayerName(id),
        tostring(State.goal)
    )
    for ____, f in ipairs(Hooks.onPlayerLeft) do
        safe(
            "уход игрока",
            function() return f(p) end
        )
    end
    pushNet()
end
function markReturned(id)
    local p = State.players:get(id)
    if p == nil then
        return
    end
    p.left = false
    local h = PlayerResource:GetSelectedHeroEntity(id)
    if isValid(h) then
        h:RemoveModifierByName("modifier_orb_left")
    end
    toast(
        "info",
        "#orb_toast_returned",
        PlayerResource:GetPlayerName(id)
    )
    pushNet()
end
function ____exports.leaversTick()
    if State.phase == "ended" or State.phase == "setup" then
        return
    end
    for ____, p in ipairs(allPlayers()) do
        do
            if p.isBot then
                goto __continue4
            end
            local cs = PlayerResource:GetConnectionState(p.id)
            if cs == DOTA_CONNECTION_STATE_CONNECTED then
                p.disconnectedFor = 0
                if p.left then
                    markReturned(p.id)
                end
                goto __continue4
            end
            if cs == DOTA_CONNECTION_STATE_DISCONNECTED or cs == DOTA_CONNECTION_STATE_FAILED or cs == DOTA_CONNECTION_STATE_UNKNOWN then
                p.disconnectedFor = p.disconnectedFor + 1
            end
            if not p.left and (cs == DOTA_CONNECTION_STATE_ABANDONED or p.disconnectedFor >= CONFIG.abandonSeconds) then
                ____exports.markLeft(p.id)
            end
        end
        ::__continue4::
    end
end
return ____exports
