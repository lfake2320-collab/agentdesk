param(
  [string]$ProjectRoot = "",
  [string]$PublicBaseUrl = "",
  [string]$AllowedRoots = "",
  [string]$EdgeProfile = "Default",
  [int]$Port = 7676,
  [int]$BrowserDebugPort = 9222
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
Set-Location -Path $ProjectRoot

if (-not $AllowedRoots) {
  $workspaceRoot = Join-Path (Join-Path $HOME "Documents") "AgentDesk-Workspaces"
  New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null
  $AllowedRoots = @($ProjectRoot, $workspaceRoot) -join ","
}

if (-not (Test-Path "dist\cli.js")) {
  Write-Host "dist\cli.js not found. Building AgentDesk first..." -ForegroundColor Yellow
  npm run build
}

$edgeExe = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgeExe)) {
  $edgeExe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path $edgeExe)) {
  throw "Microsoft Edge executable not found. Set DEVSPACE_BROWSER_EXECUTABLE manually."
}

if (-not $PublicBaseUrl) {
  $PublicBaseUrl = "http://127.0.0.1:$Port"
  Write-Host "No public tunnel URL provided. Local MCP URL will be http://127.0.0.1:$Port/mcp" -ForegroundColor Yellow
  Write-Host "For ChatGPT web, expose this with Cloudflare Tunnel/ngrok and rerun with -PublicBaseUrl https://agentdesk.example.com" -ForegroundColor Yellow
}

$env:PORT = "$Port"
$env:DEVSPACE_PUBLIC_BASE_URL = $PublicBaseUrl
$env:DEVSPACE_ALLOWED_ROOTS = $AllowedRoots
$env:DEVSPACE_TOOL_MODE = "full"
$env:DEVSPACE_PERMISSION_PROFILE = "owner"
$env:DEVSPACE_SYSTEM_TOOLS = "1"
$env:DEVSPACE_PROCESS_CONTROL = "0"
$env:DEVSPACE_BROWSER_TOOLS = "1"
$env:DEVSPACE_BROWSER_MODE = "live"
$env:DEVSPACE_BROWSER_EXECUTABLE = $edgeExe
$env:DEVSPACE_BROWSER_USER_DATA_DIR = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"
$env:DEVSPACE_BROWSER_PROFILE_DIRECTORY = $EdgeProfile
$env:DEVSPACE_BROWSER_DEBUG_PORT = "$BrowserDebugPort"
$env:DEVSPACE_BROWSER_ATTACH_ONLY = "0"
$env:DEVSPACE_PLUGINS = "1"
$env:DEVSPACE_PLUGIN_PATHS = Join-Path $ProjectRoot "examples\plugins"
$env:DEVSPACE_SKILL_PATHS = Join-Path $ProjectRoot "examples\skills"

Write-Host "Starting AgentDesk live Edge mode..." -ForegroundColor Green
Write-Host "MCP URL: $PublicBaseUrl/mcp" -ForegroundColor Cyan
Write-Host "Browser mode: live Edge profile $EdgeProfile" -ForegroundColor Cyan
Write-Host "Allowed roots: $AllowedRoots" -ForegroundColor Cyan
Write-Host "Process control: disabled" -ForegroundColor Cyan

node dist/cli.js serve
