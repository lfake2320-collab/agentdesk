param(
  [Parameter(Mandatory = $true)]
  [string]$UsbRoot,
  [string]$KitName = "AgentDesk-USB-Kit"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$UsbRoot = (Resolve-Path $UsbRoot).Path
$KitRoot = Join-Path $UsbRoot $KitName
$PayloadRoot = Join-Path $KitRoot "payload\devspace"
$ToolsRoot = Join-Path $KitRoot "tools"

if (Test-Path $KitRoot) {
  Remove-Item -Recurse -Force $KitRoot
}

New-Item -ItemType Directory -Force -Path $PayloadRoot, $ToolsRoot | Out-Null

$excludedTop = @(".git", "node_modules", ".agentdesk-gpt-runtime", ".agentdesk-fixed-runtime")

Get-ChildItem -LiteralPath $ProjectRoot -Force | ForEach-Object {
  if ($excludedTop -contains $_.Name) { return }
  Copy-Item -LiteralPath $_.FullName -Destination $PayloadRoot -Recurse -Force
}

$startInstall = @'
@echo off
setlocal
cd /d "%~dp0"
echo AgentDesk USB Kit
echo.
echo This installer does not run automatically when the USB drive is inserted.
echo You started it manually, so it will now install AgentDesk for this Windows user.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Install-AgentDesk.ps1"
pause
'@
[System.IO.File]::WriteAllText((Join-Path $KitRoot "Start-Install.cmd"), $startInstall, [System.Text.UTF8Encoding]::new($false))

$installer = @'
param(
  [string]$InstallRoot = "$env:USERPROFILE\AgentDesk\devspace"
)

$ErrorActionPreference = "Stop"
$KitRoot = Split-Path $PSScriptRoot -Parent
$PayloadRoot = Join-Path $KitRoot "payload\devspace"

function New-UrlSafeToken([string]$Prefix) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return $Prefix + [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

Write-Host "Installing AgentDesk to: $InstallRoot" -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
Copy-Item -Path (Join-Path $PayloadRoot "*") -Destination $InstallRoot -Recurse -Force

$RuntimeDir = Join-Path $InstallRoot ".agentdesk-fixed-runtime"
$ConfigDir = Join-Path $RuntimeDir "config"
$StateDir = Join-Path $RuntimeDir "state"
$LogDir = Join-Path $RuntimeDir "logs"
New-Item -ItemType Directory -Force -Path $ConfigDir, $StateDir, $LogDir | Out-Null

$ownerToken = New-UrlSafeToken "adsk-fixed-"
$filePassword = New-UrlSafeToken "file-"
Write-Utf8NoBomFile -Path (Join-Path $ConfigDir "auth.json") -Content (@{ ownerToken = $ownerToken } | ConvertTo-Json -Depth 3)
Write-Utf8NoBomFile -Path (Join-Path $ConfigDir "file-browser-auth.json") -Content (@{ username = "agentdesk"; password = $filePassword } | ConvertTo-Json -Depth 3)

Push-Location $InstallRoot
try {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Install Node.js LTS first, then run this installer again."
  }
  npm install
  npm run build
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "AgentDesk files were installed and built." -ForegroundColor Green
Write-Host "Next step on this computer:" -ForegroundColor Yellow
Write-Host "1. Open PowerShell in: $InstallRoot" -ForegroundColor Cyan
Write-Host "2. Run: .\scripts\run-agentdesk-fixed.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "For fixed public access on a new computer, configure Cloudflare named tunnel credentials for your own hostname separately." -ForegroundColor Yellow
Write-Host "Owner token file: $ConfigDir\auth.json" -ForegroundColor Yellow
Write-Host "File browser password file: $ConfigDir\file-browser-auth.json" -ForegroundColor Yellow
'@
[System.IO.File]::WriteAllText((Join-Path $ToolsRoot "Install-AgentDesk.ps1"), $installer, [System.Text.UTF8Encoding]::new($false))

$readme = @'
AgentDesk USB Kit
=================

Windows does not safely support USB script autorun. This kit will not run just because the USB drive is inserted.

Usage:
1. Insert the USB drive.
2. Open AgentDesk-USB-Kit.
3. Double-click Start-Install.cmd.
4. The installer copies AgentDesk to the target user profile, generates fresh local passwords, runs npm install, and builds the project.

Security model:
- It does not copy your existing OAuth token.
- It does not copy Cloudflare tunnel credentials.
- It does not silently install itself on insertion.
- Public access still requires you to configure Cloudflare credentials on that computer.

After install:
- Local MCP can be run from the installed folder.
- Local file browser is available after AgentDesk starts.
- Public file browser and phone access require the Cloudflare named tunnel to be configured.
'@
[System.IO.File]::WriteAllText((Join-Path $KitRoot "README.txt"), $readme, [System.Text.UTF8Encoding]::new($false))

Write-Host "AgentDesk USB kit created:" -ForegroundColor Green
Write-Host $KitRoot -ForegroundColor Cyan
Write-Host "Run Start-Install.cmd manually on the target computer." -ForegroundColor Yellow
