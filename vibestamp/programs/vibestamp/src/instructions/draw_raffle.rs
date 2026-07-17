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
        constraint = raffle.staked_entries.contains(&winner.key()) @ LoyaltyError::InvalidCustomerCard
    )]
    /// CHECK: The winner account, verified by constraint check
    pub winner: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = raffle.merchant == merchant.key() @ LoyaltyError::InvalidCustomerCard
    )]
    pub merchant: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DrawRaffle>) -> Result<()> {
    let raffle = &mut ctx.accounts.raffle;
    let now = Clock::get()?.unix_timestamp;
    let slot = Clock::get()?.slot;

    require!(raffle.active, LoyaltyError::RaffleNotActive);
    require!(now >= raffle.closes_at, LoyaltyError::RaffleNotClosedYet);
    require!(!raffle.staked_entries.is_empty(), LoyaltyError::NoStakerInRaffle);

    // Pseudo-random index selection on-chain
    let winner_idx = (slot as usize) % raffle.staked_entries.len();
    let winner_pubkey = raffle.staked_entries[winner_idx];

    // Verify the winner account passed matches the drawn winner
    require!(ctx.accounts.winner.key() == winner_pubkey, LoyaltyError::InvalidCustomerCard);

    raffle.winner = Some(winner_pubkey);
    raffle.active = false;

    let prize = raffle.prize_lamports;
    
    // Transfer the prize lamports from the Raffle PDA to the winner
    // Note: The Raffle PDA is closed by this instruction, so all remaining rent lamports
    // go to the merchant automatically via the `close = merchant` annotation.
    // We deduct the prize from the Raffle account lamports and add to the winner's lamports.
    let raffle_info = raffle.to_account_info();
    let winner_info = ctx.accounts.winner.to_account_info();

    **raffle_info.try_borrow_mut_lamports()? = raffle_info.lamports().checked_sub(prize).ok_or(LoyaltyError::MathOverflow)?;
    **winner_info.try_borrow_mut_lamports()? = winner_info.lamports().checked_add(prize).ok_or(LoyaltyError::MathOverflow)?;

    msg!("Raffle index {} drawn! Winner is: {:?}", raffle.raffle_index, winner_pubkey);
    Ok(())
}
