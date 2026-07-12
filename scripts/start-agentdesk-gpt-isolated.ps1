param(
  [int]$Port = 7866,
  [int]$BrowserDebugPort = 9333,
  [string]$EdgeProfile = "Default",
  [string]$AllowedRoots = "",
  [switch]$NoTunnel
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not $AllowedRoots) {
  $workspaceRoot = Join-Path (Join-Path $HOME "Documents") "AgentDesk-Workspaces"
  New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null
  $AllowedRoots = @($ProjectRoot, $workspaceRoot) -join ","
}

$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-gpt-runtime"
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$TunnelLog = Join-Path $RuntimeDir "cloudflared-$Port-$RunId.log"
$AgentDeskLog = Join-Path $RuntimeDir "agentdesk-$Port-$RunId.log"
$UrlFile = Join-Path $RuntimeDir "mcp-url-$Port.txt"
$PidFile = Join-Path $RuntimeDir "agentdesk-$Port.pid"
$TunnelPidFile = Join-Path $RuntimeDir "cloudflared-$Port.pid"
$StateDir = Join-Path $RuntimeDir "state"
$ConfigDir = Join-Path $RuntimeDir "config"
$AuthFile = Join-Path $ConfigDir "auth.json"

New-Item -ItemType Directory -Force -Path $RuntimeDir, $StateDir, $ConfigDir | Out-Null
Set-Location -Path $ProjectRoot

function New-AgentDeskGptOwnerToken {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return "adsk-gpt-" + [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Write-JsonNoBom([string]$Path, [string]$Json) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Json, $utf8NoBom)
}

function Read-OwnerToken([string]$Path) {
  $raw = [System.IO.File]::ReadAllText($Path)
  $raw = $raw.TrimStart([char]0xFEFF)
  return ($raw | ConvertFrom-Json).ownerToken
}

if (-not (Test-Path $AuthFile)) {
  $token = New-AgentDeskGptOwnerToken
  $auth = @{ ownerToken = $token } | ConvertTo-Json -Depth 3
  Write-JsonNoBom -Path $AuthFile -Json $auth
} else {
  try {
    $token = Read-OwnerToken -Path $AuthFile
    $auth = @{ ownerToken = $token } | ConvertTo-Json -Depth 3
    Write-JsonNoBom -Path $AuthFile -Json $auth
  } catch {
    $token = New-AgentDeskGptOwnerToken
    $auth = @{ ownerToken = $token } | ConvertTo-Json -Depth 3
    Write-JsonNoBom -Path $AuthFile -Json $auth
  }
}

if (-not $token -or $token.Length -lt 16) {
  $token = New-AgentDeskGptOwnerToken
  $auth = @{ ownerToken = $token } | ConvertTo-Json -Depth 3
  Write-JsonNoBom -Path $AuthFile -Json $auth
}

if (-not (Test-Path "dist\cli.js")) {
  throw "dist\cli.js not found. Build AgentDesk first with npm run build. I will not build automatically to avoid disrupting any existing COPT line."
}

function Test-PortFree([int]$PortToCheck) {
  $line = netstat -ano | Select-String ":$PortToCheck" | Select-String "LISTENING"
  return -not $line
}

if (-not (Test-PortFree $Port)) {
  throw "Port $Port is already in use. This script will not kill existing processes. Rerun with another -Port, for example -Port 7867."
}

if (-not (Test-PortFree $BrowserDebugPort)) {
  throw "Browser debug port $BrowserDebugPort is already in use. This script will not kill existing browser/debug processes. Rerun with another -BrowserDebugPort, for example -BrowserDebugPort 9334."
}

$edgeExe = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgeExe)) {
  $edgeExe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path $edgeExe)) {
  throw "Microsoft Edge executable not found."
}

$PublicBaseUrl = "http://127.0.0.1:$Port"
$AllowedHosts = "localhost,127.0.0.1"
$TunnelProcess = $null

if (-not $NoTunnel) {
  if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    throw "cloudflared was not found. Install it or rerun with -NoTunnel for local-only mode."
  }

  $TunnelProcess = Start-Process -FilePath "cloudflared" `
    -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$Port", "--logfile", $TunnelLog, "--loglevel", "info") `
    -PassThru `
    -WindowStyle Minimized
  Set-Content -Path $TunnelPidFile -Value $TunnelProcess.Id

  Write-Host "Waiting for isolated Cloudflare quick tunnel on local port $Port..." -ForegroundColor Cyan
  $PublicBaseUrl = $null
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $TunnelLog) {
      $content = Get-Content $TunnelLog -Raw
      $match = [regex]::Match($content, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
      if ($match.Success) {
        $PublicBaseUrl = $match.Value
        break
      }
    }
  }
  if (-not $PublicBaseUrl) {
    throw "Cloudflare quick tunnel did not produce a trycloudflare URL. See $TunnelLog"
  }

  $TunnelHost = ([Uri]$PublicBaseUrl).Host
  $AllowedHosts = "localhost,127.0.0.1,$TunnelHost"
}

$envBlock = @{
  "PORT" = "$Port"
  "DEVSPACE_PUBLIC_BASE_URL" = $PublicBaseUrl
  "DEVSPACE_ALLOWED_HOSTS" = $AllowedHosts
  "DEVSPACE_ALLOWED_ROOTS" = $AllowedRoots
  "DEVSPACE_OAUTH_OWNER_TOKEN" = $token
  "DEVSPACE_TRUST_PROXY" = "1"
  "DEVSPACE_TOOL_MODE" = "full"
  "DEVSPACE_PERMISSION_PROFILE" = "owner"
  "DEVSPACE_SYSTEM_TOOLS" = "1"
  "DEVSPACE_PROCESS_CONTROL" = "0"
  "DEVSPACE_BROWSER_TOOLS" = "1"
  "DEVSPACE_BROWSER_MODE" = "live"
  "DEVSPACE_BROWSER_EXECUTABLE" = $edgeExe
  "DEVSPACE_BROWSER_USER_DATA_DIR" = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"
  "DEVSPACE_BROWSER_PROFILE_DIRECTORY" = $EdgeProfile
  "DEVSPACE_BROWSER_DEBUG_PORT" = "$BrowserDebugPort"
  "DEVSPACE_BROWSER_ATTACH_ONLY" = "0"
  "DEVSPACE_PLUGINS" = "1"
  "DEVSPACE_PLUGIN_PATHS" = "$ProjectRoot\examples\plugins"
  "DEVSPACE_SKILL_PATHS" = "$ProjectRoot\examples\skills"
  "DEVSPACE_STATE_DIR" = $StateDir
  "DEVSPACE_CONFIG_DIR" = $ConfigDir
}

$envScriptLines = @(
  '$ErrorActionPreference = "Stop"',
  "try {",
  "  Set-Location -Path '$ProjectRoot'"
)
foreach ($key in $envBlock.Keys) {
  $escaped = $envBlock[$key].Replace("'", "''")
  $envScriptLines += "  `$env:$key = '$escaped'"
}
$escapedAgentDeskLog = $AgentDeskLog.Replace("'", "''")
$envScriptLines += "  node dist/cli.js serve *>> '$escapedAgentDeskLog'"
$envScriptLines += "} catch {"
$envScriptLines += "  `$message = '[' + (Get-Date -Format o) + '] PowerShell startup error: ' + `$_.Exception.Message"
$envScriptLines += "  Add-Content -Path '$escapedAgentDeskLog' -Value `$message"
$envScriptLines += "  throw"
$envScriptLines += "}"
$StartScript = Join-Path $RuntimeDir "run-agentdesk.ps1"
Set-Content -Path $StartScript -Value ($envScriptLines -join [Environment]::NewLine)

$AgentDeskProcess = Start-Process powershell `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $StartScript) `
  -PassThru `
  -WindowStyle Minimized
Set-Content -Path $PidFile -Value $AgentDeskProcess.Id

Write-Host "Waiting for AgentDesk on http://127.0.0.1:$Port/healthz ..." -ForegroundColor Cyan
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/healthz" -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -eq 200) {
      $healthy = $true
      break
    }
  } catch {}
}

if (-not $healthy) {
  Write-Host "AgentDesk failed to become healthy. Log:" -ForegroundColor Red
  if (Test-Path $AgentDeskLog) { Get-Content $AgentDeskLog -Tail 80 }
  throw "AgentDesk did not become healthy on port $Port."
}

$McpUrl = "$PublicBaseUrl/mcp"
Set-Content -Path $UrlFile -Value $McpUrl

Write-Host "" 
Write-Host "AgentDesk GPT isolated line is ready." -ForegroundColor Green
Write-Host "This did not stop or reuse your existing COPT port 7676." -ForegroundColor Green
Write-Host "Local health: http://127.0.0.1:$Port/healthz" -ForegroundColor Cyan
Write-Host "Allowed hosts: $AllowedHosts" -ForegroundColor Cyan
Write-Host "GPT MCP URL: $McpUrl" -ForegroundColor Cyan
Write-Host "URL saved to: $UrlFile" -ForegroundColor Gray
Write-Host "Owner password file: $AuthFile" -ForegroundColor Yellow
Write-Host "AgentDesk PID: $($AgentDeskProcess.Id)" -ForegroundColor Gray
if ($TunnelProcess) { Write-Host "Cloudflared PID: $($TunnelProcess.Id)" -ForegroundColor Gray }
Write-Host "" 
Write-Host "Next: paste this URL into GPT custom MCP server:" -ForegroundColor Yellow
Write-Host $McpUrl -ForegroundColor Cyan
