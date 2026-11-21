--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____links = require("lib.links")
local linkModifiers = ____links.linkModifiers
local ____arena = require("game.arena")
local Arena = ____arena.Arena
local ____util = require("game.util")
local safe = ____util.safe
local ____camps = require("game.camps")
local ALL_NEUTRAL_NAMES = ____camps.ALL_NEUTRAL_NAMES
local ____precache_list = require("core.precache_list")
local PRECACHE_MODELS = ____precache_list.PRECACHE_MODELS
local PRECACHE_PARTICLES = ____precache_list.PRECACHE_PARTICLES
local PRECACHE_UNITS = ____precache_list.PRECACHE_UNITS
linkModifiers()
Precache = function(context)
    for ____, p in ipairs(PRECACHE_PARTICLES) do
        PrecacheResource("particle", p, context)
    end
    for ____, m in ipairs(PRECACHE_MODELS) do
        PrecacheResource("model", m, context)
    end
    PrecacheResource("soundfile", "soundevents/game_sounds_overthrow.vsndevts", context)
    for ____, h in ipairs({
        "ogre_magi",
        "zuus",
        "weaver",
        "vengefulspirit",
        "techies",
        "pudge"
    }) do
        PrecacheResource("soundfile", ("soundevents/game_sounds_heroes/game_sounds_" .. h) .. ".vsndevts", context)
    end
    for ____, n in ipairs(ALL_NEUTRAL_NAMES) do
        PrecacheUnitByNameSync(n, context)
    end
    for ____, n in ipairs(PRECACHE_UNITS) do
        PrecacheUnitByNameSync(n, context)
    end
    PrecacheUnitByNameSync("npc_dota_observer_wards", context)
    PrecacheUnitByNameSync("npc_dota_sentry_wards", context)
end
Activate = function()
    safe(
        "запуск",
        function() return Arena:Init() end
    )
end
_G.Precache = Precache
_G.Activate = Activate
if _G.ORBTHROW_LOADED == true then
    safe(
        "перезагрузка",
        function() return Arena:Reload() end
    )
end
_G.ORBTHROW_LOADED = true
return ____exports
