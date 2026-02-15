/**
 * Oracle service: signs and submits settle_game / reset_arena transactions
 * to the Solana program. Uses ORACLE_PRIVATE_KEY from env; never hardcode keys.
 *
 * Security:
 *  - Oracle keypair loaded from env only, cached in memory.
 *  - Per-arena mutex prevents double-settlement race conditions.
 *  - Shared retry helper with exponential backoff for all on-chain transactions.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getInstructionDiscriminator } from "./utils/anchor";

const PROGRAM_ID = new PublicKey("DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz");

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// ─── Anchor account byte offsets ────────────────────────────────────────────
// These must match the Anchor struct layout in programs/soliseum/src/lib.rs:
//   [0..8]   — Anchor discriminator (8 bytes)
//   [8..40]  — creator: Pubkey (32 bytes)
//   [40..72] — oracle: Pubkey (32 bytes)
//   [72..80] — agent_a: Pubkey fragment / entry_fee (depends on struct)
//   ...
//   [96]     — status: u8 (ArenaStatus enum)
//   [97]     — winner: Option<u8> tag (0 = None, 1 = Some)
//   [98]     — winner: Option<u8> value (0 = agent A, 1 = agent B)
const OFFSET_CREATOR = 8;
const OFFSET_STATUS = 96;
const OFFSET_WINNER_TAG = 97;
const OFFSET_WINNER_VALUE = 98;
const MIN_ACCOUNT_LEN_STATUS = 97;
const MIN_ACCOUNT_LEN_WINNER = 99;

function encodeSettleGameInstruction(winner: number): Buffer {
  const discriminator = getInstructionDiscriminator("settle_game");
  const data = Buffer.alloc(discriminator.length + 1);
  discriminator.copy(data, 0);
  data.writeUInt8(winner, 8);
  return data;
}

function encodeResetArenaInstruction(): Buffer {
  return getInstructionDiscriminator("reset_arena");
}

function loadOracleKeypair(): Keypair {
  const encoded = process.env.ORACLE_PRIVATE_KEY;
  if (!encoded || encoded === "") {
    throw new Error(
      "ORACLE_PRIVATE_KEY is not set. Set it in .env and never commit the key."
    );
  }
  try {
    const decoded = decodePrivateKey(encoded);
    return Keypair.fromSecretKey(decoded);
  } catch (e) {
    throw new Error(
      "Invalid ORACLE_PRIVATE_KEY. Use base58 or JSON array format."
    );
  }
}

function decodePrivateKey(encoded: string): Uint8Array {
  const trimmed = encoded.trim();
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    return new Uint8Array(arr);
  }
  return new Uint8Array(bs58.decode(trimmed));
}

export class SolanaService {
  private connection: Connection;
  private oracleKeypair: Keypair | null = null;

  /** Per-arena mutex: prevents concurrent settle/reset for the same arena. */
  private activeArenaOps = new Set<string>();

  constructor(rpcUrl?: string) {
    const url =
      rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    this.connection = new Connection(url);
  }

  private getOracle(): Keypair {
    if (!this.oracleKeypair) {
      this.oracleKeypair = loadOracleKeypair();
    }
    return this.oracleKeypair;
  }

  /** Arena status enum from program (must match lib.rs ArenaStatus). */
  private static readonly ARENA_STATUS = { Pending: 0, Active: 1, Settled: 2, Cancelled: 3 } as const;

  /**
   * Acquire per-arena lock. Throws if another operation is already in progress.
   * Automatically released via the returned release function.
   */
  private acquireArenaLock(arenaAddress: string): () => void {
    if (this.activeArenaOps.has(arenaAddress)) {
      throw new Error(`Operation already in progress for arena ${arenaAddress}. Please wait.`);
    }
    this.activeArenaOps.add(arenaAddress);
    return () => { this.activeArenaOps.delete(arenaAddress); };
  }

  /** Fetch arena status from chain. */
  async getArenaStatus(arenaAddress: string): Promise<number> {
    const info = await this.connection.getAccountInfo(new PublicKey(arenaAddress));
    if (!info?.data || info.data.length < MIN_ACCOUNT_LEN_STATUS) {
      throw new Error("Arena account not found or invalid");
    }
    return info.data[OFFSET_STATUS] as number;
  }

  /** Fetch arena status and winner from chain for DB sync. */
  async getArenaOnChainState(arenaAddress: string): Promise<{ status: number; winner: number | null }> {
    const info = await this.connection.getAccountInfo(new PublicKey(arenaAddress));
    if (!info?.data || info.data.length < MIN_ACCOUNT_LEN_WINNER) {
      throw new Error("Arena account not found or invalid");
    }
    const status = info.data[OFFSET_STATUS] as number;
    const winnerTag = info.data[OFFSET_WINNER_TAG] as number;
    const winner = winnerTag === 1 ? (info.data[OFFSET_WINNER_VALUE] as number) : null;
    return { status, winner };
  }

  /**
   * Send a transaction with exponential-backoff retry.
   * Shared by settle_game and reset_arena to eliminate code duplication.
   */
  private async sendTransactionWithRetry(
    ix: TransactionInstruction,
    label: string
  ): Promise<string> {
    const oracle = this.getOracle();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(
          this.connection,
          tx,
          [oracle],
          { commitment: "confirmed", maxRetries: 5, preflightCommitment: "confirmed" }
        );
        console.log(`[SolanaService] ${label} confirmed:`, sig);
        return sig;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(
          `[SolanaService] ${label} attempt ${attempt}/${MAX_RETRIES} failed:`,
          lastError.message
        );
        if (attempt < MAX_RETRIES) {
          // Exponential backoff: 2s, 4s
          await this.delay(RETRY_BASE_DELAY_MS * attempt);
        }
      }
    }

    throw lastError ?? new Error(`${label} failed after ${MAX_RETRIES} retries`);
  }

  /**
   * Build and send the settle_game instruction. Oracle must match the arena's oracle.
   * winnerSide: 0 = agent A, 1 = agent B.
   * Per-arena mutex prevents double-settlement race conditions.
   */
  async settleGameOnChain(
    arenaAddress: string,
    winnerSide: number
  ): Promise<string> {
    if (winnerSide !== 0 && winnerSide !== 1) {
      throw new Error("winnerSide must be 0 or 1");
    }

    const release = this.acquireArenaLock(arenaAddress);
    try {
      const status = await this.getArenaStatus(arenaAddress);
      if (status === SolanaService.ARENA_STATUS.Settled) {
        throw new Error(
          "Arena already settled. Each arena supports one battle. Run reset first (POST /api/arena/reset) or create a new arena."
        );
      }
      if (status !== SolanaService.ARENA_STATUS.Active) {
        throw new Error(
          `Arena must be Active to settle (current status: ${status}). Only Active arenas can be settled.`
        );
      }

      const arenaPubkey = new PublicKey(arenaAddress);
      const oracle = this.getOracle();

      const data = encodeSettleGameInstruction(winnerSide);
      const keys = [
        { pubkey: arenaPubkey, isSigner: false, isWritable: true },
        { pubkey: oracle.publicKey, isSigner: true, isWritable: false },
      ];

      const ix = new TransactionInstruction({
        keys,
        programId: PROGRAM_ID,
        data,
      });

      return await this.sendTransactionWithRetry(ix, "settle_game");
    } finally {
      release();
    }
  }

  /**
   * Reset a settled arena to Active so it can be used for another battle.
   * Vault must be empty (all rewards claimed).
   * Uses shared retry logic and per-arena mutex.
   */
  async resetArenaOnChain(arenaAddress: string): Promise<string> {
    const release = this.acquireArenaLock(arenaAddress);
    try {
      const arenaPubkey = new PublicKey(arenaAddress);
      const info = await this.connection.getAccountInfo(arenaPubkey);
      if (!info?.data || info.data.length < MIN_ACCOUNT_LEN_STATUS) {
        throw new Error("Arena account not found or invalid");
      }
      const status = info.data[OFFSET_STATUS] as number;
      if (status !== SolanaService.ARENA_STATUS.Settled) {
        throw new Error(
          `Arena must be Settled to reset (current status: ${status}). Only settled arenas can be reset.`
        );
      }
      const creatorBytes = info.data.subarray(OFFSET_CREATOR, OFFSET_CREATOR + 32);
      const creatorPubkey = new PublicKey(creatorBytes);

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), creatorPubkey.toBuffer()],
        PROGRAM_ID
      );
      const vaultBalance = await this.connection.getBalance(vaultPda);
      if (vaultBalance > 0) {
        throw new Error(
          `Vault must be empty to reset. Claim all rewards first (vault has ${vaultBalance / 1e9} SOL).`
        );
      }

      const oracle = this.getOracle();
      const data = encodeResetArenaInstruction();
      const keys = [
        { pubkey: arenaPubkey, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: oracle.publicKey, isSigner: true, isWritable: false },
      ];

      const ix = new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
      return await this.sendTransactionWithRetry(ix, "reset_arena");
    } finally {
      release();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
