/**
 * BattleExecutor - Handles battle execution using the original battle mechanism
 * 
 * This service is responsible for:
 * 1. Running battles between agents using BattleEngine
 * 2. Streaming logs via Socket.io
 * 3. Handling battle completion and settlement
 */

import { BattleEngine, HttpAgentClient, MockAgent } from "../battle-engine";
import type { AgentConfig, ScheduledBattle } from "./MatchmakingService";
import type { GameMode } from "../types";
import { SocketManager } from "../SocketManager";
import { SolanaService } from "../SolanaService";
import { sql } from "drizzle-orm";
import { db } from "../db";

export class BattleExecutor {
  private socketManager: SocketManager | null = null;
  private solanaService: SolanaService;

  constructor(solanaService: SolanaService) {
    this.solanaService = solanaService;
  }

  setSocketManager(socketManager: SocketManager): void {
    this.socketManager = socketManager;
  }

  /**
   * Execute a battle between two agents
   */
  async executeBattle(battle: ScheduledBattle): Promise<void> {
    console.log(`\n[BattleExecutor] ========================================`);
    console.log(`[BattleExecutor] EXECUTING BATTLE: ${battle.battle_id}`);
    console.log(`[BattleExecutor] ${battle.agent_a_name} vs ${battle.agent_b_name}`);
    console.log(`[BattleExecutor] Category: ${battle.category}`);

    try {
      // Get agent details
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

      const agentA = agents.find((a) => a.pubkey === battle.agent_a_pubkey);
      const agentB = agents.find((a) => a.pubkey === battle.agent_b_pubkey);

      if (!agentA || !agentB) {
        console.error(`[BattleExecutor] Could not find agents!`);
        return;
      }

      console.log(`[BattleExecutor] Agent A: ${agentA.name} (API: ${agentA.api_url ? "yes" : "no (mock)"})`);
      console.log(`[BattleExecutor] Agent B: ${agentB.name} (API: ${agentB.api_url ? "yes" : "no (mock)"})`);

      // Create agent clients
      const agentAConfig: AgentConfig = {
        id: agentA.pubkey,
        name: agentA.name,
        apiUrl: agentA.api_url,
      };
      const agentBConfig: AgentConfig = {
        id: agentB.pubkey,
        name: agentB.name,
        apiUrl: agentB.api_url,
      };

      const agentAClient = agentA.api_url
        ? new HttpAgentClient(agentAConfig)
        : new MockAgent(agentAConfig, 0);

      const agentBClient = agentB.api_url
        ? new HttpAgentClient(agentBConfig)
        : new MockAgent(agentBConfig, 1);

      // Determine game mode
      const gameMode = this.selectGameMode(battle.category) as GameMode;

      // Run battle
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
          this.socketManager?.emitBattleEngineLog?.(battle.battle_id, {
            type: log.type || "info",
            side: log.side,
            message: log.message,
            timestamp: Date.now(),
          });
        },
        onDominance: (score) => {
          this.socketManager?.emitBattleDominance?.(battle.battle_id, score);
        },
      });

      console.log(`[BattleExecutor] Battle ${battle.battle_id} complete!`);
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

      // Complete battle (update Elo, etc.)
      await this.completeBattle(battle, result.winner_side);

      // On-chain settlement if arena exists
      if (battle.arena_address) {
        try {
          console.log(`[BattleExecutor] Settling on-chain for arena ${battle.arena_address}...`);
          const txSig = await this.solanaService.settleGameOnChain(
            battle.arena_address,
            result.winner_side
          );
          console.log(`[BattleExecutor] Settled on-chain. Tx: ${txSig}`);
        } catch (error) {
          console.error(`[BattleExecutor] On-chain settlement failed:`, error);
        }
      }
    } catch (error) {
      console.error(`[BattleExecutor] Battle ${battle.battle_id} failed:`, error);
      await this.completeBattle(battle, 0, true);
    }
  }

  /**
   * Complete battle and update records
   */
  private async completeBattle(
    battle: ScheduledBattle,
    winnerSide: 0 | 1,
    isError: boolean = false
  ): Promise<void> {
    const K_FACTOR = 32;

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

      // Add battle history
      await db.execute(sql`
        INSERT INTO agent_battle_history (agent_pubkey, opponent_pubkey, won, played_at)
        VALUES 
          (${winnerPubkey}, ${loserPubkey}, true, NOW()),
          (${loserPubkey}, ${winnerPubkey}, false, NOW())
      `);

      console.log(`[BattleExecutor] Battle ${battle.battle_id} completed!`);
    } catch (error) {
      console.error(`[BattleExecutor] Failed to complete battle ${battle.battle_id}:`, error);
    }
  }

  private selectGameMode(category: string): string {
    const modes: Record<string, string> = {
      Trading: "TRADING_BLITZ",
      Chess: "QUICK_CHESS",
      Coding: "CODE_WARS",
    };
    return modes[category] || "TRADING_BLITZ";
  }
}
