#!/usr/bin/env npx ts-node
/**
 * Soliseum Phase 3 - Sync Script
 * Scans recent transactions for the Soliseum program.
 * Run as fallback to ensure database integrity.
 *
 * Usage: npx ts-node scripts/sync.ts [--limit 100] [--dry-run]
 */

import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { db } from "../db";
import { indexerState } from "../db/schema";
import { eq } from "drizzle-orm";
import { parseWebhookPayload } from "../webhooks/solanaParser";
import { processParsedInstructions } from "../webhooks/indexerService";

const PROGRAM_ID = new PublicKey("DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz");
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DEFAULT_LIMIT = 100;

interface SyncArgs {
  limit: number;
  dryRun: boolean;
}

function parseArgs(): SyncArgs {
  const args = process.argv.slice(2);
  let limit = DEFAULT_LIMIT;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10) || DEFAULT_LIMIT;
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }
  return { limit, dryRun };
}

/** Convert Solana getTransaction response to Helius-like format for our parser */
function toWebhookFormat(tx: any): unknown {
  if (!tx?.transaction?.message) return null;
  const msg = tx.transaction.message;
  const accountKeys =
    "accountKeys" in msg
      ? msg.accountKeys.map((k: any) =>
          typeof k === "string" ? k : k.pubkey?.toBase58?.() ?? k.toBase58?.() ?? k
        )
      : msg.staticAccountKeys?.map((k: any) =>
          typeof k === "string" ? k : k.toBase58?.()
        ) ?? [];

  const mapIx = (ix: any) => ({
    programIdIndex:
      ix.programIdIndex ??
      accountKeys.indexOf(
        ix.programId?.toBase58?.() ?? ix.programId ?? ""
      ),
    accounts: ix.accounts ?? [],
    data: (() => {
      const d = ix.data ?? "";
      if (typeof d !== "string") return "";
      try {
        return Buffer.from(bs58.decode(d)).toString("base64");
      } catch {
        return d;
      }
    })(),
  });

  const mainIxs =
    "instructions" in msg
      ? msg.instructions.map(mapIx)
      : [];
  const innerIxs =
    tx.meta?.innerInstructions?.flatMap((ii: any) =>
      (ii.instructions ?? []).map(mapIx)
    ) ?? [];
  const instructions = [...mainIxs, ...innerIxs];

  return {
    blockTime: tx.blockTime,
    slot: tx.slot,
    signature: tx.transaction.signatures?.[0],
    transaction: {
      message: {
        accountKeys,
        instructions,
      },
    },
    meta: tx.meta,
  };
}

async function main(): Promise<void> {
  const { limit, dryRun } = parseArgs();
  const conn = new Connection(RPC_URL);

  console.log(`[Sync] Fetching last ${limit} Soliseum transactions (dryRun=${dryRun})`);

  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, {
    limit,
  });

  let processed = 0;
  let lastSig = "";

  for (const { signature } of sigs) {
    try {
      const tx = await conn.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) continue;

      const webhookFormat = toWebhookFormat(tx);
      if (!webhookFormat) continue;

      const parsed = parseWebhookPayload(webhookFormat);
      for (const { signature: sig, instructions } of parsed) {
        if (!dryRun) {
          await processParsedInstructions(sig, instructions);
        }
        processed += instructions.length;
        lastSig = sig;
      }
    } catch (e) {
      console.warn(`[Sync] Tx ${signature}:`, (e as Error).message);
    }
  }

  if (!dryRun && lastSig) {
    const slot = (await conn.getSignatureStatuses([lastSig])).value[0]?.slot;
    if (slot) {
      await db
        .insert(indexerState)
        .values({
          id: "solana_last_slot",
          lastProcessedSlot: slot,
          lastProcessedSignature: lastSig,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: indexerState.id,
          set: {
            lastProcessedSlot: slot,
            lastProcessedSignature: lastSig,
            updatedAt: new Date(),
          },
        });
    }
  }

  console.log(`[Sync] Done. Processed ${processed} instructions.`);
}

main().catch((e) => {
  console.error("[Sync] Fatal:", e);
  process.exit(1);
});
