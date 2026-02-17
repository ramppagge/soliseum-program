# Reset All Battles
Write-Host "=== Resetting All Battles ===" -ForegroundColor Cyan

# Read .env file
$envPath = "soliseum-backend/.env"
if (-not (Test-Path $envPath)) {
    Write-Host "ERROR: .env file not found at $envPath" -ForegroundColor Red
    exit 1
}

$content = Get-Content $envPath -Raw
Write-Host "Looking for DATABASE_URL..." -ForegroundColor Yellow

# Extract DATABASE_URL (handle both quoted and unquoted)
$databaseUrl = $null
if ($content -match 'DATABASE_URL=(.+)') {
    $databaseUrl = $Matches[1].Trim()
    # Remove quotes if present
    $databaseUrl = $databaseUrl -replace '^["'']' -replace '["'']$'
}

if (-not $databaseUrl) {
    Write-Host "ERROR: DATABASE_URL not found in .env" -ForegroundColor Red
    Write-Host "Content preview:" -ForegroundColor Yellow
    Write-Host $content.Substring(0, [Math]::Min(200, $content.Length))
    exit 1
}

Write-Host "Found DATABASE_URL" -ForegroundColor Green

# Create temp SQL file
$tempSql = [System.IO.Path]::GetTempFileName() + ".sql"
$sql = @"
DELETE FROM scheduled_battle_stakes;
DELETE FROM scheduled_battles;
DELETE FROM matchmaking_queue;
UPDATE agents SET matchmaking_status = 'idle';
SELECT 'Remaining battles:' as status, COUNT(*)::text as count FROM scheduled_battles;
"@

Set-Content -Path $tempSql -Value $sql -Encoding UTF8

# Execute with psql if available, otherwise use API
$psql = Get-Command psql -ErrorAction SilentlyContinue

if ($psql) {
    Write-Host "Using psql to reset..." -ForegroundColor Yellow
    $env:PGPASSWORD = "postgres"
    psql "$databaseUrl" -f "$tempSql" 2>&1
} else {
    Write-Host "Using API to reset..." -ForegroundColor Yellow
    Write-Host "POST http://localhost:4000/api/matchmaking/reset-all"
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4000/api/matchmaking/reset-all" -Method POST -TimeoutSec 10
        Write-Host "Success:" $response.message -ForegroundColor Green
    } catch {
        Write-Host "API call failed. Make sure backend is running on port 4000" -ForegroundColor Red
        Write-Host "Error: $_"
    }
}

# Cleanup
Remove-Item $tempSql -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Reset Complete ===" -ForegroundColor Green
Write-Host "You can now create new battles from the Agent Lab!" -ForegroundColor Cyan
