// Silence unexpected_cfgs from Anchor/solana_program macros (they use cfg values we don't declare)
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("DSabgEbjSc4ZYGL8ZkCoFiE9NFZgF1vGRmrsFFkBZiXz");

pub const BPS_DENOMINATOR: u64 = 10_000;

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

#[program]
pub mod soliseum {
    use super::*;

    /// Initialize a new arena with oracle and platform fee configuration.
    pub fn initialize_arena(
        ctx: Context<InitializeArena>,
        fee_bps: u16,
    ) -> Result<()> {
        require!(fee_bps <= BPS_DENOMINATOR as u16, SoliseumError::MathOverflow);

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
        arena.oracle = ctx.accounts.oracle.key();
        arena.total_pool = 0;
        arena.agent_a_pool = 0;
        arena.agent_b_pool = 0;
        arena.status = ArenaStatus::Active;
        arena.winner = None;
        arena.fee_bps = fee_bps;

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
    /// Oracle only. Vault must be empty (all rewards claimed).
    pub fn reset_arena(ctx: Context<ResetArena>) -> Result<()> {
        require!(
            ctx.accounts.arena.status == ArenaStatus::Settled,
            SoliseumError::InvalidArenaState
        );
        require!(
            ctx.accounts.vault.lamports() == 0,
            SoliseumError::InvalidArenaState
        );

        let arena = &mut ctx.accounts.arena;
        arena.status = ArenaStatus::Active;
        arena.winner = None;
        arena.total_pool = 0;
        arena.agent_a_pool = 0;
        arena.agent_b_pool = 0;

        Ok(())
    }

    /// Settle the game with the winner. Oracle only.
    pub fn settle_game(ctx: Context<SettleGame>, winner: u8) -> Result<()> {
        require!(winner <= 1, SoliseumError::InvalidArenaState);
        require!(
            ctx.accounts.arena.status == ArenaStatus::Active,
            SoliseumError::InvalidArenaState
        );

        let arena = &mut ctx.accounts.arena;
        arena.winner = Some(winner);
        arena.status = ArenaStatus::Settled;

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

#[account]
pub struct Arena {
    pub creator: Pubkey,
    pub oracle: Pubkey,
    pub total_pool: u64,
    pub agent_a_pool: u64,
    pub agent_b_pool: u64,
    pub status: ArenaStatus,
    pub winner: Option<u8>,
    pub fee_bps: u16,
}

impl Arena {
    // creator(32) + oracle(32) + total_pool(8) + agent_a_pool(8) + agent_b_pool(8)
    // + status(1) + winner(1+1 for Option) + fee_bps(2)
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 1 + 2 + 2;
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

    /// Oracle authorized to settle the game
    /// CHECK: Oracle is stored and validated on settle_game
    pub oracle: UncheckedAccount<'info>,

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
pub struct ResetArena<'info> {
    #[account(
        mut,
        seeds = [b"arena", arena.creator.as_ref()],
        bump,
        constraint = arena.oracle == oracle.key() @ SoliseumError::UnauthorizedOracle
    )]
    pub arena: Account<'info, Arena>,

    #[account(mut, seeds = [b"vault", arena.creator.as_ref()], bump)]
    /// CHECK: Vault PDA; we only check lamports == 0
    pub vault: UncheckedAccount<'info>,

    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettleGame<'info> {
    #[account(
        mut,
        seeds = [b"arena", arena.creator.as_ref()],
        bump,
        constraint = arena.oracle == oracle.key() @ SoliseumError::UnauthorizedOracle
    )]
    pub arena: Account<'info, Arena>,

    pub oracle: Signer<'info>,
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
}
