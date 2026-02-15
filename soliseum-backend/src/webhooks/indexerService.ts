/**
 * Soliseum Phase 3 - Indexer Service
 * Applies parsed on-chain events to the database.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  agents,
  arenas,
  stakes,
  users,
  agentBattleHistory,
} from "../db/schema";
import type { ParsedInstruction } from "./solanaParser";

export async function applyPlaceStake(
  arenaAddress: string,
  userAddress: string,
  amount: bigint,
  side: number,
  txSignature: string
): Promise<void> {
  // Idempotency: skip if this tx_signature was already processed (Helius may retry webhooks)
  if (txSignature) {
    const [existing] = await db
      .select({ id: stakes.id })
      .from(stakes)
      .where(eq(stakes.txSignature, txSignature))
      .limit(1);
    if (existing) {
      console.warn(`[Indexer] Skipping duplicate tx_signature: ${txSignature}`);
      return;
    }
  }

  // Use BigInt throughout to preserve full lamport precision (Number loses precision > 2^53)
  const amountBig = BigInt(amount);

  // Ensure arena exists (may have been created by initialize_arena or our oracle)
  const [arena] = await db
    .select()
    .from(arenas)
    .where(eq(arenas.arenaAddress, arenaAddress))
    .limit(1);

  if (!arena) {
    // Arena not in DB yet - create placeholder (will be updated by settle or sync)
    await db.insert(arenas).values({
      arenaAddress,
      creatorAddress: "", // Unknown until we fetch from chain
      oracleAddress: "",
      status: "Live",
      totalPool: amountBig,
      agentAPool: side === 0 ? amountBig : 0n,
      agentBPool: side === 1 ? amountBig : 0n,
    });
  } else {
    await db
      .update(arenas)
      .set({
        totalPool: sql`${arenas.totalPool} + ${amountBig.toString()}::bigint`,
        agentAPool:
          side === 0
            ? sql`${arenas.agentAPool} + ${amountBig.toString()}::bigint`
            : sql`${arenas.agentAPool}`,
        agentBPool:
          side === 1
            ? sql`${arenas.agentBPool} + ${amountBig.toString()}::bigint`
            : sql`${arenas.agentBPool}`,
        updatedAt: new Date(),
      })
      .where(eq(arenas.arenaAddress, arenaAddress));
  }

  const [arenaRow] = await db
    .select({ id: arenas.id })
    .from(arenas)
    .where(eq(arenas.arenaAddress, arenaAddress))
    .limit(1);
  const arenaId = arenaRow!.id;

  // Upsert stake (user can add to existing stake on same side)
  const [existingStake] = await db
    .select()
    .from(stakes)
    .where(
      and(eq(stakes.arenaId, arenaId), eq(stakes.userAddress, userAddress), eq(stakes.side, side))
    )
    .limit(1);

  if (existingStake) {
    await db
      .update(stakes)
      .set({
        amount: sql`${stakes.amount} + ${amountBig.toString()}::bigint`,
        txSignature,
        updatedAt: new Date(),
      })
      .where(eq(stakes.id, existingStake.id));
  } else {
    await db.insert(stakes).values({
      userAddress,
      arenaId,
      amount: amountBig,
      side,
      claimed: false,
      txSignature,
    });
  }

  // Upsert user and increment totalStaked
  await db
    .insert(users)
    .values({
      walletAddress: userAddress,
      totalStaked: amountBig,
    })
    .onConflictDoUpdate({
      target: users.walletAddress,
      set: {
        totalStaked: sql`${users.totalStaked} + ${amountBig.toString()}::bigint`,
        updatedAt: new Date(),
      },
    });
}

export async function applySettleGame(
  arenaAddress: string,
  winner: number
): Promise<void> {
  const now = new Date();
  await db
    .update(arenas)
    .set({
      status: "Settled",
      winnerSide: winner,
      endTime: now,
      updatedAt: now,
    })
    .where(eq(arenas.arenaAddress, arenaAddress));

  // Update agent wins and credibility for the winner
  const [arena] = await db
    .select({ agentAPubkey: arenas.agentAPubkey, agentBPubkey: arenas.agentBPubkey })
    .from(arenas)
    .where(eq(arenas.arenaAddress, arenaAddress))
    .limit(1);

  if (arena?.agentAPubkey || arena?.agentBPubkey) {
    const winnerPubkey = winner === 0 ? arena.agentAPubkey : arena.agentBPubkey;
    const loserPubkey = winner === 0 ? arena.agentBPubkey : arena.agentAPubkey;

    if (winnerPubkey) {
      await db
        .insert(agents)
        .values({
          pubkey: winnerPubkey,
          name: `Agent ${winnerPubkey.slice(0, 8)}`,
          category: "Trading",
          totalWins: 1,
          credibilityScore: 10,
        })
        .onConflictDoUpdate({
          target: agents.pubkey,
          set: {
            totalWins: sql`${agents.totalWins} + 1`,
            credibilityScore: sql`LEAST(100, ${agents.credibilityScore} + 2)`,
            updatedAt: now,
          },
        });

      const [arenaRow] = await db
        .select({ id: arenas.id })
        .from(arenas)
        .where(eq(arenas.arenaAddress, arenaAddress))
        .limit(1);
      if (arenaRow) {
        await db.insert(agentBattleHistory).values({
          agentPubkey: winnerPubkey,
          arenaId: arenaRow.id,
          side: winner,
          won: true,
          playedAt: now,
        });
      }
    }
    if (loserPubkey) {
      await db
        .insert(agents)
        .values({
          pubkey: loserPubkey,
          name: `Agent ${loserPubkey.slice(0, 8)}`,
          category: "Trading",
        })
        .onConflictDoUpdate({
          target: agents.pubkey,
          set: {
            credibilityScore: sql`GREATEST(0, ${agents.credibilityScore} - 1)`,
            updatedAt: now,
          },
        });

      const [arenaRow] = await db
        .select({ id: arenas.id })
        .from(arenas)
        .where(eq(arenas.arenaAddress, arenaAddress))
        .limit(1);
      if (arenaRow) {
        await db.insert(agentBattleHistory).values({
          agentPubkey: loserPubkey,
          arenaId: arenaRow.id,
          side: winner === 0 ? 1 : 0,
          won: false,
          playedAt: now,
        });
      }
    }
  }
}

export async function applyInitializeArena(
  arenaAddress: string,
  creatorAddress: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(arenas)
    .where(eq(arenas.arenaAddress, arenaAddress))
    .limit(1);

  if (!existing) {
    await db.insert(arenas).values({
      arenaAddress,
      creatorAddress,
      oracleAddress: "", // Will be set when we fetch full arena data
      status: "Live",
      totalPool: 0n,
      agentAPool: 0n,
      agentBPool: 0n,
      startTime: new Date(),
    });
  }
}

/** Sync arena status from on-chain to DB. status: 0=Pending, 1=Active, 2=Settled, 3=Cancelled */
export async function syncArenaFromChain(
  arenaAddress: string,
  status: number,
  winner: number | null
): Promise<void> {
  const dbStatus = status === 1 ? "Live" : status === 2 ? "Settled" : status === 3 ? "Cancelled" : "Pending";
  const now = new Date();
  await db
    .update(arenas)
    .set({
      status: dbStatus,
      winnerSide: winner,
      ...(status === 2 ? { endTime: now } : {}),
      updatedAt: now,
    })
    .where(eq(arenas.arenaAddress, arenaAddress));
}

export async function applyResetArena(arenaAddress: string): Promise<void> {
  await db
    .update(arenas)
    .set({
      status: "Live",
      totalPool: 0n,
      agentAPool: 0n,
      agentBPool: 0n,
      winnerSide: null,
      updatedAt: new Date(),
    })
    .where(eq(arenas.arenaAddress, arenaAddress));
}

export async function applyClaimReward(
  arenaAddress: string,
  userAddress: string
): Promise<void> {
  const [arena] = await db
    .select({ id: arenas.id })
    .from(arenas)
    .where(eq(arenas.arenaAddress, arenaAddress))
    .limit(1);

  if (arena) {
    await db
      .update(stakes)
      .set({ claimed: true, updatedAt: new Date() })
      .where(
        and(eq(stakes.arenaId, arena.id), eq(stakes.userAddress, userAddress))
      );
  }
}

/** Enrich arena with agent pubkeys when oracle starts a battle (optional). */
export async function enrichArenaFromBattle(
  arenaAddress: string,
  agentAPubkey: string | undefined,
  agentBPubkey: string | undefined,
  agentAName?: string,
  agentBName?: string
): Promise<void> {
  const looksLikePubkey = (s: string) =>
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  const aPub = agentAPubkey && looksLikePubkey(agentAPubkey) ? agentAPubkey : undefined;
  const bPub = agentBPubkey && looksLikePubkey(agentBPubkey) ? agentBPubkey : undefined;
  if (!aPub && !bPub) return;

  const [arena] = await db
    .select({ id: arenas.id })
    .from(arenas)
    .where(eq(arenas.arenaAddress, arenaAddress))
    .limit(1);

  if (!arena) {
    await db
      .insert(arenas)
      .values({
        arenaAddress,
        creatorAddress: "",
        oracleAddress: "",
        status: "Live",
        agentAPubkey: aPub,
        agentBPubkey: bPub,
      })
      .onConflictDoUpdate({
        target: arenas.arenaAddress,
        set: {
          agentAPubkey: aPub,
          agentBPubkey: bPub,
          updatedAt: new Date(),
        },
      });
  }

  const now = new Date();
  await db
    .update(arenas)
    .set({
      agentAPubkey: aPub ?? undefined,
      agentBPubkey: bPub ?? undefined,
      updatedAt: now,
    })
    .where(eq(arenas.arenaAddress, arenaAddress));

  if (aPub) {
    await db
      .insert(agents)
      .values({
        pubkey: aPub,
        name: agentAName ?? `Agent ${aPub.slice(0, 8)}`,
        category: "Trading",
      })
      .onConflictDoNothing({ target: agents.pubkey });
  }
  if (bPub) {
    await db
      .insert(agents)
      .values({
        pubkey: bPub,
        name: agentBName ?? `Agent ${bPub.slice(0, 8)}`,
        category: "Trading",
      })
      .onConflictDoNothing({ target: agents.pubkey });
  }
}

export async function processParsedInstructions(
  signature: string,
  instructions: ParsedInstruction[]
): Promise<void> {
  for (const ix of instructions) {
    try {
      switch (ix.type) {
        case "place_stake":
          await applyPlaceStake(
            ix.arenaAddress,
            ix.userAddress,
            ix.amount,
            ix.side,
            signature
          );
          break;
        case "settle_game":
          await applySettleGame(ix.arenaAddress, ix.winner);
          break;
        case "initialize_arena":
          await applyInitializeArena(ix.arenaAddress, ix.creatorAddress);
          break;
        case "claim_reward":
          await applyClaimReward(ix.arenaAddress, ix.userAddress);
          break;
      }
    } catch (err) {
      console.error(`[Indexer] Error processing ${ix.type}:`, err);
      throw err;
    }
  }
}
