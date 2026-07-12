param(
  [switch]$SkipInstall,
  [switch]$SkipTests,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Step([string]$Text) {
  Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Fail([string]$Text) {
  throw "[AgentDesk verify] $Text"
}

function Test-CommandAvailable([string]$Command) {
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function Test-NodeVersion([string]$VersionText) {
  $clean = $VersionText.TrimStart("v")
  $version = [Version]$clean
  $min = [Version]"22.19.0"
  $maxExclusive = [Version]"27.0.0"
  return ($version -ge $min -and $version -lt $maxExclusive)
}

Write-Step "AgentDesk fresh-clone verification"
Write-Host "Project root: $ProjectRoot"

Write-Step "Checking required commands"
foreach ($cmd in @("git", "node", "npm")) {
  if (-not (Test-CommandAvailable $cmd)) {
    Fail "$cmd was not found in PATH. Install it first, then reopen PowerShell."
  }
  Write-Host "$cmd OK" -ForegroundColor Green
}

$nodeVersion = (& node -v).Trim()
if (-not (Test-NodeVersion $nodeVersion)) {
  Fail "Node.js $nodeVersion is not supported. Install Node.js >=22.19 and <27."
}
Write-Host "Node version OK: $nodeVersion" -ForegroundColor Green

Push-Location $ProjectRoot
try {
  Write-Step "Checking git checkout"
  & git status --short

  if (-not $SkipInstall) {
    Write-Step "Installing npm dependencies"
    & npm install
  } else {
    Write-Host "Skipped npm install" -ForegroundColor Yellow
  }

  if (-not $SkipBuild) {
    Write-Step "Building AgentDesk"
    & npm run build
  } else {
    Write-Host "Skipped npm run build" -ForegroundColor Yellow
  }

  if (-not (Test-Path (Join-Path $ProjectRoot "dist\cli.js"))) {
    Fail "dist\cli.js was not found. Build did not produce the CLI output."
  }

  if (-not $SkipTests) {
    Write-Step "Running test suite"
    & npm test
  } else {
    Write-Host "Skipped npm test" -ForegroundColor Yellow
  }

  Write-Step "Checking first-run launcher files"
  foreach ($path in @(
    "Start-AgentDesk.cmd",
    "scripts\setup-wizard.mjs",
    "scripts\install-agentdesk-tasks.ps1",
    "scripts\start-agentdesk-fixed-hidden.vbs",
    "scripts\start-agentdesk-named-tunnel-hidden.vbs"
  )) {
    if (-not (Test-Path (Join-Path $ProjectRoot $path))) {
      Fail "Missing required launcher file: $path"
    }
    Write-Host "$path OK" -ForegroundColor Green
  }

  Write-Step "Fresh-clone verification passed"
  Write-Host "Next step: double-click Start-AgentDesk.cmd, or run: node scripts\setup-wizard.mjs" -ForegroundColor Green
} finally {
  Pop-Location
}
