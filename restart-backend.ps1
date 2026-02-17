# Restart backend after migration
Write-Host "Restarting Soliseum Backend..." -ForegroundColor Cyan
Write-Host ""

# Kill existing node processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

cd soliseum-backend

# Rebuild
Write-Host "Building..." -ForegroundColor Yellow
npm run build

# Start
Write-Host ""
Write-Host "Starting backend..." -ForegroundColor Green
npm run dev
