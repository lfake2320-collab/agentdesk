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

Write-Host "AgentDesk OAuth discovery check" -ForegroundColor Cyan
Write-Host "Base: $base"
Write-Host ""

foreach ($url in $urls) {
  Write-Host "GET $url" -ForegroundColor Yellow
  try {
    $response = Invoke-WebRequest -Uri $url -Method GET -MaximumRedirection 0 -SkipHttpErrorCheck
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    if ($response.Headers.'WWW-Authenticate') {
      Write-Host "WWW-Authenticate: $($response.Headers.'WWW-Authenticate')"
    }
    $body = [string]$response.Content
    if ($body.Length -gt 900) {
      $body = $body.Substring(0, 900) + "..."
    }
    Write-Host $body
  } catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  }
  Write-Host ""
}

Write-Host "Expected ChatGPT server URL:" -ForegroundColor Cyan
Write-Host "$base/mcp"
