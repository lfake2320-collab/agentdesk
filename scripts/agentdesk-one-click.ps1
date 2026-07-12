param(
  [string]$ProjectRoot = "",
  [switch]$NoPrompt
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-fixed-runtime"
$SetupFile = Join-Path $RuntimeDir "setup.json"
$InstallTasksScript = Join-Path $ProjectRoot "scripts\install-agentdesk-tasks.ps1"
$SetupWizardScript = Join-Path $ProjectRoot "scripts\setup-wizard.mjs"
$DistCli = Join-Path $ProjectRoot "dist\cli.js"
$NodeModules = Join-Path $ProjectRoot "node_modules"
$LogDir = Join-Path $RuntimeDir "logs"

function Say([string]$Text, [string]$Color = "Gray") {
  Write-Host $Text -ForegroundColor $Color
}

function Section([string]$Title) {
  Write-Host ""
  Write-Host ("==== " + $Title + " ====") -ForegroundColor Cyan
}

function Test-Command([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Split-List([string]$Value) {
  if (-not $Value) { return @() }
  return @($Value -split "`r?`n|," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Get-BoolEnv([string]$Name, [bool]$Default) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
  $text = $value.Trim().ToLowerInvariant()
  if ($text -in @("1", "true", "yes", "on")) { return $true }
  if ($text -in @("0", "false", "no", "off")) { return $false }
  return $Default
}

function Get-IntEnv([string]$Name, [int]$Default) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  $parsed = 0
  if ([int]::TryParse($value, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) { return $parsed }
  return $Default
}

function Test-WideRoot([string]$Root) {
  if (-not $Root) { return $false }
  $value = $Root.Trim()
  if ($value -match '^[A-Za-z]:[\\/]?$') { return $true }
  if ($value -eq "/") { return $true }
  return $false
}

function Write-JsonNoBom([string]$Path, [object]$Value) {
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $json = $Value | ConvertTo-Json -Depth 12
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $utf8)
}

function Ensure-DefaultSetup {
  if (Test-Path $SetupFile) { return }

  $workspaceRoot = Join-Path (Join-Path $HOME "Documents") "AgentDesk-Workspaces"
  New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null

  $roots = Split-List ([Environment]::GetEnvironmentVariable("DEVSPACE_ALLOWED_ROOTS"))
  if (-not $roots -or $roots.Count -eq 0) { $roots = @($ProjectRoot, $workspaceRoot) }
  $wide = $false
  foreach ($root in $roots) { if (Test-WideRoot $root) { $wide = $true } }

  $port = Get-IntEnv "PORT" 7875
  $publicBaseUrl = [Environment]::GetEnvironmentVariable("DEVSPACE_PUBLIC_BASE_URL")
  if ([string]::IsNullOrWhiteSpace($publicBaseUrl)) { $publicBaseUrl = "http://127.0.0.1:$port" }

  $setup = [ordered]@{
    port = $port
    publicBaseUrl = $publicBaseUrl.TrimEnd("/")
    permissionProfile = if ([Environment]::GetEnvironmentVariable("DEVSPACE_PERMISSION_PROFILE")) { [Environment]::GetEnvironmentVariable("DEVSPACE_PERMISSION_PROFILE") } else { "owner" }
    toolMode = if ([Environment]::GetEnvironmentVariable("DEVSPACE_TOOL_MODE")) { [Environment]::GetEnvironmentVariable("DEVSPACE_TOOL_MODE") } else { "full" }
    systemTools = Get-BoolEnv "DEVSPACE_SYSTEM_TOOLS" $true
    processControl = Get-BoolEnv "DEVSPACE_PROCESS_CONTROL" $true
    browserTools = Get-BoolEnv "DEVSPACE_BROWSER_TOOLS" $true
    browserMode = if ([Environment]::GetEnvironmentVariable("DEVSPACE_BROWSER_MODE")) { [Environment]::GetEnvironmentVariable("DEVSPACE_BROWSER_MODE") } else { "live" }
    browserDebugPort = Get-IntEnv "DEVSPACE_BROWSER_DEBUG_PORT" 9342
    edgeProfile = if ([Environment]::GetEnvironmentVariable("DEVSPACE_BROWSER_PROFILE_DIRECTORY")) { [Environment]::GetEnvironmentVariable("DEVSPACE_BROWSER_PROFILE_DIRECTORY") } else { "Default" }
    allowedRoots = $roots
    allowWideRoots = $wide
    enablePublicFileBrowser = Get-BoolEnv "DEVSPACE_PUBLIC_FILE_BROWSER" $false
    plugins = Get-BoolEnv "DEVSPACE_PLUGINS" $true
    skills = Get-BoolEnv "DEVSPACE_SKILLS" $true
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    createdBy = "agentdesk-one-click"
  }

  Write-JsonNoBom -Path $SetupFile -Value $setup
  Say "Default setup written: $SetupFile" "Green"
}

function Read-Setup {
  Ensure-DefaultSetup
  try {
    return Get-Content $SetupFile -Raw | ConvertFrom-Json
  } catch {
    throw "setup.json read failed: $($_.Exception.Message)"
  }
}

function Get-PortFromSetup($Setup) {
  $port = 7875
  try { $port = [int]$Setup.port } catch {}
  if ($port -lt 1 -or $port -gt 65535) { $port = 7875 }
  return $port
}

function Test-Health([int]$Port) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 3
    return $r.ok -eq $true
  } catch {
    return $false
  }
}

function Open-Url([string]$Url) {
  try { Start-Process $Url | Out-Null } catch { Say "Open manually: $Url" "Yellow" }
}

function Require-Node {
  Section "Check Node.js"
  if (-not (Test-Command "node")) {
    Say "Node.js was not found. AgentDesk needs Node.js 22.19 or newer." "Yellow"
    if ((-not $NoPrompt) -and (Test-Command "winget")) {
      $answer = Read-Host "Type Y to install Node.js LTS via winget, or press Enter to open the download page"
      if ($answer -match '^[Yy]') {
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        Say "After Node.js is installed, double-click the launcher again." "Green"
        exit 0
      }
    }
    Open-Url "https://nodejs.org/"
    throw "Node.js missing."
  }

  $raw = (& node --version).Trim().TrimStart("v")
  $version = [version]$raw
  Say "Node.js: v$version" "Green"
  if ($version -lt [version]"22.19.0") {
    Say "Node.js is older than 22.19. Upgrade is recommended." "Yellow"
  }

  if (-not (Test-Command "npm")) { throw "node exists but npm was not found." }
  Say ("npm: " + (& npm --version)) "Green"
}

function Ensure-Build {
  Section "Check dependencies and build"
  Push-Location $ProjectRoot
  try {
    if (-not (Test-Path $NodeModules)) {
      Say "node_modules missing. Running npm install." "Yellow"
      & npm install
      if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
    } else {
      Say "node_modules exists." "Green"
    }

    if (-not (Test-Path $DistCli)) {
      Say "dist\cli.js missing. Running npm run build." "Yellow"
      & npm run build
      if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
    } else {
      Say "dist\cli.js exists." "Green"
    }
  } finally {
    Pop-Location
  }
}

function Start-AgentDeskTask($Setup) {
  Section "Start background service"
  if (-not (Test-Path $InstallTasksScript)) { throw "Task installer not found: $InstallTasksScript" }
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $InstallTasksScript,
    "-ProjectRoot", $ProjectRoot,
    "-Start"
  )
  if ($Setup.enableTunnel -eq $true) { $args += "-InstallTunnel" }
  & powershell.exe @args
  if ($LASTEXITCODE -ne 0) { throw "Task registration/start failed with exit code $LASTEXITCODE" }
}

function Wait-UntilHealthy([int]$Port) {
  Section "Wait for service"
  for ($i = 1; $i -le 35; $i++) {
    if (Test-Health $Port) {
      Say "AgentDesk is running: http://127.0.0.1:$Port/console" "Green"
      return $true
    }
    Write-Host "." -NoNewline -ForegroundColor DarkGray
    Start-Sleep -Seconds 1
  }
  Write-Host ""
  return $false
}

function Show-PortConflict([int]$Port) {
  try {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) { return }
    Say "Port $Port is already used by:" "Yellow"
    foreach ($item in $listeners) {
      $proc = Get-Process -Id $item.OwningProcess -ErrorAction SilentlyContinue
      $name = "unknown"
      if ($proc) { $name = $proc.ProcessName }
      Say ("PID {0}  {1}" -f $item.OwningProcess, $name) "Yellow"
    }
  } catch {}
}

function Show-AccountHint([int]$Port) {
  try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/status.json" -TimeoutSec 5
    if ($status.account.enabled -eq $true) {
      Say "Account gating: $($status.account.plan) / $($status.account.licenseSource)" "Cyan"
    }
  } catch {
    Say "Account status check skipped: $($_.Exception.Message)" "Yellow"
  }
}

function Open-SetupWizard {
  Section "Open setup wizard"
  if (-not (Test-Path $SetupWizardScript)) { throw "Setup wizard not found: $SetupWizardScript" }
  Say "Opening http://127.0.0.1:7876/. Click the quick install button." "Cyan"
  Push-Location $ProjectRoot
  try {
    & node $SetupWizardScript
  } finally {
    Pop-Location
  }
}

try {
  Section "AgentDesk one-click start"
  Say "Project root: $ProjectRoot" "Gray"
  New-Item -ItemType Directory -Force -Path $RuntimeDir, $LogDir | Out-Null

  Require-Node
  $setup = Read-Setup
  $port = Get-PortFromSetup $setup

  if (Test-Health $port) {
    Say "Service is already healthy. Opening console only." "Green"
    Show-AccountHint $port
    Open-Url "http://127.0.0.1:$port/console"
    Say "Console opened. ChatGPT MCP URL: $($setup.publicBaseUrl.TrimEnd('/'))/mcp" "Cyan"
    exit 0
  }

  Ensure-Build
  Start-AgentDeskTask $setup

  if (Wait-UntilHealthy $port) {
    Show-AccountHint $port
    Open-Url "http://127.0.0.1:$port/console"
    Say "Console opened. ChatGPT MCP URL: $($setup.publicBaseUrl.TrimEnd('/'))/mcp" "Cyan"
    Say "Next time, just double-click the launcher. It will self-check, repair, and start." "Green"
    exit 0
  }

  Say "AgentDesk did not become healthy in time." "Red"
  Show-PortConflict $port
  Say "Log directory: $LogDir" "Yellow"
  Open-SetupWizard
} catch {
  Write-Host ""
  Say ("Start failed: " + $_.Exception.Message) "Red"
  Say "Send the error above to ChatGPT for the next repair step." "Yellow"
  exit 1
}
