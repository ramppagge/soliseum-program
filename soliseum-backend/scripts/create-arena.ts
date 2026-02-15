/**
 * Create a live arena and seed it in the database.
 *
 * Mode 1 (default): Create on-chain + seed DB. Requires program deployed on devnet.
 * Mode 2 (--seed-only): Seed DB only. Arena shows in UI but stake/claim will fail on-chain.
 *
 * Prerequisites:
 * - DATABASE_URL set in .env
 * - For on-chain: ORACLE_PRIVATE_KEY, program deployed, oracle funded
 *
 * Usage: npx ts-node scripts/create-arena.ts [--seed-only]
 */

import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as crypto from "crypto";
import bs58 from "bs58";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { arenas } from "../src/db/schema";

const PROGRAM_ID = new PublicKey("DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz");
const FEE_BPS = 250; // 2.5%

function getDiscriminator(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function loadKeypair(): Keypair {
  const encoded = process.env.ORACLE_PRIVATE_KEY;
  if (!encoded?.trim()) {
    throw new Error("ORACLE_PRIVATE_KEY not set in .env");
  }
  const trimmed = encoded.trim();
  const secret = trimmed.startsWith("[") ? new Uint8Array(JSON.parse(trimmed)) : bs58.decode(trimmed);
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const seedOnly = process.argv.includes("--seed-only");

  let arenaAddress: string;

  if (seedOnly) {
    // Generate a placeholder arena address (for UI testing only - stake/claim won't work on-chain)
    const { Keypair } = await import("@solana/web3.js");
    const placeholder = Keypair.generate();
    arenaAddress = placeholder.publicKey.toBase58();
    console.log("Seed-only mode: creating arena in DB only (stake/claim will fail until program is deployed)");
  } else {
    const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl);

    const creator = loadKeypair();
    console.log("Creator/Oracle:", creator.publicKey.toBase58());

    const [arenaPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("arena"), creator.publicKey.toBuffer()],
      PROGRAM_ID
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), creator.publicKey.toBuffer()],
      PROGRAM_ID
    );

    const arenaAccount = await connection.getAccountInfo(arenaPda);
    if (arenaAccount) {
      console.log("Arena already exists on-chain:", arenaPda.toBase58());
    } else {
      const data = Buffer.alloc(8 + 2);
      getDiscriminator("initialize_arena").copy(data, 0);
      data.writeUInt16LE(FEE_BPS, 8);

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: arenaPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: creator.publicKey, isSigner: true, isWritable: true },
          { pubkey: creator.publicKey, isSigner: true, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const tx = new Transaction().add(ix);
      console.log("Sending initialize_arena...");
      const sig = await sendAndConfirmTransaction(connection, tx, [creator], {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      console.log("Tx:", sig);
      console.log("Arena created:", arenaPda.toBase58());
    }
    arenaAddress = arenaPda.toBase58();
  }

  // Seed database
  const [existing] = await db.select().from(arenas).where(eq(arenas.arenaAddress, arenaAddress)).limit(1);

  if (existing) {
    console.log("Arena already in database, status:", existing.status);
  } else {
    const creatorPubkey = seedOnly
      ? "seed-only-placeholder"
      : loadKeypair().publicKey.toBase58();
    await db.insert(arenas).values({
      arenaAddress,
      creatorAddress: creatorPubkey,
      oracleAddress: creatorPubkey,
      status: "Live",
      totalPool: BigInt(0),
      agentAPool: BigInt(0),
      agentBPool: BigInt(0),
    });
    console.log("Arena seeded in database.");
  }

  console.log("\n--- Live Arena Ready ---");
  console.log("Arena address (use as battle ID):", arenaAddress);
  console.log("Open in frontend: /arena/battle/" + arenaAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
