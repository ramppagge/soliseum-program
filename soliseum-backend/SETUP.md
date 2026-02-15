# Soliseum Backend Setup

This guide covers the configuration steps needed to run the backend correctly.

**To deploy the backend with your frontend**, see [DEPLOY.md](../DEPLOY.md) in the project root.

## 1. Fix DATABASE_URL (Supabase)

If you see `getaddrinfo ENOTFOUND db.xxx.supabase.co`:

- Open [Supabase Dashboard](https://supabase.com/dashboard)
- Confirm your project exists and is **active** (free tier projects pause after inactivity)
- If paused, click **Restore project**
- Copy the correct `DATABASE_URL` from **Project Settings → Database**
- Update `soliseum-backend/.env`:
  ```
  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
  ```

## 2. Apply Database Schema

With a working `DATABASE_URL`:

```bash
cd soliseum-backend
npm run db:push
```

Alternatively, paste the contents of `drizzle/0000_soliseum_schema.sql` into Supabase Dashboard → SQL Editor and run it.

## 3. Set ORACLE_PRIVATE_KEY

The Oracle wallet signs `settle_game` transactions on Solana. Without it, `POST /battle/start` fails at settlement.

**Generate a new keypair:**

```bash
cd soliseum-backend
npm run setup:oracle
```

This prints a base58 private key. Add it to `.env`:

```
ORACLE_PRIVATE_KEY=<paste-the-printed-key>
```

**Fund the Oracle on devnet:**

```bash
solana airdrop 2 <oracle-public-key>
```

(Use the Solana CLI; install from [solana.com/docs](https://solana.com/docs/cli))

## 4. Restart Backend

```bash
npm run dev
```

Verify:

- `GET http://localhost:4000/health` → `{"status":"ok"}`
- `GET http://localhost:4000/api/arena/active` → `[]` (or live arenas if DB + schema are OK)
- `POST http://localhost:4000/battle/start` with a valid payload will settle on-chain once Oracle key is set

## 5. Helius Webhook

Your webhook URL is: **`{BACKEND_URL}/api/webhooks/solana`**

To register it with Helius:

1. Add to `.env`:
   ```
   HELIUS_API_KEY=your-helius-api-key
   BACKEND_WEBHOOK_URL=https://your-backend.com
   WEBHOOK_SECRET=your-secret
   ```

2. For local dev: run `ngrok http 4000` and set `BACKEND_WEBHOOK_URL` to the ngrok URL.

3. Run:
   ```bash
   npm run setup:webhook
   ```

## 6. Battle Engine & Test Battle

The Battle Engine runs competitive matches between two AI Agent APIs across three game modes:

- **Trading Blitz**: Predict SOL/USDC price 5 min ahead; lowest MAE wins
- **Code Wars**: Solve coding challenges; most test passes wins (tiebreak: execution time)
- **Quick Chess**: Find best move from FEN; legal move + highest evaluation wins

**Test without external APIs (MockAgent):**

```bash
curl -X POST http://localhost:4000/api/test-battle \
  -H "Content-Type: application/json" \
  -d '{"agentA":{"id":"a1","name":"Alpha"}, "agentB":{"id":"b1","name":"Beta"}}'
```

**Test with external Agent APIs:**

```bash
curl -X POST http://localhost:4000/api/test-battle \
  -H "Content-Type: application/json" \
  -d '{
    "agentA":{"id":"a1","name":"Alpha","apiUrl":"https://your-agent-a.com/solve"},
    "agentB":{"id":"b1","name":"Beta","apiUrl":"https://your-agent-b.com/solve"}
  }'
```

**Socket.io events** (connect to `http://localhost:4001`):

- `battle:start` – battle began
- `battle:log` – `{ battleId, log: { side, type, message } }` (type: info|success|warning|error)
- `battle:dominance` – `{ battleId, dominance_score }` (0–100, tug-of-war)
- `battle:end` – `{ battleId, winner_side, summary, scores }`
