local ____lualib = require("lualib_bundle")
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local ____exports = {}
local ____config = require("core.config")
local CONFIG = ____config.CONFIG
--- Редкость сферы по времени партии; roll — случайное число 0..1.
function ____exports.bossOrbRarity(time, roll)
    if time < CONFIG.bossOrbPurpleFrom then
        return "blue"
    end
    local chance = time < CONFIG.bossOrbPurpleLate and CONFIG.bossOrbPurpleChanceMid or CONFIG.bossOrbPurpleChanceLate
    return roll < chance and "purple" or "blue"
end
--- Шаг захвата.
-- - никого в круге: прогресс медленно падает;
-- - двое и больше: прогресс замирает;
-- - один: если захватывал другой — сначала откат его прогресса, потом свой рост.
-- Возвращает true, когда сфера захвачена.
function ____exports.captureStep(s, inside, dt, need)
    if need == nil then
        need = CONFIG.bossOrbCaptureTime
    end
    s.contested = #inside >= 2
    if #inside == 0 then
        s.progress = math.max(0, s.progress - CONFIG.bossOrbDecayPerSecond * dt)
        if s.progress == 0 then
            s.holder = -1
        end
        return false
    end
    if s.contested then
        return false
    end
    local pid = inside[1]
    if s.holder == -1 or s.holder == pid then
        s.holder = pid
        s.progress = s.progress + dt
        return s.progress >= need
    end
    s.progress = s.progress - dt
    if s.progress <= 0 then
        s.progress = 0
        s.holder = pid
    end
    return false
end
--- Сектор кольца (0..7) по углу точки.
function ____exports.sectorOf(x, y)
    local a = math.atan2(y, x)
    if a < 0 then
        a = a + math.pi * 2
    end
    return math.floor(a / (math.pi / 4)) % 8
end
--- Выбрать сектор, не совпадающий с двумя последними. rng(n) → 0..n-1.
function ____exports.pickSector(recent, rng)
    local free = {}
    do
        local i = 0
        while i < 8 do
            if not __TS__ArrayIncludes(recent, i) then
                free[#free + 1] = i
            end
            i = i + 1
        end
    end
    return free[rng(#free) + 1]
end
--- Свержение: лидер, который когда-то отрывался на 5+, потерял единоличное лидерство.
-- armed — кто «заряжен» (-1 — никто). Возвращает новое значение armed и сработало ли Свержение.
function ____exports.overthrowStep(armed, leader, gap)
    if armed >= 0 and leader ~= armed then
        return {armed = -1, fired = true}
    end
    if leader >= 0 and gap >= CONFIG.overthrowGap then
        return {armed = leader, fired = false}
    end
    return {armed = armed, fired = false}
end
return ____exports
