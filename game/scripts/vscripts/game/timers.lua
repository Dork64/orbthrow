local ____lualib = require("lualib_bundle")
local Set = ____lualib.Set
local __TS__New = ____lualib.__TS__New
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local ____exports = {}
local ____util = require("game.util")
local safe = ____util.safe
local report = ____util.report
local timers = {}
local nextId = 1
local started = false
local running = __TS__New(Set)
local cancelledWhileRunning = __TS__New(Set)
local function tick()
    local now = GameRules:GetGameTime()
    local due = {}
    local rest = {}
    for ____, t in ipairs(timers) do
        local ____temp_0 = t.at <= now and due or rest
        ____temp_0[#____temp_0 + 1] = t
    end
    timers = rest
    running = __TS__New(
        Set,
        __TS__ArrayMap(
            due,
            function(____, t) return t.id end
        )
    )
    for ____, t in ipairs(due) do
        do
            if cancelledWhileRunning:has(t.id) then
                goto __continue6
            end
            local r = safe(t.name, t.fn)
            if cancelledWhileRunning:has(t.id) then
                goto __continue6
            end
            if type(r) == "number" then
                t.at = now + math.max(0.03, r)
                timers[#timers + 1] = t
            end
        end
        ::__continue6::
    end
    running = __TS__New(Set)
    cancelledWhileRunning:clear()
end
____exports.Timers = {
    start = function(self)
        if started then
            return
        end
        started = true
        GameRules:GetGameModeEntity():SetContextThink(
            "orbthrow_timers",
            function()
                local ok, err = pcall(tick)
                if not ok then
                    report("таймеры", err)
                end
                return 0.05
            end,
            0
        )
    end,
    after = function(self, delay, name, fn)
        local ____nextId_1 = nextId
        nextId = ____nextId_1 + 1
        local id = ____nextId_1
        timers[#timers + 1] = {
            id = id,
            at = GameRules:GetGameTime() + delay,
            name = name,
            fn = fn
        }
        return id
    end,
    every = function(self, interval, name, fn, firstDelay)
        if firstDelay == nil then
            firstDelay = interval
        end
        return ____exports.Timers:after(
            firstDelay,
            name,
            function()
                local ok, err = pcall(fn)
                if not ok then
                    report(name, err)
                end
                return interval
            end
        )
    end,
    cancel = function(self, id)
        timers = __TS__ArrayFilter(
            timers,
            function(____, t) return t.id ~= id end
        )
        if running:has(id) then
            cancelledWhileRunning:add(id)
        end
    end,
    count = function(self)
        return #timers
    end
}
return ____exports
