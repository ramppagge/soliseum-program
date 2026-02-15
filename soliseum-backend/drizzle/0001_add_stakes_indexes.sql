-- Add indexes on stakes table for fast querying by user_address and arena_id
CREATE INDEX IF NOT EXISTS "stakes_user_address_idx" ON "stakes" ("user_address");
CREATE INDEX IF NOT EXISTS "stakes_arena_id_idx" ON "stakes" ("arena_id");
