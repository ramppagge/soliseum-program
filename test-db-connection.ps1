# Test Database Connection
Write-Host "=== Testing Supabase Connection ===" -ForegroundColor Cyan
Write-Host ""

# Load .env
$envFile = "soliseum-backend/.env"
if (-not (Test-Path $envFile)) {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    exit 1
}

# Parse DATABASE_URL
$content = Get-Content $envFile -Raw
if ($content -match "DATABASE_URL=(.+)") {
    $url = $Matches[1].Trim()
    
    # Mask password for display
    $displayUrl = $url -replace ":([^:@]+)@", ":****@"
    Write-Host "URL found: $displayUrl" -ForegroundColor Yellow
    Write-Host ""
    
    # Check components
    if ($url -match "postgres://([^:]+):([^@]+)@([^/]+)/(.+)") {
        $user = $Matches[1]
        $pass = $Matches[2]
        $host = $Matches[3]
        $db = $Matches[4]
        
        Write-Host "User: $user"
        Write-Host "Host: $host"
        Write-Host "Database: $db"
        Write-Host "Password length: $($pass.Length) chars"
        Write-Host ""
        
        # Check if using transaction pooler
        if ($host -match ":6543") {
            Write-Host "✅ Using Transaction Pooler port (6543)" -ForegroundColor Green
        } elseif ($host -match ":5432") {
            Write-Host "❌ Using Session Pooler port (5432) - WRONG!" -ForegroundColor Red
            Write-Host "   Switch to port 6543" -ForegroundColor Yellow
        }
        
        # Test network connectivity
        Write-Host ""
        Write-Host "Testing network connectivity..." -ForegroundColor Yellow
        $hostname = ($host -split ":")[0]
        
        try {
            $ping = Test-Connection -ComputerName $hostname -Count 2 -ErrorAction Stop
            Write-Host "✅ Host is reachable" -ForegroundColor Green
        } catch {
            Write-Host "❌ Cannot reach host: $hostname" -ForegroundColor Red
            Write-Host "   Possible causes:" -ForegroundColor Yellow
            Write-Host "   - Firewall blocking connection" -ForegroundColor White
            Write-Host "   - Supabase project is paused (free tier)" -ForegroundColor White
            Write-Host "   - Wrong hostname" -ForegroundColor White
        }
        
        # Check if Supabase project is active
        Write-Host ""
        Write-Host "Checking Supabase project status..." -ForegroundColor Yellow
        Write-Host "   Go to: https://app.supabase.com/project/_/settings/general" -ForegroundColor Cyan
        Write-Host "   Make sure your project shows 'Active' status" -ForegroundColor White
        
    } else {
        Write-Host "❌ Could not parse DATABASE_URL format" -ForegroundColor Red
    }
} else {
    Write-Host "❌ DATABASE_URL not found in .env" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Troubleshooting Steps ===" -ForegroundColor Cyan
Write-Host "1. Check if project is paused:" -ForegroundColor Yellow
Write-Host "   https://app.supabase.com - look for 'Resume' button" -ForegroundColor White
Write-Host ""
Write-Host "2. Try direct connection test:" -ForegroundColor Yellow
Write-Host "   npx pg-connection-test $url" -ForegroundColor White
Write-Host ""
Write-Host "3. Use Session Pooler as fallback:" -ForegroundColor Yellow
Write-Host "   Replace :6543 with :5432 in your URL" -ForegroundColor White
