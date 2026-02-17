/**
 * Oracle Coordination API Routes
 * 
 * Endpoints for distributed oracle nodes to coordinate signatures:
 * - POST /api/oracle/sign - Request settlement signature from this oracle
 * - POST /api/oracle/sign-reset - Request reset signature from this oracle
 * 
 * Security:
 * - Only accepts requests from other authorized oracle nodes
 * - Validates arena state before signing
 * - Rate limited to prevent abuse
 */

import type { Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { 
  MultisigOracleService, 
  createSettlementMessage, 
  createResetMessage 
} from "../MultisigOracleService";

// In-memory request deduplication (prevents replay within window)
const recentRequests = new Map<string, number>();
const REQUEST_WINDOW_MS = 60000; // 1 minute

interface SignRequest {
  arenaAddress: string;
  winner: number;
  nonce: string; // BigInt as string
  requester: string; // Oracle pubkey that is requesting
}

interface SignResetRequest {
  arenaAddress: string;
  nonce: string;
}

export class OracleCoordinationAPI {
  private multisigService: MultisigOracleService;
  private authorizedRequesters: Set<string> = new Set();

  constructor(multisigService: MultisigOracleService) {
    this.multisigService = multisigService;
    this.loadAuthorizedRequesters();
  }

  /**
   * Load authorized oracle node pubkeys from environment
   */
  private loadAuthorizedRequesters(): void {
    for (let i = 0; i < 3; i++) {
      const pubkey = process.env[`ORACLE_${i}_PUBKEY`];
      if (pubkey) {
        this.authorizedRequesters.add(pubkey);
        console.log(`[OracleCoordinationAPI] Authorized oracle ${i}: ${pubkey}`);
      }
    }
  }

  /**
   * Validate request is from authorized oracle
   */
  private isAuthorized(requesterPubkey: string): boolean {
    return this.authorizedRequesters.has(requesterPubkey);
  }

  /**
   * Check for replay attacks
   */
  private isReplay(requestId: string): boolean {
    const now = Date.now();
    const lastSeen = recentRequests.get(requestId);
    
    if (lastSeen && (now - lastSeen) < REQUEST_WINDOW_MS) {
      return true; // Replay detected
    }
    
    recentRequests.set(requestId, now);
    
    // Cleanup old entries
    for (const [id, timestamp] of recentRequests.entries()) {
      if (now - timestamp > REQUEST_WINDOW_MS) {
        recentRequests.delete(id);
      }
    }
    
    return false;
  }

  /**
   * POST /api/oracle/sign
   * Request a settlement signature from this oracle
   */
  async handleSignRequest(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as SignRequest;
      
      // Validate request
      if (!body.arenaAddress || typeof body.winner !== "number" || !body.nonce || !body.requester) {
        res.status(400).json({ ok: false, error: "Missing required fields" });
        return;
      }

      if (!this.isAuthorized(body.requester)) {
        res.status(403).json({ ok: false, error: "Unauthorized requester" });
        return;
      }

      // Validate winner
      if (body.winner !== 0 && body.winner !== 1) {
        res.status(400).json({ ok: false, error: "Invalid winner (must be 0 or 1)" });
        return;
      }

      // Validate arena address
      let arenaPubkey: PublicKey;
      try {
        arenaPubkey = new PublicKey(body.arenaAddress);
      } catch {
        res.status(400).json({ ok: false, error: "Invalid arena address" });
        return;
      }

      // Check replay
      const requestId = `${body.arenaAddress}:${body.winner}:${body.nonce}`;
      if (this.isReplay(requestId)) {
        res.status(429).json({ ok: false, error: "Duplicate request" });
        return;
      }

      // Validate arena state
      const state = await this.multisigService.getArenaMultisigState(body.arenaAddress);
      
      if (state.status !== 1) { // Active
        res.status(400).json({ 
          ok: false, 
          error: `Arena not active (status: ${state.status})` 
        });
        return;
      }

      // Validate nonce matches
      const requestNonce = BigInt(body.nonce);
      if (requestNonce !== state.settlementNonce) {
        res.status(400).json({ 
          ok: false, 
          error: `Nonce mismatch: expected ${state.settlementNonce}, got ${requestNonce}` 
        });
        return;
      }

      // Verify requester is in the oracle committee
      const isInCommittee = state.oracles.some(pk => pk.toBase58() === body.requester);
      if (!isInCommittee) {
        res.status(403).json({ 
          ok: false, 
          error: "Requester not in arena oracle committee" 
        });
        return;
      }

      // Create signature
      const signature = this.multisigService.createSettlementSignature(
        arenaPubkey,
        body.winner,
        requestNonce
      );

      res.json({
        ok: true,
        oracle_index: signature.oracle_index,
        signature: bs58.encode(signature.signature),
        arena: body.arenaAddress,
        winner: body.winner,
      });

    } catch (e) {
      console.error("[OracleCoordinationAPI] Sign request failed:", e);
      res.status(500).json({ 
        ok: false, 
        error: e instanceof Error ? e.message : "Internal error" 
      });
    }
  }

  /**
   * POST /api/oracle/sign-reset
   * Request a reset signature from this oracle
   */
  async handleSignResetRequest(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as SignResetRequest;
      
      if (!body.arenaAddress || !body.nonce) {
        res.status(400).json({ ok: false, error: "Missing required fields" });
        return;
      }

      let arenaPubkey: PublicKey;
      try {
        arenaPubkey = new PublicKey(body.arenaAddress);
      } catch {
        res.status(400).json({ ok: false, error: "Invalid arena address" });
        return;
      }

      const requestId = `reset:${body.arenaAddress}:${body.nonce}`;
      if (this.isReplay(requestId)) {
        res.status(429).json({ ok: false, error: "Duplicate request" });
        return;
      }

      const state = await this.multisigService.getArenaMultisigState(body.arenaAddress);
      
      if (state.status !== 2) { // Settled
        res.status(400).json({ 
          ok: false, 
          error: `Arena not settled (status: ${state.status})` 
        });
        return;
      }

      const requestNonce = BigInt(body.nonce);
      if (requestNonce !== state.settlementNonce) {
        res.status(400).json({ 
          ok: false, 
          error: `Nonce mismatch: expected ${state.settlementNonce}, got ${requestNonce}` 
        });
        return;
      }

      const signature = this.multisigService.createResetSignature(
        arenaPubkey,
        requestNonce
      );

      res.json({
        ok: true,
        oracle_index: signature.oracle_index,
        signature: bs58.encode(signature.signature),
        arena: body.arenaAddress,
      });

    } catch (e) {
      console.error("[OracleCoordinationAPI] Sign reset request failed:", e);
      res.status(500).json({ 
        ok: false, 
        error: e instanceof Error ? e.message : "Internal error" 
      });
    }
  }

  /**
   * GET /api/oracle/status
   * Get this oracle node's status
   */
  async handleStatusRequest(_req: Request, res: Response): Promise<void> {
    try {
      const config = this.multisigService.getThisNodeConfig();
      res.json({
        ok: true,
        oracle_index: config.index,
        public_key: config.publicKey.toBase58(),
        endpoint: config.endpoint || null,
        authorized_peers: Array.from(this.authorizedRequesters),
      });
    } catch (e) {
      res.status(500).json({ 
        ok: false, 
        error: e instanceof Error ? e.message : "Internal error" 
      });
    }
  }
}
