# Troubleshooting: Battle Stakes UI Not Showing

## Quick Checklist

### 1. ✅ Backend is Running
```bash
cd soliseum-backend
npm run dev
```
You should see:
- `[MatchmakingService] Elo matchmaking started`
- `Soliseum Oracle (API) listening on port 4000`

### 2. ✅ Frontend is Running (with latest build)
```bash
cd soliseum-arena
npm run build   # Important: Build the changes
npm run dev     # Start dev server
```

### 3. ✅ Database Migrations Applied
The matchmaking tables must exist. Check with:
```sql
-- Connect to your PostgreSQL database
\dt scheduled_battles
\dt matchmaking_queue
\dt scheduled_battle_stakes
```

If missing, run:
```bash
cd soliseum-backend
npx tsx src/db/migrations/run-migration.ts
```

### 4. ✅ Create a Scheduled Battle (Test Data)
Run this debug script in PowerShell:
```powershell
cd soliseum-backend
./debug-matchmaking.ps1
```

Or manually create a battle via the database:
```sql
-- Insert test battle (requires 2 agents in database)
INSERT INTO scheduled_battles (
  agent_a_pubkey, agent_b_pubkey, agent_a_elo, agent_b_elo,
  category, game_mode, status, staking_ends_at
) VALUES (
  'agent1_pubkey_here', 'agent2_pubkey_here', 1000, 1000,
  'Trading', 'TRADING_BLITZ', 'staking', NOW() + INTERVAL '2 minutes'
);
```

### 5. ✅ Browser Check
1. Open browser console (F12)
2. Go to http://localhost:5173/arena (or your dev URL)
3. Check for errors in console
4. Check Network tab - should see request to `/api/matchmaking/battles`

---

## Common Issues

### Issue: "No battles showing"
**Cause**: No scheduled battles in database

**Fix**: 
1. Register 2 agents via Agent Lab
2. Click "Enter Arena" on both agents (same category)
3. Wait for match (or check logs)

### Issue: "API returns empty array"
**Cause**: Matchmaking service not started or database connection issue

**Fix**:
```bash
# Restart backend
cd soliseum-backend
npm run dev

# Check health
curl http://localhost:4000/health
```

### Issue: "Frontend build errors"
**Cause**: Old build files

**Fix**:
```bash
cd soliseum-arena
rm -rf dist
npm run build
```

### Issue: "Cannot read property of undefined"
**Cause**: Type mismatch in API response

**Fix**: Check browser console for exact error, verify API response matches frontend types

---

## Testing the Flow Manually

### Step 1: Verify API works
```bash
# Check active battles
curl http://localhost:4000/api/matchmaking/battles

# Expected response:
# {"ok":true,"battles":[{"battle_id":"...","status":"staking",...}]}
```

### Step 2: Verify frontend receives data
Open browser console and run:
```javascript
fetch('http://localhost:4000/api/matchmaking/battles')
  .then(r => r.json())
  .then(console.log)
```

### Step 3: Check React Query
In React DevTools (Components tab):
1. Find `Index` component
2. Check `activeBattles` query state
3. Should show `data.battles` array

---

## Debug Logs to Check

### Backend Logs
Look for:
```
[MatchmakingService] Starting...
[MatchmakingService] Started successfully
[processQueue] Found match: agent1 vs agent2
[scheduleBattle] Created battle: sb_xxxxx
```

### Frontend Logs
Look for:
```
[matchmaking, battles] query successful
Staking battles: X
```

---

## Need More Help?

1. Check if the backend port is correct in `soliseum-arena/src/config/soliseum.ts`
2. Verify no firewall blocking port 4000
3. Check PostgreSQL is running and accessible
4. Look at full browser console for CORS errors
