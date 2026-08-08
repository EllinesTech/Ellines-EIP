# db-switch.ps1 -- Switch DATABASE_URL between local PostgreSQL and Supabase
# Usage:
#   .\scripts\db-switch.ps1 local   -- point .env at ellines_eip_local
#   .\scripts\db-switch.ps1 cloud   -- point .env at Supabase
#   .\scripts\db-switch.ps1 status  -- show which DB is active

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("local","cloud","status")]
    [string]$Target
)

$envFile = ".env"
$localUrl = "postgresql://postgres:80802424@localhost:5432/ellines_eip_local"
$cloudUrl = "postgresql://postgres.difrqfciratkwwvjlngp:Mwasblac808024242022@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30"

if (-not (Test-Path $envFile)) {
    Write-Host "[ERROR] .env not found in $(Get-Location)" -ForegroundColor Red
    exit 1
}

# Read line by line to avoid CRLF issues
$lines = Get-Content $envFile
$dbLine = ""
foreach ($line in $lines) {
    if ($line -match "^DATABASE_URL=") {
        $dbLine = $line
        break
    }
}

$isLocal = $dbLine -match "localhost:5432/ellines_eip_local"
$isCloud = $dbLine -match "pooler\.supabase\.com"

if ($Target -eq "status") {
    if ($isLocal) {
        Write-Host "[ACTIVE] Local -- postgresql://postgres@localhost:5432/ellines_eip_local" -ForegroundColor Green
    } elseif ($isCloud) {
        Write-Host "[ACTIVE] Supabase (cloud) -- aws-1-eu-west-2.pooler.supabase.com" -ForegroundColor Cyan
    } else {
        Write-Host "[ACTIVE] Unknown / custom DATABASE_URL: $dbLine" -ForegroundColor Yellow
    }
    exit 0
}

# Read full content for replacement
$content = Get-Content $envFile -Raw

if ($Target -eq "local") {
    if ($isLocal) {
        Write-Host "[ALREADY] Already pointing at local DB" -ForegroundColor Yellow
        exit 0
    }
    $content = $content -replace "(?m)^DATABASE_URL=.*", "DATABASE_URL=$localUrl"
    $content = $content -replace "(?m)^DIRECT_URL=.*", "DIRECT_URL=$localUrl"
    [System.IO.File]::WriteAllText((Resolve-Path $envFile).Path, $content)
    Write-Host "[SWITCHED] .env now points to: ellines_eip_local (localhost)" -ForegroundColor Green
    Write-Host "  Run: npm run dev:identity" -ForegroundColor Gray
}

if ($Target -eq "cloud") {
    if ($isCloud) {
        Write-Host "[ALREADY] Already pointing at Supabase" -ForegroundColor Yellow
        exit 0
    }
    $content = $content -replace "(?m)^DATABASE_URL=.*", "DATABASE_URL=$cloudUrl"
    $content = $content -replace "(?m)^DIRECT_URL=.*", "DIRECT_URL=$cloudUrl"
    [System.IO.File]::WriteAllText((Resolve-Path $envFile).Path, $content)
    Write-Host "[SWITCHED] .env now points to: Supabase (cloud)" -ForegroundColor Cyan
    Write-Host "  Live site at eip.ellines.co.ke also uses Supabase." -ForegroundColor Gray
}
