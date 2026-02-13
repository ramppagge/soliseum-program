/**
 * Soliseum Phase 3 - Parse raw Solana transaction data
 * Extracts place_stake, settle_game, initialize_arena, claim_reward from Helius/Shyft webhooks.
 */

import * as crypto from "crypto";

const PROGRAM_ID = "DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz";

function getInstructionDiscriminator(ixName: string): Buffer {
  const preimage = `global:${ixName}`;
  return crypto.createHash("sha256").update(preimage).digest().subarray(0, 8);
}

const DISCRIMINATORS = {
  place_stake: getInstructionDiscriminator("place_stake"),
  settle_game: getInstructionDiscriminator("settle_game"),
  initialize_arena: getInstructionDiscriminator("initialize_arena"),
  claim_reward: getInstructionDiscriminator("claim_reward"),
};

export interface ParsedPlaceStake {
  type: "place_stake";
  arenaAddress: string;
  userAddress: string;
  amount: bigint;
  side: number;
}

export interface ParsedSettleGame {
  type: "settle_game";
  arenaAddress: string;
  winner: number;
}

export interface ParsedInitializeArena {
  type: "initialize_arena";
  arenaAddress: string;
  creatorAddress: string;
}

export interface ParsedClaimReward {
  type: "claim_reward";
  arenaAddress: string;
  userAddress: string;
}

export type ParsedInstruction =
  | ParsedPlaceStake
  | ParsedSettleGame
  | ParsedInitializeArena
  | ParsedClaimReward;

/** Raw webhook payload - Helius raw format (array of tx objects) */
export interface HeliusRawWebhookPayload {
  blockTime?: number;
  slot?: number;
  signature?: string;
  transaction?: {
    message: {
      accountKeys: string[];
      instructions?: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string; // base64
      }>;
    };
  };
  meta?: {
    innerInstructions?: Array<{
      instructions: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string;
      }>;
    }>;
  };
}

/** Parse a single raw transaction from Helius webhook */
export function parseHeliusTransaction(
  tx: HeliusRawWebhookPayload
): { signature: string; instructions: ParsedInstruction[] } | null {
  const sig = tx.signature ?? tx.transaction?.message?.accountKeys?.[0];
  if (!sig || !tx.transaction?.message?.accountKeys) return null;

  const accountKeys = tx.transaction.message.accountKeys;
  const instructions = tx.transaction.message.instructions ?? [];
  const innerInstructions =
    tx.meta?.innerInstructions?.flatMap((ii) => ii.instructions) ?? [];
  const allInstructions = [...instructions, ...innerInstructions];

  const results: ParsedInstruction[] = [];

  for (const ix of allInstructions) {
    const programId =
      accountKeys[ix.programIdIndex] ??
      (tx.transaction!.message as { accountKeys?: string[] }).accountKeys?.[
        ix.programIdIndex
      ];
    if (programId !== PROGRAM_ID) continue;

    const data = Buffer.from(ix.data, "base64");
    if (data.length < 8) continue;

    const discriminator = data.subarray(0, 8);

    if (discriminator.equals(DISCRIMINATORS.place_stake) && data.length >= 17) {
      const amount = data.readBigUInt64LE(8);
      const side = data.readUInt8(16);
      const arenaIdx = ix.accounts[0];
      const userIdx = ix.accounts[3];
      if (arenaIdx !== undefined && userIdx !== undefined) {
        results.push({
          type: "place_stake",
          arenaAddress: accountKeys[arenaIdx],
          userAddress: accountKeys[userIdx],
          amount,
          side,
        });
      }
    } else if (
      discriminator.equals(DISCRIMINATORS.settle_game) &&
      data.length >= 9
    ) {
      const winner = data.readUInt8(8);
      const arenaIdx = ix.accounts[0];
      if (arenaIdx !== undefined) {
        results.push({
          type: "settle_game",
          arenaAddress: accountKeys[arenaIdx],
          winner,
        });
      }
    } else if (
      discriminator.equals(DISCRIMINATORS.initialize_arena) &&
      data.length >= 10
    ) {
      const arenaIdx = ix.accounts[0];
      const creatorIdx = ix.accounts[2];
      if (arenaIdx !== undefined && creatorIdx !== undefined) {
        results.push({
          type: "initialize_arena",
          arenaAddress: accountKeys[arenaIdx],
          creatorAddress: accountKeys[creatorIdx],
        });
      }
    } else if (discriminator.equals(DISCRIMINATORS.claim_reward)) {
      const arenaIdx = ix.accounts[0];
      const userIdx = ix.accounts[3]; // user in ClaimReward
      if (arenaIdx !== undefined && userIdx !== undefined) {
        results.push({
          type: "claim_reward",
          arenaAddress: accountKeys[arenaIdx],
          userAddress: accountKeys[userIdx],
        });
      }
    }
  }

  return results.length > 0
    ? { signature: typeof sig === "string" ? sig : String(sig), instructions: results }
    : null;
}

/** Handle both Helius array payload and single-object formats */
export function parseWebhookPayload(
  body: unknown
): Array<{ signature: string; instructions: ParsedInstruction[] }> {
  const arr = Array.isArray(body) ? body : [body];
  const results: Array<{ signature: string; instructions: ParsedInstruction[] }> = [];

  for (const item of arr) {
    const parsed = parseHeliusTransaction(item as HeliusRawWebhookPayload);
    if (parsed) results.push(parsed);
  }

  return results;
}
