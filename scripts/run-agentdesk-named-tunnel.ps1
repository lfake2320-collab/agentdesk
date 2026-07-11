param(
  [string]$ConfigPath = "G:\devspace-copt-lab\devspace\.agentdesk-fixed-runtime\agentdesk-cloudflared.yml"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = "G:\devspace-copt-lab\devspace"
$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-fixed-runtime"
$LogDir = Join-Path $RuntimeDir "logs"
$TunnelLog = Join-Path $LogDir "agentdesk-cloudflared.log"
$SupervisorLog = Join-Path $LogDir "agentdesk-cloudflared-supervisor.log"

New-Item -ItemType Directory -Force -Path $RuntimeDir, $LogDir | Out-Null
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
Write-Host "Config: $ConfigPath" -ForegroundColor Cyan
Write-Host "Public hostname: https://agentdesk.husan.icu" -ForegroundColor Cyan
Write-Host "Origin service: http://127.0.0.1:7875" -ForegroundColor Cyan
Write-Host "Log: $TunnelLog" -ForegroundColor Gray

while ($true) {
  Write-SupervisorLog "starting cloudflared tunnel run agentdesk"
  $cmd = 'cloudflared --config "' + $ConfigPath + '" tunnel run agentdesk >> "' + $TunnelLog + '" 2>&1'
  cmd.exe /d /c $cmd
  $exit = $LASTEXITCODE
  Write-SupervisorLog "cloudflared exited with code $exit; restarting in 5 seconds"
  Start-Sleep -Seconds 5
}
