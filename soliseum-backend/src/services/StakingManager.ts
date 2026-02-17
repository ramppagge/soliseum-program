/**
 * StakingManager - Handles staking logic for battles
 * 
 * This service is only active when ENABLE_STAKING feature flag is set.
 * It manages:
 * 1. Recording stakes (DB-only or on-chain verified)
 * 2. Transaction verification caching
 * 3. Arena reset for settled battles
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import type { StakePlacement, ScheduledBattle } from "./MatchmakingService";
import { SocketManager } from "../SocketManager";
import { SolanaService } from "../SolanaService";

export class StakingManager {
  private socketManager: SocketManager | null = null;
  private solanaService: SolanaService;
  private txVerificationCache = new Map<string, { verified: boolean; timestamp: number }>();
  private readonly TX_CACHE_TTL_MS = 60000;
  private arenaResetTimer: NodeJS.Timeout | null = null;

  constructor(solanaService: SolanaService) {
    this.solanaService = solanaService;
    this.startArenaResetTimer();
  }

  setSocketManager(socketManager: SocketManager): void {
    this.socketManager = socketManager;
  }

  destroy(): void {
    if (this.arenaResetTimer) {
      clearInterval(this.arenaResetTimer);
      this.arenaResetTimer = null;
    }
  }

  /**
   * Place a stake on a battle
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
          let isVerified = this.getCachedTxVerification(stake.tx_signature);

          if (isVerified === null) {
            const connection = this.solanaService.getConnection();
            const status = await connection.getSignatureStatus(stake.tx_signature);
            isVerified = !!status?.value && !status.value.err;
            this.cacheTxVerification(stake.tx_signature, isVerified);
          }

          if (!isVerified) {
            return { success: false, message: "Transaction failed or not found" };
          }

          // Insert verified stake
          await db.execute(sql`
            INSERT INTO scheduled_battle_stakes 
              (battle_id, user_address, agent_pubkey, side, amount, tx_signature)
            VALUES (${stake.battle_id}, ${stake.user_address}, ${stake.agent_pubkey}, ${side}, ${stake.amount}, ${stake.tx_signature})
            ON CONFLICT (battle_id, user_address, side) DO UPDATE SET
              amount = scheduled_battle_stakes.amount + ${stake.amount},
              tx_signature = ${stake.tx_signature}
          `);
        } catch (txError) {
          console.error(`[StakingManager] Failed to verify on-chain tx:`, txError);
          return { success: false, message: "Failed to verify on-chain transaction" };
        }
      } else if (b.arena_address) {
        // On-chain arena exists but no tx_signature
        return {
          success: false,
          message: "On-chain staking required. Please submit the transaction signature.",
        };
      } else {
        // DB-only stake (fallback for testing)
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
      console.error("[StakingManager] placeStake error:", error);
      return { success: false, message: "Failed to place stake" };
    }
  }

  /**
   * Create on-chain arena for battle
   */
  async createArenaForBattle(): Promise<{ arenaAddress: string; vaultAddress: string } | null> {
    try {
      console.log(`[StakingManager] Creating on-chain arena...`);
      const result = await this.solanaService.createArenaOnChain();
      console.log(`[StakingManager] Arena created: ${result.arenaAddress}`);
      return result;
    } catch (error) {
      console.error(`[StakingManager] Failed to create arena:`, error);
      return null;
    }
  }

  /**
   * Reset settled arenas periodically
   */
  private startArenaResetTimer(): void {
    this.arenaResetTimer = setInterval(() => {
      this.resetSettledArenas().catch((err) => {
        console.error("[StakingManager] Arena reset error:", err);
      });
    }, 60000);
  }

  private async resetSettledArenas(): Promise<void> {
    try {
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
          const arenaState = await this.solanaService.getArenaOnChainState(arena_address);

          if (arenaState.status === 2) {
            // Settled
            console.log(`[StakingManager] Resetting settled arena: ${arena_address}`);
            const txSig = await this.solanaService.resetArenaOnChain(arena_address);
            console.log(`[StakingManager] Arena reset. Tx: ${txSig}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("Vault must be empty")) {
            console.log(`[StakingManager] Arena ${arena_address} waiting for claims...`);
          } else {
            console.error(`[StakingManager] Failed to reset arena ${arena_address}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("[StakingManager] resetSettledArenas error:", error);
    }
  }

  // ==================== CACHE METHODS ====================

  private getCachedTxVerification(txSignature: string): boolean | null {
    const cached = this.txVerificationCache.get(txSignature);
    if (!cached) return null;
    if (Date.now() - cached.timestamp < this.TX_CACHE_TTL_MS) {
      return cached.verified;
    }
    this.txVerificationCache.delete(txSignature);
    return null;
  }

  private cacheTxVerification(txSignature: string, verified: boolean): void {
    this.txVerificationCache.set(txSignature, {
      verified,
      timestamp: Date.now(),
    });

    if (this.txVerificationCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of this.txVerificationCache.entries()) {
        if (now - value.timestamp > this.TX_CACHE_TTL_MS) {
          this.txVerificationCache.delete(key);
        }
      }
    }
  }
}
