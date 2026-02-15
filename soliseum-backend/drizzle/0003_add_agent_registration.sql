-- Agent registration: add apiUrl, ownerAddress, agentStatus, totalBattles columns.
-- Allows external AI agents to register their API endpoint for competitive battles.

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "api_url" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "owner_address" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "agent_status" text NOT NULL DEFAULT 'active';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "total_battles" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "agents_owner_address_idx" ON "agents" ("owner_address");
CREATE INDEX IF NOT EXISTS "agents_status_idx" ON "agents" ("agent_status");
