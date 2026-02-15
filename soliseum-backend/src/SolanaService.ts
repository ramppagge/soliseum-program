/**
 * Oracle service: signs and submits settle_game transactions to the Solana program.
 * Uses ORACLE_PRIVATE_KEY from env; never hardcode keys.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as crypto from "crypto";
import bs58 from "bs58";

const PROGRAM_ID = new PublicKey("DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function getInstructionDiscriminator(ixName: string): Buffer {
  const preimage = `global:${ixName}`;
  return crypto.createHash("sha256").update(preimage).digest().subarray(0, 8);
}

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

  /** Arena status enum from program (must match lib.rs ArenaStatus) */
  private static readonly ARENA_STATUS = { Pending: 0, Active: 1, Settled: 2, Cancelled: 3 } as const;

  /** Fetch arena status from chain. Status byte at offset 96 (after 8 discriminator + 88 arena fields). */
  async getArenaStatus(arenaAddress: string): Promise<number> {
    const info = await this.connection.getAccountInfo(new PublicKey(arenaAddress));
    if (!info?.data || info.data.length < 97) {
      throw new Error("Arena account not found or invalid");
    }
    return info.data[96] as number;
  }

  /** Fetch arena status and winner from chain for DB sync. */
  async getArenaOnChainState(arenaAddress: string): Promise<{ status: number; winner: number | null }> {
    const info = await this.connection.getAccountInfo(new PublicKey(arenaAddress));
    if (!info?.data || info.data.length < 99) {
      throw new Error("Arena account not found or invalid");
    }
    const status = info.data[96] as number;
    const winnerTag = info.data[97] as number;
    const winner = winnerTag === 1 ? (info.data[98] as number) : null;
    return { status, winner };
  }

  /**
   * Build and send the settle_game instruction. Oracle must match the arena's oracle.
   * winnerSide: 0 = agent A, 1 = agent B.
   * Throws clear error if arena is already Settled (one battle per arena; use reset first).
   */
  async settleGameOnChain(
    arenaAddress: string,
    winnerSide: number
  ): Promise<string> {
    if (winnerSide !== 0 && winnerSide !== 1) {
      throw new Error("winnerSide must be 0 or 1");
    }

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
        console.log("[SolanaService] settle_game confirmed:", sig);
        return sig;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(
          `[SolanaService] settle_game attempt ${attempt}/${MAX_RETRIES} failed:`,
          lastError.message
        );
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS);
        }
      }
    }

    throw lastError ?? new Error("settle_game failed after retries");
  }

  /**
   * Reset a settled arena to Active so it can be used for another battle.
   * Vault must be empty (all rewards claimed). Requires program with reset_arena instruction.
   */
  async resetArenaOnChain(arenaAddress: string): Promise<string> {
    const arenaPubkey = new PublicKey(arenaAddress);
    const info = await this.connection.getAccountInfo(arenaPubkey);
    if (!info?.data || info.data.length < 41) {
      throw new Error("Arena account not found or invalid");
    }
    const status = info.data[96] as number;
    if (status !== SolanaService.ARENA_STATUS.Settled) {
      throw new Error(
        `Arena must be Settled to reset (current status: ${status}). Only settled arenas can be reset.`
      );
    }
    const creatorBytes = info.data.subarray(8, 40);
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
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [oracle],
      { commitment: "confirmed", maxRetries: 5, preflightCommitment: "confirmed" }
    );
    console.log("[SolanaService] reset_arena confirmed:", sig);
    return sig;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
