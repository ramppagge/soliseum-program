-- Performance indexes for leaderboard, user history, and arena list queries.
-- Also adds idempotency constraint on stakes.tx_signature to prevent double-counting on webhook retries.

-- Composite index for GET /api/arena/active (status = 'Live' ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS "arenas_status_created_idx" ON "arenas" ("status", "created_at" DESC);

-- Composite index for GET /api/arena/settled (status = 'Settled' ORDER BY updated_at DESC)
CREATE INDEX IF NOT EXISTS "arenas_status_updated_idx" ON "arenas" ("status", "updated_at" DESC);

-- Index for GET /api/agents/:pubkey battle history lookups
CREATE INDEX IF NOT EXISTS "abh_agent_pubkey_idx" ON "agent_battle_history" ("agent_pubkey");

-- Composite index for agent battle history ordered by played_at (sparklines + 7-day filter)
CREATE INDEX IF NOT EXISTS "abh_pubkey_played_idx" ON "agent_battle_history" ("agent_pubkey", "played_at" DESC);

-- Composite index for applyPlaceStake upsert (arena_id + user_address + side)
CREATE INDEX IF NOT EXISTS "stakes_arena_user_side_idx" ON "stakes" ("arena_id", "user_address", "side");

-- Unique index on tx_signature for webhook idempotency (skip NULL for existing rows)
CREATE UNIQUE INDEX IF NOT EXISTS "stakes_tx_signature_unique_idx" ON "stakes" ("tx_signature") WHERE "tx_signature" IS NOT NULL;
