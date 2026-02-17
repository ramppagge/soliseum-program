# Fix Supabase Connection Issues
Write-Host "=== Supabase Connection Fix ===" -ForegroundColor Cyan
Write-Host ""

# Check current DATABASE_URL
$envFile = "soliseum-backend/.env"
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    
    if ($content -match "DATABASE_URL=([^
]+)") {
        $currentUrl = $Matches[1]
        Write-Host "Current DATABASE_URL found" -ForegroundColor Yellow
        
        # Check if using session pooler (port 5432)
        if ($currentUrl -match ":5432") {
            Write-Host ""
            Write-Host "❌ PROBLEM DETECTED: You're using Session Pooler (port 5432)" -ForegroundColor Red
            Write-Host "   Free tier limits this to ~10 connections" -ForegroundColor Red
            Write-Host ""
            Write-Host "✅ SOLUTION: Switch to Transaction Pooler" -ForegroundColor Green
            Write-Host ""
            Write-Host "Steps to fix:" -ForegroundColor Cyan
            Write-Host "1. Go to https://app.supabase.com" -ForegroundColor White
            Write-Host "2. Select your project" -ForegroundColor White  
            Write-Host "3. Click 'Connect' button (top right)" -ForegroundColor White
            Write-Host "4. Under 'Transaction Pooler', copy the connection string" -ForegroundColor White
            Write-Host "5. It should look like:" -ForegroundColor Gray
            Write-Host "   postgres://postgres.xxx:[password]@aws-0-xx.pooler.supabase.com:6543/postgres" -ForegroundColor Gray
            Write-Host ""
            Write-Host "6. Update your .env file with the new URL" -ForegroundColor White
            Write-Host ""
        }
        elseif ($currentUrl -match ":6543") {
            Write-Host "✅ Good! You're using Transaction Pooler (port 6543)" -ForegroundColor Green
            Write-Host ""
            Write-Host "If you're still getting connection errors:" -ForegroundColor Yellow
            Write-Host "1. Wait 2-3 minutes for Supabase to release stuck connections" -ForegroundColor White
            Write-Host "2. Restart your backend" -ForegroundColor White
            Write-Host "3. Or restart your Supabase project (Settings > General > Restart)" -ForegroundColor White
        }
        else {
            Write-Host "⚠️ Cannot detect pooler type from URL" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "❌ DATABASE_URL not found in .env file" -ForegroundColor Red
    }
}
else {
    Write-Host "❌ .env file not found at $envFile" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Alternative Solutions ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "If you can't use Transaction Pooler:" -ForegroundColor Yellow
Write-Host "1. Reduce matchmaking frequency (already done)" -ForegroundColor White
Write-Host "2. Use local PostgreSQL for development" -ForegroundColor White
Write-Host "3. Upgrade to Supabase Pro ($25/month)" -ForegroundColor White
Write-Host ""
