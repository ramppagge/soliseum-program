# Debug Database Connection
Write-Host "=== Database Connection Debug ===" -ForegroundColor Cyan
Write-Host ""

$envContent = Get-Content "soliseum-backend/.env" -Raw

if ($envContent -match 'DATABASE_URL=(.+)') {
    $url = $Matches[1].Trim()
    
    Write-Host "URL from .env:" -ForegroundColor Yellow
    Write-Host $url
    Write-Host ""
    
    # Handle both postgres:// and postgresql://
    $normalizedUrl = $url -replace '^postgresql://', 'postgres://'
    
    if ($normalizedUrl -match '^postgres://([^:]+):(.+)@([^:]+):(\d+)/(.+)$') {
        $user = $Matches[1]
        $pass = $Matches[2]
        $hostname = $Matches[3]
        $port = $Matches[4]
        $database = $Matches[5]
        
        Write-Host "Parsed:" -ForegroundColor Green
        Write-Host "  User: $user"
        Write-Host "  Pass: $($pass.Substring(0, 3))... (length: $($pass.Length))"
        Write-Host "  Host: $hostname"
        Write-Host "  Port: $port"
        Write-Host "  DB: $database"
        Write-Host ""
        
        # Verify format
        $userOk = $user -match '^postgres\.'
        $portOk = $port -eq '6543'
        
        Write-Host "Checks:" -ForegroundColor Yellow
        Write-Host "  User format (postgres.xxx): $(if ($userOk) { 'OK' } else { 'WRONG' })" -ForegroundColor $(if ($userOk) { 'Green' } else { 'Red' })
        Write-Host "  Port (6543): $(if ($portOk) { 'OK' } else { 'WRONG' })" -ForegroundColor $(if ($portOk) { 'Green' } else { 'Red' })
        Write-Host ""
        
        if ($userOk -and $portOk) {
            Write-Host "Connection string looks CORRECT!" -ForegroundColor Green
            Write-Host ""
            Write-Host "If it's still failing, try:" -ForegroundColor Cyan
            Write-Host "1. Reset password again (maybe copy/paste error)" -ForegroundColor White
            Write-Host "2. Check for extra spaces in .env file" -ForegroundColor White
            Write-Host "3. Try Session Pooler (port 5432) as test" -ForegroundColor White
        }
        
    } else {
        Write-Host "Cannot parse URL" -ForegroundColor Red
    }
} else {
    Write-Host "DATABASE_URL not found" -ForegroundColor Red
}
