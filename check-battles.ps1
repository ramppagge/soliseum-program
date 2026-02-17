# Check what's happening with battles
Write-Host "=== Soliseum Battle Status Check ===" -ForegroundColor Cyan
Write-Host ""

# Check if backend is running
try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/api/matchmaking/battles" -Method GET -TimeoutSec 5
    Write-Host "✅ Backend API is working" -ForegroundColor Green
    Write-Host ""
    
    if ($response.ok -eq $true) {
        $battleCount = $response.battles.Count
        
        if ($battleCount -eq 0) {
            Write-Host "⚠️  No scheduled battles found" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "This is why you don't see changes on the frontend!" -ForegroundColor Red
            Write-Host ""
            Write-Host "To create a test battle, run:" -ForegroundColor Cyan
            Write-Host "  cd soliseum-backend" -ForegroundColor White
            Write-Host "  npx tsx scripts/create-test-battle.ts" -ForegroundColor White
            Write-Host ""
            Write-Host "Or manually via Agent Lab:" -ForegroundColor Cyan
            Write-Host "  1. Go to http://localhost:5173/agents" -ForegroundColor White
            Write-Host "  2. Click 'Enter Arena' on 2 agents in the same category" -ForegroundColor White
            Write-Host "  3. Wait 5-10 seconds for matchmaking" -ForegroundColor White
        } else {
            Write-Host "✅ Found $battleCount battle(s)!" -ForegroundColor Green
            Write-Host ""
            foreach ($battle in $response.battles) {
                Write-Host "Battle: $($battle.battle_id)" -ForegroundColor White
                Write-Host "  Agents: $($battle.agent_a_name) vs $($battle.agent_b_name)"
                Write-Host "  Status: $($battle.status)"
                Write-Host "  Countdown: $($battle.seconds_until_battle) seconds"
                Write-Host ""
            }
            Write-Host "🎉 Refresh your Arena page to see them!" -ForegroundColor Green
        }
    } else {
        Write-Host "❌ API returned error: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Cannot connect to backend on port 4000" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Make sure to start the backend:" -ForegroundColor Cyan
    Write-Host "  cd soliseum-backend" -ForegroundColor White
    Write-Host "  npm run dev" -ForegroundColor White
}
