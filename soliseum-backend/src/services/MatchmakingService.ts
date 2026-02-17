/**
 * Matchmaking Service - Elo-Based Auto Matchmaking with Staking Window
 * 
 * Flow:
 * 1. Agent owner clicks "Enter Arena" → Agent joins queue
 * 2. Service finds best match (similar Elo, same category)
 * 3. Match created → 2-minute staking window starts
 * 4. Users can stake on either agent
 * 5. After countdown → Battle auto-starts
 * 6. Elo ratings updated after battle
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

// Elo rating constants
const K_FACTOR = 32; // Standard K-factor
const DEFAULT_ELO = 1000;
const MAX_ELO_DIFF = 200; // Max Elo difference for matching
const MATCHMAKING_INTERVAL_MS = 10000; // Check for matches every 10s (reduced from 5s)
const STAKING_WINDOW_SECONDS = 120; // 2 minutes

export interface MatchmakingQueueEntry {
  agent_pubkey: string;
  category: "Trading" | "Chess" | "Coding";
  elo_rating: number;
  queued_at: Date;
}

export interface ScheduledBattle {
  id: number;
  battle_id: string;
  agent_a_pubkey: string;
  agent_b_pubkey: string;
  agent_a_elo: number;
  agent_b_elo: number;
  category: string;
  game_mode: string;
  status: "staking" | "battling" | "completed" | "cancelled";
  matched_at: Date;
  staking_ends_at: Date;
  seconds_until_battle: number;
  agent_a_name: string;
  agent_b_name: string;
  total_stake_a: bigint;
  total_stake_b: bigint;
  stake_count_a: number;
  stake_count_b: number;
}

export interface StakePlacement {
  user_address: string;
  battle_id: number;
  agent_pubkey: string;
  side: 0 | 1;
  amount: bigint;
}

export class MatchmakingService {
  private matchmakingTimer: NodeJS.Timeout | null = null;
  private battleStartTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  /**
   * Start the matchmaking engine
   */
  start(): void {
    if (this.matchmakingTimer) {
      console.log("[MatchmakingService] Already running");
      return;
    }

    console.log("[MatchmakingService] Starting...");
    
    // Matchmaking loop - find pairs every 5 seconds
    this.matchmakingTimer = setInterval(() => {
      this.processQueue().catch(console.error);
    }, MATCHMAKING_INTERVAL_MS);

    // Battle starter loop - check for completed staking windows
    this.battleStartTimer = setInterval(() => {
      this.startReadyBattles().catch(console.error);
    }, 3000); // Check every 3 seconds (reduced from 1s)

    console.log("[MatchmakingService] Started successfully");
  }

  /**
   * Stop the matchmaking engine
   */
  stop(): void {
    if (this.matchmakingTimer) {
      clearInterval(this.matchmakingTimer);
      this.matchmakingTimer = null;
    }
    if (this.battleStartTimer) {
      clearInterval(this.battleStartTimer);
      this.battleStartTimer = null;
    }
    console.log("[MatchmakingService] Stopped");
  }

  /**
   * Agent owner clicks "Enter Arena" - Add to queue
   */
  async enterQueue(
    agentPubkey: string,
    category: "Trading" | "Chess" | "Coding"
  ): Promise<{ success: boolean; message: string; battle?: ScheduledBattle }> {
    try {
      // Check if agent exists and is active
      const [agent] = await db.execute(sql`
        SELECT pubkey, elo_rating, matchmaking_status, agent_status
        FROM agents
        WHERE pubkey = ${agentPubkey}
      `);

      const agentData = agent as unknown as { 
        pubkey: string; 
        elo_rating: number; 
        matchmaking_status: string;
        agent_status: string;
      }[];

      if (!agentData || agentData.length === 0) {
        return { success: false, message: "Agent not found" };
      }

      const a = agentData[0];

      if (a.agent_status !== "active") {
        return { success: false, message: "Agent is not active" };
      }

      if (a.matchmaking_status === "queued") {
        return { success: false, message: "Agent already in queue" };
      }

      if (a.matchmaking_status === "matched" || a.matchmaking_status === "battling") {
        return { success: false, message: "Agent already in a battle" };
      }

      // Check if agent is already in a scheduled battle
      const [existingBattle] = await db.execute(sql`
        SELECT id FROM scheduled_battles
        WHERE (agent_a_pubkey = ${agentPubkey} OR agent_b_pubkey = ${agentPubkey})
        AND status IN ('staking', 'battling')
        LIMIT 1
      `);

      if (existingBattle && Array.isArray(existingBattle) && existingBattle.length > 0) {
        return { success: false, message: "Agent already in an active battle" };
      }

      // Add to queue
      await db.execute(sql`
        INSERT INTO matchmaking_queue (agent_pubkey, category, elo_rating, queued_at, expires_at)
        VALUES (${agentPubkey}, ${category}, ${a.elo_rating}, NOW(), NOW() + INTERVAL '5 minutes')
        ON CONFLICT (agent_pubkey) DO UPDATE SET
          category = ${category},
          elo_rating = ${a.elo_rating},
          queued_at = NOW(),
          expires_at = NOW() + INTERVAL '5 minutes'
      `);

      // Update agent status
      await db.execute(sql`
        UPDATE agents SET matchmaking_status = 'queued' WHERE pubkey = ${agentPubkey}
      `);

      // Try to find match immediately
      const match = await this.findMatch(agentPubkey, category, a.elo_rating);
      
      if (match) {
        const battle = await this.createBattle(match);
        return { 
          success: true, 
          message: "Match found! Staking window started.",
          battle 
        };
      }

      return { 
        success: true, 
        message: "Added to queue. Searching for opponent..." 
      };
    } catch (error) {
      console.error("[MatchmakingService] enterQueue error:", error);
      return { success: false, message: "Failed to enter queue" };
    }
  }

  /**
   * Remove agent from queue (owner cancels)
   */
  async leaveQueue(agentPubkey: string): Promise<boolean> {
    try {
      await db.execute(sql`
        DELETE FROM matchmaking_queue WHERE agent_pubkey = ${agentPubkey}
      `);
      
      await db.execute(sql`
        UPDATE agents SET matchmaking_status = 'idle' WHERE pubkey = ${agentPubkey}
      `);

      return true;
    } catch (error) {
      console.error("[MatchmakingService] leaveQueue error:", error);
      return false;
    }
  }

  /**
   * Find best match for an agent
   */
  private async findMatch(
    agentPubkey: string,
    category: string,
    eloRating: number
  ): Promise<{ agent_a: string; agent_b: string; agent_a_elo: number; agent_b_elo: number } | null> {
    // Use database function to find best match
    const result = await db.execute(sql`
      SELECT * FROM find_match(${agentPubkey}, ${category}, ${eloRating}, ${MAX_ELO_DIFF})
    `);

    const matches = result as unknown as { 
      opponent_pubkey: string; 
      opponent_elo: number;
      elo_diff: number;
      wait_seconds: number;
    }[];

    if (matches.length === 0) {
      return null;
    }

    const match = matches[0];
    
    // Determine who is agent A (higher Elo or first in queue)
    if (eloRating >= match.opponent_elo) {
      return {
        agent_a: agentPubkey,
        agent_b: match.opponent_pubkey,
        agent_a_elo: eloRating,
        agent_b_elo: match.opponent_elo,
      };
    } else {
      return {
        agent_a: match.opponent_pubkey,
        agent_b: agentPubkey,
        agent_a_elo: match.opponent_elo,
        agent_b_elo: eloRating,
      };
    }
  }

  /**
   * Create a scheduled battle between two agents
   */
  private async createBattle(match: {
    agent_a: string;
    agent_b: string;
    agent_a_elo: number;
    agent_b_elo: number;
  }): Promise<ScheduledBattle> {
    const category = await this.getAgentCategory(match.agent_a);
    const gameMode = this.selectGameMode(category);

    // Remove both from queue
    await db.execute(sql`
      DELETE FROM matchmaking_queue 
      WHERE agent_pubkey IN (${match.agent_a}, ${match.agent_b})
    `);

    // Create scheduled battle
    const [battle] = await db.execute(sql`
      INSERT INTO scheduled_battles (
        agent_a_pubkey, agent_b_pubkey, agent_a_elo, agent_b_elo,
        category, game_mode, status, staking_ends_at
      ) VALUES (
        ${match.agent_a}, ${match.agent_b}, ${match.agent_a_elo}, ${match.agent_b_elo},
        ${category}, ${gameMode}, 'staking', NOW() + INTERVAL '2 minutes'
      )
      RETURNING *
    `);

    // Update agent statuses
    await db.execute(sql`
      UPDATE agents 
      SET matchmaking_status = 'matched' 
      WHERE pubkey IN (${match.agent_a}, ${match.agent_b})
    `);

    return (battle as unknown as ScheduledBattle[])[0];
  }

  /**
   * Process matchmaking queue - find pairs
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Get all queued agents
      const result = await db.execute(sql`
        SELECT agent_pubkey, category, elo_rating
        FROM matchmaking_queue
        WHERE expires_at > NOW()
        ORDER BY queued_at ASC
      `);

      const queue = result as unknown as MatchmakingQueueEntry[];

      // Simple greedy matching
      const matched = new Set<string>();
      
      for (const agent of queue) {
        if (matched.has(agent.agent_pubkey)) continue;

        // Find best opponent
        const opponent = await this.findBestOpponent(agent, queue, matched);
        
        if (opponent) {
          const match = {
            agent_a: agent.elo_rating >= opponent.elo_rating ? agent.agent_pubkey : opponent.agent_pubkey,
            agent_b: agent.elo_rating >= opponent.elo_rating ? opponent.agent_pubkey : agent.agent_pubkey,
            agent_a_elo: Math.max(agent.elo_rating, opponent.elo_rating),
            agent_b_elo: Math.min(agent.elo_rating, opponent.elo_rating),
          };

          await this.createBattle(match);
          
          matched.add(agent.agent_pubkey);
          matched.add(opponent.agent_pubkey);

          console.log(`[MatchmakingService] Matched: ${match.agent_a} vs ${match.agent_b}`);
        }
      }

      // Clean up expired queue entries
      await db.execute(sql`
        DELETE FROM matchmaking_queue WHERE expires_at <= NOW()
      `);

      // Update status for expired
      await db.execute(sql`
        UPDATE agents 
        SET matchmaking_status = 'idle'
        WHERE matchmaking_status = 'queued'
        AND pubkey NOT IN (SELECT agent_pubkey FROM matchmaking_queue)
      `);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Find best opponent for an agent
   */
  private async findBestOpponent(
    agent: MatchmakingQueueEntry,
    queue: MatchmakingQueueEntry[],
    matched: Set<string>
  ): Promise<MatchmakingQueueEntry | null> {
    let bestOpponent: MatchmakingQueueEntry | null = null;
    let bestDiff = Infinity;

    for (const opponent of queue) {
      if (opponent.agent_pubkey === agent.agent_pubkey) continue;
      if (matched.has(opponent.agent_pubkey)) continue;
      if (opponent.category !== agent.category) continue;

      const diff = Math.abs(agent.elo_rating - opponent.elo_rating);
      if (diff <= MAX_ELO_DIFF && diff < bestDiff) {
        bestDiff = diff;
        bestOpponent = opponent;
      }
    }

    return bestOpponent;
  }

  /**
   * Start battles whose staking window has ended
   */
  private async startReadyBattles(): Promise<void> {
    try {
      // Find battles ready to start
      const result = await db.execute(sql`
        SELECT * FROM active_battles_view
        WHERE status = 'staking' AND seconds_until_battle <= 0
      `);

      const readyBattles = result as unknown as ScheduledBattle[];

      for (const battle of readyBattles) {
        console.log(`[MatchmakingService] Starting battle ${battle.battle_id}`);
        
        // Update status
        await db.execute(sql`
          UPDATE scheduled_battles
          SET status = 'battling', battle_started_at = NOW()
          WHERE id = ${battle.id}
        `);

        // Update agent statuses
        await db.execute(sql`
          UPDATE agents
          SET matchmaking_status = 'battling'
          WHERE pubkey IN (${battle.agent_a_pubkey}, ${battle.agent_b_pubkey})
        `);

        // Trigger battle (this would call your battle engine)
        this.triggerBattle(battle).catch(console.error);
      }
    } catch (error) {
      console.error("[MatchmakingService] startReadyBattles error:", error);
    }
  }

  /**
   * Place stake during staking window
   */
  async placeStake(stake: StakePlacement): Promise<{ success: boolean; message: string }> {
    try {
      // Verify battle is in staking phase
      const [battle] = await db.execute(sql`
        SELECT id, status, staking_ends_at, agent_a_pubkey, agent_b_pubkey
        FROM scheduled_battles
        WHERE id = ${stake.battle_id}
      `);

      const battleData = battle as unknown as { 
        id: number;
        status: string; 
        staking_ends_at: Date;
        agent_a_pubkey: string;
        agent_b_pubkey: string;
      }[];

      if (!battleData || battleData.length === 0) {
        return { success: false, message: "Battle not found" };
      }

      const b = battleData[0];

      if (b.status !== "staking") {
        return { success: false, message: "Staking window closed" };
      }

      if (new Date() > new Date(b.staking_ends_at)) {
        return { success: false, message: "Staking time expired" };
      }

      // Validate agent is in this battle
      if (stake.agent_pubkey !== b.agent_a_pubkey && stake.agent_pubkey !== b.agent_b_pubkey) {
        return { success: false, message: "Agent not in this battle" };
      }

      // Determine side
      const side = stake.agent_pubkey === b.agent_a_pubkey ? 0 : 1;

      // Insert stake
      await db.execute(sql`
        INSERT INTO scheduled_battle_stakes 
          (battle_id, user_address, agent_pubkey, side, amount)
        VALUES (${stake.battle_id}, ${stake.user_address}, ${stake.agent_pubkey}, ${side}, ${stake.amount})
        ON CONFLICT (battle_id, user_address, side) DO UPDATE SET
          amount = scheduled_battle_stakes.amount + ${stake.amount}
      `);

      // Update battle totals
      const column = side === 0 ? "total_stake_a" : "total_stake_b";
      const countColumn = side === 0 ? "stake_count_a" : "stake_count_b";
      
      await db.execute(sql`
        UPDATE scheduled_battles
        SET ${sql.raw(column)} = ${sql.raw(column)} + ${stake.amount},
            ${sql.raw(countColumn)} = ${sql.raw(countColumn)} + 1
        WHERE id = ${stake.battle_id}
      `);

      return { success: true, message: "Stake placed successfully" };
    } catch (error) {
      console.error("[MatchmakingService] placeStake error:", error);
      return { success: false, message: "Failed to place stake" };
    }
  }

  /**
   * Get active battles (for frontend display)
   */
  async getActiveBattles(): Promise<ScheduledBattle[]> {
    const result = await db.execute(sql`
      SELECT * FROM active_battles_view
      ORDER BY seconds_until_battle ASC
    `);
    return result as unknown as ScheduledBattle[];
  }

  /**
   * Get battle by ID
   */
  async getBattle(battleId: string): Promise<ScheduledBattle | null> {
    const result = await db.execute(sql`
      SELECT * FROM active_battles_view WHERE battle_id = ${battleId}
    `);
    const battles = result as unknown as ScheduledBattle[];
    return battles[0] || null;
  }

  /**
   * Update Elo ratings after battle
   */
  async updateElo(
    battleId: number,
    winnerPubkey: string
  ): Promise<{ agent_a_new_elo: number; agent_b_new_elo: number }> {
    const [battle] = await db.execute(sql`
      SELECT agent_a_pubkey, agent_b_pubkey, agent_a_elo, agent_b_elo
      FROM scheduled_battles WHERE id = ${battleId}
    `);

    const b = (battle as unknown as { 
      agent_a_pubkey: string; 
      agent_b_pubkey: string;
      agent_a_elo: number;
      agent_b_elo: number;
    }[])[0];

    const winner_elo = winnerPubkey === b.agent_a_pubkey ? b.agent_a_elo : b.agent_b_elo;
    const loser_elo = winnerPubkey === b.agent_a_pubkey ? b.agent_b_elo : b.agent_a_elo;

    const [eloResult] = await db.execute(sql`
      SELECT * FROM calculate_elo_change(${winner_elo}, ${loser_elo}, ${K_FACTOR})
    `);

    const newElos = eloResult as unknown as { winner_new_elo: number; loser_new_elo: number }[];
    const { winner_new_elo, loser_new_elo } = newElos[0];

    // Update battle
    await db.execute(sql`
      UPDATE scheduled_battles
      SET winner_pubkey = ${winnerPubkey},
          agent_a_new_elo = ${winnerPubkey === b.agent_a_pubkey ? winner_new_elo : loser_new_elo},
          agent_b_new_elo = ${winnerPubkey === b.agent_b_pubkey ? winner_new_elo : loser_new_elo},
          status = 'completed',
          battle_ended_at = NOW()
      WHERE id = ${battleId}
    `);

    // Update agents
    await db.execute(sql`
      UPDATE agents
      SET elo_rating = ${winnerPubkey === b.agent_a_pubkey ? winner_new_elo : loser_new_elo},
          elo_peak = GREATEST(elo_peak, ${winnerPubkey === b.agent_a_pubkey ? winner_new_elo : loser_new_elo}),
          matchmaking_status = 'idle',
          total_battles = total_battles + 1,
          total_wins = total_wins + ${winnerPubkey === b.agent_a_pubkey ? 1 : 0}
      WHERE pubkey = ${b.agent_a_pubkey}
    `);

    await db.execute(sql`
      UPDATE agents
      SET elo_rating = ${winnerPubkey === b.agent_b_pubkey ? winner_new_elo : loser_new_elo},
          elo_peak = GREATEST(elo_peak, ${winnerPubkey === b.agent_b_pubkey ? winner_new_elo : loser_new_elo}),
          matchmaking_status = 'idle',
          total_battles = total_battles + 1,
          total_wins = total_wins + ${winnerPubkey === b.agent_b_pubkey ? 1 : 0}
      WHERE pubkey = ${b.agent_b_pubkey}
    `);

    return {
      agent_a_new_elo: winnerPubkey === b.agent_a_pubkey ? winner_new_elo : loser_new_elo,
      agent_b_new_elo: winnerPubkey === b.agent_b_pubkey ? winner_new_elo : loser_new_elo,
    };
  }

  /**
   * Helper: Get agent category
   */
  private async getAgentCategory(pubkey: string): Promise<string> {
    const result = await db.execute(sql`SELECT category FROM agents WHERE pubkey = ${pubkey}`);
    return ((result as unknown as { category: string }[])[0])?.category;
  }

  /**
   * Helper: Select game mode based on category
   */
  private selectGameMode(category: string): string {
    const modes: Record<string, string> = {
      Trading: "TRADING_BLITZ",
      Chess: "QUICK_CHESS",
      Coding: "CODE_WARS",
    };
    return modes[category] || "TRADING_BLITZ";
  }

  /**
   * Trigger actual battle (integrates with your BattleEngine)
   */
  private async triggerBattle(battle: ScheduledBattle): Promise<void> {
    // This would integrate with your existing BattleEngine
    // For now, just log it
    console.log(`[MatchmakingService] Triggering battle: ${battle.battle_id}`);
    console.log(`  ${battle.agent_a_pubkey} vs ${battle.agent_b_pubkey}`);
    
    // TODO: Call your battle engine here
    // const result = await battleEngine.run(...)
    // await this.updateElo(battle.id, result.winner);
  }
}

// Helper type
interface MatchmakingEntry {
  agent_pubkey: string;
  category: string;
  elo_rating: number;
  queued_at: Date;
}

// Singleton
export const matchmakingService = new MatchmakingService();
