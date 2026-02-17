/**
 * Multisig Oracle Service - 2-of-3 Threshold Signature Coordination
 * 
 * Architecture:
 * - 3 oracle nodes, each with unique keypair
 * - Settlement requires 2 valid signatures (threshold)
 * - Uses Ed25519 signatures with deterministic message format
 * - Prevents replay attacks via settlement_nonce from on-chain arena
 * 
 * Security Features:
 * - Signature aggregation before on-chain submission
 * - Each oracle signs: arena_address + winner + settlement_nonce
 * - Nonce increments on every settlement/reset (on-chain)
 * - No single point of failure - any 2 oracles can settle
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

const PROGRAM_ID = new PublicKey("DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz");

// Account data offsets (must match updated program)
const OFFSET_ORACLES = 40; // After creator (32 bytes) + discriminator (8 bytes)
const OFFSET_THRESHOLD = 136; // After oracles (96 bytes)
const OFFSET_STATUS = 137;
const OFFSET_NONCE = 156; // settlement_nonce is last field

export interface OracleSignature {
  oracle_index: number;
  signature: Uint8Array; // 64-byte Ed25519 signature
}

export interface OracleConfig {
  index: number;
  publicKey: PublicKey;
  privateKey: Uint8Array;
  endpoint?: string; // For distributed oracle nodes
}

export interface ArenaMultisigState {
  oracles: PublicKey[];
  threshold: number;
  settlementNonce: bigint;
  status: number;
}

/**
 * Creates deterministic settlement message for signing
 * Format: "soliseum:settle:" + arena_pubkey (32 bytes) + winner (1 byte) + nonce (8 bytes LE)
 */
function createSettlementMessage(
  arenaAddress: PublicKey,
  winner: number,
  nonce: bigint
): Uint8Array {
  const prefix = new TextEncoder().encode("soliseum:settle:");
  const winnerByte = new Uint8Array([winner]);
  const nonceBytes = new Uint8Array(8);
  const view = new DataView(nonceBytes.buffer);
  view.setBigUint64(0, nonce, true); // Little-endian
  
  const message = new Uint8Array(prefix.length + 32 + 1 + 8);
  message.set(prefix, 0);
  message.set(arenaAddress.toBytes(), prefix.length);
  message.set(winnerByte, prefix.length + 32);
  message.set(nonceBytes, prefix.length + 33);
  
  return message;
}

/**
 * Creates deterministic reset message for signing
 * Format: "soliseum:reset:" + arena_pubkey (32 bytes) + nonce (8 bytes LE)
 */
function createResetMessage(
  arenaAddress: PublicKey,
  nonce: bigint
): Uint8Array {
  const prefix = new TextEncoder().encode("soliseum:reset:");
  const nonceBytes = new Uint8Array(8);
  const view = new DataView(nonceBytes.buffer);
  view.setBigUint64(0, nonce, true);
  
  const message = new Uint8Array(prefix.length + 32 + 8);
  message.set(prefix, 0);
  message.set(arenaAddress.toBytes(), prefix.length);
  message.set(nonceBytes, prefix.length + 32);
  
  return message;
}

/**
 * Creates deterministic oracle update message
 * Format: "soliseum:update_oracles:" + arena_pubkey + new_oracles (3 * 32 bytes) + nonce
 */
function createOracleUpdateMessage(
  arenaAddress: PublicKey,
  newOracles: PublicKey[],
  nonce: bigint
): Uint8Array {
  const prefix = new TextEncoder().encode("soliseum:update_oracles:");
  const nonceBytes = new Uint8Array(8);
  const view = new DataView(nonceBytes.buffer);
  view.setBigUint64(0, nonce, true);
  
  const message = new Uint8Array(prefix.length + 32 + 96 + 8);
  message.set(prefix, 0);
  message.set(arenaAddress.toBytes(), prefix.length);
  
  let offset = prefix.length + 32;
  for (const oracle of newOracles) {
    message.set(oracle.toBytes(), offset);
    offset += 32;
  }
  
  message.set(nonceBytes, offset);
  return message;
}

/**
 * MultisigOracleService - coordinates 2-of-3 threshold signatures
 * 
 * Usage:
 * 1. Load oracle configs from environment (ORACLE_0_KEY, ORACLE_1_KEY, ORACLE_2_KEY)
 * 2. Call settleGame() with arena address and winner
 * 3. Service fetches current nonce from chain
 * 4. Creates settlement message and collects signatures from this node + others
 * 5. Submits transaction with aggregated signatures
 */
export class MultisigOracleService {
  private connection: Connection;
  private oracles: Map<number, OracleConfig> = new Map();
  private thisNodeIndex: number;

  constructor(
    rpcUrl: string,
    thisNodeIndex: number = 0
  ) {
    this.connection = new Connection(rpcUrl);
    this.thisNodeIndex = thisNodeIndex;
    this.loadOracleConfigs();
  }

  /**
   * Load oracle keypairs from environment
   * Expected: ORACLE_0_KEY, ORACLE_1_KEY, ORACLE_2_KEY (base58 or JSON array)
   */
  private loadOracleConfigs(): void {
    for (let i = 0; i < 3; i++) {
      const envKey = process.env[`ORACLE_${i}_KEY`];
      if (!envKey) {
        if (i === this.thisNodeIndex) {
          throw new Error(`ORACLE_${i}_KEY is required for this node (index ${this.thisNodeIndex})`);
        }
        continue; // Other oracle keys optional if using external coordination
      }

      try {
        const secretKey = this.decodePrivateKey(envKey);
        const keypair = Keypair.fromSecretKey(secretKey);
        
        this.oracles.set(i, {
          index: i,
          publicKey: keypair.publicKey,
          privateKey: secretKey,
          endpoint: process.env[`ORACLE_${i}_ENDPOINT`],
        });
        
        console.log(`[MultisigOracleService] Loaded oracle ${i}: ${keypair.publicKey.toBase58()}`);
      } catch (e) {
        throw new Error(`Failed to load ORACLE_${i}_KEY: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private decodePrivateKey(encoded: string): Uint8Array {
    const trimmed = encoded.trim();
    if (trimmed.startsWith("[")) {
      const arr = JSON.parse(trimmed) as number[];
      return new Uint8Array(arr);
    }
    return bs58.decode(trimmed);
  }

  /**
   * Get this node's oracle config
   */
  getThisNodeConfig(): OracleConfig {
    const config = this.oracles.get(this.thisNodeIndex);
    if (!config) {
      throw new Error(`This node (index ${this.thisNodeIndex}) config not loaded`);
    }
    return config;
  }

  /**
   * Fetch multisig state from on-chain arena account
   */
  async getArenaMultisigState(arenaAddress: string): Promise<ArenaMultisigState> {
    const info = await this.connection.getAccountInfo(new PublicKey(arenaAddress));
    if (!info?.data || info.data.length < 164) {
      throw new Error("Arena account not found or invalid data length");
    }

    const data = info.data;
    const oracles: PublicKey[] = [];
    
    for (let i = 0; i < 3; i++) {
      const offset = OFFSET_ORACLES + (i * 32);
      const pubkeyBytes = data.subarray(offset, offset + 32);
      oracles.push(new PublicKey(pubkeyBytes));
    }

    const threshold = data[OFFSET_THRESHOLD];
    const status = data[OFFSET_STATUS];
    
    const nonceBytes = data.subarray(OFFSET_NONCE, OFFSET_NONCE + 8);
    const nonceView = new DataView(nonceBytes.buffer, nonceBytes.byteOffset);
    const settlementNonce = nonceView.getBigUint64(0, true);

    return { oracles, threshold, status, settlementNonce };
  }

  /**
   * Create signature for settlement (called by each oracle node)
   */
  createSettlementSignature(
    arenaAddress: PublicKey,
    winner: number,
    nonce: bigint
): OracleSignature {
    const config = this.getThisNodeConfig();
    const message = createSettlementMessage(arenaAddress, winner, nonce);
    const signature = nacl.sign.detached(message, config.privateKey);
    
    return {
      oracle_index: this.thisNodeIndex,
      signature,
    };
  }

  /**
   * Create signature for reset
   */
  createResetSignature(
    arenaAddress: PublicKey,
    nonce: bigint
  ): OracleSignature {
    const config = this.getThisNodeConfig();
    const message = createResetMessage(arenaAddress, nonce);
    const signature = nacl.sign.detached(message, config.privateKey);
    
    return {
      oracle_index: this.thisNodeIndex,
      signature,
    };
  }

  /**
   * Verify an oracle signature
   */
  verifySignature(
    oracleIndex: number,
    signature: Uint8Array,
    message: Uint8Array,
    state: ArenaMultisigState
  ): boolean {
    if (oracleIndex < 0 || oracleIndex >= 3) return false;
    
    const oraclePubkey = state.oracles[oracleIndex];
    return nacl.sign.detached.verify(message, signature, oraclePubkey.toBytes());
  }

  /**
   * Collect signatures from other oracle nodes via HTTP API
   * In production, this should use authenticated channels
   */
  async collectRemoteSignatures(
    arenaAddress: PublicKey,
    winner: number,
    nonce: bigint,
    state: ArenaMultisigState
  ): Promise<OracleSignature[]> {
    const signatures: OracleSignature[] = [];
    
    // Add this node's signature
    signatures.push(this.createSettlementSignature(arenaAddress, winner, nonce));
    
    // Collect from remote oracles
    for (let i = 0; i < 3; i++) {
      if (i === this.thisNodeIndex) continue;
      
      const oracle = this.oracles.get(i);
      if (!oracle?.endpoint) {
        console.warn(`[MultisigOracleService] Oracle ${i} endpoint not configured, skipping`);
        continue;
      }

      try {
        const response = await fetch(`${oracle.endpoint}/api/oracle/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            arenaAddress: arenaAddress.toBase58(),
            winner,
            nonce: nonce.toString(),
            requester: this.getThisNodeConfig().publicKey.toBase58(),
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          console.warn(`[MultisigOracleService] Oracle ${i} returned ${response.status}`);
          continue;
        }

        const data = await response.json() as { oracle_index: number; signature: string };
        const signatureBytes = bs58.decode(data.signature);
        
        // Verify signature before accepting
        const message = createSettlementMessage(arenaAddress, winner, nonce);
        if (this.verifySignature(data.oracle_index, signatureBytes, message, state)) {
          signatures.push({
            oracle_index: data.oracle_index,
            signature: signatureBytes,
          });
          console.log(`[MultisigOracleService] Collected valid signature from oracle ${i}`);
        } else {
          console.error(`[MultisigOracleService] Invalid signature from oracle ${i}`);
        }
      } catch (e) {
        console.error(`[MultisigOracleService] Failed to contact oracle ${i}:`, e);
      }
    }

    return signatures;
  }

  /**
   * Encode settle_game instruction data with multisig signatures
   * Format: discriminator (8) + winner (1) + signatures_count (1) + [oracle_index (1) + signature (64)]*
   */
  private encodeSettleGameMultisig(
    winner: number,
    signatures: OracleSignature[]
  ): Buffer {
    const discriminator = Buffer.from([134, 40, 71, 113, 16, 49, 57, 118]); // settle_game discriminator
    const data = Buffer.alloc(discriminator.length + 1 + 1 + signatures.length * 65);
    
    discriminator.copy(data, 0);
    data.writeUInt8(winner, 8);
    data.writeUInt8(signatures.length, 9);
    
    let offset = 10;
    for (const sig of signatures) {
      data.writeUInt8(sig.oracle_index, offset);
      Buffer.from(sig.signature).copy(data, offset + 1);
      offset += 65;
    }
    
    return data;
  }

  /**
   * Encode reset_arena instruction data with optional multisig signatures
   */
  private encodeResetArenaMultisig(
    signatures?: OracleSignature[]
  ): Buffer {
    const discriminator = Buffer.from([68, 100, 29, 19, 96, 163, 8, 120]); // reset_arena discriminator
    
    if (!signatures || signatures.length === 0) {
      // Creator reset (no signatures needed)
      const data = Buffer.alloc(discriminator.length + 1);
      discriminator.copy(data, 0);
      data.writeUInt8(0, 8); // signature count = 0
      return data;
    }
    
    const data = Buffer.alloc(discriminator.length + 1 + signatures.length * 65);
    discriminator.copy(data, 0);
    data.writeUInt8(signatures.length, 8);
    
    let offset = 9;
    for (const sig of signatures) {
      data.writeUInt8(sig.oracle_index, offset);
      Buffer.from(sig.signature).copy(data, offset + 1);
      offset += 65;
    }
    
    return data;
  }

  /**
   * Settle game with 2-of-3 multisig
   * 
   * Flow:
   * 1. Fetch current arena state (nonce, oracles)
   * 2. Collect signatures from this node + 1 other oracle
   * 3. Submit transaction with aggregated signatures
   */
  async settleGame(
    arenaAddress: string,
    winner: number,
    options: {
      skipRemoteCollection?: boolean; // For testing - use only local signature
      maxRetries?: number;
    } = {}
  ): Promise<string> {
    const { skipRemoteCollection = false, maxRetries = 3 } = options;
    
    const arenaPubkey = new PublicKey(arenaAddress);
    const state = await this.getArenaMultisigState(arenaAddress);
    
    // Validate arena is active
    if (state.status !== 1) { // Active = 1
      throw new Error(`Arena must be Active to settle (current status: ${state.status})`);
    }

    // Validate this node is an authorized oracle
    const thisConfig = this.getThisNodeConfig();
    const isAuthorized = state.oracles.some(pk => pk.equals(thisConfig.publicKey));
    if (!isAuthorized) {
      throw new Error(`This node (${thisConfig.publicKey.toBase58()}) is not an authorized oracle for this arena`);
    }

    // Collect signatures
    let signatures: OracleSignature[];
    if (skipRemoteCollection) {
      // For testing: sign twice with same key (not valid for production)
      signatures = [
        this.createSettlementSignature(arenaPubkey, winner, state.settlementNonce),
        this.createSettlementSignature(arenaPubkey, winner, state.settlementNonce), // Duplicate for testing
      ];
      signatures[1].oracle_index = (signatures[0].oracle_index + 1) % 3;
    } else {
      signatures = await this.collectRemoteSignatures(
        arenaPubkey,
        winner,
        state.settlementNonce,
        state
      );
    }

    // Validate threshold
    if (signatures.length < state.threshold) {
      throw new Error(
        `Insufficient signatures: ${signatures.length}/${state.threshold}. ` +
        `Could not reach threshold of ${state.threshold} oracles.`
      );
    }

    // Remove duplicates
    const uniqueIndices = new Set<number>();
    const uniqueSignatures: OracleSignature[] = [];
    for (const sig of signatures) {
      if (!uniqueIndices.has(sig.oracle_index)) {
        uniqueIndices.add(sig.oracle_index);
        uniqueSignatures.push(sig);
      }
    }

    if (uniqueSignatures.length < state.threshold) {
      throw new Error(`Not enough unique oracle signatures: ${uniqueSignatures.length}/${state.threshold}`);
    }

    // Build and send transaction
    const data = this.encodeSettleGameMultisig(winner, uniqueSignatures.slice(0, state.threshold));
    const keys = [
      { pubkey: arenaPubkey, isSigner: false, isWritable: true },
      { pubkey: thisConfig.publicKey, isSigner: true, isWritable: false },
    ];

    const ix = new TransactionInstruction({
      keys,
      programId: PROGRAM_ID,
      data,
    });

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(
          this.connection,
          tx,
          [Keypair.fromSecretKey(thisConfig.privateKey)],
          { commitment: "confirmed", maxRetries: 5, preflightCommitment: "confirmed" }
        );
        
        console.log(`[MultisigOracleService] settle_game confirmed:`, sig);
        return sig;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(
          `[MultisigOracleService] settle_game attempt ${attempt}/${maxRetries} failed:`,
          lastError.message
        );
        
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }

    throw lastError ?? new Error(`settle_game failed after ${maxRetries} retries`);
  }

  /**
   * Reset arena (creator can reset without signatures, oracles need 2-of-3)
   */
  async resetArena(
    arenaAddress: string,
    options: {
      isCreator?: boolean;
      maxRetries?: number;
    } = {}
  ): Promise<string> {
    const { isCreator = false, maxRetries = 3 } = options;
    
    const arenaPubkey = new PublicKey(arenaAddress);
    const state = await this.getArenaMultisigState(arenaAddress);
    
    if (state.status !== 2) { // Settled = 2
      throw new Error(`Arena must be Settled to reset (current status: ${state.status})`);
    }

    let signatures: OracleSignature[] | undefined;
    
    if (!isCreator) {
      // Oracle reset requires 2-of-3 signatures
      const thisConfig = this.getThisNodeConfig();
      const isAuthorized = state.oracles.some(pk => pk.equals(thisConfig.publicKey));
      if (!isAuthorized) {
        throw new Error(`This node is not an authorized oracle`);
      }

      // Collect reset signatures
      signatures = [
        this.createResetSignature(arenaPubkey, state.settlementNonce),
      ];
      
      // Add one more from remote
      for (let i = 0; i < 3; i++) {
        if (i === this.thisNodeIndex) continue;
        const oracle = this.oracles.get(i);
        if (!oracle?.endpoint) continue;
        
        try {
          const response = await fetch(`${oracle.endpoint}/api/oracle/sign-reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              arenaAddress: arenaAddress,
              nonce: state.settlementNonce.toString(),
            }),
            signal: AbortSignal.timeout(5000),
          });
          
          if (response.ok) {
            const data = await response.json() as { oracle_index: number; signature: string };
            signatures.push({
              oracle_index: data.oracle_index,
              signature: bs58.decode(data.signature),
            });
            break; // Only need one more
          }
        } catch (e) {
          console.warn(`Failed to get reset signature from oracle ${i}:`, e);
        }
      }

      if (signatures.length < state.threshold) {
        throw new Error(`Insufficient signatures for reset: ${signatures.length}/${state.threshold}`);
      }
    }

    // Get vault PDA
    const info = await this.connection.getAccountInfo(arenaPubkey);
    if (!info) throw new Error("Arena not found");
    const creatorBytes = info.data.subarray(8, 40); // After discriminator
    const creatorPubkey = new PublicKey(creatorBytes);
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), creatorPubkey.toBuffer()],
      PROGRAM_ID
    );

    const data = this.encodeResetArenaMultisig(signatures);
    const keys = [
      { pubkey: arenaPubkey, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: this.getThisNodeConfig().publicKey, isSigner: true, isWritable: false },
    ];

    const ix = new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
    
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [Keypair.fromSecretKey(this.getThisNodeConfig().privateKey)],
      { commitment: "confirmed" }
    );
    
    console.log(`[MultisigOracleService] reset_arena confirmed:`, sig);
    return sig;
  }
}

// Re-export for convenience
export { createSettlementMessage, createResetMessage, createOracleUpdateMessage };
