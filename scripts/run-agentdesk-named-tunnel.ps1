param(
  [string]$ProjectRoot = "",
  [string]$ConfigPath = "",
  [string]$TunnelName = "agentdesk"
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path

$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-fixed-runtime"
$LogDir = Join-Path $RuntimeDir "logs"
$SetupFile = Join-Path $RuntimeDir "setup.json"
$TunnelLog = Join-Path $LogDir "agentdesk-cloudflared.log"
$SupervisorLog = Join-Path $LogDir "agentdesk-cloudflared-supervisor.log"

New-Item -ItemType Directory -Force -Path $RuntimeDir, $LogDir | Out-Null

if (Test-Path $SetupFile) {
  try {
    $setup = Get-Content $SetupFile -Raw | ConvertFrom-Json
    if (-not $TunnelName -and $setup.tunnelName) { $TunnelName = [string]$setup.tunnelName }
    if ($setup.tunnelName) { $TunnelName = [string]$setup.tunnelName }
  } catch {
    Write-Warning "Ignoring invalid setup file: $SetupFile"
  }
}

if (-not $ConfigPath) {
  $ConfigPath = Join-Path $RuntimeDir "agentdesk-cloudflared.yml"
}
if (-not $TunnelName) {
  $TunnelName = "agentdesk"
}

$mutexCreated = $false
$mutexName = "Local\AgentDeskNamedTunnelSupervisor_" + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ProjectRoot)).TrimEnd("=").Replace("+", "-").Replace("/", "_"))
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$mutexCreated)
if (-not $mutexCreated) {
  return
}

Set-Location -Path $ProjectRoot

function Write-SupervisorLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $SupervisorLog -Value $line
}

if (-not (Test-Path $ConfigPath)) {
  throw "Cloudflare tunnel config not found: $ConfigPath"
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw "cloudflared was not found in PATH."
}

Write-Host "Starting AgentDesk named Cloudflare Tunnel supervisor..." -ForegroundColor Green
Write-Host "Project root: $ProjectRoot" -ForegroundColor Cyan
Write-Host "Config: $ConfigPath" -ForegroundColor Cyan
Write-Host "Tunnel: $TunnelName" -ForegroundColor Cyan
Write-Host "Log: $TunnelLog" -ForegroundColor Gray

while ($true) {
  Write-SupervisorLog "starting cloudflared tunnel run $TunnelName"
  $cmd = 'cloudflared --config "' + $ConfigPath + '" tunnel run ' + $TunnelName + ' >> "' + $TunnelLog + '" 2>&1'
  cmd.exe /d /c $cmd
  $exit = $LASTEXITCODE
  Write-SupervisorLog "cloudflared exited with code $exit; restarting in 5 seconds"
  Start-Sleep -Seconds 5
}
