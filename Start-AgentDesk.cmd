@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem AgentDesk one-click owner mode requested by this machine owner.
rem Current filesystem drives detected: C:\, D:\, E:\, G:\
set "DEVSPACE_ALLOWED_ROOTS=C:\,D:\,E:\,G:\"
set "DEVSPACE_PERMISSION_PROFILE=owner"
set "DEVSPACE_SYSTEM_TOOLS=1"
set "DEVSPACE_PROCESS_CONTROL=1"
set "DEVSPACE_BROWSER_TOOLS=1"
set "DEVSPACE_BROWSER_MODE=live"
set "DEVSPACE_TOOL_MODE=full"
set "DEVSPACE_PLUGINS=1"
set "DEVSPACE_SKILLS=1"
set "DEVSPACE_PUBLIC_FILE_BROWSER=1"
set "DEVSPACE_PUBLIC_BASE_URL=https://agentdesk.husan.icu"

echo.
echo [AgentDesk] 小白一键启动中...
echo [AgentDesk] 已启动就打开控制台；没启动就自动安装、构建、注册后台任务并拉起。
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\agentdesk-one-click.ps1" -ProjectRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo [AgentDesk] 启动失败。请把上方报错发给 ChatGPT 继续修。
  pause
  exit /b 1
)

echo.
echo [AgentDesk] 完成。窗口可直接关闭。
pause
