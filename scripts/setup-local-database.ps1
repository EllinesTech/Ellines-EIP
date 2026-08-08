# Local PostgreSQL Database Setup Script
# Run this to set up local database for offline development

Write-Host "Local PostgreSQL Setup for Ellines EIP" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$PSQL = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$PG_HOST = "localhost"
$PG_PORT = "5432"
$PG_USER = "postgres"
$DB_NAME = "ellines_eip_local"

# Step 1: Check if PostgreSQL is running
Write-Host "Step 1: Checking PostgreSQL service..." -ForegroundColor Yellow
$service = Get-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue
if ($service.Status -eq "Running") {
    Write-Host "[OK] PostgreSQL is running`n" -ForegroundColor Green
} else {
    Write-Host "[ERROR] PostgreSQL is not running. Starting service..." -ForegroundColor Red
    Start-Service -Name "postgresql-x64-18"
    Start-Sleep -Seconds 3
    Write-Host "[OK] PostgreSQL service started`n" -ForegroundColor Green
}

# Step 2: Set password for postgres user
Write-Host "Step 2: Setting up postgres user password..." -ForegroundColor Yellow
Write-Host "Please enter a password for the 'postgres' user (or press Enter to use 'postgres'):" -ForegroundColor Cyan
$securePassword = Read-Host -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$PG_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

if ([string]::IsNullOrWhiteSpace($PG_PASSWORD)) {
    $PG_PASSWORD = "postgres"
    Write-Host "Using default password: 'postgres'" -ForegroundColor Gray
}

Write-Host "`n[OK] Password set`n" -ForegroundColor Green

# Step 3: Test connection
Write-Host "Step 3: Testing connection..." -ForegroundColor Yellow
$env:PGPASSWORD = $PG_PASSWORD
$testResult = & $PSQL -U $PG_USER -h $PG_HOST -p $PG_PORT -d postgres -c "SELECT version();" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Connection successful`n" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Connection failed. The password might be incorrect." -ForegroundColor Red
    Write-Host "Please run pgAdmin or reset the password manually.`n" -ForegroundColor Yellow
    exit 1
}

# Step 4: Create database
Write-Host "Step 4: Creating database '$DB_NAME'..." -ForegroundColor Yellow
$checkDb = & $PSQL -U $PG_USER -h $PG_HOST -p $PG_PORT -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>&1

if ($checkDb -eq "1") {
    Write-Host "[WARNING] Database '$DB_NAME' already exists" -ForegroundColor Yellow
    $response = Read-Host "Do you want to drop and recreate it? (yes/no)"
    if ($response -eq "yes") {
        Write-Host "Dropping existing database..." -ForegroundColor Gray
        & $PSQL -U $PG_USER -h $PG_HOST -p $PG_PORT -d postgres -c "DROP DATABASE $DB_NAME;" 2>&1 | Out-Null
        Write-Host "Creating new database..." -ForegroundColor Gray
        & $PSQL -U $PG_USER -h $PG_HOST -p $PG_PORT -d postgres -c "CREATE DATABASE $DB_NAME;" 2>&1 | Out-Null
        Write-Host "[OK] Database recreated`n" -ForegroundColor Green
    } else {
        Write-Host "[OK] Using existing database`n" -ForegroundColor Green
    }
} else {
    & $PSQL -U $PG_USER -h $PG_HOST -p $PG_PORT -d postgres -c "CREATE DATABASE $DB_NAME;" 2>&1 | Out-Null
    Write-Host "[OK] Database '$DB_NAME' created`n" -ForegroundColor Green
}

# Step 5: Save credentials to .env.local
Write-Host "Step 5: Saving credentials..." -ForegroundColor Yellow
$LOCAL_DATABASE_URL = "postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${DB_NAME}"

$envLocalContent = @"
# Local PostgreSQL Configuration (for offline development)
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

LOCAL_DATABASE_URL=$LOCAL_DATABASE_URL
LOCAL_DIRECT_URL=$LOCAL_DATABASE_URL

# To use local database, temporarily set:
# DATABASE_URL=$LOCAL_DATABASE_URL
# DIRECT_URL=$LOCAL_DATABASE_URL

# Then run: npm run db:push
"@

$envLocalContent | Out-File -FilePath ".env.local" -Encoding UTF8
Write-Host "[OK] Credentials saved to .env.local`n" -ForegroundColor Green

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  - PostgreSQL Service: Running" -ForegroundColor White
Write-Host "  - Database: $DB_NAME" -ForegroundColor White
Write-Host "  - Host: $PG_HOST" -ForegroundColor White
Write-Host "  - Port: $PG_PORT" -ForegroundColor White
Write-Host "  - User: $PG_USER" -ForegroundColor White
Write-Host "  - Credentials saved to: .env.local`n" -ForegroundColor White

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Sync the schema to local database:" -ForegroundColor White
Write-Host "     - Backup current .env: copy .env .env.backup" -ForegroundColor Gray
Write-Host "     - Update DATABASE_URL in .env to point to local" -ForegroundColor Gray
Write-Host "     - Run: npm run db:push" -ForegroundColor Gray
Write-Host "     - Restore .env: copy .env.backup .env" -ForegroundColor Gray
Write-Host "  2. Start the identity service: npm run dev:identity" -ForegroundColor White
Write-Host "  3. Login to the web app as Owner" -ForegroundColor White
Write-Host "  4. Go to Settings -> Database Configuration" -ForegroundColor White
Write-Host "  5. Add new configuration with these details:" -ForegroundColor White
Write-Host "     - Name: Local Development" -ForegroundColor Gray
Write-Host "     - Type: local" -ForegroundColor Gray
Write-Host "     - Host: localhost" -ForegroundColor Gray
Write-Host "     - Port: 5432" -ForegroundColor Gray
Write-Host "     - Database: ellines_eip_local" -ForegroundColor Gray
Write-Host "     - Username: postgres" -ForegroundColor Gray
Write-Host "     - Password: [the password you just set]" -ForegroundColor Gray
Write-Host "  6. Test Connection" -ForegroundColor White
Write-Host "  7. Click 'Set as Primary' to switch to local database`n" -ForegroundColor White

Write-Host "Tip: Keep Supabase as primary for online work." -ForegroundColor Cyan
Write-Host "     Switch to local when you want to work offline.`n" -ForegroundColor Cyan

Write-Host "Connection String:" -ForegroundColor Yellow
Write-Host "  $LOCAL_DATABASE_URL`n" -ForegroundColor Gray

# Save connection info to a file for reference
$infoContent = @"
Local PostgreSQL Connection Details
====================================
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

Host: $PG_HOST
Port: $PG_PORT
Database: $DB_NAME
Username: $PG_USER
Password: [saved in .env.local]

Connection String:
$LOCAL_DATABASE_URL

To use this database:
1. Configure via Settings UI (recommended)
2. Or temporarily set in .env:
   DATABASE_URL=$LOCAL_DATABASE_URL
   DIRECT_URL=$LOCAL_DATABASE_URL
"@

$infoContent | Out-File -FilePath "LOCAL_DATABASE_INFO.txt" -Encoding UTF8
Write-Host "[OK] Connection details saved to: LOCAL_DATABASE_INFO.txt`n" -ForegroundColor Green
