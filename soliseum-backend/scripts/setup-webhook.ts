#!/usr/bin/env npx ts-node
/**
 * Soliseum - Helius Webhook Setup
 * Registers a webhook with Helius to receive Soliseum program transactions.
 *
 * Prerequisites (add to .env):
 *   HELIUS_API_KEY=your-helius-api-key
 *   BACKEND_WEBHOOK_URL=https://your-backend.com
 *   WEBHOOK_SECRET=your-secret (optional, for auth)
 *
 * Usage: npm run setup:webhook
 */

import "dotenv/config";

const SOLISEUM_PROGRAM_ID = "DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz";

async function main(): Promise<void> {
  const apiKey = process.env.HELIUS_API_KEY;
  const webhookBaseUrl = process.env.BACKEND_WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!apiKey) {
    console.error("\n[ERROR] HELIUS_API_KEY not set in .env");
    console.error("  1. Get API key from https://dashboard.helius.dev/api-keys");
    console.error("  2. Add to .env: HELIUS_API_KEY=your-key\n");
    process.exit(1);
  }

  if (!webhookBaseUrl) {
    console.error("\n[ERROR] BACKEND_WEBHOOK_URL not set in .env");
    console.error("  Add to .env: BACKEND_WEBHOOK_URL=https://your-backend.com");
    console.error("  For local: use ngrok (ngrok http 4000) then set to ngrok URL\n");
    process.exit(1);
  }

  const webhookUrl = webhookBaseUrl.replace(/\/$/, "") + "/api/webhooks/solana";

  const isDevnet = process.env.SOLANA_RPC_URL?.includes("devnet") ?? true;
  const webhookType = isDevnet ? "rawDevnet" : "raw";

  const body = {
    webhookURL: webhookUrl,
    webhookType,
    transactionTypes: ["Any"],
    accountAddresses: [SOLISEUM_PROGRAM_ID],
    authHeader: webhookSecret || undefined,
  };

  console.log("\n=== Helius Webhook Setup ===\n");
  console.log("Webhook URL:", webhookUrl);
  console.log("Webhook Type:", webhookType);
  console.log("Monitoring:", SOLISEUM_PROGRAM_ID);
  console.log("");

  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = (await res.json()) as { webhookID?: string; error?: string };

    if (!res.ok) {
      console.error("[ERROR] Helius API returned", res.status);
      console.error(data);
      process.exit(1);
    }

    console.log("✓ Webhook created successfully!");
    console.log("  Webhook ID:", data.webhookID);
    console.log("\nYour webhook URL is:", webhookUrl);
    console.log("\nNext: Ensure your backend is running and reachable at this URL.\n");
  } catch (err) {
    console.error("[ERROR]", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
