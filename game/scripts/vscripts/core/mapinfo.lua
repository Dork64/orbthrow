local ____lualib = require("lualib_bundle")
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local ____exports = {}
____exports.MAP = {
    center = {x = 0, y = 0},
    bounds = 5632,
    itemSpawns = {
        {x = 1664, y = 1664},
        {x = 2432, y = 0},
        {x = 1664, y = -1664},
        {x = 0, y = -2432},
        {x = -1664, y = -1664},
        {x = -2432, y = 0},
        {x = -1664, y = 1664},
        {x = 0, y = 2432}
    },
    runeSpots = {
        {x = -2432, y = -3264},
        {x = -3808, y = 1344},
        {x = 3776, y = 1088},
        {x = 128, y = 3904},
        {x = 2240, y = -3200}
    },
    bases = {
        {fountain = {x = 1696, y = 4800}, spawn = {x = 1544, y = 4396}, tower = {x = 1472, y = 4128}},
        {fountain = {x = 4193, y = 2886}, spawn = {x = 3833, y = 2649}, tower = {x = 3617, y = 2474}},
        {fountain = {x = 5089, y = -130}, spawn = {x = 4658, y = -110}, tower = {x = 4381, y = -124}},
        {fountain = {x = 4041, y = -3096}, spawn = {x = 3704, y = -2827}, tower = {x = 3471, y = -2676}},
        {fountain = {x = 1449, y = -4880}, spawn = {x = 1335, y = -4464}, tower = {x = 1236, y = -4205}},
        {fountain = {x = -1696, y = -4800}, spawn = {x = -1544, y = -4396}, tower = {x = -1472, y = -4128}},
        {fountain = {x = -4193, y = -2886}, spawn = {x = -3833, y = -2649}, tower = {x = -3617, y = -2474}},
        {fountain = {x = -5089, y = 130}, spawn = {x = -4658, y = 110}, tower = {x = -4381, y = 124}},
        {fountain = {x = -4041, y = 3096}, spawn = {x = -3704, y = 2827}, tower = {x = -3471, y = 2676}},
        {fountain = {x = -1449, y = 4880}, spawn = {x = -1335, y = 4464}, tower = {x = -1236, y = 4205}}
    },
    camps = {
        {type = "medium", x = 1454, y = 2681},
        {type = "small", x = 2752, y = 1315},
        {type = "medium", x = 3048, y = -563},
        {type = "small", x = 2170, y = -2284},
        {type = "medium", x = 393, y = -2974},
        {type = "small", x = -1525, y = -2813},
        {type = "medium", x = -2707, y = -1293},
        {type = "small", x = -3098, y = 572},
        {type = "medium", x = -2066, y = 2175},
        {type = "small", x = -393, y = 2974},
        {type = "large", x = 493, y = 2959},
        {type = "large", x = 2216, y = -783},
        {type = "large", x = -493, y = -2959},
        {type = "large", x = -2169, y = 766},
        {type = "ancient", x = 651, y = 1571},
        {type = "ancient", x = -670, y = -1617}
    }
}
--- Угол точки в градусах [0, 360).
function ____exports.angleOf(p)
    local a = math.atan2(p.y, p.x) * 180 / math.pi
    if a < 0 then
        a = a + 360
    end
    return a
end
--- Индекс ближайшей базы карты к точке.
function ____exports.nearestBase(p)
    local best = 0
    local bestD = 1000000000000000000
    __TS__ArrayForEach(
        ____exports.MAP.bases,
        function(____, b, i)
            local d = (b.fountain.x - p.x) ^ 2 + (b.fountain.y - p.y) ^ 2
            if d < bestD then
                bestD = d
                best = i
            end
        end
    )
    return best
end
return ____exports
