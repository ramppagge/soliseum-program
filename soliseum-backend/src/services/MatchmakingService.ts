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
import { BattleEngine, HttpAgentClient, MockAgent } from "../battle-engine";
import type { AgentConfig } from "../battle-engine";
import type { GameMode } from "../types";
import { SocketManager } from "../SocketManager";
import { SolanaService } from "../SolanaService";

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
  arena_address?: string | null; // On-chain arena address (null if not created on-chain)
}

export interface StakePlacement {
  user_address: string;
  battle_id: number;
  agent_pubkey: string;
  side: 0 | 1;
  amount: bigint;
  tx_signature?: string; // On-chain transaction signature for verified stakes
}

export class MatchmakingService {
  private matchmakingTimer: NodeJS.Timeout | null = null;
  private battleStartTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private arenaResetTimer: NodeJS.Timeout | null = null;
  private stuckBattleRecoveryTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private socketManager: SocketManager | null = null;
  private solanaService: SolanaService;
  
  // Transaction verification cache to avoid redundant RPC calls
  // Maps tx_signature -> { verified: boolean, timestamp: number }
  private txVerificationCache = new Map<string, { verified: boolean; timestamp: number }>();
  private readonly TX_CACHE_TTL_MS = 60000; // 60 second cache TTL

  constructor() {
    this.solanaService = new SolanaService();
  }

  /**
   * Check transaction verification cache to avoid redundant RPC calls
   */
  private getCachedTxVerification(txSignature: string): boolean | null {
    const cached = this.txVerificationCache.get(txSignature);
    if (!cached) return null;
    
    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp < this.TX_CACHE_TTL_MS) {
      return cached.verified;
    }
    
    // Expired - remove from cache
    this.txVerificationCache.delete(txSignature);
    return null;
  }

  /**
   * Cache transaction verification result
   */
  private cacheTxVerification(txSignature: string, verified: boolean): void {
    this.txVerificationCache.set(txSignature, {
      verified,
      timestamp: Date.now(),
    });
    
    // Clean up old entries periodically (simple approach: when cache gets large)
    if (this.txVerificationCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of this.txVerificationCache.entries()) {
        if (now - value.timestamp > this.TX_CACHE_TTL_MS) {
          this.txVerificationCache.delete(key);
        }
      }
    }
  }

  /**
   * Set SocketManager for emitting countdown updates
   */
  setSocketManager(socketManager: SocketManager): void {
    this.socketManager = socketManager;
  }

  /**
   * Start the matchmaking engine
   */
  start(): void {
    if (this.matchmakingTimer) {
      console.log("[MatchmakingService] Already running");
      return;
    }

    console.log("[MatchmakingService] Starting...");
    console.log(`[MatchmakingService] Matchmaking interval: ${MATCHMAKING_INTERVAL_MS}ms`);
    console.log(`[MatchmakingService] Battle starter interval: 3000ms`);
    
    // Matchmaking loop - find pairs every 5 seconds
    this.matchmakingTimer = setInterval(() => {
      this.processQueue().catch(console.error);
    }, MATCHMAKING_INTERVAL_MS);

    // Battle starter loop - check for completed staking windows
    console.log("[MatchmakingService] Starting battle starter timer...");
    this.battleStartTimer = setInterval(() => {
      console.log("[MatchmakingService] Tick - checking for ready battles...");
      this.startReadyBattles().catch(console.error);
    }, 3000); // Check every 3 seconds

    // Countdown emitter - emit countdown every second for UI updates
    this.countdownTimer = setInterval(() => {
      this.emitCountdownUpdates().catch(() => {});
    }, 1000);

    // Arena reset timer - periodically reset settled arenas for reuse
    // Runs every 60 seconds to check for settled arenas with empty vaults
    this.arenaResetTimer = setInterval(() => {
      this.resetSettledArenas().catch((err) => {
        console.error("[MatchmakingService] Arena reset error:", err);
      });
    }, 60000);

    // Stuck battle recovery - fix battles stuck in 'battling' status
    // This can happen if completeBattle fails due to DB errors
    this.stuckBattleRecoveryTimer = setInterval(() => {
      this.recoverStuckBattles().catch((err) => {
        console.error("[MatchmakingService] Stuck battle recovery error:", err);
      });
    }, 30000); // Check every 30 seconds

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
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.arenaResetTimer) {
      clearInterval(this.arenaResetTimer);
      this.arenaResetTimer = null;
    }
    if (this.stuckBattleRecoveryTimer) {
      clearInterval(this.stuckBattleRecoveryTimer);
      this.stuckBattleRecoveryTimer = null;
    }
    console.log("[MatchmakingService] Stopped");
  }

  /**
   * Emit countdown updates for battles in staking phase
   */
  private async emitCountdownUpdates(): Promise<void> {
    if (!this.socketManager) return;
    
    try {
      const result = await db.execute(sql`
        SELECT battle_id, 
               EXTRACT(EPOCH FROM (staking_ends_at - NOW()))::INTEGER as seconds_remaining
        FROM scheduled_battles
        WHERE status = 'staking' AND staking_ends_at > NOW()
      `);
      
      const battles = result as unknown as { battle_id: string; seconds_remaining: number }[];
      
      for (const battle of battles) {
        const secondsLeft = Math.max(0, battle.seconds_remaining);
        this.socketManager.emitBattleCountdown(battle.battle_id, secondsLeft);
      }
    } catch (error) {
      // Silently fail countdown updates - not critical
    }
  }

  /**
   * Reset settled arenas that have empty vaults for reuse.
   * This is critical because the oracle can only have one arena PDA.
   * Runs periodically to clean up completed battles.
   */
  private async resetSettledArenas(): Promise<void> {
    try {
      // Find completed battles with arena addresses that haven't been reset
      const result = await db.execute(sql`
        SELECT DISTINCT arena_address
        FROM scheduled_battles
        WHERE status = 'completed'
        AND arena_address IS NOT NULL
        AND battle_ended_at < NOW() - INTERVAL '5 minutes'
        LIMIT 5
      `);

      const arenas = result as unknown as { arena_address: string }[];

      for (const { arena_address } of arenas) {
        try {
          // Check if arena is settled on-chain
          const arenaState = await this.solanaService.getArenaOnChainState(arena_address);
          
          if (arenaState.status === 2) { // Settled
            console.log(`[MatchmakingService] Resetting settled arena: ${arena_address}`);
            const txSig = await this.solanaService.resetArenaOnChain(arena_address);
            console.log(`[MatchmakingService] Arena reset successfully. Tx: ${txSig}`);
          }
        } catch (error) {
          // Vault might not be empty yet (claims pending) - this is expected
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("Vault must be empty")) {
            console.log(`[MatchmakingService] Arena ${arena_address} waiting for claims...`);
          } else {
            console.error(`[MatchmakingService] Failed to reset arena ${arena_address}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("[MatchmakingService] resetSettledArenas error:", error);
    }
  }

  /**
   * Recover battles stuck in 'battling' status.
   * This can happen if completeBattle fails due to DB connection errors.
   * Automatically completes battles that have been 'battling' for too long.
   */
  private async recoverStuckBattles(): Promise<void> {
    try {
      // Find battles stuck in 'battling' status for more than 5 minutes
      const result = await db.execute(sql`
        SELECT id, battle_id, agent_a_pubkey, agent_b_pubkey, 
               agent_a_elo, agent_b_elo, category, game_mode,
               battle_started_at, arena_address,
               EXTRACT(EPOCH FROM (NOW() - battle_started_at))::INTEGER as battling_seconds
        FROM scheduled_battles
        WHERE status = 'battling'
        AND battle_started_at < NOW() - INTERVAL '5 minutes'
        LIMIT 5
      `);

      const stuckBattles = result as unknown as Array<{
        id: number;
        battle_id: string;
        agent_a_pubkey: string;
        agent_b_pubkey: string;
        agent_a_elo: number;
        agent_b_elo: number;
        category: string;
        game_mode: string;
        battle_started_at: Date;
        arena_address: string | null;
        battling_seconds: number;
      }>;

      for (const battle of stuckBattles) {
        console.log(`[MatchmakingService] Found stuck battle: ${battle.battle_id} (battling for ${battle.battling_seconds}s)`);
        
        try {
          // Complete the battle with a random winner (or Agent A as default)
          console.log(`[MatchmakingService] Auto-completing stuck battle ${battle.battle_id}...`);
          
          // Create a minimal ScheduledBattle object for completeBattle
          const battleObj: ScheduledBattle = {
            id: battle.id,
            battle_id: battle.battle_id,
            agent_a_pubkey: battle.agent_a_pubkey,
            agent_b_pubkey: battle.agent_b_pubkey,
            agent_a_elo: battle.agent_a_elo,
            agent_b_elo: battle.agent_b_elo,
            category: battle.category,
            game_mode: battle.game_mode,
            status: 'battling',
            matched_at: new Date(),
            staking_ends_at: new Date(),
            seconds_until_battle: 0,
            agent_a_name: 'Agent A',
            agent_b_name: 'Agent B',
            total_stake_a: BigInt(0),
            total_stake_b: BigInt(0),
            stake_count_a: 0,
            stake_count_b: 0,
            arena_address: battle.arena_address,
          };
          
          // Default to Agent A winner on recovery
          await this.completeBattle(battleObj, 0, true);
          console.log(`[MatchmakingService] Stuck battle ${battle.battle_id} completed`);
        } catch (recoveryError) {
          console.error(`[MatchmakingService] Failed to recover stuck battle ${battle.battle_id}:`, recoveryError);
        }
      }
    } catch (error) {
      console.error("[MatchmakingService] recoverStuckBattles error:", error);
    }
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
      const agentResult = await db.execute(sql`
        SELECT pubkey, elo_rating, matchmaking_status, agent_status
        FROM agents
        WHERE pubkey = ${agentPubkey}
      `);

      const agentData = agentResult as unknown as { 
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

      // Check if agent is already in a scheduled battle (CRITICAL - prevents duplicates)
      const existingBattleResult = await db.execute(sql`
        SELECT id, status FROM scheduled_battles
        WHERE (agent_a_pubkey = ${agentPubkey} OR agent_b_pubkey = ${agentPubkey})
        AND status IN ('staking', 'battling')
        LIMIT 1
      `);

      const existingBattle = existingBattleResult as unknown as { id: number; status: string }[];
      if (existingBattle && existingBattle.length > 0) {
        console.log(`[enterQueue] Agent ${agentPubkey} already in battle ${existingBattle[0].id} (${existingBattle[0].status})`);
        return { success: false, message: "Agent already in an active battle" };
      }

      // Check queue status
      if (a.matchmaking_status === "queued") {
        return { success: false, message: "Agent already in queue" };
      }

      if (a.matchmaking_status === "matched" || a.matchmaking_status === "battling") {
        return { success: false, message: "Agent already in a battle" };
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
   * Also creates an on-chain arena for staking
   */
  private async createBattle(match: {
    agent_a: string;
    agent_b: string;
    agent_a_elo: number;
    agent_b_elo: number;
  }): Promise<ScheduledBattle> {
    const category = await this.getAgentCategory(match.agent_a);
    const gameMode = this.selectGameMode(category);

    // Check if either agent already has an active battle (prevents duplicates)
    const existingCheck = await db.execute(sql`
      SELECT id FROM scheduled_battles
      WHERE (agent_a_pubkey IN (${match.agent_a}, ${match.agent_b}) 
         OR agent_b_pubkey IN (${match.agent_a}, ${match.agent_b}))
      AND status IN ('staking', 'battling')
      LIMIT 1
    `);
    
    const existing = existingCheck as unknown as { id: number }[];
    if (existing && existing.length > 0) {
      console.log(`[createBattle] Battle already exists for these agents, skipping`);
      // Return the existing battle with agent names
      const existingBattle = await db.execute(sql`
        SELECT sb.*, a.name as agent_a_name, b.name as agent_b_name,
               EXTRACT(EPOCH FROM (sb.staking_ends_at - NOW()))::INTEGER as seconds_until_battle,
               sb.arena_address
        FROM scheduled_battles sb
        JOIN agents a ON sb.agent_a_pubkey = a.pubkey
        JOIN agents b ON sb.agent_b_pubkey = b.pubkey
        WHERE sb.agent_a_pubkey IN (${match.agent_a}, ${match.agent_b})
        AND sb.status IN ('staking', 'battling')
        LIMIT 1
      `);
      return (existingBattle as unknown as ScheduledBattle[])[0];
    }

    // Create on-chain arena
    let arenaAddress: string | null = null;
    try {
      console.log(`[createBattle] Creating on-chain arena...`);
      const { arenaAddress: newArenaAddress } = await this.solanaService.createArenaOnChain();
      arenaAddress = newArenaAddress;
      console.log(`[createBattle] On-chain arena created: ${arenaAddress}`);
    } catch (error) {
      console.error(`[createBattle] Failed to create on-chain arena:`, error);
      // Continue without on-chain arena - stakes will be DB-only (fallback)
      // In production, you might want to throw here instead
    }

    // Remove both from queue
    await db.execute(sql`
      DELETE FROM matchmaking_queue 
      WHERE agent_pubkey IN (${match.agent_a}, ${match.agent_b})
    `);

    // Create scheduled battle with arena address
    const battleResult = await db.execute(sql`
      INSERT INTO scheduled_battles (
        agent_a_pubkey, agent_b_pubkey, agent_a_elo, agent_b_elo,
        category, game_mode, status, staking_ends_at, arena_address
      ) VALUES (
        ${match.agent_a}, ${match.agent_b}, ${match.agent_a_elo}, ${match.agent_b_elo},
        ${category}, ${gameMode}, 'staking', NOW() + INTERVAL '2 minutes',
        ${arenaAddress}
      )
      RETURNING *
    `);

    // Update agent statuses
    await db.execute(sql`
      UPDATE agents 
      SET matchmaking_status = 'matched' 
      WHERE pubkey IN (${match.agent_a}, ${match.agent_b})
    `);

    const battles = battleResult as unknown as ScheduledBattle[];
    const battle = battles[0];
    
    // Fetch agent names to return complete battle object
    const agentNames = await db.execute(sql`
      SELECT name FROM agents WHERE pubkey = ${match.agent_a}
      UNION ALL
      SELECT name FROM agents WHERE pubkey = ${match.agent_b}
    `);
    const names = agentNames as unknown as { name: string }[];
    
    return {
      ...battle,
      agent_a_name: names[0]?.name || 'Agent A',
      agent_b_name: names[1]?.name || 'Agent B',
      seconds_until_battle: Math.floor((new Date(battle.staking_ends_at).getTime() - Date.now()) / 1000),
    };
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
      console.log("[MatchmakingService] Querying for ready battles...");
      
      // Query directly from scheduled_battles table (not view) to avoid column issues
      const allBattles = await db.execute(sql`
        SELECT sb.id, sb.battle_id, sb.agent_a_pubkey, sb.agent_b_pubkey, sb.status,
               sb.staking_ends_at, sb.category,
               EXTRACT(EPOCH FROM (sb.staking_ends_at - NOW()))::INTEGER as seconds_until,
               a.name as agent_a_name, b.name as agent_b_name
        FROM scheduled_battles sb
        JOIN agents a ON sb.agent_a_pubkey = a.pubkey
        JOIN agents b ON sb.agent_b_pubkey = b.pubkey
        WHERE sb.status = 'staking'
      `);
      
      const allStaking = allBattles as unknown as any[];
      console.log(`[MatchmakingService] Total staking battles: ${allStaking.length}`);
      
      if (allStaking.length > 0) {
        allStaking.forEach(b => {
          const timeLeft = Math.max(0, b.seconds_until);
          console.log(`  - ${b.battle_id}: ${timeLeft}s remaining | ${b.agent_a_name || 'Agent A'} vs ${b.agent_b_name || 'Agent B'}`);
        });
      }
      
      // Find battles ready to start (staking_ends_at <= NOW())
      const result = await db.execute(sql`
        SELECT 
          sb.id, sb.battle_id, sb.agent_a_pubkey, sb.agent_b_pubkey, 
          sb.category, sb.status, sb.game_mode,
          a.name as agent_a_name, b.name as agent_b_name
        FROM scheduled_battles sb
        JOIN agents a ON sb.agent_a_pubkey = a.pubkey
        JOIN agents b ON sb.agent_b_pubkey = b.pubkey
        WHERE sb.status = 'staking' 
        AND sb.staking_ends_at <= NOW()
      `);

      const readyBattles = result as unknown as any[];
      console.log(`[MatchmakingService] Battles ready to start: ${readyBattles.length}`);

      for (const battle of readyBattles) {
        console.log(`[MatchmakingService] >>> STARTING BATTLE ${battle.battle_id} <<<`);
        console.log(`  ${battle.agent_a_name || 'Agent A'} vs ${battle.agent_b_name || 'Agent B'}`);
        
        try {
          // Update status
          await db.execute(sql`
            UPDATE scheduled_battles
            SET status = 'battling', battle_started_at = NOW()
            WHERE id = ${battle.id}
          `);
          console.log(`[MatchmakingService] Status updated to 'battling'`);

          // Update agent statuses
          await db.execute(sql`
            UPDATE agents
            SET matchmaking_status = 'battling'
            WHERE pubkey IN (${battle.agent_a_pubkey}, ${battle.agent_b_pubkey})
          `);
          console.log(`[MatchmakingService] Agent statuses updated`);

          // Trigger battle WITHOUT awaiting - runs in background
          // This prevents blocking the timer loop during long battles
          console.log(`[MatchmakingService] Triggering battle in background...`);
          this.triggerBattle(battle).catch((err) => {
            console.error(`[MatchmakingService] Battle ${battle.battle_id} failed:`, err);
          });
          console.log(`[MatchmakingService] Battle triggered (running in background)`);
        } catch (innerError) {
          console.error(`[MatchmakingService] FAILED to start battle ${battle.battle_id}:`, innerError);
        }
      }
    } catch (error) {
      console.error("[MatchmakingService] startReadyBattles error:", error);
    }
  }

  /**
   * Place stake during staking window
   * 
   * New flow with on-chain staking:
   * 1. Frontend calls place_stake on-chain directly (user signs transaction)
   * 2. Frontend sends tx_signature to backend via this endpoint
   * 3. Backend verifies the on-chain stake and records it in DB
   * 
   * Fallback flow (if no on-chain arena):
   * - Backend records DB-only stake (for testing/development)
   */
  async placeStake(stake: StakePlacement): Promise<{ success: boolean; message: string }> {
    try {
      // Verify battle is in staking phase
      const battleResult = await db.execute(sql`
        SELECT id, status, staking_ends_at, agent_a_pubkey, agent_b_pubkey, arena_address
        FROM scheduled_battles
        WHERE id = ${stake.battle_id}
      `);

      const battleData = battleResult as unknown as { 
        id: number;
        status: string; 
        staking_ends_at: Date;
        agent_a_pubkey: string;
        agent_b_pubkey: string;
        arena_address: string | null;
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

      // If tx_signature provided, verify on-chain stake
      if (stake.tx_signature) {
        try {
          // Check cache first to avoid redundant RPC calls
          let isVerified = this.getCachedTxVerification(stake.tx_signature);
          
          if (isVerified === null) {
            // Not in cache - verify via RPC
            const connection = this.solanaService.getConnection();
            const status = await connection.getSignatureStatus(stake.tx_signature);
            isVerified = !!status?.value && !status.value.err;
            
            // Cache the result
            this.cacheTxVerification(stake.tx_signature, isVerified);
          }
          
          if (!isVerified) {
            return { success: false, message: "Transaction failed or not found" };
          }

          // Insert verified stake with tx signature
          await db.execute(sql`
            INSERT INTO scheduled_battle_stakes 
              (battle_id, user_address, agent_pubkey, side, amount, tx_signature)
            VALUES (${stake.battle_id}, ${stake.user_address}, ${stake.agent_pubkey}, ${side}, ${stake.amount}, ${stake.tx_signature})
            ON CONFLICT (battle_id, user_address, side) DO UPDATE SET
              amount = scheduled_battle_stakes.amount + ${stake.amount},
              tx_signature = ${stake.tx_signature}
          `);
        } catch (txError) {
          console.error(`[placeStake] Failed to verify on-chain tx:`, txError);
          return { success: false, message: "Failed to verify on-chain transaction" };
        }
      } else if (b.arena_address) {
        // On-chain arena exists but no tx_signature provided
        return { 
          success: false, 
          message: "On-chain staking required. Please submit the transaction signature." 
        };
      } else {
        // No on-chain arena (fallback for testing) - record DB-only stake
        await db.execute(sql`
          INSERT INTO scheduled_battle_stakes 
            (battle_id, user_address, agent_pubkey, side, amount)
          VALUES (${stake.battle_id}, ${stake.user_address}, ${stake.agent_pubkey}, ${side}, ${stake.amount})
          ON CONFLICT (battle_id, user_address, side) DO UPDATE SET
            amount = scheduled_battle_stakes.amount + ${stake.amount}
        `);
      }

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
      SELECT 
        sb.id, sb.battle_id, sb.agent_a_pubkey, sb.agent_b_pubkey,
        sb.agent_a_elo, sb.agent_b_elo, sb.category, sb.game_mode, sb.status,
        sb.matched_at, sb.staking_ends_at, sb.total_stake_a, sb.total_stake_b,
        sb.stake_count_a, sb.stake_count_b, sb.arena_address,
        a.name as agent_a_name, b.name as agent_b_name,
        EXTRACT(EPOCH FROM (sb.staking_ends_at - NOW()))::INTEGER as seconds_until_battle
      FROM scheduled_battles sb
      JOIN agents a ON sb.agent_a_pubkey = a.pubkey
      JOIN agents b ON sb.agent_b_pubkey = b.pubkey
      WHERE sb.status IN ('staking', 'battling')
      ORDER BY sb.staking_ends_at ASC
    `);
    return result as unknown as ScheduledBattle[];
  }

  /**
   * Get battle by ID
   */
  async getBattle(battleId: string): Promise<ScheduledBattle | null> {
    const result = await db.execute(sql`
      SELECT 
        sb.id, sb.battle_id, sb.agent_a_pubkey, sb.agent_b_pubkey,
        sb.agent_a_elo, sb.agent_b_elo, sb.category, sb.game_mode, sb.status,
        sb.matched_at, sb.staking_ends_at, sb.total_stake_a, sb.total_stake_b,
        sb.stake_count_a, sb.stake_count_b, sb.arena_address,
        a.name as agent_a_name, b.name as agent_b_name,
        EXTRACT(EPOCH FROM (sb.staking_ends_at - NOW()))::INTEGER as seconds_until_battle
      FROM scheduled_battles sb
      JOIN agents a ON sb.agent_a_pubkey = a.pubkey
      JOIN agents b ON sb.agent_b_pubkey = b.pubkey
      WHERE sb.battle_id = ${battleId}
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
   * Trigger actual battle (integrates with BattleEngine)
   * Handles both real agents (with API) and mock agents (no API)
   */
  public async triggerBattle(battle: ScheduledBattle): Promise<void> {
    console.log(`\n[MatchmakingService] ========================================`);
    console.log(`[MatchmakingService] TRIGGERING BATTLE: ${battle.battle_id}`);
    console.log(`[MatchmakingService] ${battle.agent_a_name} vs ${battle.agent_b_name}`);
    console.log(`[MatchmakingService] Category: ${battle.category}`);
    
    try {
      // Get agent details
      console.log(`[MatchmakingService] Fetching agent details...`);
      const agentsResult = await db.execute(sql`
        SELECT pubkey, name, api_url, category 
        FROM agents 
        WHERE pubkey IN (${battle.agent_a_pubkey}, ${battle.agent_b_pubkey})
      `);
      
      const agents = agentsResult as unknown as {
        pubkey: string;
        name: string;
        api_url: string | null;
        category: string;
      }[];
      
      console.log(`[MatchmakingService] Found ${agents.length} agents`);
      
      const agentA = agents.find(a => a.pubkey === battle.agent_a_pubkey);
      const agentB = agents.find(a => a.pubkey === battle.agent_b_pubkey);
      
      if (!agentA || !agentB) {
        console.error(`[MatchmakingService] ERROR: Could not find agents!`);
        console.error(`  Agent A (${battle.agent_a_pubkey}): ${agentA ? 'found' : 'NOT FOUND'}`);
        console.error(`  Agent B (${battle.agent_b_pubkey}): ${agentB ? 'found' : 'NOT FOUND'}`);
        return;
      }
      
      console.log(`[MatchmakingService] Agent A: ${agentA.name} (API: ${agentA.api_url ? 'yes' : 'no (mock)'})`);
      console.log(`[MatchmakingService] Agent B: ${agentB.name} (API: ${agentB.api_url ? 'yes' : 'no (mock)'})`);
      
      // Create agent clients
      // If agent has apiUrl, use HttpAgentClient, otherwise use MockAgent
      const agentAConfig: AgentConfig = { 
        id: agentA.pubkey, 
        name: agentA.name, 
        apiUrl: agentA.api_url 
      };
      const agentBConfig: AgentConfig = { 
        id: agentB.pubkey, 
        name: agentB.name, 
        apiUrl: agentB.api_url 
      };
      
      const agentAClient = agentA.api_url 
        ? new HttpAgentClient(agentAConfig)
        : new MockAgent(agentAConfig, 0);
        
      const agentBClient = agentB.api_url
        ? new HttpAgentClient(agentBConfig)
        : new MockAgent(agentBConfig, 1);
      
      // Determine game mode from category
      const gameMode = this.selectGameMode(battle.category) as GameMode;
      
      // Run battle with Socket.io streaming
      const engine = new BattleEngine();
      
      // Emit battle start
      this.socketManager?.emitBattleStart?.(battle.battle_id, {
        agentA: { id: agentA.pubkey, name: agentA.name },
        agentB: { id: agentB.pubkey, name: agentB.name },
        gameMode: gameMode,
      });
      
      const result = await engine.run(agentAClient, agentBClient, gameMode, {
        onLog: (log) => {
          console.log(`[Battle ${battle.battle_id}] ${log.side}: ${log.message}`);
          // Emit log via Socket.io
          this.socketManager?.emitBattleEngineLog?.(battle.battle_id, {
            type: log.type || 'info',
            side: log.side,
            message: log.message,
            timestamp: Date.now(),
          });
        },
        onDominance: (score) => {
          this.socketManager?.emitBattleDominance?.(battle.battle_id, score);
        },
      });
      
      console.log(`[MatchmakingService] Battle ${battle.battle_id} complete!`);
      console.log(`  Winner: ${result.winner_side === 0 ? battle.agent_a_name : battle.agent_b_name}`);
      console.log(`  Summary: ${result.summary}`);
      
      // Emit battle end
      this.socketManager?.emitBattleEngineEnd?.(battle.battle_id, {
        winner_side: result.winner_side,
        gameMode: result.gameMode,
        durationMs: result.durationMs,
        summary: result.summary,
        scores: result.scores,
      });
      
      // Update battle result
      await this.completeBattle(battle, result.winner_side);
      
    } catch (error) {
      console.error(`[MatchmakingService] Battle ${battle.battle_id} failed:`, error);
      // Mark battle as error but still complete it
      await this.completeBattle(battle, 0, true); // Default to agent A win on error
    }
  }
  
  /**
   * Complete battle and update Elo ratings
   * Also settles the game on-chain if there's an arena address
   */
  private async completeBattle(
    battle: ScheduledBattle, 
    winnerSide: 0 | 1,
    isError: boolean = false
  ): Promise<void> {
    try {
      const winnerPubkey = winnerSide === 0 ? battle.agent_a_pubkey : battle.agent_b_pubkey;
      const loserPubkey = winnerSide === 0 ? battle.agent_b_pubkey : battle.agent_a_pubkey;
      const winnerElo = winnerSide === 0 ? battle.agent_a_elo : battle.agent_b_elo;
      const loserElo = winnerSide === 0 ? battle.agent_b_elo : battle.agent_a_elo;
      
      // Calculate new Elo
      const [eloResult] = await db.execute(sql`
        SELECT * FROM calculate_elo_change(${winnerElo}, ${loserElo}, ${K_FACTOR})
      `);
      
      const eloData = eloResult as unknown as { winner_new_elo: number; loser_new_elo: number }[];
      const { winner_new_elo, loser_new_elo } = eloData[0];
      
      // Update battle status
      await db.execute(sql`
        UPDATE scheduled_battles
        SET status = 'completed',
            battle_ended_at = NOW(),
            winner_pubkey = ${winnerPubkey},
            agent_a_new_elo = ${winnerSide === 0 ? winner_new_elo : loser_new_elo},
            agent_b_new_elo = ${winnerSide === 0 ? loser_new_elo : winner_new_elo}
        WHERE id = ${battle.id}
      `);
      
      // Update winner stats
      await db.execute(sql`
        UPDATE agents
        SET total_wins = total_wins + 1,
            total_battles = total_battles + 1,
            elo_rating = ${winnerSide === 0 ? winner_new_elo : loser_new_elo},
            matchmaking_status = 'idle'
        WHERE pubkey = ${winnerPubkey}
      `);
      
      // Update loser stats
      await db.execute(sql`
        UPDATE agents
        SET total_battles = total_battles + 1,
            elo_rating = ${winnerSide === 0 ? loser_new_elo : winner_new_elo},
            matchmaking_status = 'idle'
        WHERE pubkey = ${loserPubkey}
      `);
      
      // Add battle history
      await db.execute(sql`
        INSERT INTO agent_battle_history (agent_pubkey, opponent_pubkey, won, played_at)
        VALUES 
          (${winnerPubkey}, ${loserPubkey}, true, NOW()),
          (${loserPubkey}, ${winnerPubkey}, false, NOW())
      `);
      
      console.log(`[MatchmakingService] Battle ${battle.battle_id} completed!`);
      console.log(`  ${winnerSide === 0 ? battle.agent_a_name : battle.agent_b_name} wins!`);
      console.log(`  Elo: ${winnerElo} → ${winner_new_elo} (winner)`);
      console.log(`  Elo: ${loserElo} → ${loser_new_elo} (loser)`);
      
      // Settle game on-chain if there's an arena address
      if (battle.arena_address) {
        try {
          console.log(`[MatchmakingService] Settling game on-chain for arena ${battle.arena_address}...`);
          const txSig = await this.solanaService.settleGameOnChain(battle.arena_address, winnerSide);
          console.log(`[MatchmakingService] Game settled on-chain. Tx: ${txSig}`);
        } catch (onChainError) {
          console.error(`[MatchmakingService] Failed to settle game on-chain:`, onChainError);
          // Don't throw - the battle is still completed in DB, just not settled on-chain
          // This can be handled manually or by a retry mechanism later
        }
      }
      
    } catch (error) {
      console.error(`[MatchmakingService] Failed to complete battle ${battle.battle_id}:`, error);
    }
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
