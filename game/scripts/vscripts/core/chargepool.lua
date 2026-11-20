--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
function ____exports.createChargePool(max, now, cooldownLeft)
    return {count = max - (cooldownLeft > 0 and 1 or 0), max = max, next = cooldownLeft > 0 and now + cooldownLeft or 0}
end
function ____exports.restoreCharges(pool, now, duration)
    if pool.next == 0 or pool.next > now then
        return
    end
    local restored = math.min(
        pool.max - pool.count,
        1 + math.floor((now - pool.next) / duration)
    )
    pool.count = pool.count + restored
    pool.next = pool.count >= pool.max and 0 or pool.next + restored * duration
end
function ____exports.resizeCharges(pool, max)
    pool.count = math.min(
        max,
        pool.count + math.max(0, max - pool.max)
    )
    pool.max = max
    if pool.count >= max then
        pool.next = 0
    end
end
function ____exports.spendCharge(pool, now, duration)
    ____exports.restoreCharges(pool, now, duration)
    if pool.count <= 0 then
        return false
    end
    pool.count = pool.count - 1
    if pool.next == 0 then
        pool.next = now + duration
    end
    return true
end
return ____exports
