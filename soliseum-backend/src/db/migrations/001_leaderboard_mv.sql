-- Leaderboard Materialized View Migration
-- Run: psql $DATABASE_URL -f 001_leaderboard_mv.sql

-- Drop existing if recreating
DROP MATERIALIZED VIEW IF EXISTS leaderboard_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS leaderboard_category_mv CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Main Leaderboard Materialized View
-- ═══════════════════════════════════════════════════════════════════════════════
-- Combines agent stats with win rates for fast querying
-- Refreshes every 30 seconds via cron or application trigger

CREATE MATERIALIZED VIEW leaderboard_mv AS
SELECT 
    a.id,
    a.pubkey,
    a.name,
    a.category,
    a.description,
    a.total_wins,
    a.total_battles,
    CASE 
        WHEN a.total_battles > 0 
        THEN ROUND((a.total_wins::numeric / a.total_battles) * 100, 2)
        ELSE 0 
    END as win_rate,
    a.credibility_score,
    a.agent_status,
    a.created_at,
    a.updated_at,
    -- Rank by credibility_score (desc), then win_rate (desc)
    ROW_NUMBER() OVER (
        ORDER BY a.credibility_score DESC, 
                 CASE WHEN a.total_battles > 0 
                      THEN a.total_wins::numeric / a.total_battles 
                      ELSE 0 
                 END DESC
    ) as rank,
    -- Sparkline data: last 10 battle results (1 = win, 0 = loss)
    (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'won', abh.won,
                    'played_at', abh.played_at,
                    'arena_id', abh.arena_id
                ) ORDER BY abh.played_at DESC
            ) FILTER (WHERE abh.won IS NOT NULL),
            '[]'::jsonb
        )
        FROM (
            SELECT won, played_at, arena_id
            FROM agent_battle_history
            WHERE agent_pubkey = a.pubkey
            ORDER BY played_at DESC
            LIMIT 10
        ) abh
    ) as recent_battles,
    -- Streak calculation (consecutive wins/losses)
    (
        SELECT COUNT(*)
        FROM (
            SELECT won
            FROM agent_battle_history
            WHERE agent_pubkey = a.pubkey
            ORDER BY played_at DESC
            LIMIT 100
        ) recent
        WHERE won = (
            SELECT won FROM agent_battle_history 
            WHERE agent_pubkey = a.pubkey 
            ORDER BY played_at DESC 
            LIMIT 1
        )
        AND won = true
    ) as win_streak
FROM agents a
WHERE a.agent_status = 'active'
ORDER BY credibility_score DESC, win_rate DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Category-Specific Leaderboard Views
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW leaderboard_category_mv AS
SELECT 
    a.id,
    a.pubkey,
    a.name,
    a.category,
    a.total_wins,
    a.total_battles,
    CASE 
        WHEN a.total_battles > 0 
        THEN ROUND((a.total_wins::numeric / a.total_battles) * 100, 2)
        ELSE 0 
    END as win_rate,
    a.credibility_score,
    -- Category-specific rank
    ROW_NUMBER() OVER (
        PARTITION BY a.category
        ORDER BY a.credibility_score DESC, 
                 CASE WHEN a.total_battles > 0 
                      THEN a.total_wins::numeric / a.total_battles 
                      ELSE 0 
                 END DESC
    ) as category_rank,
    -- Overall rank (for reference)
    ROW_NUMBER() OVER (
        ORDER BY a.credibility_score DESC, 
                 CASE WHEN a.total_battles > 0 
                      THEN a.total_wins::numeric / a.total_battles 
                      ELSE 0 
                 END DESC
    ) as overall_rank
FROM agents a
WHERE a.agent_status = 'active'
ORDER BY a.category, credibility_score DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Indexes for Fast Queries
-- ═══════════════════════════════════════════════════════════════════════════════

-- Primary lookup by rank
CREATE UNIQUE INDEX idx_leaderboard_mv_rank ON leaderboard_mv(rank);

-- Lookup by pubkey
CREATE UNIQUE INDEX idx_leaderboard_mv_pubkey ON leaderboard_mv(pubkey);

-- Filter by category
CREATE INDEX idx_leaderboard_mv_category ON leaderboard_mv(category);

-- Filter by win rate (for "hot" agents)
CREATE INDEX idx_leaderboard_mv_win_rate ON leaderboard_mv(win_rate DESC) 
    WHERE total_battles >= 5;

-- Category-specific indexes
CREATE UNIQUE INDEX idx_leaderboard_cat_pubkey ON leaderboard_category_mv(category, pubkey);
CREATE INDEX idx_leaderboard_cat_rank ON leaderboard_category_mv(category, category_rank);

-- Text search (for name search)
CREATE INDEX idx_leaderboard_mv_name ON leaderboard_mv USING gin(name gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Refresh Function (for application-triggered updates)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_mv;
    REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_category_mv;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Optional: Auto-refresh via pg_cron (requires pg_cron extension)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Uncomment if pg_cron is available:
-- SELECT cron.schedule('refresh-leaderboard', '*/30 * * * *', 'SELECT refresh_leaderboard();');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Statistics & Validation
-- ═══════════════════════════════════════════════════════════════════════════════

-- Verify row count matches active agents
SELECT 
    'leaderboard_mv' as view_name,
    COUNT(*) as row_count,
    (SELECT COUNT(*) FROM agents WHERE agent_status = 'active') as expected_count
FROM leaderboard_mv;

-- Show top 10 for validation
SELECT rank, pubkey, name, category, credibility_score, win_rate, total_battles
FROM leaderboard_mv
LIMIT 10;
