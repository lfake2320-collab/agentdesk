param(
  [string]$ProjectRoot = "",
  [switch]$InstallTunnel,
  [switch]$Start
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$ScriptsDir = Join-Path $ProjectRoot "scripts"
$FixedVbs = Join-Path $ScriptsDir "start-agentdesk-fixed-hidden.vbs"
$TunnelVbs = Join-Path $ScriptsDir "start-agentdesk-named-tunnel-hidden.vbs"
$RuntimeDir = Join-Path $ProjectRoot ".agentdesk-fixed-runtime"
$TunnelConfig = Join-Path $RuntimeDir "agentdesk-cloudflared.yml"

if (-not (Test-Path $FixedVbs)) {
  throw "Hidden fixed launcher not found: $FixedVbs"
}

$settings = New-ScheduledTaskSettingsSet `
  -Hidden `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

$fixedAction = New-ScheduledTaskAction `
  -Execute "wscript.exe" `
  -Argument ('//B //Nologo "' + $FixedVbs + '"') `
  -WorkingDirectory $ProjectRoot

Register-ScheduledTask `
  -TaskName "AgentDesk Fixed MCP" `
  -Action $fixedAction `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Write-Host "Registered hidden task: AgentDesk Fixed MCP"

if ($InstallTunnel) {
  if (-not (Test-Path $TunnelVbs)) {
    throw "Hidden tunnel launcher not found: $TunnelVbs"
  }
  if (-not (Test-Path $TunnelConfig)) {
    throw "Tunnel config not found: $TunnelConfig"
  }

  $tunnelAction = New-ScheduledTaskAction `
    -Execute "wscript.exe" `
    -Argument ('//B //Nologo "' + $TunnelVbs + '"') `
    -WorkingDirectory $ProjectRoot

  Register-ScheduledTask `
    -TaskName "AgentDesk Named Tunnel" `
    -Action $tunnelAction `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

  Write-Host "Registered hidden task: AgentDesk Named Tunnel"
}

if ($Start) {
  Start-ScheduledTask -TaskName "AgentDesk Fixed MCP"
  Write-Host "Started task: AgentDesk Fixed MCP"
  if ($InstallTunnel) {
    Start-ScheduledTask -TaskName "AgentDesk Named Tunnel"
    Write-Host "Started task: AgentDesk Named Tunnel"
  }
}
