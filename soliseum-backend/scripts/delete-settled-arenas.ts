/**
 * Delete all Settled arenas from the database.
 * Stakes and agent_battle_history cascade delete automatically.
 *
 * Prerequisites: DATABASE_URL set in .env
 *
 * Usage: npx ts-node scripts/delete-settled-arenas.ts
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { arenas } from "../src/db/schema";

async function main() {
  const deleted = await db
    .delete(arenas)
    .where(eq(arenas.status, "Settled"))
    .returning({ arenaAddress: arenas.arenaAddress });
  console.log(`Deleted ${deleted.length} Settled arena(s):`);
  deleted.forEach((r) => console.log(`  - ${r.arenaAddress}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
