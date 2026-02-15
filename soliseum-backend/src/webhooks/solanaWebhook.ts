/**
 * Soliseum Phase 3 - Helius/Shyft Webhook Handler
 * POST /api/webhooks/solana
 * Validates secret header (timing-safe) and processes Soliseum program transactions.
 */

import { Request, Response } from "express";
import crypto from "crypto";
import { parseWebhookPayload } from "./solanaParser";
import { processParsedInstructions } from "./indexerService";

const WEBHOOK_SECRET_HEADER = "x-helius-webhook-secret"; // or x-shyft-webhook-secret
const EXPECTED_SECRET = process.env.WEBHOOK_SECRET ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Timing-safe webhook secret validation.
 * Uses crypto.timingSafeEqual to prevent timing-attack side-channel leaks.
 * Rejects ALL requests when WEBHOOK_SECRET is unset in production.
 */
export function validateWebhookSecret(req: Request): boolean {
  if (!EXPECTED_SECRET) {
    if (IS_PRODUCTION) {
      console.error("[Webhook] WEBHOOK_SECRET not set - rejecting all requests in production");
      return false;
    }
    console.warn("[Webhook] WEBHOOK_SECRET not set - accepting requests in development only");
    return true;
  }

  const provided =
    req.headers[WEBHOOK_SECRET_HEADER] ??
    req.headers["x-shyft-webhook-secret"] ??
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "");

  if (typeof provided !== "string" || provided.length === 0) {
    return false;
  }

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(EXPECTED_SECRET, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
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
