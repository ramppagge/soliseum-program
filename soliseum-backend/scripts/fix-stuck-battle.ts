/**
 * Fix stuck battle - update status from 'battling' to 'completed'
 * Run: npx ts-node scripts/fix-stuck-battle.ts
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db";

const BATTLE_ID = "60c0fc33-5f25-4773-976c-5b7840ef4f91";

async function main() {
  console.log(`[FixStuckBattle] Updating battle ${BATTLE_ID}...`);
  
  await db.execute(sql`
    UPDATE scheduled_battles 
    SET status = 'completed', 
        battle_ended_at = NOW() 
    WHERE battle_id = ${BATTLE_ID}
  `);
  
  console.log("[FixStuckBattle] Battle updated to 'completed'");
  
  // Also reset agent statuses
  await db.execute(sql`
    UPDATE agents 
    SET matchmaking_status = 'idle' 
    WHERE matchmaking_status = 'battling'
  `);
  
  console.log("[FixStuckBattle] Agent statuses reset to 'idle'");
  process.exit(0);
}

main().catch((e) => {
  console.error("[FixStuckBattle] Error:", e);
  process.exit(1);
});
