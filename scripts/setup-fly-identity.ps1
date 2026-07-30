# One-time: create Fly app, set secrets from root .env, deploy Identity.
# Prerequisites: flyctl installed and `flyctl auth login` completed.
# Usage (from repo root):  powershell -File scripts/setup-fly-identity.ps1

$ErrorActionPreference = 'Stop'
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path .env)) {
  throw 'Missing .env — need DATABASE_URL, DIRECT_URL, JWT_SECRET'
}

function Get-DotEnvValue([string]$key) {
  $line = Get-Content .env | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$key\s*=\s*", '').Trim().Trim('"').Trim("'")
}

$db = Get-DotEnvValue 'DATABASE_URL'
$direct = Get-DotEnvValue 'DIRECT_URL'
$jwt = Get-DotEnvValue 'JWT_SECRET'
if (-not $jwt) { $jwt = -join ((48..57 + 65..90 + 97..122 | Get-Random -Count 48 | ForEach-Object { [char]$_ })) }

if (-not $db -or -not $direct) {
  throw 'DATABASE_URL and DIRECT_URL must be set in .env'
}

Write-Host 'Checking Fly auth...'
flyctl auth whoami

Write-Host 'Ensuring app ellines-eip-identity exists...'
flyctl apps create ellines-eip-identity --org personal 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host '(app may already exist — continuing)'
}

Write-Host 'Setting Fly secrets (values not printed)...'
flyctl secrets set `
  "DATABASE_URL=$db" `
  "DIRECT_URL=$direct" `
  "JWT_SECRET=$jwt" `
  'CORS_ORIGINS=https://eip.ellines.co.ke,https://ellines-eip.pages.dev,http://localhost:3100' `
  --app ellines-eip-identity

Write-Host 'Deploying Identity...'
flyctl deploy --config services/identity/fly.toml --dockerfile services/identity/Dockerfile --app ellines-eip-identity

Write-Host ''
Write-Host 'Done. Health: https://ellines-eip-identity.fly.dev/api/v1/health'
Write-Host 'Then: npm run seed:demo  (same DB) and redeploy web / set NEXT_PUBLIC_API_URL if needed.'
Write-Host 'Create a Fly deploy token and add GitHub secret FLY_API_TOKEN for CI.'
