$ErrorActionPreference = "Continue"

$ProjectRoot = "G:\devspace-copt-lab\devspace"
$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-gpt-runtime"
$PidFile = Join-Path $RuntimeDir "agentdesk.pid"
$TunnelPidFile = Join-Path $RuntimeDir "cloudflared.pid"
$UrlFile = Join-Path $RuntimeDir "mcp-url.txt"

Write-Host "Stopping only the isolated AgentDesk GPT line..." -ForegroundColor Cyan

foreach ($entry in @(
  @{ Name = "AgentDesk GPT"; Path = $PidFile },
  @{ Name = "Cloudflare GPT tunnel"; Path = $TunnelPidFile }
)) {
  if (Test-Path $entry.Path) {
    $pidText = (Get-Content $entry.Path -Raw).Trim()
    if ($pidText -match '^\d+$') {
      $targetPid = [int]$pidText
      $targetProcess = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
      if ($targetProcess) {
        Write-Host "Stopping $($entry.Name) PID $targetPid"
        Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
      } else {
        Write-Host "$($entry.Name) PID $targetPid is not running."
      }
    }
    Remove-Item $entry.Path -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "$($entry.Name) PID file not found; skipping."
  }
}

Write-Host "Done. Existing COPT/7676 line was not touched." -ForegroundColor Green
if (Test-Path $UrlFile) {
  Write-Host "Last GPT MCP URL was: $(Get-Content $UrlFile -Raw)" -ForegroundColor Gray
}
