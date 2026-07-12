param(
  [string]$ProjectRoot = "",
  [int]$Port = 7875,
  [int]$BrowserDebugPort = 9342,
  [string]$PublicBaseUrl = "http://127.0.0.1:7875",
  [string]$EdgeProfile = "Default",
  [string]$AllowedRoots = "",
  [bool]$EnablePublicFileBrowser = $true,
  [string]$PermissionProfile = "owner",
  [string]$ToolMode = "full",
  [bool]$SystemTools = $true,
  [bool]$ProcessControl = $false,
  [bool]$BrowserTools = $true,
  [string]$BrowserMode = "live",
  [bool]$Plugins = $true,
  [bool]$Skills = $true
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path

$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-fixed-runtime"
$StateDir = Join-Path $RuntimeDir "state"
$ConfigDir = Join-Path $RuntimeDir "config"
$LogDir = Join-Path $RuntimeDir "logs"
$SetupFile = Join-Path $RuntimeDir "setup.json"
$AuthFile = Join-Path $ConfigDir "auth.json"
$FileBrowserAuthFile = Join-Path $ConfigDir "file-browser-auth.json"
$AgentDeskLog = Join-Path $LogDir "agentdesk-fixed.log"
$SupervisorLog = Join-Path $LogDir "agentdesk-fixed-supervisor.log"

New-Item -ItemType Directory -Force -Path $RuntimeDir, $StateDir, $ConfigDir, $LogDir | Out-Null

$mutexCreated = $false
$mutexName = "Local\AgentDeskFixedMcpSupervisor_" + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ProjectRoot)).TrimEnd("=").Replace("+", "-").Replace("/", "_"))
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$mutexCreated)
if (-not $mutexCreated) {
  return
}

Set-Location -Path $ProjectRoot

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Write-SupervisorLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $SupervisorLog -Value $line
}

function Convert-ToBool([object]$Value, [bool]$Fallback) {
  if ($null -eq $Value) { return $Fallback }
  if ($Value -is [bool]) { return [bool]$Value }
  $text = ([string]$Value).Trim().ToLowerInvariant()
  if ($text -in @("1", "true", "yes", "on")) { return $true }
  if ($text -in @("0", "false", "no", "off")) { return $false }
  return $Fallback
}

function Convert-ToChoice([object]$Value, [string]$Fallback, [string[]]$Allowed) {
  if ($null -eq $Value) { return $Fallback }
  $text = ([string]$Value).Trim()
  if ($Allowed -contains $text) { return $text }
  return $Fallback
}

function Convert-ToPort([object]$Value, [int]$Fallback) {
  if ($null -eq $Value -or [string]$Value -eq "") { return $Fallback }
  $parsed = 0
  if ([int]::TryParse([string]$Value, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) { return $parsed }
  return $Fallback
}

function New-OwnerToken {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return "adsk-fixed-" + [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function New-FileBrowserToken {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return "adsk-files-" + [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Get-OwnerToken {
  if (-not (Test-Path $AuthFile)) {
    $token = New-OwnerToken
    Write-Utf8NoBomFile -Path $AuthFile -Content (@{ ownerToken = $token } | ConvertTo-Json -Depth 3)
    return $token
  }

  try {
    $token = (Get-Content $AuthFile -Raw | ConvertFrom-Json).ownerToken
  } catch {
    $token = New-OwnerToken
  }

  if (-not $token -or $token.Length -lt 16) {
    $token = New-OwnerToken
  }

  Write-Utf8NoBomFile -Path $AuthFile -Content (@{ ownerToken = $token } | ConvertTo-Json -Depth 3)
  return $token
}

function Get-FileBrowserToken {
  if (-not (Test-Path $FileBrowserAuthFile)) {
    $password = New-FileBrowserToken
    Write-Utf8NoBomFile -Path $FileBrowserAuthFile -Content (@{ username = "agentdesk"; password = $password } | ConvertTo-Json -Depth 3)
    return $password
  }

  try {
    $password = (Get-Content $FileBrowserAuthFile -Raw | ConvertFrom-Json).password
  } catch {
    $password = New-FileBrowserToken
  }

  if (-not $password -or $password.Length -lt 32) {
    $password = New-FileBrowserToken
  }

  Write-Utf8NoBomFile -Path $FileBrowserAuthFile -Content (@{ username = "agentdesk"; password = $password } | ConvertTo-Json -Depth 3)
  return $password
}

function Get-DefaultAllowedRoots {
  $workspaceRoot = Join-Path (Join-Path $HOME "Documents") "AgentDesk-Workspaces"
  New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null
  return @($ProjectRoot, $workspaceRoot) -join ","
}

function Read-AgentDeskSetup {
  $cfg = [ordered]@{
    Port = $Port
    BrowserDebugPort = $BrowserDebugPort
    PublicBaseUrl = $PublicBaseUrl
    EdgeProfile = $EdgeProfile
    AllowedRoots = $AllowedRoots
    EnablePublicFileBrowser = $EnablePublicFileBrowser
    PermissionProfile = $PermissionProfile
    ToolMode = $ToolMode
    SystemTools = $SystemTools
    ProcessControl = $ProcessControl
    BrowserTools = $BrowserTools
    BrowserMode = $BrowserMode
    Plugins = $Plugins
    Skills = $Skills
  }

  if (Test-Path $SetupFile) {
    try {
      $setup = Get-Content $SetupFile -Raw | ConvertFrom-Json
      $cfg.Port = Convert-ToPort $setup.port $cfg.Port
      $cfg.BrowserDebugPort = Convert-ToPort $setup.browserDebugPort $cfg.BrowserDebugPort
      if ($setup.publicBaseUrl) { $cfg.PublicBaseUrl = [string]$setup.publicBaseUrl }
      if ($setup.edgeProfile) { $cfg.EdgeProfile = [string]$setup.edgeProfile }
      if ($setup.allowedRoots) { $cfg.AllowedRoots = (($setup.allowedRoots | ForEach-Object { [string]$_ }) -join ",") }
      $cfg.EnablePublicFileBrowser = Convert-ToBool $setup.enablePublicFileBrowser $cfg.EnablePublicFileBrowser
      $cfg.PermissionProfile = Convert-ToChoice $setup.permissionProfile $cfg.PermissionProfile @("safe", "dev", "power", "owner")
      $cfg.ToolMode = Convert-ToChoice $setup.toolMode $cfg.ToolMode @("minimal", "full", "codex")
      $cfg.SystemTools = Convert-ToBool $setup.systemTools $cfg.SystemTools
      $cfg.ProcessControl = Convert-ToBool $setup.processControl $cfg.ProcessControl
      $cfg.BrowserTools = Convert-ToBool $setup.browserTools $cfg.BrowserTools
      $cfg.BrowserMode = Convert-ToChoice $setup.browserMode $cfg.BrowserMode @("isolated", "live")
      $cfg.Plugins = Convert-ToBool $setup.plugins $cfg.Plugins
      $cfg.Skills = Convert-ToBool $setup.skills $cfg.Skills
    } catch {
      Write-Warning "Ignoring invalid setup file: $SetupFile"
    }
  }

  if (-not $cfg.AllowedRoots) {
    $cfg.AllowedRoots = Get-DefaultAllowedRoots
  }

  $cfg.PublicBaseUrl = ([string]$cfg.PublicBaseUrl).TrimEnd("/")
  return $cfg
}

function Apply-AgentDeskEnvironment([hashtable]$Cfg) {
  $token = Get-OwnerToken
  $fileBrowserToken = Get-FileBrowserToken

  if (-not (Test-Path "dist\cli.js")) {
    throw "dist\cli.js not found. Build AgentDesk first with: npm run build"
  }

  $edgeExe = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
  if (-not (Test-Path $edgeExe)) {
    $edgeExe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  }
  if ($Cfg.BrowserTools -and -not (Test-Path $edgeExe)) {
    throw "Microsoft Edge executable not found. Disable browser tools or install Edge."
  }

  $publicHost = ([Uri]$Cfg.PublicBaseUrl).Host
  $AllowedHosts = "localhost,127.0.0.1,$publicHost"

  $env:PORT = "$($Cfg.Port)"
  $env:DEVSPACE_PUBLIC_BASE_URL = $Cfg.PublicBaseUrl
  $env:DEVSPACE_ALLOWED_HOSTS = $AllowedHosts
  $env:DEVSPACE_ALLOWED_ROOTS = $Cfg.AllowedRoots
  $env:DEVSPACE_OAUTH_OWNER_TOKEN = $token
  # Keep GPT connected across AgentDesk restarts. Existing OAuth state is persisted in .agentdesk-fixed-runtime\state.
  # 31536000 seconds = 365 days.
  $env:DEVSPACE_OAUTH_ACCESS_TOKEN_TTL_SECONDS = "31536000"
  $env:DEVSPACE_OAUTH_REFRESH_TOKEN_TTL_SECONDS = "31536000"
  $env:DEVSPACE_PUBLIC_FILE_BROWSER = if ($Cfg.EnablePublicFileBrowser) { "1" } else { "0" }
  $env:DEVSPACE_FILE_BROWSER_TOKEN = $fileBrowserToken
  $env:DEVSPACE_TRUST_PROXY = "1"
  $env:DEVSPACE_TOOL_MODE = $Cfg.ToolMode
  $env:DEVSPACE_PERMISSION_PROFILE = $Cfg.PermissionProfile
  $env:DEVSPACE_SYSTEM_TOOLS = if ($Cfg.SystemTools) { "1" } else { "0" }
  $env:DEVSPACE_PROCESS_CONTROL = if ($Cfg.ProcessControl) { "1" } else { "0" }
  $env:DEVSPACE_BROWSER_TOOLS = if ($Cfg.BrowserTools) { "1" } else { "0" }
  $env:DEVSPACE_BROWSER_MODE = $Cfg.BrowserMode
  $env:DEVSPACE_BROWSER_EXECUTABLE = $edgeExe
  $env:DEVSPACE_BROWSER_USER_DATA_DIR = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"
  $env:DEVSPACE_BROWSER_PROFILE_DIRECTORY = $Cfg.EdgeProfile
  $env:DEVSPACE_BROWSER_DEBUG_PORT = "$($Cfg.BrowserDebugPort)"
  $env:DEVSPACE_BROWSER_ATTACH_ONLY = "0"
  $env:DEVSPACE_PLUGINS = if ($Cfg.Plugins) { "1" } else { "0" }
  $env:DEVSPACE_PLUGIN_PATHS = "$ProjectRoot\examples\plugins"
  $env:DEVSPACE_SKILL_PATHS = "$ProjectRoot\examples\skills"
  $env:DEVSPACE_SKILLS = if ($Cfg.Skills) { "1" } else { "0" }
  $env:DEVSPACE_STATE_DIR = $StateDir
  $env:DEVSPACE_CONFIG_DIR = $ConfigDir

  return @{ OwnerToken = $token; FileBrowserToken = $fileBrowserToken }
}

Write-Host "Starting fixed AgentDesk MCP supervisor..." -ForegroundColor Green
Write-Host "Project root: $ProjectRoot" -ForegroundColor Cyan
Write-Host "Owner password file: $AuthFile" -ForegroundColor Yellow
Write-Host "File browser password file: $FileBrowserAuthFile" -ForegroundColor Yellow
Write-Host "Log: $AgentDeskLog" -ForegroundColor Gray

while ($true) {
  try {
    $cfg = Read-AgentDeskSetup
    Apply-AgentDeskEnvironment -Cfg $cfg | Out-Null
    Write-Host "Local MCP: http://127.0.0.1:$($cfg.Port)/mcp" -ForegroundColor Cyan
    Write-Host "Public MCP: $($cfg.PublicBaseUrl)/mcp" -ForegroundColor Cyan
    Write-Host "Profile: $($cfg.PermissionProfile), Tool mode: $($cfg.ToolMode), Browser: $($cfg.BrowserTools)/$($cfg.BrowserMode)" -ForegroundColor Cyan
    Write-SupervisorLog "starting node dist/cli.js serve on port $($cfg.Port), profile $($cfg.PermissionProfile), toolMode $($cfg.ToolMode)"
    $cmd = 'node dist/cli.js serve >> "' + $AgentDeskLog + '" 2>&1'
    cmd.exe /d /c $cmd
    $exit = $LASTEXITCODE
    Write-SupervisorLog "node exited with code $exit; restarting in 5 seconds"
  } catch {
    Write-SupervisorLog "supervisor error: $($_.Exception.Message); retrying in 5 seconds"
  }
  Start-Sleep -Seconds 5
}
