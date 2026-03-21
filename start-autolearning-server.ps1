$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

function Write-Step {
  param([string]$Message)
  Write-Host "[autolearning] $Message" -ForegroundColor Cyan
}

function Load-DotEnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) {
      return
    }
    if ($line.StartsWith("#")) {
      return
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -lt 1) {
      return
    }

    $name = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

function Stop-PortOwner {
  param([int]$Port)

  $connections = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $connections) {
    return
  }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    if ($processId -and $processId -ne $PID) {
      Write-Step "Port $Port is already in use by PID $processId. Stopping the old process..."
      taskkill /PID $processId /F | Out-Null
    }
  }

  Start-Sleep -Milliseconds 400
}

$envFile = Join-Path $repoRoot ".env.local"
Load-DotEnvFile -Path $envFile

if (-not $env:HOST) { $env:HOST = "127.0.0.1" }
if (-not $env:PORT) { $env:PORT = "8787" }
if (-not $env:PUBLIC_BASE_URL) { $env:PUBLIC_BASE_URL = "http://03hhhx.dpdns.org" }
if (-not $env:GITHUB_REPO_OWNER) { $env:GITHUB_REPO_OWNER = "HarmonLiu05" }
if (-not $env:GITHUB_REPO_NAME) { $env:GITHUB_REPO_NAME = "autolearning" }
if (-not $env:GITHUB_REPO_BRANCH) { $env:GITHUB_REPO_BRANCH = "main" }

if (-not $env:GITHUB_REPO_TOKEN) {
  Write-Error "Missing GITHUB_REPO_TOKEN. Copy .env.local.example to .env.local and fill in your token first."
  exit 1
}

$portNumber = 0
if (-not [int]::TryParse($env:PORT, [ref]$portNumber)) {
  Write-Error "PORT must be a number. Current value: $($env:PORT)"
  exit 1
}

Stop-PortOwner -Port $portNumber

Write-Step "Preparing to start the Autolearning server..."
Write-Host "  HOST=$($env:HOST)"
Write-Host "  PORT=$($env:PORT)"
Write-Host "  PUBLIC_BASE_URL=$($env:PUBLIC_BASE_URL)"
Write-Host "  GITHUB_REPO_OWNER=$($env:GITHUB_REPO_OWNER)"
Write-Host "  GITHUB_REPO_NAME=$($env:GITHUB_REPO_NAME)"
Write-Host "  GITHUB_REPO_BRANCH=$($env:GITHUB_REPO_BRANCH)"
Write-Host ""
Write-Host "Health check URLs:"
Write-Host "  Local:  http://127.0.0.1:$($env:PORT)/health"
Write-Host "  Public: $($env:PUBLIC_BASE_URL)/health"
Write-Host ""
Write-Host "After the server starts, reload the browser extension before testing contributions." -ForegroundColor Yellow
Write-Host ""

npm run dev:server
