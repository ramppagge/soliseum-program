# Debug script for matchmaking system
Write-Host "=== Soliseum Matchmaking Debug ===" -ForegroundColor Cyan

# 1. Check if backend is running
try {
    $health = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method GET -TimeoutSec 5
    Write-Host "✅ Backend is running" -ForegroundColor Green
    Write-Host "   Status: $($health.status)"
    Write-Host "   Database: $($health.checks.database)"
    Write-Host "   Solana RPC: $($health.checks.solanaRpc)"
} catch {
    Write-Host "❌ Backend is NOT running on port 4000" -ForegroundColor Red
    Write-Host "   Start it with: npm run dev"
    exit 1
}

# 2. Check active battles
try {
    $battles = Invoke-RestMethod -Uri "http://localhost:4000/api/matchmaking/battles" -Method GET -TimeoutSec 5
    Write-Host ""
    Write-Host "=== Active Battles ===" -ForegroundColor Cyan
    if ($battles.battles.Count -eq 0) {
        Write-Host "⚠️ No scheduled battles found" -ForegroundColor Yellow
        Write-Host "   You need to enter matchmaking queue first (Agent Lab > Enter Arena)"
    } else {
        Write-Host "✅ Found $($battles.battles.Count) battle(s)" -ForegroundColor Green
        foreach ($battle in $battles.battles) {
            Write-Host ""
            Write-Host "   Battle: $($battle.battle_id)" -ForegroundColor White
            Write-Host "   Agents: $($battle.agent_a_name) vs $($battle.agent_b_name)"
            Write-Host "   Status: $($battle.status)"
            Write-Host "   Countdown: $($battle.seconds_until_battle) seconds"
            Write-Host "   Total Stakes: $([math]::Round($battle.total_stake_a / 1e9, 2)) SOL / $([math]::Round($battle.total_stake_b / 1e9, 2)) SOL"
        }
    }
} catch {
    Write-Host "❌ Failed to fetch battles: $_" -ForegroundColor Red
}

# 3. Check matchmaking queue
try {
    Write-Host ""
    Write-Host "=== Matchmaking Queue ===" -ForegroundColor Cyan
    # We need an agent pubkey to check status - let's get one from agents list
    $agents = Invoke-RestMethod -Uri "http://localhost:4000/api/agents" -Method GET -TimeoutSec 5
    if ($agents.Count -gt 0) {
        $firstAgent = $agents[0]
        Write-Host "Checking agent: $($firstAgent.name) ($($firstAgent.pubkey.Substring(0, 8))...)"
        $status = Invoke-RestMethod -Uri "http://localhost:4000/api/matchmaking/status/$($firstAgent.pubkey)" -Method GET -TimeoutSec 5
        if ($status.queue) {
            Write-Host "⏳ Agent is in queue (time remaining: $($status.queue.time_remaining)s)" -ForegroundColor Yellow
        } elseif ($status.battle) {
            Write-Host "✅ Agent is in battle: $($status.battle.battle_id)" -ForegroundColor Green
        } else {
            Write-Host "ℹ️ Agent status: $($status.agent.status)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "ℹ️ Could not check queue status" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Make sure backend is running: npm run dev"
Write-Host "2. Go to Agent Lab and click 'Enter Arena' to enter matchmaking"
Write-Host "3. Need 2 agents in same category to create a match"
Write-Host "4. Once matched, battle appears on Arena page with countdown"
