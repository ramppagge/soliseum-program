#!/usr/bin/env npx ts-node
/**
 * Soliseum - Oracle Keypair Setup
 * Generates a new Solana keypair for the Oracle wallet.
 * Add the printed private key to .env as ORACLE_PRIVATE_KEY.
 *
 * Usage: npx ts-node scripts/setup-oracle.ts
 * Or:    npm run setup:oracle
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

function main(): void {
  const keypair = Keypair.generate();
  const privateKeyBase58 = bs58.encode(keypair.secretKey);
  const publicKey = keypair.publicKey.toBase58();

  console.log("\n=== Oracle Keypair Generated ===\n");
  console.log("Public Key (Oracle Address):");
  console.log("  ", publicKey);
  console.log("\nPrivate Key (base58) - ADD TO .env as ORACLE_PRIVATE_KEY:");
  console.log("  ", privateKeyBase58);
  console.log("\nSteps:");
  console.log("  1. Copy the private key above");
  console.log("  2. Add to soliseum-backend/.env:");
  console.log("     ORACLE_PRIVATE_KEY=<paste-key-here>");
  console.log("  3. Fund the oracle on devnet:");
  console.log("     solana airdrop 2", publicKey);
  console.log("  4. Restart the backend: npm run dev\n");
}

main();
