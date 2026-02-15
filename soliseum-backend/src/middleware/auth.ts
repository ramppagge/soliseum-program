/**
 * Wallet-based authentication using Solana message signing.
 *
 * Flow:
 *   1. Client calls POST /api/auth/nonce with { walletAddress }
 *   2. Server returns a unique nonce string
 *   3. Client signs the nonce using their Solana wallet (signMessage)
 *   4. Client calls POST /api/auth/verify with { walletAddress, signature, nonce }
 *   5. Server verifies the signature → returns a session token
 *   6. Client includes token in Authorization header for protected routes
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

// ─── Nonce store (in-memory; replace with Redis in production) ───────────────

interface NonceEntry {
  nonce: string;
  createdAt: number;
}

const nonceStore = new Map<string, NonceEntry>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Session store (in-memory; replace with Redis / JWT in production) ───────

interface SessionEntry {
  walletAddress: string;
  createdAt: number;
}

const sessionStore = new Map<string, SessionEntry>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of nonceStore) {
    if (now - entry.createdAt > NONCE_TTL_MS) nonceStore.delete(key);
  }
  for (const [key, entry] of sessionStore) {
    if (now - entry.createdAt > SESSION_TTL_MS) sessionStore.delete(key);
  }
}, 10 * 60 * 1000);

// ─── Handlers ────────────────────────────────────────────────────────────────

/** POST /api/auth/nonce — Issue a nonce for the given wallet */
export function issueNonce(req: Request, res: Response): void {
  const { walletAddress } = req.body;

  const nonce = `Soliseum authentication:\n${crypto.randomUUID()}`;
  nonceStore.set(walletAddress, { nonce, createdAt: Date.now() });

  res.json({ ok: true, nonce });
}

/** POST /api/auth/verify — Verify signed nonce and issue session token */
export function verifySignature(req: Request, res: Response): void {
  const { walletAddress, signature, nonce } = req.body;

  // Check the nonce exists and matches
  const stored = nonceStore.get(walletAddress);
  if (!stored || stored.nonce !== nonce) {
    res.status(401).json({ ok: false, error: "Invalid or expired nonce" });
    return;
  }

  // Check nonce hasn't expired
  if (Date.now() - stored.createdAt > NONCE_TTL_MS) {
    nonceStore.delete(walletAddress);
    res.status(401).json({ ok: false, error: "Nonce expired" });
    return;
  }

  // Verify the signature
  try {
    const messageBytes = new TextEncoder().encode(nonce);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(walletAddress);

    const valid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!valid) {
      res.status(401).json({ ok: false, error: "Invalid signature" });
      return;
    }
  } catch {
    res.status(401).json({ ok: false, error: "Signature verification failed" });
    return;
  }

  // Consume the nonce (single-use)
  nonceStore.delete(walletAddress);

  // Create session token
  const token = crypto.randomUUID();
  sessionStore.set(token, { walletAddress, createdAt: Date.now() });

  res.json({ ok: true, token, expiresIn: SESSION_TTL_MS });
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Require a valid session token in the Authorization header.
 * Sets req.walletAddress on success.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header) {
    res.status(401).json({ ok: false, error: "Authorization header required" });
    return;
  }

  const token = header.replace(/^Bearer\s+/i, "");
  const session = sessionStore.get(token);

  if (!session) {
    res.status(401).json({ ok: false, error: "Invalid or expired token" });
    return;
  }

  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessionStore.delete(token);
    res.status(401).json({ ok: false, error: "Session expired" });
    return;
  }

  // Attach wallet address to request for downstream handlers
  (req as any).walletAddress = session.walletAddress;
  next();
}

/**
 * Validate a session token (used by SocketManager for WebSocket auth).
 * Returns true if the token maps to a valid, non-expired session.
 */
export function validateSession(token: string): boolean {
  const session = sessionStore.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessionStore.delete(token);
    return false;
  }
  return true;
}
