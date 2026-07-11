param(
  [Parameter(Mandatory=$true)]
  [string]$PublicBaseUrl
)

$ErrorActionPreference = "Stop"

$base = $PublicBaseUrl.TrimEnd('/')
$urls = @(
  "$base/healthz",
  "$base/.well-known/oauth-protected-resource",
  "$base/.well-known/oauth-protected-resource/mcp",
  "$base/.well-known/oauth-authorization-server",
  "$base/mcp/.well-known/oauth-protected-resource",
  "$base/mcp/.well-known/oauth-authorization-server",
  "$base/mcp"
)

function Invoke-AgentDeskDiagnosticRequest {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Uri
  )

  try {
    $response = Invoke-WebRequest -Uri $Uri -Method GET -MaximumRedirection 0 -UseBasicParsing
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Headers = $response.Headers
      Body = [string]$response.Content
      Error = $null
    }
  } catch [System.Net.WebException] {
    $webResponse = $_.Exception.Response
    if ($null -eq $webResponse) {
      return [pscustomobject]@{
        StatusCode = 0
        Headers = @{}
        Body = ""
        Error = $_.Exception.Message
      }
    }

    $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
    try {
      $body = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }

    return [pscustomobject]@{
      StatusCode = [int]$webResponse.StatusCode
      Headers = $webResponse.Headers
      Body = [string]$body
      Error = $null
    }
  }
}

function Get-HeaderValue {
  param(
    [Parameter(Mandatory=$true)]
    $Headers,
    [Parameter(Mandatory=$true)]
    [string]$Name
  )

  if ($Headers -is [System.Collections.IDictionary]) {
    return $Headers[$Name]
  }
  return $Headers.Get($Name)
}

Write-Host "AgentDesk OAuth discovery check" -ForegroundColor Cyan
Write-Host "Base: $base"
Write-Host "PowerShell: $($PSVersionTable.PSVersion)"
Write-Host ""

foreach ($url in $urls) {
  Write-Host "GET $url" -ForegroundColor Yellow
  $result = Invoke-AgentDeskDiagnosticRequest -Uri $url
  if ($result.Error) {
    Write-Host "ERROR: $($result.Error)" -ForegroundColor Red
    Write-Host ""
    continue
  }

  $statusColor = if ($result.StatusCode -ge 200 -and $result.StatusCode -lt 400) { "Green" } else { "DarkYellow" }
  Write-Host "Status: $($result.StatusCode)" -ForegroundColor $statusColor

  $wwwAuth = Get-HeaderValue -Headers $result.Headers -Name "WWW-Authenticate"
  if ($wwwAuth) {
    Write-Host "WWW-Authenticate: $wwwAuth"
  }

  $body = [string]$result.Body
  if ($body.Length -gt 900) {
    $body = $body.Substring(0, 900) + "..."
  }
  if ($body.Trim().Length -gt 0) {
    Write-Host $body
  }
  Write-Host ""
}

Write-Host "Expected ChatGPT server URL:" -ForegroundColor Cyan
Write-Host "$base/mcp"
