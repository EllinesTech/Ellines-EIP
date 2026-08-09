# Test Ellines EIP Connector Functionality
$baseUrl = "http://localhost:3001/api/v1"
$webUrl = "http://localhost:3100"

Write-Host "`n=== ELLINES EIP CONNECTOR TEST ===" -ForegroundColor Cyan

# Step 1: Login
Write-Host "[1/5] Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = "demo@ellines.co.ke"
    password = "EllinesDemo2026!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.accessToken
    $orgId = $loginResponse.user.organizationId
    Write-Host "  SUCCESS: Logged in as $($loginResponse.user.email)" -ForegroundColor Green
    Write-Host "    Org ID: $orgId" -ForegroundColor Gray
} catch {
    Write-Host "  FAILED: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Get connector catalog
Write-Host "`n[2/5] Fetching connector catalog..." -ForegroundColor Yellow
try {
    $catalog = Invoke-RestMethod -Uri "$baseUrl/connectors" -Method Get -Headers $headers
    Write-Host "  SUCCESS: Found $($catalog.Count) connector templates" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Get existing installations
Write-Host "`n[3/5] Checking existing installations..." -ForegroundColor Yellow
try {
    $installations = Invoke-RestMethod -Uri "$baseUrl/connectors/installations?organizationId=$orgId" -Method Get -Headers $headers
    Write-Host "  SUCCESS: Found $($installations.Count) installations" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Get enterprise summary
Write-Host "`n[4/5] Fetching enterprise summary..." -ForegroundColor Yellow
try {
    $summary = Invoke-RestMethod -Uri "$baseUrl/enterprise/summary?organizationId=$orgId" -Method Get -Headers $headers
    Write-Host "  SUCCESS: Health Score = $($summary.healthScore), Systems = $($summary.connectedSystems)" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: $_" -ForegroundColor Red
}

# Step 5: Test CSV connector
Write-Host "`n[5/5] Testing CSV connector installation..." -ForegroundColor Yellow
$csvTemplate = $catalog | Where-Object { $_.slug -eq "csv-file" } | Select-Object -First 1

if ($csvTemplate) {
    $csvData = "healthScore,connectedSystems,openAlerts,openDecisions,briefHighlight`n85,5,2,1,Test connector from PowerShell"
    $installBody = @{
        catalogId = $csvTemplate.id
        displayName = "Test CSV $(Get-Date -Format 'HHmmss')"
        config = @{
            csvText = $csvData
        }
    } | ConvertTo-Json -Depth 10
    
    try {
        $newInstall = Invoke-RestMethod -Uri "$baseUrl/connectors/installations" -Method Post -Body $installBody -Headers $headers
        Write-Host "  SUCCESS: Installed connector $($newInstall.displayName)" -ForegroundColor Green
        
        Start-Sleep -Seconds 1
        $syncResult = Invoke-RestMethod -Uri "$baseUrl/connectors/installations/$($newInstall.id)/sync" -Method Post -Headers $headers
        Write-Host "  SUCCESS: Sync completed - Health Score = $($syncResult.healthScore)" -ForegroundColor Green
    } catch {
        Write-Host "  FAILED: $_" -ForegroundColor Red
    }
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Cyan
Write-Host "Web UI: http://localhost:3100`n" -ForegroundColor White
