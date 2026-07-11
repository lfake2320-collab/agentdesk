param(
  [int]$Port = 7875,
  [int]$BrowserDebugPort = 9342,
  [string]$PublicBaseUrl = "https://agentdesk.husan.icu",
  [string]$EdgeProfile = "Default",
  [string]$AllowedRoots = "G:\\devspace-copt-lab\\devspace,C:\\Users\\23209\\Documents,G:\\"
)

$ErrorActionPreference = "Stop"

$mutexCreated = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\AgentDeskFixedMcpSupervisor", [ref]$mutexCreated)
if (-not $mutexCreated) {
  return
}

$ProjectRoot = "G:\devspace-copt-lab\devspace"
$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-fixed-runtime"
$StateDir = Join-Path $RuntimeDir "state"
$ConfigDir = Join-Path $RuntimeDir "config"
$LogDir = Join-Path $RuntimeDir "logs"
$AuthFile = Join-Path $ConfigDir "auth.json"
$FileBrowserAuthFile = Join-Path $ConfigDir "file-browser-auth.json"
$AgentDeskLog = Join-Path $LogDir "agentdesk-fixed.log"
$SupervisorLog = Join-Path $LogDir "agentdesk-fixed-supervisor.log"

New-Item -ItemType Directory -Force -Path $RuntimeDir, $StateDir, $ConfigDir, $LogDir | Out-Null
Set-Location -Path $ProjectRoot

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Write-SupervisorLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $SupervisorLog -Value $line
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

if (-not (Test-Path $AuthFile)) {
  $token = New-OwnerToken
  $auth = @{ ownerToken = $token } | ConvertTo-Json -Depth 3
  Write-Utf8NoBomFile -Path $AuthFile -Content $auth
} else {
  try {
    $token = (Get-Content $AuthFile -Raw | ConvertFrom-Json).ownerToken
  } catch {
    $token = New-OwnerToken
  }
  if (-not $token -or $token.Length -lt 16) {
    $token = New-OwnerToken
  }
  $auth = @{ ownerToken = $token } | ConvertTo-Json -Depth 3
  Write-Utf8NoBomFile -Path $AuthFile -Content $auth
}

if (-not (Test-Path $FileBrowserAuthFile)) {
  $fileBrowserToken = New-FileBrowserToken
  $fileBrowserAuth = @{ username = "agentdesk"; password = $fileBrowserToken } | ConvertTo-Json -Depth 3
  Write-Utf8NoBomFile -Path $FileBrowserAuthFile -Content $fileBrowserAuth
} else {
  try {
    $fileBrowserToken = (Get-Content $FileBrowserAuthFile -Raw | ConvertFrom-Json).password
  } catch {
    $fileBrowserToken = New-FileBrowserToken
  }
  if (-not $fileBrowserToken -or $fileBrowserToken.Length -lt 32) {
    $fileBrowserToken = New-FileBrowserToken
  }
  $fileBrowserAuth = @{ username = "agentdesk"; password = $fileBrowserToken } | ConvertTo-Json -Depth 3
  Write-Utf8NoBomFile -Path $FileBrowserAuthFile -Content $fileBrowserAuth
}

if (-not (Test-Path "dist\cli.js")) {
  throw "dist\cli.js not found. Build AgentDesk first with: npm run build"
}

$edgeExe = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgeExe)) {
  $edgeExe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path $edgeExe)) {
  throw "Microsoft Edge executable not found."
}

$PublicBaseUrl = $PublicBaseUrl.TrimEnd("/")
$publicHost = ([Uri]$PublicBaseUrl).Host
$AllowedHosts = "localhost,127.0.0.1,$publicHost"

$env:PORT = "$Port"
$env:DEVSPACE_PUBLIC_BASE_URL = $PublicBaseUrl
$env:DEVSPACE_ALLOWED_HOSTS = $AllowedHosts
$env:DEVSPACE_ALLOWED_ROOTS = $AllowedRoots
$env:DEVSPACE_OAUTH_OWNER_TOKEN = $token
# Keep GPT connected across AgentDesk restarts. Existing OAuth state is persisted in .agentdesk-fixed-runtime\state.
# 31536000 seconds = 365 days.
$env:DEVSPACE_OAUTH_ACCESS_TOKEN_TTL_SECONDS = "31536000"
$env:DEVSPACE_OAUTH_REFRESH_TOKEN_TTL_SECONDS = "31536000"
$env:DEVSPACE_PUBLIC_FILE_BROWSER = "1"
$env:DEVSPACE_FILE_BROWSER_TOKEN = $fileBrowserToken
$env:DEVSPACE_TRUST_PROXY = "1"
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
$env:DEVSPACE_PLUGIN_PATHS = "$ProjectRoot\examples\plugins"
$env:DEVSPACE_SKILL_PATHS = "$ProjectRoot\examples\skills"
$env:DEVSPACE_STATE_DIR = $StateDir
$env:DEVSPACE_CONFIG_DIR = $ConfigDir

Write-Host "Starting fixed AgentDesk MCP supervisor..." -ForegroundColor Green
Write-Host "Local MCP: http://127.0.0.1:$Port/mcp" -ForegroundColor Cyan
Write-Host "Public MCP: $PublicBaseUrl/mcp" -ForegroundColor Cyan
Write-Host "Owner password file: $AuthFile" -ForegroundColor Yellow
Write-Host "File browser password file: $FileBrowserAuthFile" -ForegroundColor Yellow
Write-Host "Log: $AgentDeskLog" -ForegroundColor Gray

while ($true) {
  Write-SupervisorLog "starting node dist/cli.js serve on port $Port"
  $cmd = 'node dist/cli.js serve >> "' + $AgentDeskLog + '" 2>&1'
  cmd.exe /d /c $cmd
  $exit = $LASTEXITCODE
  Write-SupervisorLog "node exited with code $exit; restarting in 5 seconds"
  Start-Sleep -Seconds 5
}
