import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Soliseum } from "../target/types/soliseum";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";

describe("soliseum", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Soliseum as Program<Soliseum>;

  let creator: Keypair;
  let oracle: Keypair;
  let userA: Keypair;
  let userB: Keypair;

  let arenaPda: PublicKey;
  let vaultPda: PublicKey;
  const FEE_BPS = 250; // 2.5%
  const STAKE_AMOUNT_A = new anchor.BN(1 * LAMPORTS_PER_SOL);
  const STAKE_AMOUNT_B = new anchor.BN(2 * LAMPORTS_PER_SOL);

  before(async () => {
    creator = Keypair.generate();
    oracle = Keypair.generate();
    userA = Keypair.generate();
    userB = Keypair.generate();

    const airdropAmount = 10 * LAMPORTS_PER_SOL;
    const conn = provider.connection;

    for (const kp of [creator, oracle, userA, userB]) {
      const sig = await conn.requestAirdrop(kp.publicKey, airdropAmount);
      await conn.confirmTransaction(sig);
    }

    [arenaPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("arena"), creator.publicKey.toBuffer()],
      program.programId
    );
    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), creator.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Initializes the arena", async () => {
    await program.methods
      .initializeArena(FEE_BPS)
      .accounts({
        arena: arenaPda,
        vault: vaultPda,
        creator: creator.publicKey,
        oracle: oracle.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const arena = await program.account.arena.fetch(arenaPda);
    expect(arena.creator.equals(creator.publicKey)).to.be.true;
    expect(arena.oracle.equals(oracle.publicKey)).to.be.true;
    expect(arena.totalPool.toNumber()).to.equal(0);
    expect(arena.agentAPool.toNumber()).to.equal(0);
    expect(arena.agentBPool.toNumber()).to.equal(0);
    expect(arena.status.active !== undefined).to.be.true;
    expect(arena.winner).to.be.null;
    expect(arena.feeBps).to.equal(FEE_BPS);
  });

  it("Allows User A to stake on Agent A (side 0)", async () => {
    const [stakePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        arenaPda.toBuffer(),
        userA.publicKey.toBuffer(),
      ],
      program.programId
    );

    const balanceBefore = await provider.connection.getBalance(userA.publicKey);

    await program.methods
      .placeStake(STAKE_AMOUNT_A, 0)
      .accounts({
        arena: arenaPda,
        vault: vaultPda,
        stake: stakePda,
        user: userA.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userA])
      .rpc();

    const balanceAfter = await provider.connection.getBalance(userA.publicKey);
    expect(balanceAfter).to.be.lessThan(balanceBefore);

    const arena = await program.account.arena.fetch(arenaPda);
    expect(arena.agentAPool.toString()).to.equal(STAKE_AMOUNT_A.toString());
    expect(arena.totalPool.toString()).to.equal(STAKE_AMOUNT_A.toString());

    const stake = await program.account.stake.fetch(stakePda);
    expect(stake.owner.equals(userA.publicKey)).to.be.true;
    expect(stake.amount.toString()).to.equal(STAKE_AMOUNT_A.toString());
    expect(stake.side).to.equal(0);
    expect(stake.claimed).to.be.false;
  });

  it("Allows User B to stake on Agent B (side 1)", async () => {
    const [stakePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        arenaPda.toBuffer(),
        userB.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .placeStake(STAKE_AMOUNT_B, 1)
      .accounts({
        arena: arenaPda,
        vault: vaultPda,
        stake: stakePda,
        user: userB.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userB])
      .rpc();

    const arena = await program.account.arena.fetch(arenaPda);
    expect(arena.agentAPool.toString()).to.equal(STAKE_AMOUNT_A.toString());
    expect(arena.agentBPool.toString()).to.equal(STAKE_AMOUNT_B.toString());
    expect(
      arena.totalPool.toString()
    ).to.equal(STAKE_AMOUNT_A.add(STAKE_AMOUNT_B).toString());
  });

  it("Oracle settles the game with Agent A as winner", async () => {
    await program.methods
      .settleGame(0)
      .accounts({
        arena: arenaPda,
        oracle: oracle.publicKey,
      })
      .signers([oracle])
      .rpc();

    const arena = await program.account.arena.fetch(arenaPda);
    expect(arena.status.settled !== undefined).to.be.true;
    expect(arena.winner).to.equal(0);
  });

  it("User A (winner) claims reward", async () => {
    const [stakePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        arenaPda.toBuffer(),
        userA.publicKey.toBuffer(),
      ],
      program.programId
    );

    const balanceBefore = await provider.connection.getBalance(userA.publicKey);

    await program.methods
      .claimReward()
      .accounts({
        arena: arenaPda,
        vault: vaultPda,
        stake: stakePda,
        user: userA.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userA])
      .rpc();

    const balanceAfter = await provider.connection.getBalance(userA.publicKey);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);

    const stake = await program.account.stake.fetch(stakePda);
    expect(stake.claimed).to.be.true;

    // Verify payout: UserStake + (UserStake * NetLoserPool / TotalWinnerPool)
    // NetLoserPool = TotalLoserPool * (10000 - FeeBps) / 10000
    const totalWinnerPool = STAKE_AMOUNT_A.toNumber();
    const totalLoserPool = STAKE_AMOUNT_B.toNumber();
    const netLoserPool = Math.floor(
      (totalLoserPool * (10000 - FEE_BPS)) / 10000
    );
    const userReward = Math.floor(
      (STAKE_AMOUNT_A.toNumber() * netLoserPool) / totalWinnerPool
    );
    const totalPayout = STAKE_AMOUNT_A.toNumber() + userReward;
    expect(balanceAfter - balanceBefore).to.be.at.least(totalPayout - 10000);
  });

  it("Rejects double claim", async () => {
    const [stakePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        arenaPda.toBuffer(),
        userA.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .claimReward()
        .accounts({
          arena: arenaPda,
          vault: vaultPda,
          stake: stakePda,
          user: userA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userA])
        .rpc();
      expect.fail("Should have thrown AlreadyClaimed");
    } catch (err: unknown) {
      const anchorErr = err as { logs?: string[] };
      expect(
        anchorErr.logs?.some((l) => l.includes("AlreadyClaimed") || l.includes("6011"))
      ).to.be.true;
    }
  });

  it("Rejects non-oracle settle attempt", async () => {
    const [newArenaPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("arena"), userA.publicKey.toBuffer()],
      program.programId
    );
    const [newVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), userA.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeArena(FEE_BPS)
      .accounts({
        arena: newArenaPda,
        vault: newVaultPda,
        creator: userA.publicKey,
        oracle: oracle.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userA])
      .rpc();

    const [stakePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        newArenaPda.toBuffer(),
        userA.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .placeStake(new anchor.BN(LAMPORTS_PER_SOL), 0)
      .accounts({
        arena: newArenaPda,
        vault: newVaultPda,
        stake: stakePda,
        user: userA.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userA])
      .rpc();

    try {
      await program.methods
        .settleGame(0)
        .accounts({
          arena: newArenaPda,
          oracle: userA.publicKey,
        })
        .signers([userA])
        .rpc();
      expect.fail("Should have thrown UnauthorizedOracle");
    } catch (err: unknown) {
      const anchorErr = err as { logs?: string[] };
      expect(
        anchorErr.logs?.some(
          (l) =>
            l.includes("UnauthorizedOracle") ||
            l.includes("6009") ||
            l.includes("ConstraintRaw")
        )
      ).to.be.true;
    }
  });
});
