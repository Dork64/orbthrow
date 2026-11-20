@echo off
rem ORBTHROW: open Dota 2 Workshop Tools (Asset Browser) for publishing, without starting a match
cd /d "E:\SteamLibrary\steamapps\common\dota 2 beta\game\bin\win64"
start "" dota2.exe -novid -tools -condebug -addon orbthrow
