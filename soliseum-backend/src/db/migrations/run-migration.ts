/**
 * Database Migration Runner
 * 
 * Usage:
 *   npx ts-node src/db/migrations/run-migration.ts
 * 
 * This runs the leaderboard materialized view migration using Drizzle.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../index";

async function runMigration() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Soliseum Leaderboard Migration (Materialized Views)");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    // Check if views already exist
    console.log("[1/4] Checking existing views...");
    const existingViews = await db.execute(sql`
      SELECT matviewname 
      FROM pg_matviews 
      WHERE schemaname = 'public' 
      AND matviewname IN ('leaderboard_mv', 'leaderboard_category_mv')
    `);
    
    const views = existingViews as unknown as { matviewname: string }[];
    if (views.length > 0) {
      console.log(`   Found existing views: ${views.map(v => v.matviewname).join(", ")}`);
      console.log("   Dropping existing views to recreate...\n");
      
      await db.execute(sql`DROP MATERIALIZED VIEW IF EXISTS leaderboard_mv CASCADE`);
      await db.execute(sql`DROP MATERIALIZED VIEW IF EXISTS leaderboard_category_mv CASCADE`);
      console.log("   ✓ Dropped existing views\n");
    }

    // Create main leaderboard materialized view
    console.log("[2/4] Creating leaderboard_mv...");
    await db.execute(sql`
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
        ROW_NUMBER() OVER (
          ORDER BY a.credibility_score DESC, 
            CASE WHEN a.total_battles > 0 
              THEN a.total_wins::numeric / a.total_battles 
              ELSE 0 
            END DESC
        ) as rank,
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
      ORDER BY credibility_score DESC, win_rate DESC
    `);
    console.log("   ✓ Created leaderboard_mv\n");

    // Create category-specific view
    console.log("[3/4] Creating leaderboard_category_mv...");
    await db.execute(sql`
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
        ROW_NUMBER() OVER (
          PARTITION BY a.category
          ORDER BY a.credibility_score DESC, 
            CASE WHEN a.total_battles > 0 
              THEN a.total_wins::numeric / a.total_battles 
              ELSE 0 
            END DESC
        ) as category_rank,
        ROW_NUMBER() OVER (
          ORDER BY a.credibility_score DESC, 
            CASE WHEN a.total_battles > 0 
              THEN a.total_wins::numeric / a.total_battles 
              ELSE 0 
            END DESC
        ) as overall_rank
      FROM agents a
      WHERE a.agent_status = 'active'
      ORDER BY a.category, credibility_score DESC
    `);
    console.log("   ✓ Created leaderboard_category_mv\n");

    // Create indexes
    console.log("[4/4] Creating indexes...");
    await db.execute(sql`CREATE UNIQUE INDEX idx_leaderboard_mv_rank ON leaderboard_mv(rank)`);
    await db.execute(sql`CREATE UNIQUE INDEX idx_leaderboard_mv_pubkey ON leaderboard_mv(pubkey)`);
    await db.execute(sql`CREATE INDEX idx_leaderboard_mv_category ON leaderboard_mv(category)`);
    await db.execute(sql`CREATE INDEX idx_leaderboard_mv_win_rate ON leaderboard_mv(win_rate DESC) WHERE total_battles >= 5`);
    await db.execute(sql`CREATE UNIQUE INDEX idx_leaderboard_cat_pubkey ON leaderboard_category_mv(category, pubkey)`);
    await db.execute(sql`CREATE INDEX idx_leaderboard_cat_rank ON leaderboard_category_mv(category, category_rank)`);
    console.log("   ✓ Created indexes\n");

    // Create refresh function
    console.log("[Bonus] Creating refresh function...");
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION refresh_leaderboard()
      RETURNS void AS $$
      BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_mv;
        REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_category_mv;
      END;
      $$ LANGUAGE plpgsql
    `);
    console.log("   ✓ Created refresh_leaderboard() function\n");

    // Verify
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  Verification");
    console.log("═══════════════════════════════════════════════════════════");
    
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM leaderboard_mv`);
    const count = ((countResult as unknown as { count: string }[])[0])?.count || "0";
    console.log(`   Total agents in leaderboard: ${count}`);

    const sampleResult = await db.execute(sql`
      SELECT rank, pubkey, name, category, credibility_score, win_rate 
      FROM leaderboard_mv 
      ORDER BY rank 
      LIMIT 5
    `);
    const sample = sampleResult as unknown as { rank: number; name: string; category: string; credibility_score: number }[];
    
    console.log("\n   Top 5 agents:");
    for (const agent of sample) {
      console.log(`   #${agent.rank} ${agent.name} (${agent.category}) - ${agent.credibility_score} cred`);
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  ✅ Migration Complete!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\nNext steps:");
    console.log("  1. Restart your backend server");
    console.log("  2. Test: curl http://localhost:4000/api/leaderboard");
    console.log("\nThe materialized views will auto-refresh every 30 seconds.");
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:\n", error);
    process.exit(1);
  }
}

runMigration();
