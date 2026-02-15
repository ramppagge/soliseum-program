/**
 * Fund the Oracle wallet on devnet using the Solana RPC airdrop.
 * Usage: npx ts-node scripts/fund-oracle.ts
 */

import "dotenv/config";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

async function main() {
  const privateKeyBase58 = process.env.ORACLE_PRIVATE_KEY;
  if (!privateKeyBase58) {
    console.error("❌ ORACLE_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  // Decode the private key to get the public key
  const secretKey = bs58.decode(privateKeyBase58);
  const publicKeyBytes = secretKey.slice(32); // Last 32 bytes
  const publicKey = new PublicKey(publicKeyBytes);

  console.log("\n=== Funding Oracle Wallet ===\n");
  console.log("Oracle Address:", publicKey.toBase58());
  console.log("RPC:", rpcUrl);

  try {
    // Check current balance
    const balanceBefore = await connection.getBalance(publicKey);
    console.log(`Balance before: ${balanceBefore / LAMPORTS_PER_SOL} SOL`);

    // Request airdrop (2 SOL)
    console.log("\nRequesting 2 SOL airdrop...");
    const signature = await connection.requestAirdrop(
      publicKey,
      2 * LAMPORTS_PER_SOL
    );

    console.log("Airdrop signature:", signature);
    console.log("Confirming transaction...");

    await connection.confirmTransaction(signature, "confirmed");

    // Check new balance
    const balanceAfter = await connection.getBalance(publicKey);
    console.log(`Balance after: ${balanceAfter / LAMPORTS_PER_SOL} SOL`);
    console.log("\n✅ Oracle wallet funded successfully!\n");
  } catch (err) {
    console.error("\n❌ Airdrop failed:", err);
    console.log("\nAlternatives:");
    console.log("1. Use the web faucet: https://faucet.solana.com/");
    console.log("2. Paste your Oracle address:", publicKey.toBase58());
    console.log("3. Or wait a minute and try again (rate limits apply)\n");
    process.exit(1);
  }
}

main();
