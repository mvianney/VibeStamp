use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializePassport<'info> {
    #[account(
        init,
        payer = payer,
        space = PassportState::SPACE,
        seeds = [b"passport", customer.key().as_ref()],
        bump
    )]
    pub passport: Account<'info, PassportState>,

    /// CHECK: The customer wallet for which passport is being created
    pub customer: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePassport>) -> Result<()> {
    let passport = &mut ctx.accounts.passport;
    let now = Clock::get()?.unix_timestamp;

    passport.customer = ctx.accounts.customer.key();
    passport.total_stores_visited = 0;
    passport.total_stamp_earned_lifetime = 0;
    passport.total_badges_unlocked = 0;
    passport.first_visit_timestamp = now;
    passport.last_updated = now;
    passport.bump = ctx.bumps.passport;

    Ok(())
}
