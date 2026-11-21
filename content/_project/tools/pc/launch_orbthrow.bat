@echo off
setlocal
set "mode=-tools"
if /i "%~1"=="--online" set "mode=-console"

rem Installed at the addon root or in its _project\tools\pc folder.
set "dotaRoot=%~dp0..\..\.."
if exist "%dotaRoot%\game\bin\win64\dota2.exe" goto launch
set "dotaRoot=%~dp0..\..\..\..\..\.."
if exist "%dotaRoot%\game\bin\win64\dota2.exe" goto launch

rem When run from the repository, use the install location registered by Steam.
for %%V in (64 32) do (
    for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 570" /v InstallLocation /reg:%%V 2^>nul') do (
        if exist "%%B\game\bin\win64\dota2.exe" (
            set "dotaRoot=%%B"
            goto launch
        )
    )
)
echo Dota 2 installation not found.
pause
exit /b 1

:launch
cd /d "%dotaRoot%\game\bin\win64" || exit /b 1
start "" dota2.exe -novid %mode% -condebug -addon orbthrow +dota_launch_custom_game orbthrow forest_solo
exit /b %errorlevel%
