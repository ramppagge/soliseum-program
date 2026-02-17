-- Matchmaking System Migration
-- Elo ratings + Auto matchmaking queue + Scheduled battles with staking window

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add Elo Rating to Agents
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS elo_rating INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN IF NOT EXISTS elo_peak INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN IF NOT EXISTS matchmaking_status TEXT DEFAULT 'idle'
  CHECK (matchmaking_status IN ('idle', 'queued', 'matched', 'battling'));

CREATE INDEX IF NOT EXISTS idx_agents_elo ON agents(elo_rating);
CREATE INDEX IF NOT EXISTS idx_agents_matchmaking ON agents(matchmaking_status, category, elo_rating);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Matchmaking Queue
-- ═══════════════════════════════════════════════════════════════════════════════
-- Agents waiting to be matched

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id SERIAL PRIMARY KEY,
  agent_pubkey TEXT NOT NULL UNIQUE REFERENCES agents(pubkey),
  category TEXT NOT NULL CHECK (category IN ('Trading', 'Chess', 'Coding')),
  elo_rating INTEGER NOT NULL,
  queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '5 minutes',
  priority INTEGER DEFAULT 0 -- Higher = matched first (e.g., long wait times)
);

CREATE INDEX IF NOT EXISTS idx_queue_category_elo ON matchmaking_queue(category, elo_rating);
CREATE INDEX IF NOT EXISTS idx_queue_queued_at ON matchmaking_queue(queued_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Scheduled Battles (After match found, before battle starts)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 2-minute staking window

CREATE TYPE battle_status AS ENUM ('staking', 'battling', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS scheduled_battles (
  id SERIAL PRIMARY KEY,
  battle_id TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  
  -- Agents
  agent_a_pubkey TEXT NOT NULL REFERENCES agents(pubkey),
  agent_b_pubkey TEXT NOT NULL REFERENCES agents(pubkey),
  agent_a_elo INTEGER NOT NULL,
  agent_b_elo INTEGER NOT NULL,
  
  -- Category & Mode
  category TEXT NOT NULL CHECK (category IN ('Trading', 'Chess', 'Coding')),
  game_mode TEXT NOT NULL DEFAULT 'TRADING_BLITZ',
  
  -- Arena (created on-chain after staking window)
  arena_address TEXT,
  
  -- Timing
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  staking_ends_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '2 minutes',
  battle_started_at TIMESTAMP WITH TIME ZONE,
  battle_ended_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status battle_status DEFAULT 'staking',
  
  -- Winner (filled after battle)
  winner_pubkey TEXT REFERENCES agents(pubkey),
  agent_a_new_elo INTEGER,
  agent_b_new_elo INTEGER,
  
  -- Stakes tracking
  total_stake_a BIGINT DEFAULT 0,
  total_stake_b BIGINT DEFAULT 0,
  stake_count_a INTEGER DEFAULT 0,
  stake_count_b INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_battles(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_staking_ends ON scheduled_battles(staking_ends_at) 
  WHERE status = 'staking';
CREATE INDEX IF NOT EXISTS idx_scheduled_agents ON scheduled_battles(agent_a_pubkey, agent_b_pubkey);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Stakes for Scheduled Battles
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scheduled_battle_stakes (
  id SERIAL PRIMARY KEY,
  battle_id INTEGER NOT NULL REFERENCES scheduled_battles(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,
  agent_pubkey TEXT NOT NULL REFERENCES agents(pubkey),
  amount BIGINT NOT NULL,
  side INTEGER NOT NULL CHECK (side IN (0, 1)), -- 0 = agent A, 1 = agent B
  tx_signature TEXT, -- Filled when battle moves on-chain
  claimed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(battle_id, user_address, side) -- One stake per user per side
);

CREATE INDEX IF NOT EXISTS idx_stakes_battle ON scheduled_battle_stakes(battle_id);
CREATE INDEX IF NOT EXISTS idx_stakes_user ON scheduled_battle_stakes(user_address);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Functions
-- ═══════════════════════════════════════════════════════════════════════════════

-- Calculate Elo change after battle
CREATE OR REPLACE FUNCTION calculate_elo_change(
  winner_elo INTEGER,
  loser_elo INTEGER,
  k_factor INTEGER DEFAULT 32
) RETURNS TABLE(winner_new_elo INTEGER, loser_new_elo INTEGER) AS $$
DECLARE
  expected_winner FLOAT;
  expected_loser FLOAT;
  winner_change INTEGER;
  loser_change INTEGER;
BEGIN
  -- Expected scores
  expected_winner := 1.0 / (1.0 + POWER(10.0, (loser_elo - winner_elo)::FLOAT / 400.0));
  expected_loser := 1.0 / (1.0 + POWER(10.0, (winner_elo - loser_elo)::FLOAT / 400.0));
  
  -- Elo changes
  winner_change := ROUND(k_factor * (1.0 - expected_winner));
  loser_change := ROUND(k_factor * (0.0 - expected_loser));
  
  RETURN QUERY SELECT 
    winner_elo + winner_change,
    loser_elo + loser_change;
END;
$$ LANGUAGE plpgsql;

-- Find best match for an agent
CREATE OR REPLACE FUNCTION find_match(
  p_agent_pubkey TEXT,
  p_category TEXT,
  p_elo_rating INTEGER,
  p_max_elo_diff INTEGER DEFAULT 200
) RETURNS TABLE(
  opponent_pubkey TEXT,
  opponent_elo INTEGER,
  elo_diff INTEGER,
  wait_seconds INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.agent_pubkey as opponent_pubkey,
    q.elo_rating as opponent_elo,
    ABS(q.elo_rating - p_elo_rating) as elo_diff,
    EXTRACT(EPOCH FROM (NOW() - q.queued_at))::INTEGER as wait_seconds
  FROM matchmaking_queue q
  WHERE q.category = p_category
    AND q.agent_pubkey != p_agent_pubkey
    AND ABS(q.elo_rating - p_elo_rating) <= p_max_elo_diff
  ORDER BY 
    ABS(q.elo_rating - p_elo_rating) ASC, -- Closest Elo first
    q.queued_at ASC -- Then longest waiting
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Get active battle for display (with stakes)
CREATE OR REPLACE VIEW active_battles_view AS
SELECT 
  sb.*,
  a.name as agent_a_name,
  a.category as agent_a_category,
  b.name as agent_b_name,
  b.category as agent_b_category,
  EXTRACT(EPOCH FROM (sb.staking_ends_at - NOW()))::INTEGER as seconds_until_battle,
  CASE 
    WHEN sb.status = 'staking' AND sb.staking_ends_at > NOW() THEN 'countdown'
    WHEN sb.status = 'staking' AND sb.staking_ends_at <= NOW() THEN 'starting'
    WHEN sb.status = 'battling' THEN 'live'
    ELSE sb.status::TEXT
  END as display_status
FROM scheduled_battles sb
JOIN agents a ON sb.agent_a_pubkey = a.pubkey
JOIN agents b ON sb.agent_b_pubkey = b.pubkey
WHERE sb.status IN ('staking', 'battling')
ORDER BY sb.staking_ends_at ASC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Statistics
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT 'Elo ratings added to agents' as migration_step;
SELECT 'Matchmaking queue table created' as migration_step;
SELECT 'Scheduled battles table created' as migration_step;
SELECT 'Stakes table created' as migration_step;
SELECT 'Functions and views created' as migration_step;
