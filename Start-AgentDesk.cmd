@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [AgentDesk] Node.js was not found.
  echo Please install Node.js 22.19 or newer, then run this file again.
  echo Download: https://nodejs.org/
  echo.
  pause
  exit /b 1
)
node scripts\setup-wizard.mjs
pause
