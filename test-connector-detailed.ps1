# Detailed Connector Test
$baseUrl = "http://localhost:3001/api/v1"

Write-Host "`n=== DETAILED CONNECTOR TEST ===" -ForegroundColor Cyan

# Login
$loginBody = @{ email = "demo@ellines.co.ke"; password = "EllinesDemo2026!" } | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResponse.accessToken
$orgId = $loginResponse.user.organizationId
$headers = @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" }

Write-Host "Logged in as: $($loginResponse.user.email)" -ForegroundColor Green

# Get catalog
$catalog = Invoke-RestMethod -Uri "$baseUrl/connectors" -Method Get -Headers $headers
Write-Host "`nConnector Templates Available:" -ForegroundColor Yellow
$catalog | ForEach-Object {
    Write-Host "  [$($_.slug)] $($_.name) - $($_.description.Substring(0, [Math]::Min(60, $_.description.Length)))..." -ForegroundColor Gray
}

# Test CSV Connector
Write-Host "`n--- Testing CSV Connector ---" -ForegroundColor Cyan
$csvTemplate = $catalog | Where-Object { $_.slug -eq "csv-file" }
$csvData = @"
healthScore,connectedSystems,openAlerts,openDecisions,briefHighlight
92,7,1,3,Production environment running smoothly
"@

$installBody = @{
    catalogId = $csvTemplate.id
    displayName = "CSV Test $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    config = @{ csvText = $csvData }
} | ConvertTo-Json -Depth 10

$newInstall = Invoke-RestMethod -Uri "$baseUrl/connectors/installations" -Method Post -Body $installBody -Headers $headers
Write-Host "Installed: $($newInstall.displayName) [ID: $($newInstall.id)]" -ForegroundColor Green

# Sync the connector
Write-Host "Syncing connector..." -ForegroundColor Yellow
$syncResult = Invoke-RestMethod -Uri "$baseUrl/connectors/installations/$($newInstall.id)/sync" -Method Post -Headers $headers
Write-Host "Sync Result:" -ForegroundColor Green
Write-Host "  Health Score: $($syncResult.healthScore)" -ForegroundColor White
Write-Host "  Connected Systems: $($syncResult.connectedSystems)" -ForegroundColor White
Write-Host "  Open Alerts: $($syncResult.openAlerts)" -ForegroundColor White
Write-Host "  Open Decisions: $($syncResult.openDecisions)" -ForegroundColor White
Write-Host "  Brief: $($syncResult.briefHighlight)" -ForegroundColor White

# Check enterprise summary updated
Write-Host "`nChecking updated enterprise summary..." -ForegroundColor Yellow
$summary = Invoke-RestMethod -Uri "$baseUrl/enterprise/summary?organizationId=$orgId" -Method Get -Headers $headers
Write-Host "Enterprise Summary:" -ForegroundColor Green
Write-Host "  Health Score: $($summary.healthScore)" -ForegroundColor White
Write-Host "  Connected Systems: $($summary.connectedSystems)" -ForegroundColor White
Write-Host "  Open Alerts: $($summary.openAlerts)" -ForegroundColor White
Write-Host "  Open Decisions: $($summary.openDecisions)" -ForegroundColor White

# Test REST API Connector
Write-Host "`n--- Testing REST API Connector ---" -ForegroundColor Cyan
$restTemplate = $catalog | Where-Object { $_.slug -eq "rest-generic" }

if ($restTemplate) {
    $restInstallBody = @{
        catalogId = $restTemplate.id
        displayName = "JSONPlaceholder Test"
        config = @{
            endpoint = "https://jsonplaceholder.typicode.com/todos/1"
            authType = "none"
        }
    } | ConvertTo-Json -Depth 10
    
    try {
        $restInstall = Invoke-RestMethod -Uri "$baseUrl/connectors/installations" -Method Post -Body $restInstallBody -Headers $headers
        Write-Host "Installed: $($restInstall.displayName)" -ForegroundColor Green
        
        Write-Host "Syncing REST connector..." -ForegroundColor Yellow
        $restSync = Invoke-RestMethod -Uri "$baseUrl/connectors/installations/$($restInstall.id)/sync" -Method Post -Headers $headers
        Write-Host "REST Sync Result: Health Score = $($restSync.healthScore)" -ForegroundColor Green
    } catch {
        Write-Host "REST connector test failed: $_" -ForegroundColor Yellow
    }
}

# List all installations
Write-Host "`n--- All Connector Installations ---" -ForegroundColor Cyan
$allInstalls = Invoke-RestMethod -Uri "$baseUrl/connectors/installations?organizationId=$orgId" -Method Get -Headers $headers
$allInstalls | ForEach-Object {
    $statusColor = if ($_.status -eq "active") { "Green" } else { "Yellow" }
    Write-Host "  [$($_.status)] $($_.displayName)" -ForegroundColor $statusColor
    Write-Host "    ID: $($_.id)" -ForegroundColor Gray
    Write-Host "    Last Synced: $($_.lastSyncedAt)" -ForegroundColor Gray
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Cyan
Write-Host "Total Installations: $($allInstalls.Count)" -ForegroundColor White
Write-Host "`n" 
