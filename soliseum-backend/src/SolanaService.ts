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

  /**
   * Build and send the settle_game instruction. Oracle must match the arena's oracle.
   * winnerSide: 0 = agent A, 1 = agent B.
   */
  async settleGameOnChain(
    arenaAddress: string,
    winnerSide: number
  ): Promise<string> {
    if (winnerSide !== 0 && winnerSide !== 1) {
      throw new Error("winnerSide must be 0 or 1");
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
