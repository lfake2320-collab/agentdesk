param(
  [string]$Version = "0.1.0",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutputDir) {
  $OutputDir = Join-Path $ProjectRoot "release"
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$PackageName = "agentdesk-v$Version-windows-source"
$StageRoot = Join-Path $env:TEMP ("$PackageName-" + [Guid]::NewGuid().ToString("N"))
$StageDir = Join-Path $StageRoot $PackageName
$ZipPath = Join-Path $OutputDir "$PackageName.zip"

function Copy-ProjectItem([string]$Name) {
  $source = Join-Path $ProjectRoot $Name
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $StageDir $Name) -Recurse -Force
  }
}

Write-Host "Creating AgentDesk release zip" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host "Version: $Version"

Push-Location $ProjectRoot
try {
  npm install
  npm test
  npm run build
} finally {
  Pop-Location
}

if (Test-Path $StageRoot) { Remove-Item -Recurse -Force $StageRoot }
New-Item -ItemType Directory -Force -Path $StageDir, $OutputDir | Out-Null

$include = @(
  "dist",
  "docs",
  "examples",
  "scripts",
  "skills",
  "src",
  ".env.example",
  ".gitignore",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "package-lock.json",
  "package.json",
  "README.md",
  "README.zh-CN.md",
  "SECURITY.md",
  "Start-AgentDesk.cmd",
  "tsconfig.build.json",
  "tsconfig.json",
  "vite.config.ts"
)

foreach ($item in $include) {
  Copy-ProjectItem $item
}

$installReadme = @"
AgentDesk Windows Source Release v$Version
=========================================

This package is a source release for Windows users.

Quick start:
1. Install Node.js >=22.19 and <27.
2. Open PowerShell in this folder.
3. Run: .\scripts\verify-first-clone.ps1 -SkipTests
4. Double-click Start-AgentDesk.cmd.
5. Follow the setup wizard.

Docs:
- docs\first-clone-windows.md
- docs\cloudflare-tunnel.md
- docs\release-checklist.md

The package intentionally does not include:
- node_modules
- .git
- .agentdesk-fixed-runtime
- private tokens
- Cloudflare credentials
"@
[System.IO.File]::WriteAllText((Join-Path $StageDir "INSTALL-WINDOWS.txt"), $installReadme, [System.Text.UTF8Encoding]::new($false))

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $StageRoot "*") -DestinationPath $ZipPath -Force
Remove-Item -Recurse -Force $StageRoot

Write-Host "Release zip created:" -ForegroundColor Green
Write-Host $ZipPath -ForegroundColor Cyan
