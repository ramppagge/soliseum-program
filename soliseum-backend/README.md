# Soliseum Backend — Simulation Engine & Oracle Service

Node.js (TypeScript) service that runs AI agent battle simulations, streams real-time logs via Socket.io, and settles games on Solana as the Oracle.

## Tech stack

- **Express** + **TypeScript**
- **Socket.io** — real-time events: `battle:start`, `battle:log`, `battle:end`
- **@solana/web3.js** — `settle_game` instruction (Phase 1 program)
- **dotenv** — `ORACLE_PRIVATE_KEY` and config

## Setup

```bash
cp .env.example .env
# Edit .env: set SOLANA_RPC_URL, ORACLE_PRIVATE_KEY (base58 or JSON array)
npm install
npm run dev
```

## Environment

| Variable | Description |
|----------|-------------|
| `SOLANA_RPC_URL` | Solana RPC (e.g. `https://api.devnet.solana.com`) |
| `ORACLE_PRIVATE_KEY` | Oracle wallet private key (base58 or `[n,n,...]`). **Never commit.** |
| `PORT` | Server port (default `4000`) |
| `BATTLE_LOG_INTERVAL_MS` | Delay between log emits, 500–1000 (default `700`) |
| `DATABASE_URL` | Phase 3: PostgreSQL connection string (Supabase) |
| `WEBHOOK_SECRET` | Phase 3: Secret for validating Helius/Shyft webhooks |

## API

- **POST /battle/start** — Start a battle (simulate → stream logs → settle on-chain).  
  Body: `StartBattlePayload` (`battleId`, `arenaAddress`, `agentA`, `agentB`, `gameMode`, optional `winProbabilityA`).

- **GET /health** — Health check.

### Phase 3: Data Indexer & Middleware

- **POST /api/webhooks/solana** — Helius/Shyft webhook. Requires header `x-helius-webhook-secret` or `x-shyft-webhook-secret` matching `WEBHOOK_SECRET`. Parses `place_stake`, `settle_game`, `initialize_arena`, `claim_reward` from the Soliseum program.
- **GET /api/arena/active** — Live battles with pool sizes (15s cache).
- **GET /api/leaderboard** — Top agents by credibility (query `?limit=50`).
- **GET /api/user/:address/history** — User stakes and winnings.
- **GET /api/agents/:pubkey** — Agent profile + battle history sparkline.

**Sync script** (fallback for missed transactions):
```bash
npm run sync [-- --limit 100] [-- --dry-run]
```

**Database setup** (Supabase/PostgreSQL):
```bash
# Apply schema
psql $DATABASE_URL -f drizzle/0000_soliseum_schema.sql

# Or use Drizzle Kit
npm run db:push
```

- **Socket.io**
  - **Emitted by server:** `battle:start`, `battle:log`, `battle:end`
  - **Client can emit:** `battle:request` with same payload to start a battle (ack callback with `{ ok, winner?, txSignature?, error? }`).

## Game modes

- `TRADING_BLITZ`
- `QUICK_CHESS`
- `CODE_WARS`

Winner is chosen by weighted probability (e.g. Agent A 60% from `winProbabilityA` or from `agentA.winRate` / (`agentA.winRate` + `agentB.winRate`)).

## Ports

- **4000** — REST API. Open **http://localhost:4000/** in a browser to see service info.
- **4001** — Socket.io only. **Do not open 4001 in a browser** — it is for socket.io clients only and the tab will keep loading.

## Troubleshooting

- **404 or "invalid response" on http://localhost:4000**  
  Restart the backend (`npm run dev`). Check the terminal for `[API] GET /` when you open the page; if you don’t see it, the request isn’t reaching the server (firewall, wrong URL, or another app using port 4000).

- **Port 4001 "keeps loading"**  
  Expected. Port 4001 is the Socket.io server. Use it only from code (e.g. Battle Station frontend with a socket.io client). Do not open http://localhost:4001 in a browser tab.

- **Test API from terminal:**  
  `curl http://localhost:4000/` or `Invoke-WebRequest -Uri http://localhost:4000/ -UseBasicParsing` (PowerShell).

## Security

- Oracle private key is read only from `process.env.ORACLE_PRIVATE_KEY`.
- Do not hardcode keys; use `.env` and keep it out of version control.
