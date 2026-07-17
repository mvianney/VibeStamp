use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;

#[derive(Accounts)]
#[instruction(raffle_index: u64)]
pub struct CreateRaffle<'info> {
    #[account(
        init,
        payer = merchant,
        space = Raffle::SPACE,
        seeds = [b"raffle", merchant.key().as_ref(), raffle_index.to_le_bytes().as_ref()],
        bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(mut)]
    pub merchant: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateRaffle>,
    raffle_index: u64,
    prize_lamports: u64,
    duration_seconds: u64,
) -> Result<()> {
    let raffle = &mut ctx.accounts.raffle;
    let now = Clock::get()?.unix_timestamp;

    raffle.merchant = ctx.accounts.merchant.key();
    raffle.raffle_index = raffle_index;
    raffle.prize_lamports = prize_lamports;
    raffle.closes_at = now.saturating_add(duration_seconds as i64);
    raffle.staked_entries = Vec::new();
    raffle.staked_badges = Vec::new();
    raffle.winner = None;
    raffle.active = true;
    raffle.bump = ctx.bumps.raffle;

    // Fund the Raffle PDA with the prize lamports from the merchant's wallet
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.key(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.merchant.to_account_info(),
            to: ctx.accounts.raffle.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_context, prize_lamports)?;

    Ok(())
}
