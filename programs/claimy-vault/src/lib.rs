//! Claimy vault program: holds Claimy SPL in a PDA-owned token account.
//! Withdrawals to a user's ATA are executed via CPI with PDA `invoke_signed`,
//! after an off-chain relayer (hot key) signs the transaction — same key stored
//! in [`VaultState::relayer`]. See [Solana PDAs](https://solana.com/docs/core/pda).
//!
//! Next steps (not in this crate): custodial sweep into `vault_token_account`,
//! credits ledger in Supabase, and `withdraw-spl` building this ix after verifying Phantom `signMessage`.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Seed prefix for the config/state PDA (one per mint).
pub const STATE_SEED: &[u8] = b"state";
/// Seed prefix for the vault authority PDA whose ATA holds SPL.
pub const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod claimy_vault {
    use super::*;

    /// Creates `vault_state`, derives vault PDA, and opens the vault token account (empty ATA).
    pub fn initialize(ctx: Context<Initialize>, relayer: Pubkey) -> Result<()> {
        require!(relayer != Pubkey::default(), ErrorCode::InvalidRelayer);

        let vault_bump = ctx.bumps.vault_authority;
        ctx.accounts.vault_state.relayer = relayer;
        ctx.accounts.vault_state.vault_bump = vault_bump;

        msg!(
            "claimy_vault: initialized mint={} vault_auth={} relayer={}",
            ctx.accounts.mint.key(),
            ctx.accounts.vault_authority.key(),
            relayer
        );
        Ok(())
    }

    /// Relayer-only: SPL `transfer` from vault ATA → user's ATA (same mint).
    pub fn withdraw_to_user(ctx: Context<WithdrawToUser>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);
        require_keys_eq!(
            ctx.accounts.relayer.key(),
            ctx.accounts.vault_state.relayer,
            ErrorCode::UnauthorizedRelayer
        );
        let mint_key = ctx.accounts.mint.key();
        let bump = ctx.accounts.vault_state.vault_bump;
        let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, amount)?;

        msg!(
            "claimy_vault: withdraw amount={} to_owner={}",
            amount,
            ctx.accounts.destination_owner.key()
        );
        Ok(())
    }
}

#[account]
pub struct VaultState {
    /// Backend / Edge Function signer allowed to call `withdraw_to_user`.
    pub relayer: Pubkey,
    /// Bump for [`VAULT_SEED`, mint] PDA (vault token authority).
    pub vault_bump: u8,
}

impl VaultState {
    pub const LEN: usize = 32 + 1;
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + VaultState::LEN,
        seeds = [STATE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// Vault authority PDA (no private key — signs only via program CPI).
    /// CHECK: seeds verified below; no data allocated.
    #[account(seeds = [VAULT_SEED, mint.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WithdrawToUser<'info> {
    #[account(seeds = [STATE_SEED, mint.key().as_ref()], bump)]
    pub vault_state: Account<'info, VaultState>,

    /// CHECK: PDA vault authority
    #[account(seeds = [VAULT_SEED, mint.key().as_ref()], bump = vault_state.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_token_account.mint == mint.key(),
        constraint = vault_token_account.owner == vault_authority.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == mint.key(),
        constraint = user_token_account.owner == destination_owner.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// User's wallet pubkey (must own `user_token_account`).
    /// CHECK: constraint on user_token_account.owner
    pub destination_owner: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    pub relayer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be > 0")]
    ZeroAmount,
    #[msg("Signer is not the configured relayer")]
    UnauthorizedRelayer,
    #[msg("relayer cannot be default pubkey")]
    InvalidRelayer,
}
