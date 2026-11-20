-- Дымовой тест: загрузить все скрипты сборки в LuaJIT с заглушками API Доты
-- и вызвать Precache/Activate. Ловит ошибки загрузки, require и опечатки верхнего уровня.
local root = arg[1]
package.path = root .. "/?.lua;" .. package.path

local calls = {}
local function proxy(name)
  local p = {}
  setmetatable(p, {
    __index = function(_, k) return proxy(name .. "." .. tostring(k)) end,
    __call = function(_, ...) calls[#calls + 1] = name; return proxy(name .. "()") end,
    __tostring = function() return "<" .. name .. ">" end,
    __concat = function(a, b) return tostring(a) .. tostring(b) end,
    __add = function() return 0 end, __sub = function() return 0 end,
    __mul = function() return 0 end, __div = function() return 0 end,
    __lt = function() return false end, __le = function() return false end,
    __unm = function() return 0 end,
  })
  return p
end

-- Константы, которые код использует как числа
local numeric = { "IsInToolsMode" }
setmetatable(_G, { __index = function(_, k)
  if type(k) == "string" and k:match("^[A-Z_]+$") then return 0 end -- перечисления
  return proxy(k)
end })
IsServer = function() return true end
IsInToolsMode = function() return true end
local linked = {}
LinkLuaModifier = function(name, path)
  linked[name] = path
  calls[#calls + 1] = "LinkLuaModifier " .. name .. " " .. path
end
print_orig = print

local ok, err = pcall(function()
  require("addon_game_mode")
end)
if not ok then print("ОШИБКА загрузки: " .. tostring(err)); os.exit(1) end
if type(Activate) ~= "function" or type(Precache) ~= "function" then print("ОШИБКА: нет Activate/Precache"); os.exit(1) end
for _, name in ipairs({ "modifier_orb_controller", "modifier_orb_ring", "modifier_orb_pregame", "modifier_orb_spawn_protection", "modifier_orb_left" }) do
  local path = assert(linked[name], "Нет LinkLuaModifier для " .. name)
  local chunk = assert(loadfile(root .. "/" .. path:gsub("%.lua$", "") .. ".lua"))
  local env = setmetatable({}, { __index = _G })
  setfenv(chunk, env)
  local loaded, err = pcall(chunk)
  if not loaded then print("ОШИБКА загрузки " .. path .. ": " .. tostring(err)); os.exit(1) end
  if type(rawget(env, name)) ~= "table" then print("ОШИБКА: " .. name .. " не виден в окружении своего файла"); os.exit(1) end
end
local ok3, e3 = pcall(Precache, proxy("context"))
if not ok3 then print("ОШИБКА Precache: " .. tostring(e3)); os.exit(1) end
local ok4, e4 = pcall(Activate)
if not ok4 then print("ОШИБКА Activate: " .. tostring(e4)); os.exit(1) end
print("дымовой тест пройден: вызовов API " .. #calls)
