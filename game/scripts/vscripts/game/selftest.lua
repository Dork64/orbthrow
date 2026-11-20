--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____links = require("lib.links")
local MODIFIER_NAMES = ____links.MODIFIER_NAMES
local modifierFile = ____links.modifierFile
local ____util = require("game.util")
local log = ____util.log
local report = ____util.report
local done = false
function ____exports.modifierSelfTest()
    if done then
        return
    end
    done = true
    local dummy = CreateUnitByName(
        "npc_dota_xp_granter",
        Vector(-6000, -6000, 0),
        false,
        nil,
        nil,
        DOTA_TEAM_NEUTRALS
    )
    if dummy == nil then
        report("самопроверка", "не удалось создать юнит для проверки модификаторов")
        return
    end
    local failed = {}
    local function tryAll(names)
        local bad = {}
        for ____, name in ipairs(names) do
            local m = dummy:AddNewModifier(dummy, nil, name, {duration = 0.5, amount = 1})
            if m == nil or not dummy:HasModifier(name) then
                bad[#bad + 1] = name
            else
                dummy:RemoveModifierByName(name)
            end
        end
        return bad
    end
    local bad = tryAll(MODIFIER_NAMES)
    if #bad > 0 then
        log(
            "самопроверка: не создались",
            table.concat(bad, ", "),
            "— пробую путь с .lua"
        )
        for ____, name in ipairs(bad) do
            LinkLuaModifier(
                name,
                modifierFile(name) .. ".lua",
                LUA_MODIFIER_MOTION_NONE
            )
        end
        bad = tryAll(bad)
    end
    for ____, n in ipairs(bad) do
        failed[#failed + 1] = n
    end
    UTIL_Remove(dummy)
    if #failed == 0 then
        log(("самопроверка: все модификаторы работают (" .. tostring(#MODIFIER_NAMES)) .. ")")
    else
        report(
            "самопроверка",
            "модификаторы не загрузились: " .. table.concat(failed, ", ")
        )
    end
end
return ____exports
