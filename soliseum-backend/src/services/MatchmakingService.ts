/**
 * Matchmaking Service - Elo-Based Auto Matchmaking
 * 
 * SEPARATED ARCHITECTURE:
 * 1. MatchmakingService: Handles queue, matching, and battle lifecycle
 * 2. BattleExecutor: Handles battle execution (original mechanism)
 * 3. StakingManager: Handles staking (optional, can be disabled)
 * 
 * MODES:
 * - ORIGINAL: Match found → Battle starts immediately (no staking)
 * - STAKING: Match found → Staking window → Battle starts (with on-chain)
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { BattleExecutor } from "./BattleExecutor";
import { StakingManager } from "./StakingManager";
import { SocketManager } from "../SocketManager";
import { SolanaService } from "../SolanaService";

// Elo rating constants
const K_FACTOR = 32;
const DEFAULT_ELO = 1000;
const MAX_ELO_DIFF = 200;
const MATCHMAKING_INTERVAL_MS = 10000;

// Feature flags - toggle these to change behavior
const FEATURES = {
  // ORIGINAL MODE: Set to false to skip staking and go directly to battle
  ENABLE_STAKING: process.env.ENABLE_STAKING === "true" || false,
  
  // On-chain arena creation (only used if staking is enabled)
  ENABLE_ON_CHAIN_ARENA: process.env.ENABLE_ON_CHAIN_ARENA === "true" || false,
  
  // Auto-retry failed battle completions
  ENABLE_STUCK_BATTLE_RECOVERY: true,
};

export interface AgentConfig {
  id: string;
  name: string;
  apiUrl: string | null;
}

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
  arena_address?: string | null;
}

export interface StakePlacement {
  user_address: string;
  battle_id: number;
  agent_pubkey: string;
  side: 0 | 1;
  amount: bigint;
  tx_signature?: string;
}

export class MatchmakingService {
  private matchmakingTimer: NodeJS.Timeout | null = null;
  private battleStartTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private stuckBattleRecoveryTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private socketManager: SocketManager | null = null;
  
  // Sub-services
  private battleExecutor: BattleExecutor;
  private stakingManager: StakingManager | null = null;
  private solanaService: SolanaService;

  constructor() {
    this.solanaService = new SolanaService();
    this.battleExecutor = new BattleExecutor(this.solanaService);
    
    // Only initialize staking manager if staking is enabled
    if (FEATURES.ENABLE_STAKING) {
      this.stakingManager = new StakingManager(this.solanaService);
    }
    
    console.log(`[MatchmakingService] Initialized with features:`, FEATURES);
  }

  setSocketManager(socketManager: SocketManager): void {
    this.socketManager = socketManager;
    this.battleExecutor.setSocketManager(socketManager);
    this.stakingManager?.setSocketManager(socketManager);
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
    console.log(`[MatchmakingService] Mode: ${FEATURES.ENABLE_STAKING ? 'STAKING' : 'ORIGINAL (no staking)'}`);
    console.log(`[MatchmakingService] Matchmaking interval: ${MATCHMAKING_INTERVAL_MS}ms`);

    // Matchmaking loop - find pairs
    this.matchmakingTimer = setInterval(() => {
      this.processQueue().catch(console.error);
    }, MATCHMAKING_INTERVAL_MS);

    // Battle starter loop - different behavior based on mode
    if (FEATURES.ENABLE_STAKING) {
      // Staking mode: Check for completed staking windows
      console.log("[MatchmakingService] Starting staking window checker...");
      this.battleStartTimer = setInterval(() => {
        this.startReadyBattlesWithStaking().catch(console.error);
      }, 3000);
      
      // Countdown emitter for staking phase
      this.countdownTimer = setInterval(() => {
        this.emitCountdownUpdates().catch(() => {});
      }, 1000);
    } else {
      // Original mode: Battles start immediately when created
      console.log("[MatchmakingService] Original mode: battles start immediately");
    }

    // Stuck battle recovery (always enabled for safety)
    if (FEATURES.ENABLE_STUCK_BATTLE_RECOVERY) {
      this.stuckBattleRecoveryTimer = setInterval(() => {
        this.recoverStuckBattles().catch((err) => {
          console.error("[MatchmakingService] Recovery error:", err);
        });
      }, 30000);
    }

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
    if (this.stuckBattleRecoveryTimer) {
      clearInterval(this.stuckBattleRecoveryTimer);
      this.stuckBattleRecoveryTimer = null;
    }
    console.log("[MatchmakingService] Stopped");
  }

  // ==================== QUEUE MANAGEMENT ====================

  /**
   * Agent owner enters queue
   */
  async enterQueue(
    agentPubkey: string,
    category: "Trading" | "Chess" | "Coding"
  ): Promise<{ success: boolean; message: string; battle?: ScheduledBattle | null }> {
    try {
      // Check agent exists and is active
      const agentResult = await db.execute(sql`
        SELECT pubkey, elo_rating, matchmaking_status, agent_status
        FROM agents WHERE pubkey = ${agentPubkey}
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

      // Check if already in battle
      const existingBattle = await db.execute(sql`
        SELECT id, status FROM scheduled_battles
        WHERE (agent_a_pubkey = ${agentPubkey} OR agent_b_pubkey = ${agentPubkey})
        AND status IN ('staking', 'battling')
        LIMIT 1
      `);

      if ((existingBattle as unknown as any[]).length > 0) {
        return { success: false, message: "Agent already in an active battle" };
      }

      if (a.matchmaking_status === "queued") {
        return { success: false, message: "Agent already in queue" };
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

      await db.execute(sql`
        UPDATE agents SET matchmaking_status = 'queued' WHERE pubkey = ${agentPubkey}
      `);

      // Try to find match immediately
      const match = await this.findMatch(agentPubkey, category, a.elo_rating);
      
      if (match) {
        const battle = await this.createBattle(match);
        
        // ORIGINAL MODE: Start battle immediately
        if (!FEATURES.ENABLE_STAKING && battle) {
          console.log(`[MatchmakingService] Original mode: Starting battle immediately`);
          this.startBattleImmediately(battle).catch((err) => {
            console.error(`[MatchmakingService] Failed to start battle:`, err);
          });
        }
        
        return { 
          success: true, 
          message: FEATURES.ENABLE_STAKING 
            ? "Match found! Staking window started." 
            : "Match found! Battle starting...",
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
   * Remove agent from queue
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
   * Place stake (delegates to StakingManager if enabled)
   */
  async placeStake(stake: StakePlacement): Promise<{ success: boolean; message: string }> {
    if (!FEATURES.ENABLE_STAKING || !this.stakingManager) {
      return { success: false, message: "Staking is not enabled" };
    }
    return this.stakingManager.placeStake(stake);
  }

  // ==================== PRIVATE METHODS ====================

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
      const matched = new Set<string>();
      
      for (const agent of queue) {
        if (matched.has(agent.agent_pubkey)) continue;

        const opponent = await this.findBestOpponent(agent, queue, matched);
        
        if (opponent) {
          const match = {
            agent_a: agent.elo_rating >= opponent.elo_rating ? agent.agent_pubkey : opponent.agent_pubkey,
            agent_b: agent.elo_rating >= opponent.elo_rating ? opponent.agent_pubkey : agent.agent_pubkey,
            agent_a_elo: Math.max(agent.elo_rating, opponent.elo_rating),
            agent_b_elo: Math.min(agent.elo_rating, opponent.elo_rating),
          };

          const battle = await this.createBattle(match);
          
          // ORIGINAL MODE: Start battle immediately
          if (!FEATURES.ENABLE_STAKING && battle) {
            this.startBattleImmediately(battle).catch(console.error);
          }
          
          matched.add(agent.agent_pubkey);
          matched.add(opponent.agent_pubkey);

          console.log(`[MatchmakingService] Matched: ${match.agent_a} vs ${match.agent_b}`);
        }
      }

      // Clean up expired queue entries
      await db.execute(sql`DELETE FROM matchmaking_queue WHERE expires_at <= NOW()`);
      await db.execute(sql`
        UPDATE agents SET matchmaking_status = 'idle'
        WHERE matchmaking_status = 'queued'
        AND pubkey NOT IN (SELECT agent_pubkey FROM matchmaking_queue)
      `);
    } finally {
      this.isProcessing = false;
    }
  }

  private async findMatch(
    agentPubkey: string,
    category: string,
    eloRating: number
  ): Promise<{ agent_a: string; agent_b: string; agent_a_elo: number; agent_b_elo: number } | null> {
    const result = await db.execute(sql`
      SELECT * FROM find_match(${agentPubkey}, ${category}, ${eloRating}, ${MAX_ELO_DIFF})
    `);

    const matches = result as unknown as { 
      opponent_pubkey: string; 
      opponent_elo: number;
    }[];

    if (matches.length === 0) return null;

    const match = matches[0];
    
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

  private async createBattle(match: {
    agent_a: string;
    agent_b: string;
    agent_a_elo: number;
    agent_b_elo: number;
  }): Promise<ScheduledBattle | null> {
    try {
      const category = await this.getAgentCategory(match.agent_a);
      const gameMode = this.selectGameMode(category);

      // Check for existing battle
      const existingCheck = await db.execute(sql`
        SELECT id FROM scheduled_battles
        WHERE (agent_a_pubkey IN (${match.agent_a}, ${match.agent_b}) 
           OR agent_b_pubkey IN (${match.agent_a}, ${match.agent_b}))
        AND status IN ('staking', 'battling')
        LIMIT 1
      `);
      
      if ((existingCheck as unknown as any[]).length > 0) {
        console.log(`[createBattle] Battle already exists for these agents`);
        const existing = await db.execute(sql`
          SELECT sb.*, a.name as agent_a_name, b.name as agent_b_name,
                 EXTRACT(EPOCH FROM (sb.staking_ends_at - NOW()))::INTEGER as seconds_until_battle
          FROM scheduled_battles sb
          JOIN agents a ON sb.agent_a_pubkey = a.pubkey
          JOIN agents b ON sb.agent_b_pubkey = b.pubkey
          WHERE sb.agent_a_pubkey IN (${match.agent_a}, ${match.agent_b})
          AND sb.status IN ('staking', 'battling')
          LIMIT 1
        `);
        return (existing as unknown as ScheduledBattle[])[0] || null;
      }

      // Remove from queue
      await db.execute(sql`
        DELETE FROM matchmaking_queue 
        WHERE agent_pubkey IN (${match.agent_a}, ${match.agent_b})
      `);

      // Create battle record
      const battleResult = await db.execute(sql`
        INSERT INTO scheduled_battles (
          agent_a_pubkey, agent_b_pubkey, agent_a_elo, agent_b_elo,
          category, game_mode, status, staking_ends_at, arena_address
        ) VALUES (
          ${match.agent_a}, ${match.agent_b}, ${match.agent_a_elo}, ${match.agent_b_elo},
          ${category}, ${gameMode}, 
          ${FEATURES.ENABLE_STAKING ? 'staking' : 'battling'},
          NOW() + INTERVAL '2 minutes',
          NULL
        )
        RETURNING *
      `);

      // Update agent statuses
      await db.execute(sql`
        UPDATE agents 
        SET matchmaking_status = ${FEATURES.ENABLE_STAKING ? 'matched' : 'battling'}
        WHERE pubkey IN (${match.agent_a}, ${match.agent_b})
      `);

      const battles = battleResult as unknown as ScheduledBattle[];
      const battle = battles[0];
      if (!battle) return null;
      
      // Fetch agent names
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
        seconds_until_battle: FEATURES.ENABLE_STAKING ? 120 : 0,
      };
    } catch (error) {
      console.error(`[createBattle] Error:`, error);
      return null;
    }
  }

  /**
   * ORIGINAL MODE: Start battle immediately (no staking window)
   */
  private async startBattleImmediately(battle: ScheduledBattle): Promise<void> {
    console.log(`[MatchmakingService] Starting battle immediately: ${battle.battle_id}`);
    
    try {
      // Update battle status
      await db.execute(sql`
        UPDATE scheduled_battles
        SET status = 'battling', battle_started_at = NOW()
        WHERE id = ${battle.id}
      `);

      // Execute battle using BattleExecutor
      await this.battleExecutor.executeBattle(battle);
      
    } catch (error) {
      console.error(`[MatchmakingService] Battle ${battle.battle_id} failed:`, error);
      await this.completeBattle(battle, 0, true);
    }
  }

  /**
   * STAKING MODE: Check for battles ready to start after staking window
   */
  private async startReadyBattlesWithStaking(): Promise<void> {
    if (!FEATURES.ENABLE_STAKING) return;

    try {
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

      for (const battle of readyBattles) {
        console.log(`[MatchmakingService] Staking complete, starting battle: ${battle.battle_id}`);
        
        try {
          await db.execute(sql`
            UPDATE scheduled_battles
            SET status = 'battling', battle_started_at = NOW()
            WHERE id = ${battle.id}
          `);

          await db.execute(sql`
            UPDATE agents
            SET matchmaking_status = 'battling'
            WHERE pubkey IN (${battle.agent_a_pubkey}, ${battle.agent_b_pubkey})
          `);

          // Execute battle in background
          this.battleExecutor.executeBattle(battle as ScheduledBattle).catch((err) => {
            console.error(`[MatchmakingService] Battle ${battle.battle_id} failed:`, err);
          });
          
        } catch (innerError) {
          console.error(`[MatchmakingService] Failed to start battle ${battle.battle_id}:`, innerError);
        }
      }
    } catch (error) {
      console.error("[MatchmakingService] startReadyBattlesWithStaking error:", error);
    }
  }

  /**
   * Complete battle and update Elo
   */
  async completeBattle(
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
      
      const { winner_new_elo, loser_new_elo } = (eloResult as unknown as any[])[0];
      
      // Update battle
      await db.execute(sql`
        UPDATE scheduled_battles
        SET status = 'completed',
            battle_ended_at = NOW(),
            winner_pubkey = ${winnerPubkey},
            agent_a_new_elo = ${winnerSide === 0 ? winner_new_elo : loser_new_elo},
            agent_b_new_elo = ${winnerSide === 0 ? loser_new_elo : winner_new_elo}
        WHERE id = ${battle.id}
      `);
      
      // Update agents
      await db.execute(sql`
        UPDATE agents
        SET total_wins = total_wins + 1,
            total_battles = total_battles + 1,
            elo_rating = ${winnerSide === 0 ? winner_new_elo : loser_new_elo},
            matchmaking_status = 'idle'
        WHERE pubkey = ${winnerPubkey}
      `);
      
      await db.execute(sql`
        UPDATE agents
        SET total_battles = total_battles + 1,
            elo_rating = ${winnerSide === 0 ? loser_new_elo : winner_new_elo},
            matchmaking_status = 'idle'
        WHERE pubkey = ${loserPubkey}
      `);
      
      // Add history
      await db.execute(sql`
        INSERT INTO agent_battle_history (agent_pubkey, opponent_pubkey, won, played_at)
        VALUES 
          (${winnerPubkey}, ${loserPubkey}, true, NOW()),
          (${loserPubkey}, ${winnerPubkey}, false, NOW())
      `);
      
      console.log(`[MatchmakingService] Battle ${battle.battle_id} completed! Winner: ${winnerSide === 0 ? battle.agent_a_name : battle.agent_b_name}`);
      
    } catch (error) {
      console.error(`[MatchmakingService] Failed to complete battle ${battle.battle_id}:`, error);
    }
  }

  /**
   * Recover battles stuck in 'battling' status
   */
  private async recoverStuckBattles(): Promise<void> {
    try {
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

      const stuckBattles = result as unknown as any[];

      for (const battle of stuckBattles) {
        console.log(`[MatchmakingService] Recovering stuck battle: ${battle.battle_id}`);
        
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
        
        await this.completeBattle(battleObj, 0, true);
      }
    } catch (error) {
      console.error("[MatchmakingService] recoverStuckBattles error:", error);
    }
  }

  /**
   * Emit countdown updates (staking mode only)
   */
  private async emitCountdownUpdates(): Promise<void> {
    if (!this.socketManager || !FEATURES.ENABLE_STAKING) return;
    
    try {
      const result = await db.execute(sql`
        SELECT battle_id, 
               EXTRACT(EPOCH FROM (staking_ends_at - NOW()))::INTEGER as seconds_remaining
        FROM scheduled_battles
        WHERE status = 'staking' AND staking_ends_at > NOW()
      `);
      
      const battles = result as unknown as { battle_id: string; seconds_remaining: number }[];
      
      for (const battle of battles) {
        this.socketManager.emitBattleCountdown(battle.battle_id, Math.max(0, battle.seconds_remaining));
      }
    } catch (error) {
      // Silently fail
    }
  }

  // ==================== HELPER METHODS ====================

  private async getAgentCategory(pubkey: string): Promise<string> {
    const result = await db.execute(sql`SELECT category FROM agents WHERE pubkey = ${pubkey}`);
    return ((result as unknown as { category: string }[])[0])?.category;
  }

  private selectGameMode(category: string): string {
    const modes: Record<string, string> = {
      Trading: "TRADING_BLITZ",
      Chess: "QUICK_CHESS",
      Coding: "CODE_WARS",
    };
    return modes[category] || "TRADING_BLITZ";
  }

  // ==================== PUBLIC API ====================

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
   * Debug: Manually trigger a battle immediately
   */
  async triggerBattle(battle: ScheduledBattle): Promise<void> {
    console.log(`[MatchmakingService] Debug: Manually triggering battle ${battle.battle_id}`);
    
    await db.execute(sql`
      UPDATE scheduled_battles
      SET status = 'battling', battle_started_at = NOW()
      WHERE id = ${battle.id}
    `);

    await db.execute(sql`
      UPDATE agents
      SET matchmaking_status = 'battling'
      WHERE pubkey IN (${battle.agent_a_pubkey}, ${battle.agent_b_pubkey})
    `);

    this.battleExecutor.executeBattle(battle).catch((err) => {
      console.error(`[MatchmakingService] Debug battle ${battle.battle_id} failed:`, err);
    });
  }
}

// Singleton
export const matchmakingService = new MatchmakingService();
