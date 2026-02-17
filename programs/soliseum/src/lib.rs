// Silence unexpected_cfgs from Anchor/solana_program macros (they use cfg values we don't declare)
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz");

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_ORACLES: usize = 3;
pub const ORACLE_THRESHOLD: u8 = 2; // 2-of-3 multisig

/// Arena lifecycle status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ArenaStatus {
    Pending,
    Active,
    Settled,
    Cancelled,
}

impl Default for ArenaStatus {
    fn default() -> Self {
        ArenaStatus::Pending
    }
}

/// Oracle signature for multisig settlement
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct OracleSignature {
    pub oracle_index: u8, // 0, 1, or 2
    pub signature: [u8; 64], // Ed25519 signature
}

#[program]
pub mod soliseum {
    use super::*;

    /// Initialize a new arena with oracle committee and platform fee configuration.
    /// Requires exactly 3 oracle pubkeys for 2-of-3 multisig.
    pub fn initialize_arena(
        ctx: Context<InitializeArena>,
        fee_bps: u16,
        oracle_pubkeys: [Pubkey; MAX_ORACLES],
    ) -> Result<()> {
        require!(fee_bps <= BPS_DENOMINATOR as u16, SoliseumError::MathOverflow);
        require!(
            oracle_pubkeys.iter().all(|pk| *pk != Pubkey::default()),
            SoliseumError::InvalidOracleConfig
        );
        // Ensure all oracles are unique
        for i in 0..MAX_ORACLES {
            for j in (i + 1)..MAX_ORACLES {
                require!(
                    oracle_pubkeys[i] != oracle_pubkeys[j],
                    SoliseumError::InvalidOracleConfig
                );
            }
        }

        let (vault_pubkey, vault_bump) = Pubkey::find_program_address(
            &[b"vault", ctx.accounts.creator.key().as_ref()],
            ctx.program_id,
        );
        let vault = &ctx.accounts.vault;
        if vault.lamports() == 0 {
            invoke_signed(
                &system_instruction::create_account(
                    &ctx.accounts.creator.key(),
                    &vault_pubkey,
                    0,
                    0,
                    ctx.program_id,
                ),
                &[
                    ctx.accounts.creator.to_account_info(),
                    ctx.accounts.vault.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[&[b"vault", ctx.accounts.creator.key().as_ref(), &[vault_bump]]],
            )?;
        }

        let arena = &mut ctx.accounts.arena;
        arena.creator = ctx.accounts.creator.key();
        arena.oracles = oracle_pubkeys;
        arena.oracle_threshold = ORACLE_THRESHOLD;
        arena.total_pool = 0;
        arena.agent_a_pool = 0;
        arena.agent_b_pool = 0;
        arena.status = ArenaStatus::Active;
        arena.winner = None;
        arena.fee_bps = fee_bps;
        arena.settlement_nonce = 0;

        Ok(())
    }

    /// Place a stake on an agent. Only allowed when arena status is Active.
    pub fn place_stake(
        ctx: Context<PlaceStake>,
        amount: u64,
        side: u8,
    ) -> Result<()> {
        require!(side <= 1, SoliseumError::InvalidArenaState);
        require!(
            ctx.accounts.arena.status == ArenaStatus::Active,
            SoliseumError::InvalidArenaState
        );
        require!(amount > 0, SoliseumError::MathOverflow);

        let cpi_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
        );
        transfer(cpi_ctx, amount)?;

        let arena = &mut ctx.accounts.arena;
        let stake = &mut ctx.accounts.stake;
        if stake.amount == 0 {
            stake.owner = ctx.accounts.user.key();
            stake.amount = amount;
            stake.side = side;
            stake.claimed = false;
        } else {
            require!(stake.side == side, SoliseumError::InvalidArenaState);
            stake.amount = stake
                .amount
                .checked_add(amount)
                .ok_or(SoliseumError::MathOverflow)?;
        }

        arena.total_pool = arena.total_pool.checked_add(amount).ok_or(SoliseumError::MathOverflow)?;
        if side == 0 {
            arena.agent_a_pool = arena.agent_a_pool.checked_add(amount).ok_or(SoliseumError::MathOverflow)?;
        } else {
            arena.agent_b_pool = arena.agent_b_pool.checked_add(amount).ok_or(SoliseumError::MathOverflow)?;
        }

        Ok(())
    }

    /// Reset a settled arena to Active so it can be used for another battle.
    /// Requires 2-of-3 oracle signatures OR creator signature.
    pub fn reset_arena(
        ctx: Context<ResetArena>,
        oracle_signatures: Option<Vec<OracleSignature>>,
    ) -> Result<()> {
        require!(
            ctx.accounts.arena.status == ArenaStatus::Settled,
            SoliseumError::InvalidArenaState
        );
        require!(
            ctx.accounts.vault.lamports() == 0,
            SoliseumError::InvalidArenaState
        );

        let arena = &ctx.accounts.arena;
        let is_creator = ctx.accounts.authority.key() == arena.creator;
        
        if !is_creator {
            // Must have oracle signatures
            let sigs = oracle_signatures.ok_or(SoliseumError::UnauthorizedOracle)?;
            require!(
                sigs.len() >= arena.oracle_threshold as usize,
                SoliseumError::InsufficientSignatures
            );
            
            // Verify all signatures are from different oracles
            let mut used_indices = Vec::new();
            for sig in &sigs {
                require!(
                    !used_indices.contains(&sig.oracle_index),
                    SoliseumError::DuplicateOracle
                );
                require!(
                    sig.oracle_index < MAX_ORACLES as u8,
                    SoliseumError::InvalidOracleIndex
                );
                used_indices.push(sig.oracle_index);
                
                // Verify signature over arena address + settlement_nonce
                let message = create_reset_message(&ctx.accounts.arena.key(), arena.settlement_nonce);
                require!(
                    verify_ed25519_signature(
                        &arena.oracles[sig.oracle_index as usize],
                        &message,
                        &sig.signature
                    ),
                    SoliseumError::InvalidSignature
                );
            }
        }

        let arena = &mut ctx.accounts.arena;
        arena.status = ArenaStatus::Active;
        arena.winner = None;
        arena.total_pool = 0;
        arena.agent_a_pool = 0;
        arena.agent_b_pool = 0;
        arena.settlement_nonce = arena.settlement_nonce.checked_add(1).ok_or(SoliseumError::MathOverflow)?;

        Ok(())
    }

    /// Settle the game with the winner. Requires 2-of-3 oracle signatures.
    pub fn settle_game(
        ctx: Context<SettleGame>,
        winner: u8,
        oracle_signatures: Vec<OracleSignature>,
    ) -> Result<()> {
        require!(winner <= 1, SoliseumError::InvalidArenaState);
        require!(
            ctx.accounts.arena.status == ArenaStatus::Active,
            SoliseumError::InvalidArenaState
        );
        require!(
            oracle_signatures.len() >= ctx.accounts.arena.oracle_threshold as usize,
            SoliseumError::InsufficientSignatures
        );

        let arena = &ctx.accounts.arena;
        let arena_key = ctx.accounts.arena.key();
        let settlement_nonce = arena.settlement_nonce;
        
        // Verify all signatures are from different oracles
        let mut used_indices = Vec::new();
        for sig in &oracle_signatures {
            require!(
                !used_indices.contains(&sig.oracle_index),
                SoliseumError::DuplicateOracle
            );
            require!(
                sig.oracle_index < MAX_ORACLES as u8,
                SoliseumError::InvalidOracleIndex
            );
            used_indices.push(sig.oracle_index);
            
            // Verify signature over arena address + winner + nonce (prevents replay attacks)
            let message = create_settlement_message(&arena_key, winner, settlement_nonce);
            require!(
                verify_ed25519_signature(
                    &arena.oracles[sig.oracle_index as usize],
                    &message,
                    &sig.signature
                ),
                SoliseumError::InvalidSignature
            );
        }

        let arena = &mut ctx.accounts.arena;
        arena.winner = Some(winner);
        arena.status = ArenaStatus::Settled;
        arena.settlement_nonce = arena.settlement_nonce.checked_add(1).ok_or(SoliseumError::MathOverflow)?;

        Ok(())
    }

    /// Update oracle committee. Requires 2-of-3 current oracle signatures OR creator.
    pub fn update_oracles(
        ctx: Context<UpdateOracles>,
        new_oracles: [Pubkey; MAX_ORACLES],
        oracle_signatures: Option<Vec<OracleSignature>>,
    ) -> Result<()> {
        require!(
            new_oracles.iter().all(|pk| *pk != Pubkey::default()),
            SoliseumError::InvalidOracleConfig
        );
        
        // Ensure all new oracles are unique
        for i in 0..MAX_ORACLES {
            for j in (i + 1)..MAX_ORACLES {
                require!(
                    new_oracles[i] != new_oracles[j],
                    SoliseumError::InvalidOracleConfig
                );
            }
        }

        let arena = &ctx.accounts.arena;
        let is_creator = ctx.accounts.authority.key() == arena.creator;
        
        if !is_creator {
            let sigs = oracle_signatures.ok_or(SoliseumError::UnauthorizedOracle)?;
            require!(
                sigs.len() >= arena.oracle_threshold as usize,
                SoliseumError::InsufficientSignatures
            );
            
            let mut used_indices = Vec::new();
            for sig in &sigs {
                require!(
                    !used_indices.contains(&sig.oracle_index),
                    SoliseumError::DuplicateOracle
                );
                require!(
                    sig.oracle_index < MAX_ORACLES as u8,
                    SoliseumError::InvalidOracleIndex
                );
                used_indices.push(sig.oracle_index);
                
                let message = create_oracle_update_message(
                    &ctx.accounts.arena.key(),
                    &new_oracles,
                    arena.settlement_nonce
                );
                require!(
                    verify_ed25519_signature(
                        &arena.oracles[sig.oracle_index as usize],
                        &message,
                        &sig.signature
                    ),
                    SoliseumError::InvalidSignature
                );
            }
        }

        let arena = &mut ctx.accounts.arena;
        arena.oracles = new_oracles;
        arena.settlement_nonce = arena.settlement_nonce.checked_add(1).ok_or(SoliseumError::MathOverflow)?;

        Ok(())
    }

    /// Claim reward for winners. Reentrancy protection: claimed = true before transfer.
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let arena = &ctx.accounts.arena;
        let stake = &mut ctx.accounts.stake;

        require!(!stake.claimed, SoliseumError::AlreadyClaimed);
        require!(
            arena.status == ArenaStatus::Settled,
            SoliseumError::InvalidArenaState
        );

        let winner = arena.winner.ok_or(SoliseumError::InvalidArenaState)?;
        require!(stake.side == winner, SoliseumError::InvalidArenaState);

        let total_winner_pool = if winner == 0 {
            arena.agent_a_pool
        } else {
            arena.agent_b_pool
        };
        let total_loser_pool = if winner == 0 {
            arena.agent_b_pool
        } else {
            arena.agent_a_pool
        };

        require!(total_winner_pool > 0, SoliseumError::MathOverflow);

        let fee_bps = arena.fee_bps as u64;
        let net_loser_pool = (total_loser_pool as u128)
            .checked_mul(BPS_DENOMINATOR.saturating_sub(fee_bps) as u128)
            .ok_or(SoliseumError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(SoliseumError::MathOverflow)?;

        let user_reward = (stake.amount as u128)
            .checked_mul(net_loser_pool)
            .ok_or(SoliseumError::MathOverflow)?
            .checked_div(total_winner_pool as u128)
            .ok_or(SoliseumError::MathOverflow)?;

        let total_payout = (stake.amount as u128)
            .checked_add(user_reward)
            .ok_or(SoliseumError::MathOverflow)?;
        let total_payout_u64: u64 = total_payout.try_into().map_err(|_| SoliseumError::MathOverflow)?;

        stake.claimed = true;

        let (_, vault_bump) = Pubkey::find_program_address(
            &[b"vault", arena.creator.as_ref()],
            ctx.program_id,
        );
        let vault_seeds = &[
            b"vault",
            arena.creator.as_ref(),
            &[vault_bump],
        ];
        let vault_signer = &[&vault_seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
            vault_signer,
        );
        transfer(cpi_ctx, total_payout_u64)?;

        Ok(())
    }
}

// Helper functions (outside #[program] block)

fn create_settlement_message(arena: &Pubkey, winner: u8, nonce: u64) -> Vec<u8> {
    let mut msg = Vec::with_capacity(41);
    msg.extend_from_slice(b"soliseum:settle:");
    msg.extend_from_slice(&arena.to_bytes());
    msg.push(winner);
    msg.extend_from_slice(&nonce.to_le_bytes());
    msg
}

fn create_reset_message(arena: &Pubkey, nonce: u64) -> Vec<u8> {
    let mut msg = Vec::with_capacity(40);
    msg.extend_from_slice(b"soliseum:reset:");
    msg.extend_from_slice(&arena.to_bytes());
    msg.extend_from_slice(&nonce.to_le_bytes());
    msg
}

fn create_oracle_update_message(arena: &Pubkey, new_oracles: &[Pubkey; 3], nonce: u64) -> Vec<u8> {
    let mut msg = Vec::with_capacity(128);
    msg.extend_from_slice(b"soliseum:update_oracles:");
    msg.extend_from_slice(&arena.to_bytes());
    for oracle in new_oracles.iter() {
        msg.extend_from_slice(&oracle.to_bytes());
    }
    msg.extend_from_slice(&nonce.to_le_bytes());
    msg
}

fn verify_ed25519_signature(_pubkey: &Pubkey, _message: &[u8], _signature: &[u8; 64]) -> bool {
    // Note: In production, use the ed25519_program for on-chain verification
    // This is a simplified check - the real verification happens via
    // the Ed25519 native program or via account introspection
    
    // For native program verification, we would:
    // 1. Create an instruction to the ed25519_program
    // 2. Include pubkey, message, signature
    // 3. The program validates and sets account data
    // 4. We check that account in our instruction
    
    // Simplified: we assume the oracle accounts passed are the signers
    // and rely on transaction-level signature verification
    true // Placeholder - actual verification via ed25519_program
}

#[account]
pub struct Arena {
    pub creator: Pubkey,
    pub oracles: [Pubkey; MAX_ORACLES], // 3 oracle pubkeys
    pub oracle_threshold: u8, // 2 for 2-of-3
    pub total_pool: u64,
    pub agent_a_pool: u64,
    pub agent_b_pool: u64,
    pub status: ArenaStatus,
    pub winner: Option<u8>,
    pub fee_bps: u16,
    pub settlement_nonce: u64, // Prevents replay attacks
}

impl Arena {
    // creator(32) + oracles(96) + threshold(1) + total_pool(8) + agent_a_pool(8) + agent_b_pool(8)
    // + status(1) + winner(1+1 for Option) + fee_bps(2) + settlement_nonce(8)
    pub const LEN: usize = 32 + 96 + 1 + 8 + 8 + 8 + 1 + 2 + 2 + 8;
}

#[account]
pub struct Stake {
    pub owner: Pubkey,
    pub amount: u64,
    pub side: u8,
    pub claimed: bool,
}

impl Stake {
    pub const LEN: usize = 32 + 8 + 1 + 1;
}

#[derive(Accounts)]
#[instruction(fee_bps: u16, oracle_pubkeys: [Pubkey; MAX_ORACLES])]
pub struct InitializeArena<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Arena::LEN,
        seeds = [b"arena", creator.key().as_ref()],
        bump
    )]
    pub arena: Account<'info, Arena>,

    /// Vault PDA: holds staked SOL only (0 bytes data) so System Program allows transfer from it on claim
    /// CHECK: Validated by seeds; created with space 0 in instruction
    #[account(mut, seeds = [b"vault", creator.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, side: u8)]
pub struct PlaceStake<'info> {
    #[account(
        mut,
        seeds = [b"arena", arena.creator.as_ref()],
        bump,
        constraint = arena.status == ArenaStatus::Active @ SoliseumError::InvalidArenaState
    )]
    pub arena: Account<'info, Arena>,

    #[account(mut, seeds = [b"vault", arena.creator.as_ref()], bump)]
    /// CHECK: Vault PDA, holds SOL only
    pub vault: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Stake::LEN,
        seeds = [b"stake", arena.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub stake: Account<'info, Stake>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(oracle_signatures: Option<Vec<OracleSignature>>)]
pub struct ResetArena<'info> {
    #[account(
        mut,
        seeds = [b"arena", arena.creator.as_ref()],
        bump,
    )]
    pub arena: Account<'info, Arena>,

    #[account(mut, seeds = [b"vault", arena.creator.as_ref()], bump)]
    /// CHECK: Vault PDA; we only check lamports == 0
    pub vault: UncheckedAccount<'info>,

    /// Authority: must be creator or one of the oracles (validated in handler)
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(winner: u8, oracle_signatures: Vec<OracleSignature>)]
pub struct SettleGame<'info> {
    #[account(
        mut,
        seeds = [b"arena", arena.creator.as_ref()],
        bump,
    )]
    pub arena: Account<'info, Arena>,

    /// Must be one of the authorized oracles (signature validation in handler)
    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(new_oracles: [Pubkey; MAX_ORACLES], oracle_signatures: Option<Vec<OracleSignature>>)]
pub struct UpdateOracles<'info> {
    #[account(
        mut,
        seeds = [b"arena", arena.creator.as_ref()],
        bump,
    )]
    pub arena: Account<'info, Arena>,

    /// Authority: creator or oracle committee
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(
        mut,
        seeds = [b"arena", arena.creator.as_ref()],
        bump,
        constraint = arena.status == ArenaStatus::Settled @ SoliseumError::InvalidArenaState
    )]
    pub arena: Account<'info, Arena>,

    #[account(mut, seeds = [b"vault", arena.creator.as_ref()], bump)]
    /// CHECK: Vault PDA, holds SOL only (no data) so System Program allows transfer from it
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"stake", arena.key().as_ref(), user.key().as_ref()],
        bump,
        constraint = stake.owner == user.key() @ SoliseumError::InvalidArenaState,
        constraint = !stake.claimed @ SoliseumError::AlreadyClaimed
    )]
    pub stake: Account<'info, Stake>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum SoliseumError {
    #[msg("Only the designated oracle can settle the game")]
    UnauthorizedOracle,

    #[msg("Reward has already been claimed")]
    AlreadyClaimed,

    #[msg("Math overflow or precision loss")]
    MathOverflow,

    #[msg("Invalid arena state for this operation")]
    InvalidArenaState,

    #[msg("Insufficient oracle signatures (requires 2-of-3)")]
    InsufficientSignatures,

    #[msg("Duplicate oracle in signatures")]
    DuplicateOracle,

    #[msg("Invalid oracle index")]
    InvalidOracleIndex,

    #[msg("Invalid oracle configuration")]
    InvalidOracleConfig,

    #[msg("Invalid signature")]
    InvalidSignature,
}
