use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct DrawRaffle<'info> {
    #[account(
        mut,
        seeds = [b"raffle", raffle.merchant.as_ref(), raffle.raffle_index.to_le_bytes().as_ref()],
        bump = raffle.bump,
        close = merchant
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        mut,
        constraint = raffle.merchant == merchant.key() @ LoyaltyError::InvalidCustomerCard
    )]
    pub merchant: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Remaining accounts layout (for each unique staker):
///   [wallet_i (writable), loyalty_card_i (writable)]
/// The program derives the winner on-chain and transfers the prize.
/// All staker loyalty-card locks are cleared regardless of win/loss.
pub fn handler(ctx: Context<DrawRaffle>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let slot = clock.slot;

    // Read raffle state (clone what we need before mutating)
    let staked_entries = ctx.accounts.raffle.staked_entries.clone();
    let prize = ctx.accounts.raffle.prize_lamports;
    let merchant_key = ctx.accounts.raffle.merchant;
    let raffle_index = ctx.accounts.raffle.raffle_index;

    require!(ctx.accounts.raffle.active, LoyaltyError::RaffleNotActive);
    require!(now >= ctx.accounts.raffle.closes_at, LoyaltyError::RaffleNotClosedYet);
    require!(!staked_entries.is_empty(), LoyaltyError::NoStakerInRaffle);

    // On-chain pseudo-random winner selection using slot + timestamp
    // No client-side prediction or retries required
    let seed = slot
        .wrapping_mul(1_000_003)
        .wrapping_add(now as u64)
        .wrapping_add(staked_entries.len() as u64);
    let winner_idx = (seed as usize) % staked_entries.len();
    let winner_pubkey = staked_entries[winner_idx];

    // Count unique stakers to validate remaining accounts
    let mut unique_stakers: Vec<Pubkey> = staked_entries.clone();
    unique_stakers.sort_unstable();
    unique_stakers.dedup();

    let remaining = &ctx.remaining_accounts;
    require!(
        remaining.len() == unique_stakers.len() * 2,
        LoyaltyError::InvalidCustomerCard
    );

    // Process remaining accounts: clear badge locks and find winner wallet
    let mut winner_wallet_idx: Option<usize> = None;



    for i in 0..(remaining.len() / 2) {
        let wallet_info = &remaining[i * 2];
        let card_info = &remaining[i * 2 + 1];

        // Verify this wallet is a staker in the raffle
        require!(
            staked_entries.contains(&wallet_info.key()),
            LoyaltyError::InvalidCustomerCard
        );

        // Verify the loyalty card is the correct PDA for this (merchant, customer)
        let (expected_card, _) = Pubkey::find_program_address(
            &[b"loyalty_card", merchant_key.as_ref(), wallet_info.key().as_ref()],
            ctx.program_id,
        );
        require!(card_info.key() == expected_card, LoyaltyError::InvalidCustomerCard);
        require!(card_info.owner == ctx.program_id, LoyaltyError::InvalidCustomerCard);

        // Clear the staked_badge_raffle lock (using try_from and exit to handle Borsh variable size)
        let mut card = Account::<LoyaltyCard>::try_from(card_info)?;
        msg!("DEBUG: card bump is: {}", card.bump);
        msg!("DEBUG: card staked_badge_raffle before: {:?}", card.staked_badge_raffle);
        card.staked_badge_raffle = None;
        msg!("DEBUG: card staked_badge_raffle after: {:?}", card.staked_badge_raffle);
        card.exit(ctx.program_id)?;

        // Track winner wallet for prize transfer
        if wallet_info.key() == winner_pubkey {
            winner_wallet_idx = Some(i * 2);
        }
    }

    // Transfer prize from Raffle PDA to winner
    let winner_remaining_idx = winner_wallet_idx.ok_or(LoyaltyError::InvalidCustomerCard)?;
    let raffle_info = ctx.accounts.raffle.to_account_info();
    let winner_info = &remaining[winner_remaining_idx];

    **raffle_info.try_borrow_mut_lamports()? = raffle_info
        .lamports()
        .checked_sub(prize)
        .ok_or(LoyaltyError::MathOverflow)?;
    **winner_info.try_borrow_mut_lamports()? = winner_info
        .lamports()
        .checked_add(prize)
        .ok_or(LoyaltyError::MathOverflow)?;

    // Finalize raffle state (account is closed via `close = merchant` after handler)
    let raffle = &mut ctx.accounts.raffle;
    raffle.winner = Some(winner_pubkey);
    raffle.active = false;

    msg!("Raffle index {} drawn! Winner is: {:?}", raffle_index, winner_pubkey);
    Ok(())
}
