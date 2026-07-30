# Puts Cloudflare Pages secrets for live auth (values read from root .env, not printed).
# Requires: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in .env.cloudflare or environment.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-DotEnvValue([string]$file, [string]$key) {
  if (-not (Test-Path $file)) { return $null }
  $line = Get-Content $file | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$key\s*=\s*", '').Trim().Trim('"').Trim("'")
}

# Load Cloudflare credentials into process env (do not echo)
$cfFile = Join-Path $root '.env.cloudflare'
if (Test-Path $cfFile) {
  Get-Content $cfFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      Set-Item -Path "Env:$($matches[1])" -Value $matches[2].Trim().Trim('"').Trim("'")
    }
  }
}

$supabaseUrl = Get-DotEnvValue (Join-Path $root '.env') 'SUPABASE_URL'
if (-not $supabaseUrl) { $supabaseUrl = Get-DotEnvValue (Join-Path $root '.env') 'NEXT_PUBLIC_SUPABASE_URL' }
$serviceKey = Get-DotEnvValue (Join-Path $root '.env') 'SUPABASE_SERVICE_ROLE_KEY'
$jwt = Get-DotEnvValue (Join-Path $root '.env') 'JWT_SECRET'
if (-not $jwt) { $jwt = 'ellines-eip-dev-secret' }

if (-not $env:CLOUDFLARE_API_TOKEN -or -not $env:CLOUDFLARE_ACCOUNT_ID) {
  throw 'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required (.env.cloudflare)'
}
if (-not $supabaseUrl -or -not $serviceKey) {
  throw 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env'
}

Write-Host 'Setting Pages secrets for ellines-eip (values hidden)...'
$supabaseUrl | npx --yes wrangler@4.114.0 pages secret put SUPABASE_URL --project-name=ellines-eip
$serviceKey | npx --yes wrangler@4.114.0 pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name=ellines-eip
$jwt | npx --yes wrangler@4.114.0 pages secret put JWT_SECRET --project-name=ellines-eip
Write-Host 'Secrets updated.'
