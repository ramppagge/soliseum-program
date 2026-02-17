# Restart frontend with clean cache
Write-Host "=== Restarting Frontend (Clean Cache) ===" -ForegroundColor Cyan
Write-Host ""

# Stop any running node processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

cd soliseum-arena

# Clear vite cache
Write-Host "Clearing Vite cache..." -ForegroundColor Yellow
if (Test-Path "node_modules/.vite") {
    Remove-Item -Recurse -Force "node_modules/.vite"
}

# Rebuild
Write-Host "Building..." -ForegroundColor Yellow
npm run build

# Start dev server
Write-Host ""
Write-Host "Starting dev server on port 8080..." -ForegroundColor Green
npm run dev
