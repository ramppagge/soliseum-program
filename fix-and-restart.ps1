# Fix and restart everything
Write-Host "=== Fixing Soliseum Backend & Frontend ===" -ForegroundColor Cyan

# Kill any running Node processes on port 4000 and 5173
Write-Host ""
Write-Host "Step 1: Stopping any running Node processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Build backend
Write-Host ""
Write-Host "Step 2: Building backend..." -ForegroundColor Yellow
cd soliseum-backend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend build failed" -ForegroundColor Red
    exit 1
}

# Start backend in new window
Write-Host ""
Write-Host "Step 3: Starting backend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $PWD; npm run dev" -WindowStyle Normal

# Wait for backend to start
Write-Host "Waiting for backend to start..."
$retries = 0
while ($retries -lt 10) {
    Start-Sleep -Seconds 2
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method GET -TimeoutSec 2
        Write-Host "✅ Backend is up! (Status: $($health.status))" -ForegroundColor Green
        break
    } catch {
        $retries++
        Write-Host "  Retry $retries/10..." -ForegroundColor Gray
    }
}

if ($retries -eq 10) {
    Write-Host "❌ Backend failed to start" -ForegroundColor Red
    exit 1
}

# Build frontend
Write-Host ""
Write-Host "Step 4: Building frontend..." -ForegroundColor Yellow
cd ../soliseum-arena
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed" -ForegroundColor Red
    exit 1
}

# Start frontend in new window
Write-Host ""
Write-Host "Step 5: Starting frontend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $PWD; npm run dev" -WindowStyle Normal

# Check if matchmaking route works now
Write-Host ""
Write-Host "Step 6: Testing matchmaking API..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/api/matchmaking/battles" -Method GET -TimeoutSec 5
    if ($response.ok -eq $true) {
        Write-Host "✅ Matchmaking API is working!" -ForegroundColor Green
        Write-Host "   Found $($response.battles.Count) battle(s)" -ForegroundColor White
    } else {
        Write-Host "⚠️ API returned error: $($response.error)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ API test failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "All services should be running!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open http://localhost:5173/arena" -ForegroundColor White
Write-Host "  2. Go to Agent Lab, click 'Enter Arena' on 2 agents" -ForegroundColor White
Write-Host "  3. Return to Arena to see STAKING OPEN section" -ForegroundColor White
Write-Host ""
Write-Host "Or create a test battle instantly:" -ForegroundColor Cyan
Write-Host "  cd soliseum-backend" -ForegroundColor White
Write-Host "  npx tsx scripts/create-test-battle.ts" -ForegroundColor White
