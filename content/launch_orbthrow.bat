@echo off
rem ORBTHROW: launch in Workshop Tools, log goes to game\dota\console.log
cd /d "E:\SteamLibrary\steamapps\common\dota 2 beta\game\bin\win64"
start "" dota2.exe -novid -tools -condebug -addon orbthrow +dota_launch_custom_game orbthrow forest_solo
