/**
 * Create a test scheduled battle for UI testing
 * Run: npx tsx scripts/create-test-battle.ts
 */
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function createTestBattle() {
  console.log("Creating test scheduled battle...\n");

  try {
    // First, check if we have any agents
    const agentsResult = await db.execute(sql`
      SELECT pubkey, name, category, elo_rating 
      FROM agents 
      WHERE agent_status = 'active'
      LIMIT 2
    `);

    const agents = agentsResult as unknown as Array<{
      pubkey: string;
      name: string;
      category: string;
      elo_rating: number;
    }>;

    if (agents.length < 2) {
      console.log("❌ Need at least 2 active agents to create a battle");
      console.log("   Please register agents via the Agent Lab first");
      process.exit(1);
    }

    const agentA = agents[0];
    const agentB = agents[1];

    console.log(`Found agents:`);
    console.log(`  A: ${agentA.name} (${agentA.category})`);
    console.log(`  B: ${agentB.name} (${agentB.category})`);

    // Check if they're same category
    if (agentA.category !== agentB.category) {
      console.log("\n⚠️ Agents are in different categories. Using first agent's category.");
    }

    // Check for existing active battles
    const existingResult = await db.execute(sql`
      SELECT battle_id, status 
      FROM scheduled_battles 
      WHERE status IN ('staking', 'battling')
      LIMIT 1
    `);

    const existing = existingResult as unknown as Array<{ battle_id: string; status: string }>;

    if (existing.length > 0) {
      console.log(`\n✅ Active battle already exists: ${existing[0].battle_id} (${existing[0].status})`);
      console.log("   Refresh the Arena page to see it!");
      process.exit(0);
    }

    // Create the scheduled battle
    const battleResult = await db.execute(sql`
      INSERT INTO scheduled_battles (
        agent_a_pubkey,
        agent_b_pubkey,
        agent_a_elo,
        agent_b_elo,
        category,
        game_mode,
        status,
        staking_ends_at,
        total_stake_a,
        total_stake_b,
        stake_count_a,
        stake_count_b
      ) VALUES (
        ${agentA.pubkey},
        ${agentB.pubkey},
        ${agentA.elo_rating},
        ${agentB.elo_rating},
        ${agentA.category},
        'TRADING_BLITZ',
        'staking',
        NOW() + INTERVAL '2 minutes',
        500000000,  -- 0.5 SOL already staked on A
        300000000,  -- 0.3 SOL already staked on B
        2,
        1
      )
      RETURNING battle_id, staking_ends_at
    `);

    const battle = (battleResult as unknown as Array<{ battle_id: string; staking_ends_at: string }>)[0];

    console.log(`\n✅ Created test battle: ${battle.battle_id}`);
    console.log(`   Staking ends at: ${battle.staking_ends_at}`);
    console.log(`   Agents: ${agentA.name} vs ${agentB.name}`);
    console.log(`\n🎉 Now refresh the Arena page to see the STAKING OPEN section!`);

  } catch (error) {
    console.error("❌ Error creating test battle:", error);
    process.exit(1);
  }
}

createTestBattle();
