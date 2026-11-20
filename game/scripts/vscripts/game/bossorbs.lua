local ____lualib = require("lualib_bundle")
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArrayIndexOf = ____lualib.__TS__ArrayIndexOf
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__Iterator = ____lualib.__TS__Iterator
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local ____exports = {}
local boss, rng, landingPoint, teamsInGame, land, pushBossNet, groundZ, computeEdgePoint, spawnEdgeOrbs, ORB_MODELS, RING_PARTICLE, orbs, orbCounter, nextThrowAt, recentSectors, overthrowArmed, edgePoints, lastBossSig
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
local TIMINGS = ____config.TIMINGS
local ____center = require("core.center")
local bossOrbRarity = ____center.bossOrbRarity
local captureStep = ____center.captureStep
local overthrowStep = ____center.overthrowStep
local pickSector = ____center.pickSector
local ____rules = require("core.rules")
local leaderGap = ____rules.leaderGap
local ____orbs = require("game.orbs")
local captureSpeed = ____orbs.captureSpeed
local enqueue = ____orbs.enqueue
local ____mapinfo = require("core.mapinfo")
local MAP = ____mapinfo.MAP
local ____state = require("game.state")
local State = ____state.State
local activePlayers = ____state.activePlayers
local currentLeaderId = ____state.currentLeaderId
local gameNow = ____state.gameNow
local placesNow = ____state.placesNow
local scoreRows = ____state.scoreRows
local toast = ____state.toast
local ____timers = require("game.timers")
local Timers = ____timers.Timers
local ____util = require("game.util")
local isValid = ____util.isValid
local log = ____util.log
local safe = ____util.safe
function boss()
    local b = Entities:FindByName(nil, "@overboss")
    return isValid(b) and b or nil
end
function rng(n)
    return RandomInt(0, n - 1)
end
function landingPoint(keep)
    if keep == nil then
        keep = 2
    end
    local sector = pickSector(recentSectors, rng)
    recentSectors[#recentSectors + 1] = sector
    while #recentSectors > math.min(
        6,
        math.max(2, keep)
    ) do
        table.remove(recentSectors, 1)
    end
    do
        local i = 0
        while i < 25 do
            local a = (sector + RandomFloat(0.1, 0.9)) * (math.pi / 4)
            local r = RandomFloat(430, CONFIG.ringRadius - 120)
            local p = Vector(
                math.cos(a) * r,
                math.sin(a) * r,
                0
            )
            if GridNav:IsTraversable(p) and not GridNav:IsBlocked(p) then
                return GetGroundPosition(p, nil)
            end
            i = i + 1
        end
    end
    local a = (sector + 0.5) * (math.pi / 4)
    return GetGroundPosition(
        Vector(
            math.cos(a) * 600,
            math.sin(a) * 600,
            0
        ),
        nil
    )
end
function ____exports.throwBossOrb(rarity, quiet, keep, edgeTarget)
    if quiet == nil then
        quiet = false
    end
    if keep == nil then
        keep = 2
    end
    local b = boss()
    if b ~= nil and edgeTarget == nil then
        local anim = b:FindAbilityByName("dota_ability_throw_coin_long") or b:FindAbilityByName("dota_ability_throw_coin")
        if anim ~= nil then
            b:CastAbilityNoTarget(anim, -1)
        end
    end
    local target = edgeTarget or landingPoint(keep)
    local start = edgeTarget ~= nil and Vector(target.x, target.y, target.z + 900) or Vector(0, 0, target.z + 350)
    local unit = CreateUnitByName(
        "npc_orb_boss_sphere",
        start,
        false,
        nil,
        nil,
        DOTA_TEAM_NEUTRALS
    )
    orbCounter = orbCounter + 1
    local orb = {
        id = orbCounter,
        rarity = rarity,
        unit = isValid(unit) and unit or nil,
        pos = target,
        landed = false,
        bornAt = gameNow(),
        cap = {holder = -1, progress = 0, contested = false},
        edge = edgeTarget ~= nil
    }
    if orb.unit ~= nil then
        orb.unit:AddNewModifier(orb.unit, nil, "modifier_orb_sphere_unit", {})
        orb.unit:SetModel(ORB_MODELS[rarity])
        orb.unit:SetOriginalModel(ORB_MODELS[rarity])
    end
    orbs[#orbs + 1] = orb
    local t0 = GameRules:GetGameTime()
    local flight
    flight = Timers:every(
        0.03,
        "полет сферы",
        function()
            local t = math.min(
                1,
                (GameRules:GetGameTime() - t0) / 1
            )
            if orb.unit ~= nil and isValid(orb.unit) then
                local x = start.x + (target.x - start.x) * t
                local y = start.y + (target.y - start.y) * t
                local z = start.z + (target.z - start.z) * t + (orb.edge == true and 0 or math.sin(t * math.pi) * 300)
                orb.unit:SetAbsOrigin(Vector(x, y, z))
            end
            if t >= 1 then
                Timers:cancel(flight)
                land(orb)
            end
        end
    )
    local pinger = b or orb.unit
    if pinger ~= nil and edgeTarget == nil then
        for ____, team in ipairs(teamsInGame()) do
            MinimapEvent(
                team,
                pinger,
                target.x,
                target.y,
                DOTA_MINIMAP_EVENT_HINT_LOCATION,
                3
            )
        end
    end
    if not quiet then
        toast("event", rarity == "purple" and "#orb_toast_boss_purple" or "#orb_toast_boss_blue")
    end
    log(
        "сфера Повелителя:",
        rarity,
        math.floor(target.x),
        math.floor(target.y)
    )
end
function teamsInGame()
    return __TS__ArrayMap(
        activePlayers(),
        function(____, p) return p.team end
    )
end
function land(orb)
    orb.landed = true
    if orb.unit ~= nil and isValid(orb.unit) then
        FindClearSpaceForUnit(orb.unit, orb.pos, false)
        orb.pos = orb.unit:GetAbsOrigin()
    end
    local fx = ParticleManager:CreateParticle(RING_PARTICLE, PATTACH_WORLDORIGIN, nil)
    ParticleManager:SetParticleControl(fx, 0, orb.pos)
    ParticleManager:SetParticleControl(
        fx,
        1,
        Vector(CONFIG.bossOrbCaptureRadius, 0, 0)
    )
    orb.ring = fx
    StartSoundEventFromPosition("General.Coins", orb.pos)
end
function pushBossNet()
    local list = {}
    __TS__ArrayForEach(
        orbs,
        function(____, o, i)
            list[tostring(i + 1)] = {
                id = o.id,
                x = math.floor(o.pos.x),
                y = math.floor(o.pos.y),
                z = math.floor(o.pos.z),
                r = o.rarity,
                p = math.floor(o.cap.progress / CONFIG.bossOrbCaptureTime * 100) / 100,
                h = o.cap.holder,
                c = o.cap.contested and 1 or 0,
                l = o.landed and 1 or 0
            }
        end
    )
    local sig = (tostring(math.floor(nextThrowAt)) .. "a") .. tostring(overthrowArmed)
    for k in pairs(list) do
        local o = list[k]
        sig = sig .. (((((((((((((("|" .. tostring(o.id)) .. ":") .. tostring(o.x)) .. ":") .. tostring(o.y)) .. ":") .. tostring(o.z)) .. ":") .. tostring(o.p)) .. ":") .. tostring(o.h)) .. ":") .. tostring(o.c)) .. ":") .. tostring(o.l)
    end
    if sig == lastBossSig then
        return
    end
    lastBossSig = sig
    CustomNetTables:SetTableValue(
        "orb_game",
        "boss",
        {
            orbs = list,
            next = math.floor(nextThrowAt),
            armed = overthrowArmed
        }
    )
end
function groundZ(x, y)
    return GetGroundHeight(
        Vector(x, y, 0),
        nil
    )
end
function computeEdgePoint(baseIndex)
    local b = MAP.bases[baseIndex + 1] or MAP.bases[1]
    local ang = math.atan2(b.fountain.y, b.fountain.x)
    local function dir(r, da)
        if da == nil then
            da = 0
        end
        return Vector(
            math.cos(ang + da) * r,
            math.sin(ang + da) * r,
            0
        )
    end
    local top = groundZ(
        dir(CONFIG.ringRadius - 100).x,
        dir(CONFIG.ringRadius - 100).y
    )
    local edge = 1300
    do
        local r = CONFIG.ringRadius
        while r <= 3200 do
            local p = dir(r)
            if math.abs(groundZ(p.x, p.y) - top) > 48 then
                edge = r
                break
            end
            r = r + 25
        end
    end
    local want = math.min(
        2200,
        math.max(CONFIG.ringRadius + 150, edge - CONFIG.edgeOrbInset)
    )
    for ____, dr in ipairs({
        0,
        -60,
        -120,
        40,
        -180,
        -240
    }) do
        for ____, da in ipairs({
            0,
            0.06,
            -0.06,
            0.12,
            -0.12
        }) do
            local p = dir(want + dr, da)
            if GridNav:IsTraversable(p) and not GridNav:IsBlocked(p) and math.abs(groundZ(p.x, p.y) - top) <= 48 then
                return GetGroundPosition(p, nil)
            end
        end
    end
    return GetGroundPosition(
        dir(want),
        nil
    )
end
function ____exports.edgePointOf(baseIndex)
    local p = edgePoints:get(baseIndex)
    if p == nil then
        p = computeEdgePoint(baseIndex)
        edgePoints:set(baseIndex, p)
        log(
            "край возвышенности для базы",
            baseIndex,
            ":",
            math.floor(p.x),
            math.floor(p.y)
        )
    end
    return p
end
function spawnEdgeOrbs(now)
    local players = activePlayers()
    if #players == 0 then
        return
    end
    __TS__ArrayForEach(
        players,
        function(____, p, i)
            local point = ____exports.edgePointOf(p.baseIndex)
            for ____, o in ipairs(orbs) do
                if o.edge == true and (o.pos - point):Length2D() < 200 then
                    return
                end
            end
            local rarity = bossOrbRarity(
                now,
                RandomFloat(0, 1)
            )
            Timers:after(
                0.15 * i,
                "сфера у края",
                function() return ____exports.throwBossOrb(rarity, true, 2, point) end
            )
        end
    )
    toast("event", "#orb_toast_edge_orbs")
end
ORB_MODELS = {blue = "models/props_gameplay/rune_doubledamage01.vmdl", purple = "models/props_gameplay/rune_arcane.vmdl"}
RING_PARTICLE = "particles/ui_mouseactions/range_display.vpcf"
orbs = {}
orbCounter = 0
nextThrowAt = TIMINGS.bossOrbFirst
recentSectors = {}
overthrowArmed = -1
--- Дробная часть «сфер на бросок» (число сфер растет с числом игроков).
local throwCarry = 0
local nextEdgeAt = CONFIG.edgeOrbFirst
edgePoints = __TS__New(Map)
--- Сколько сфер Повелителя взял каждый игрок (для званий в итогах).
____exports.bossOrbsTaken = __TS__New(Map)
local function removeOrb(orb)
    if orb.ring ~= nil then
        ParticleManager:DestroyParticle(orb.ring, false)
        ParticleManager:ReleaseParticleIndex(orb.ring)
    end
    if orb.unit ~= nil and isValid(orb.unit) then
        UTIL_Remove(orb.unit)
    end
    local i = __TS__ArrayIndexOf(orbs, orb)
    if i >= 0 then
        __TS__ArraySplice(orbs, i, 1)
    end
end
--- Кто из настоящих героев стоит в круге захвата.
local function heroesInside(orb)
    local units = FindUnitsInRadius(
        DOTA_TEAM_NEUTRALS,
        orb.pos,
        nil,
        CONFIG.bossOrbCaptureRadius,
        DOTA_UNIT_TARGET_TEAM_BOTH,
        DOTA_UNIT_TARGET_HERO,
        bit.bor(
            bit.bor(DOTA_UNIT_TARGET_FLAG_INVULNERABLE, DOTA_UNIT_TARGET_FLAG_MAGIC_IMMUNE_ENEMIES),
            DOTA_UNIT_TARGET_FLAG_NOT_ILLUSIONS
        ),
        FIND_ANY_ORDER,
        false
    )
    local ids = {}
    for ____, unit in ipairs(units) do
        do
            local u = unit
            local real = u:IsRealHero()
            if not real or not u:IsAlive() or u:IsInvulnerable() or u:IsTempestDouble() or u:IsClone() then
                goto __continue28
            end
            local pid = u:GetPlayerOwnerID()
            local p = State.players:get(pid)
            if p == nil or p.left or __TS__ArrayIncludes(ids, pid) then
                goto __continue28
            end
            ids[#ids + 1] = pid
        end
        ::__continue28::
    end
    return ids
end
local function giveOrb(orb, pid, reason)
    enqueue(pid, orb.rarity, 1)
    ____exports.bossOrbsTaken:set(
        pid,
        (____exports.bossOrbsTaken:get(pid) or 0) + 1
    )
    local hero = PlayerResource:GetSelectedHeroName(pid)
    toast(
        "event",
        reason,
        hero,
        nil,
        nil,
        pid
    )
    local h = PlayerResource:GetSelectedHeroEntity(pid)
    if isValid(h) then
        EmitSoundOn("Rune.Arcane", h)
    end
    removeOrb(orb)
end
local function lastPlaceId()
    local places = placesNow()
    local worst = -1
    local worstPlace = -1
    for ____, ____value in __TS__Iterator(places) do
        local id = ____value[1]
        local place = ____value[2]
        if place > worstPlace then
            worst = id
            worstPlace = place
        end
    end
    return worst
end
local lastTick = -1
--- Каждые 0.1 с: броски по расписанию, захват, Свержение, сетевая таблица.
function ____exports.bossOrbsTick()
    if State.phase ~= "game" and State.phase ~= "overtime" then
        return
    end
    local now = gameNow()
    local dt = lastTick < 0 and 0 or math.max(
        0,
        math.min(0.5, now - lastTick)
    )
    lastTick = now
    if now >= nextThrowAt then
        nextThrowAt = now + TIMINGS.bossOrbEvery + RandomFloat(-TIMINGS.bossOrbJitter, TIMINGS.bossOrbJitter)
        throwCarry = throwCarry + math.max(
            1,
            #activePlayers()
        ) * CONFIG.bossOrbsPerPlayer
        local n = math.max(
            1,
            math.floor(throwCarry)
        )
        throwCarry = math.max(0, throwCarry - n)
        do
            local i = 0
            while i < n do
                local rarity = bossOrbRarity(
                    now,
                    RandomFloat(0, 1)
                )
                if i == 0 then
                    ____exports.throwBossOrb(rarity, false, n + 1)
                else
                    Timers:after(
                        0.7 * i,
                        "бросок сферы",
                        function() return ____exports.throwBossOrb(rarity, true, n + 1) end
                    )
                end
                i = i + 1
            end
        end
    end
    if now >= nextEdgeAt then
        nextEdgeAt = now + CONFIG.edgeOrbEvery
        spawnEdgeOrbs(now)
    end
    for ____, orb in ipairs(__TS__ArraySlice(orbs)) do
        do
            if not orb.landed then
                goto __continue46
            end
            local inside = heroesInside(orb)
            local k = #inside == 1 and captureSpeed(inside[1]) or 1
            if captureStep(orb.cap, inside, dt * k) then
                giveOrb(orb, orb.cap.holder, orb.rarity == "purple" and "#orb_toast_captured_purple" or "#orb_toast_captured_blue")
                goto __continue46
            end
            if now - orb.bornAt >= CONFIG.bossOrbMaxAge then
                local last = lastPlaceId()
                if last >= 0 then
                    giveOrb(orb, last, "#orb_toast_orb_to_last")
                else
                    removeOrb(orb)
                end
            end
        end
        ::__continue46::
    end
    local rows = __TS__ArrayFilter(
        scoreRows(),
        function(____, r) return not r.left end
    )
    if overthrowArmed >= 0 then
        local ap = State.players:get(overthrowArmed)
        if ap == nil or ap.left then
            overthrowArmed = -1
        end
    end
    local st = overthrowStep(
        overthrowArmed,
        currentLeaderId(),
        leaderGap(rows)
    )
    overthrowArmed = st.armed
    if st.fired then
        toast("goal", "#orb_toast_overthrow")
        do
            local i = 0
            while i < CONFIG.overthrowOrbs do
                Timers:after(
                    0.6 * i,
                    "свержение",
                    function() return ____exports.throwBossOrb("purple", true) end
                )
                i = i + 1
            end
        end
    end
    pushBossNet()
end
lastBossSig = ""
--- Лежащие сферы (для ботов).
function ____exports.landedBossOrbs()
    return __TS__ArrayMap(
        __TS__ArrayFilter(
            orbs,
            function(____, o) return o.landed end
        ),
        function(____, o) return o.pos end
    )
end
function ____exports.bossOrbCheat(rarity)
    safe(
        "чит сферы",
        function() return ____exports.throwBossOrb(rarity == "purple" and "purple" or "blue") end
    )
end
return ____exports
