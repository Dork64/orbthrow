@echo off
rem ORBTHROW: compile Panorama (layout, styles, scripts) into game folder for publishing
cd /d "E:\SteamLibrary\steamapps\common\dota 2 beta\game\bin\win64"
resourcecompiler.exe -r -i "E:\SteamLibrary\steamapps\common\dota 2 beta\content\dota_addons\orbthrow\panorama\*" > "E:\SteamLibrary\steamapps\common\dota 2 beta\content\dota_addons\orbthrow\_deploy\compile.log" 2>&1
echo done >> "E:\SteamLibrary\steamapps\common\dota 2 beta\content\dota_addons\orbthrow\_deploy\compile.log"
