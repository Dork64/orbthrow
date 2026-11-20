local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__ArraySplice = ____lualib.__TS__ArraySplice
local ____exports = {}
local ____modbase = require("lib.modbase")
local ModBase = ____modbase.ModBase
local ____registry = require("lib.registry")
local registerModifier = ____registry.registerModifier
____exports.ModifierOrbGoblin = __TS__Class()
local ModifierOrbGoblin = ____exports.ModifierOrbGoblin
ModifierOrbGoblin.name = "ModifierOrbGoblin"
__TS__ClassExtends(ModifierOrbGoblin, ModBase)
function ModifierOrbGoblin.prototype.____constructor(self, ...)
    ModBase.prototype.____constructor(self, ...)
    self.hits = {}
end
function ModifierOrbGoblin.prototype.IsHidden(self)
    return true
end
function ModifierOrbGoblin.prototype.IsPurgable(self)
    return false
end
function ModifierOrbGoblin.prototype.RemoveOnDeath(self)
    return false
end
function ModifierOrbGoblin.prototype.GetEffectName(self)
    return "particles/generic_gameplay/rune_bounty_owner.vpcf"
end
function ModifierOrbGoblin.prototype.GetEffectAttachType(self)
    return PATTACH_ABSORIGIN_FOLLOW
end
function ModifierOrbGoblin.prototype.CheckState(self)
    return {[MODIFIER_STATE_NO_UNIT_COLLISION] = true}
end
function ModifierOrbGoblin.prototype.OnCreated(self)
    self.hits = {}
    if IsServer() then
        self:StartIntervalThink(0.5)
    end
end
function ModifierOrbGoblin.prototype.DeclareFunctions(self)
    return {MODIFIER_EVENT_ON_TAKEDAMAGE}
end
function ModifierOrbGoblin.prototype.OnTakeDamage(self, e)
    if not IsServer() or e.unit ~= self:GetParent() then
        return
    end
    local a = e.attacker
    if a == nil then
        return
    end
    local pid = a:GetPlayerOwnerID()
    if pid < 0 then
        return
    end
    local ____self_hits_0 = self.hits
    ____self_hits_0[#____self_hits_0 + 1] = {
        pid = pid,
        time = GameRules:GetGameTime(),
        amount = e.damage
    }
    if #self.hits > 200 then
        __TS__ArraySplice(self.hits, 0, 100)
    end
end
function ModifierOrbGoblin.prototype.OnIntervalThink(self)
    local p = self:GetParent()
    if not p:IsAlive() then
        return
    end
    do
        local t = 2
        while t <= 13 do
            do
                if t == 4 or t == 5 then
                    goto __continue18
                end
                AddFOWViewer(
                    t,
                    p:GetAbsOrigin(),
                    350,
                    0.6,
                    false
                )
            end
            ::__continue18::
            t = t + 1
        end
    end
end
modifier_orb_goblin = registerModifier("modifier_orb_goblin", ____exports.ModifierOrbGoblin)
return ____exports
