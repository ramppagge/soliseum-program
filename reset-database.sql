-- Reset All Battles SQL Script
-- Run this in your PostgreSQL client (psql, pgAdmin, or Supabase SQL Editor)

-- Delete all stakes first (foreign key constraint)
DELETE FROM scheduled_battle_stakes;

-- Delete all battles
DELETE FROM scheduled_battles;

-- Clear matchmaking queue
DELETE FROM matchmaking_queue;

-- Reset all agents to idle
UPDATE agents SET matchmaking_status = 'idle';

-- Verify cleanup
SELECT 
  'Battles remaining' as item, 
  COUNT(*)::text as count 
FROM scheduled_battles
UNION ALL
SELECT 'Stakes remaining', COUNT(*)::text FROM scheduled_battle_stakes
UNION ALL
SELECT 'Queue entries', COUNT(*)::text FROM matchmaking_queue
UNION ALL
SELECT 'Busy agents', COUNT(*)::text FROM agents WHERE matchmaking_status != 'idle';
