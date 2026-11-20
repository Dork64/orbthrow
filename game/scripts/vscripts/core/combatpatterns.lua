local ____lualib = require("lualib_bundle")
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__Delete = ____lualib.__TS__Delete
local ____exports = {}
function ____exports.advanceCombo(state, allowed, need, within, cooldown, name, now)
    if now < state.readyAt or not __TS__ArrayIncludes(allowed, name) then
        return false
    end
    state.casts[name] = now
    local count = 0
    for ab in pairs(state.casts) do
        if now - state.casts[ab] <= within then
            count = count + 1
        else
            __TS__Delete(state.casts, ab)
        end
    end
    if count < need then
        return false
    end
    state.casts = {}
    state.readyAt = now + cooldown
    return true
end
function ____exports.insideRing(distance, inner, outer)
    return distance >= inner and distance <= outer
end
function ____exports.tetherBand(distance, inner, outer, breakRange)
    if distance > breakRange then
        return "broken"
    end
    return ____exports.insideRing(distance, inner, outer) and "active" or "outside"
end
--- Не даём сферам превратить Phase Shift в непрерывную неуязвимость.
function ____exports.boundedOrbCooldown(ability, reduction)
    return ability == "puck_phase_shift" and math.min(20, reduction) or reduction
end
return ____exports
