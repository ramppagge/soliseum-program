/**
 * Soliseum program client - builds place_stake and claim_reward instructions.
 * Uses raw @solana/web3.js (no Anchor dependency).
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz");

/** SHA256("global:place_stake").slice(0,8) - Anchor instruction discriminator */
function getPlaceStakeDiscriminator(): Buffer {
  return Buffer.from([22, 66, 171, 110, 117, 28, 158, 57]);
}

/** SHA256("global:claim_reward").slice(0,8) */
function getClaimRewardDiscriminator(): Buffer {
  return Buffer.from([149, 95, 181, 242, 94, 90, 158, 162]);
}

/** Arena account layout: 8(disc) + creator(32) + ... */
const ARENA_CREATOR_OFFSET = 8;

/** Fetch arena creator from on-chain arena account */
export async function fetchArenaCreator(
  connection: Connection,
  arenaAddress: PublicKey
): Promise<PublicKey> {
  const accountInfo = await connection.getAccountInfo(arenaAddress);
  if (!accountInfo?.data || accountInfo.data.length < ARENA_CREATOR_OFFSET + 32) {
    throw new Error("Invalid arena account");
  }
  return new PublicKey(accountInfo.data.subarray(ARENA_CREATOR_OFFSET, ARENA_CREATOR_OFFSET + 32));
}

/** Derive vault PDA from creator */
export function getVaultPda(creator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), creator.toBuffer()],
    PROGRAM_ID
  );
}

/** Derive stake PDA from arena and user */
export function getStakePda(arena: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), arena.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
}

/** Stake account layout: 8(disc) + owner(32) + amount(8) + side(1) + claimed(1) */
export async function fetchStakeFromChain(
  connection: Connection,
  arenaAddress: PublicKey,
  user: PublicKey
): Promise<{ amount: number; side: number; claimed: boolean } | null> {
  const [stakePda] = getStakePda(arenaAddress, user);
  const info = await connection.getAccountInfo(stakePda);
  if (!info?.data || info.data.length < 50) return null;
  const amount = info.data.readBigUInt64LE(40);
  const side = info.data.readUInt8(48);
  const claimed = info.data.readUInt8(49) === 1;
  return { amount: Number(amount), side, claimed };
}

/** Build place_stake instruction */
export async function buildPlaceStakeInstruction(
  connection: Connection,
  arenaAddress: PublicKey,
  user: PublicKey,
  amountLamports: bigint,
  side: 0 | 1
): Promise<TransactionInstruction> {
  const creator = await fetchArenaCreator(connection, arenaAddress);
  const [vaultPda] = getVaultPda(creator);
  const [stakePda] = getStakePda(arenaAddress, user);

  const data = Buffer.alloc(8 + 8 + 1);
  getPlaceStakeDiscriminator().copy(data, 0);
  data.writeBigUInt64LE(amountLamports, 8);
  data.writeUInt8(side, 16);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: arenaAddress, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: stakePda, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Build claim_reward instruction */
export async function buildClaimRewardInstruction(
  connection: Connection,
  arenaAddress: PublicKey,
  user: PublicKey
): Promise<TransactionInstruction> {
  const creator = await fetchArenaCreator(connection, arenaAddress);
  const [vaultPda] = getVaultPda(creator);
  const [stakePda] = getStakePda(arenaAddress, user);

  const data = Buffer.alloc(8);
  getClaimRewardDiscriminator().copy(data, 0);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: arenaAddress, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: stakePda, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Convert SOL to lamports */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}
