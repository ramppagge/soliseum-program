/**
 * Soliseum Phase 3 - Helius/Shyft Webhook Handler
 * POST /api/webhooks/solana
 * Validates secret header and processes Soliseum program transactions.
 */

import { Request, Response } from "express";
import { parseWebhookPayload } from "./solanaParser";
import { processParsedInstructions } from "./indexerService";

const WEBHOOK_SECRET_HEADER = "x-helius-webhook-secret"; // or x-shyft-webhook-secret
const EXPECTED_SECRET = process.env.WEBHOOK_SECRET ?? "";

export function validateWebhookSecret(req: Request): boolean {
  if (!EXPECTED_SECRET) {
    console.warn("[Webhook] WEBHOOK_SECRET not set - accepting all requests");
    return true;
  }
  const provided =
    req.headers[WEBHOOK_SECRET_HEADER] ??
    req.headers["x-shyft-webhook-secret"] ??
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "");
  return typeof provided === "string" && provided === EXPECTED_SECRET;
}

export async function handleSolanaWebhook(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!validateWebhookSecret(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const parsed = parseWebhookPayload(req.body);

    if (parsed.length === 0) {
      res.status(200).json({ ok: true, processed: 0, message: "No Soliseum instructions" });
      return;
    }

    let processed = 0;
    for (const { signature, instructions } of parsed) {
      await processParsedInstructions(signature, instructions);
      processed += instructions.length;
    }

    res.status(200).json({ ok: true, processed });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
