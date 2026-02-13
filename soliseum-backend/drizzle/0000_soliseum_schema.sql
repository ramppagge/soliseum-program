-- Soliseum Phase 3 - Initial Schema
-- Run against Supabase/PostgreSQL

CREATE TABLE IF NOT EXISTS "agents" (
  "id" serial PRIMARY KEY NOT NULL,
  "pubkey" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "metadata_url" text,
  "total_wins" integer DEFAULT 0 NOT NULL,
  "credibility_score" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "arenas" (
  "id" serial PRIMARY KEY NOT NULL,
  "arena_address" text NOT NULL UNIQUE,
  "creator_address" text NOT NULL,
  "oracle_address" text NOT NULL,
  "status" text DEFAULT 'Live' NOT NULL,
  "total_pool" bigint DEFAULT 0 NOT NULL,
  "agent_a_pool" bigint DEFAULT 0 NOT NULL,
  "agent_b_pool" bigint DEFAULT 0 NOT NULL,
  "winner_side" integer,
  "agent_a_pubkey" text,
  "agent_b_pubkey" text,
  "start_time" timestamp with time zone,
  "end_time" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stakes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_address" text NOT NULL,
  "arena_id" integer NOT NULL REFERENCES "arenas"("id") ON DELETE CASCADE,
  "amount" bigint NOT NULL,
  "side" integer NOT NULL,
  "claimed" boolean DEFAULT false NOT NULL,
  "tx_signature" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "wallet_address" text PRIMARY KEY NOT NULL,
  "username" text,
  "profile_picture" text,
  "total_staked" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_battle_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_pubkey" text NOT NULL,
  "arena_id" integer NOT NULL REFERENCES "arenas"("id") ON DELETE CASCADE,
  "side" integer NOT NULL,
  "won" boolean NOT NULL,
  "credibility_before" integer,
  "credibility_after" integer,
  "played_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "indexer_state" (
  "id" text PRIMARY KEY NOT NULL,
  "last_processed_slot" bigint NOT NULL,
  "last_processed_signature" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agents_pubkey_idx" ON "agents" ("pubkey");
CREATE UNIQUE INDEX IF NOT EXISTS "arenas_arena_address_idx" ON "arenas" ("arena_address");
