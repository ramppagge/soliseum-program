/**
 * Reset all battles - clean slate for testing
 * Run: npx tsx scripts/reset-battles.ts
 */
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function resetBattles() {
  console.log("=== Resetting All Battles ===\n");

  try {
    console.log("Deleting all stakes...");
    await db.execute(sql`DELETE FROM scheduled_battle_stakes`);
    console.log("  ✓ Stakes deleted");

    console.log("Deleting all battles...");
    await db.execute(sql`DELETE FROM scheduled_battles`);
    console.log("  ✓ Battles deleted");

    console.log("Clearing matchmaking queue...");
    await db.execute(sql`DELETE FROM matchmaking_queue`);
    console.log("  ✓ Queue cleared");

    console.log("Resetting agent statuses...");
    await db.execute(sql`UPDATE agents SET matchmaking_status = 'idle'`);
    console.log("  ✓ Agents reset to idle");

    // Verify
    const [counts] = await db.execute(sql`
      SELECT 
        (SELECT COUNT(*)::int FROM scheduled_battles) as battles,
        (SELECT COUNT(*)::int FROM scheduled_battle_stakes) as stakes,
        (SELECT COUNT(*)::int FROM matchmaking_queue) as queue,
        (SELECT COUNT(*)::int FROM agents WHERE matchmaking_status != 'idle') as busy_agents
    `);

    console.log("\n=== Verification ===");
    console.log(`Battles: ${(counts as any).battles}`);
    console.log(`Stakes: ${(counts as any).stakes}`);
    console.log(`Queue entries: ${(counts as any).queue}`);
    console.log(`Busy agents: ${(counts as any).busy_agents}`);

    console.log("\n✅ All battles reset successfully!");
    console.log("You can now create new battles from the Agent Lab.");
    
  } catch (error) {
    console.error("\n❌ Reset failed:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

resetBattles();
