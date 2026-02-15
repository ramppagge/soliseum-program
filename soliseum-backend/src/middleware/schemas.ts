/**
 * Zod schemas for all API request validation.
 */

import { z } from "zod";

// ─── Shared ──────────────────────────────────────────────────────────────────

/** Solana public key: base58 string, 32-44 chars */
const solanaAddress = z
  .string()
  .min(32, "Address too short")
  .max(44, "Address too long")
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid base58 address");

const gameMode = z.enum(["TRADING_BLITZ", "QUICK_CHESS", "CODE_WARS"]);

// ─── Agent (inside battle payload) ───────────────────────────────────────────

const agentSchema = z.object({
  id: z.string().min(1, "Agent id is required"),
  name: z.string().min(1, "Agent name is required").max(64),
  winRate: z.number().min(0).max(100).optional(),
  stats: z
    .object({
      logic: z.number().min(0).max(100).optional(),
      speed: z.number().min(0).max(100).optional(),
      risk: z.number().min(0).max(100).optional(),
      consistency: z.number().min(0).max(100).optional(),
      adaptability: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

// ─── POST /battle/start ──────────────────────────────────────────────────────

export const startBattleBody = z.object({
  battleId: z.string().min(1, "battleId is required").max(128),
  arenaAddress: solanaAddress,
  agentA: agentSchema,
  agentB: agentSchema,
  gameMode: gameMode.default("TRADING_BLITZ"),
  winProbabilityA: z.number().min(0).max(1).optional(),
});

// ─── GET /api/arena/active ───────────────────────────────────────────────────

export const activeArenasQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).partial();

// ─── GET /api/leaderboard ────────────────────────────────────────────────────

export const leaderboardQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).partial();

// ─── GET /api/user/:address/history ──────────────────────────────────────────

export const userHistoryParams = z.object({
  address: solanaAddress,
});

// ─── GET /api/agents/:pubkey ─────────────────────────────────────────────────

export const agentPubkeyParams = z.object({
  pubkey: solanaAddress,
});

// ─── POST /api/auth/nonce ────────────────────────────────────────────────────

export const authNonceBody = z.object({
  walletAddress: solanaAddress,
});

// ─── POST /api/auth/verify ───────────────────────────────────────────────────

export const authVerifyBody = z.object({
  walletAddress: solanaAddress,
  signature: z.string().min(1, "Signature is required"),
  nonce: z.string().min(1, "Nonce is required"),
});

// ─── POST /api/test-battle ───────────────────────────────────────────────────

export const testBattleBody = z.object({
  agentA: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(64),
    apiUrl: z.union([z.string().url(), z.null()]).optional(),
  }),
  agentB: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(64),
    apiUrl: z.union([z.string().url(), z.null()]).optional(),
  }),
  gameMode: gameMode.optional().default("TRADING_BLITZ"),
});
