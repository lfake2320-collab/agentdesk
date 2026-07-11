param(
  [string]$Token,
  [switch]$Generate,
  [switch]$NoRestart,
  [string]$ProjectRoot = "G:\devspace-copt-lab\devspace"
)

$ErrorActionPreference = "Stop"

$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-fixed-runtime"
$ConfigDir = Join-Path $RuntimeDir "config"
$AuthFile = Join-Path $ConfigDir "auth.json"
$LogDir = Join-Path $RuntimeDir "logs"
$ChangeLog = Join-Path $LogDir "agentdesk-token-changes.log"
$TaskName = "AgentDesk Fixed MCP"
$HealthUrl = "http://127.0.0.1:7875/healthz"

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function New-SecureOwnerToken {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $body = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  return "adsk-fixed-$body"
}

function Test-WeakToken([string]$Value) {
  if (-not $Value) { return "Token is empty." }
  if ($Value.Length -lt 32) { return "Token must be at least 32 characters long." }
    
  $classes = 0
  if ($Value -cmatch "[A-Z]") { $classes++ }
  if ($Value -cmatch "[a-z]") { $classes++ }
  if ($Value -match "[0-9]") { $classes++ }
  if ($Value -match "[^A-Za-z0-9]") { $classes++ }
 
  return $null
}

function Wait-Health([string]$Url, [int]$Seconds = 45) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($resp.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Seconds 1
  }
  return $false
}

New-Item -ItemType Directory -Force -Path $ConfigDir, $LogDir | Out-Null

if ($Generate -or -not $Token) {
  $Token = New-SecureOwnerToken
}

$reason = Test-WeakToken $Token
if ($reason) {
  throw "Refusing to set weak AgentDesk owner token: $reason"
}

$auth = @{ ownerToken = $Token } | ConvertTo-Json -Depth 3
Write-Utf8NoBomFile -Path $AuthFile -Content $auth

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
$fingerprint = if ($Token.Length -ge 12) { $Token.Substring(0, 8) + "..." + $Token.Substring($Token.Length - 4) } else { "<short>" }
Add-Content -Path $ChangeLog -Value "[$timestamp] ownerToken changed, fingerprint=$fingerprint"

Write-Host "AgentDesk owner token updated." -ForegroundColor Green
Write-Host "Auth file: $AuthFile" -ForegroundColor Cyan
Write-Host "Token fingerprint: $fingerprint" -ForegroundColor Yellow

if ($NoRestart) {
  Write-Host "NoRestart was set. Restart AgentDesk Fixed MCP later for the token to take effect." -ForegroundColor Yellow
  return
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Scheduled task '$TaskName' was not found. Start AgentDesk manually or recreate the task." -ForegroundColor Yellow
  return
}

Write-Host "Restarting scheduled task: $TaskName" -ForegroundColor Cyan
try {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {}
Start-Sleep -Seconds 3
Start-ScheduledTask -TaskName $TaskName

if (Wait-Health -Url $HealthUrl -Seconds 60) {
  Write-Host "AgentDesk local health is OK: $HealthUrl" -ForegroundColor Green
} else {
  Write-Host "Token was updated, but AgentDesk health did not return within 60 seconds. Check fixed runtime logs." -ForegroundColor Yellow
}

Write-Host "Use this owner token in the GPT OAuth page:" -ForegroundColor Yellow
Write-Host $Token -ForegroundColor Cyan
