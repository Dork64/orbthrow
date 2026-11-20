local ____lualib = require("lualib_bundle")
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArraySlice = ____lualib.__TS__ArraySlice
local __TS__ArraySort = ____lualib.__TS__ArraySort
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local Map = ____lualib.Map
local __TS__New = ____lualib.__TS__New
local ____exports = {}
--- Двое последних по убийствам; при равенстве — у кого больше смертей. Нужно минимум 3 игрока.
function ____exports.lastTwo(rows)
    if #rows < 3 then
        return {}
    end
    local sorted = __TS__ArraySort(
        __TS__ArraySlice(rows),
        function(____, a, b)
            if a.kills ~= b.kills then
                return a.kills - b.kills
            end
            if a.deaths ~= b.deaths then
                return b.deaths - a.deaths
            end
            return a.id - b.id
        end
    )
    return {sorted[1].id, sorted[2].id}
end
____exports.COURIER_POOLS = __TS__ArrayMap(
    {
        {},
        {
            "falcon_blade",
            "orb_of_corrosion",
            "phase_boots",
            "power_treads",
            "arcane_boots",
            "tranquil_boots",
            "pavise",
            "urn_of_shadows",
            "soul_ring",
            "aghanims_shard"
        },
        {
            "vanguard",
            "veil_of_discord",
            "mask_of_madness",
            "dragon_lance",
            "lesser_crit",
            "kaya",
            "sange",
            "yasha",
            "glimmer_cape",
            "force_staff",
            "vladmir",
            "rod_of_atos",
            "aether_lens",
            "blink"
        },
        {
            "blade_mail",
            "armlet",
            "diffusal_blade",
            "echo_sabre",
            "spirit_vessel",
            "witch_blade",
            "basher",
            "maelstrom",
            "aeon_disk",
            "mage_slayer",
            "invis_sword",
            "orchid",
            "heavens_halberd",
            "solar_crest",
            "cyclone",
            "meteor_hammer"
        },
        {
            "desolator",
            "bfury",
            "black_king_bar",
            "kaya_and_sange",
            "sange_and_yasha",
            "yasha_and_kaya",
            "ultimate_scepter",
            "nullifier",
            "shivas_guard",
            "hurricane_pike",
            "gungir",
            "manta",
            "bloodstone",
            "radiance",
            "sphere",
            "lotus_orb"
        },
        {
            "monkey_king_bar",
            "refresher",
            "satanic",
            "octarine_core",
            "assault",
            "ethereal_blade",
            "greater_crit",
            "sheepstick",
            "heart",
            "butterfly",
            "mjollnir",
            "silver_edge",
            "skadi",
            "abyssal_blade",
            "bloodthorn"
        }
    },
    function(____, list) return __TS__ArrayMap(
        list,
        function(____, n) return "item_" .. n end
    ) end
)
--- Уровень пула по времени: 3-6 мин — 1, 6-10 — 2, 10-15 — 3, 15-21 — 4, дальше 5.
function ____exports.courierTierByTime(time)
    local m = time / 60
    if m < 6 then
        return 1
    end
    if m < 10 then
        return 2
    end
    if m < 15 then
        return 3
    end
    if m < 21 then
        return 4
    end
    return 5
end
--- Поправка по месту: единоличный лидер с отрывом 3+ — уровень ниже,
-- двое последних по убийствам — уровень выше. Пределы 1..5.
function ____exports.courierTierFor(time, playerId, rows)
    local tier = ____exports.courierTierByTime(time)
    local sorted = __TS__ArraySort(
        __TS__ArraySlice(rows),
        function(____, a, b) return b.kills - a.kills end
    )
    if #sorted >= 2 and sorted[1].id == playerId and sorted[1].kills - sorted[2].kills >= 3 then
        tier = tier - 1
    end
    if __TS__ArrayIncludes(
        ____exports.lastTwo(rows),
        playerId
    ) then
        tier = tier + 1
    end
    return math.max(
        1,
        math.min(5, tier)
    )
end
--- Предмет из пула без повтора того, что уже есть у героя. Если все есть — любой.
function ____exports.courierItem(tier, owned, rng)
    local pool = ____exports.COURIER_POOLS[math.max(
        1,
        math.min(5, tier)
    ) + 1]
    local fresh = __TS__ArrayFilter(
        pool,
        function(____, n) return not __TS__ArrayIncludes(owned, n) end
    )
    local from = #fresh > 0 and fresh or pool
    return from[rng(#from) + 1]
end
function ____exports.helpGold(minute)
    return 600 + 30 * minute
end
____exports.REVENGE_STEP = 0.1
____exports.REVENGE_MAX = 3
--- Множитель урона attacker → victim с учетом мести в обе стороны. rev[a][b] — месть a против b.
function ____exports.revengeMultiplier(rev, attacker, victim)
    local ____opt_0 = rev:get(attacker)
    local mine = ____opt_0 and ____opt_0:get(victim) or 0
    local ____opt_2 = rev:get(victim)
    local theirs = ____opt_2 and ____opt_2:get(attacker) or 0
    return (1 + ____exports.REVENGE_STEP * mine) * (1 - ____exports.REVENGE_STEP * theirs)
end
--- Убийство: у жертвы растет месть против убийцы, у убийцы сбрасывается месть против жертвы.
function ____exports.revengeOnKill(rev, killer, victim)
    local v = rev:get(victim) or __TS__New(Map)
    v:set(
        killer,
        math.min(
            ____exports.REVENGE_MAX,
            (v:get(killer) or 0) + 1
        )
    )
    rev:set(victim, v)
    local ____opt_4 = rev:get(killer)
    if ____opt_4 ~= nil then
        ____opt_4:delete(victim)
    end
end
____exports.HUNT_START_GAP = 4
____exports.HUNT_END_GAP = 2
--- Кто под охотой после шага (-1 — никто). leader — единоличный лидер или -1.
function ____exports.huntStep(hunted, leader, gap)
    if hunted >= 0 then
        if leader ~= hunted or gap <= ____exports.HUNT_END_GAP then
            return leader >= 0 and gap >= ____exports.HUNT_START_GAP and leader or -1
        end
        return hunted
    end
    return leader >= 0 and gap >= ____exports.HUNT_START_GAP and leader or -1
end
function ____exports.goblinHealth(minute)
    return 1200 + 150 * minute
end
return ____exports
