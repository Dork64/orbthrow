@echo off
rem ORBTHROW: launch in the normal client (no -tools) to test like on Valve servers
cd /d "E:\SteamLibrary\steamapps\common\dota 2 beta\game\bin\win64"
start "" dota2.exe -novid -console -condebug -addon orbthrow +dota_launch_custom_game orbthrow forest_solo
