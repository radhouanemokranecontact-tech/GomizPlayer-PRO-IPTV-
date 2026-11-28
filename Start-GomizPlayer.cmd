@echo off
setlocal
cd /d "%~dp0"

set "APPDIR=%~dp0"
if "%APPDIR:~-1%"=="\" set "APPDIR=%APPDIR:~0,-1%"

set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
  echo Electron is not installed yet. Running: npm install
  call npm.cmd install
)

if not exist "%ELECTRON%" (
  echo.
  echo Could not find Electron. Open a terminal in this folder and run:  npm.cmd install
  echo.
  pause
  exit /b 1
)

start "" "%ELECTRON%" "%APPDIR%" %*
exit /b 0
