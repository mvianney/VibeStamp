use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct StakeBadgeForRaffle<'info> {
    #[account(
        mut,
        seeds = [b"raffle", raffle.merchant.as_ref(), raffle.raffle_index.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        mut,
        seeds = [b"loyalty_card", raffle.merchant.as_ref(), customer.key().as_ref()],
        bump = loyalty_card.bump
    )]
    pub loyalty_card: Account<'info, LoyaltyCard>,

    #[account(mut)]
    pub customer: Signer<'info>,
}

pub fn handler(ctx: Context<StakeBadgeForRaffle>, badge_index: u8) -> Result<()> {
    let raffle = &mut ctx.accounts.raffle;
    let card = &mut ctx.accounts.loyalty_card;
    let now = Clock::get()?.unix_timestamp;

    require!(raffle.active, LoyaltyError::RaffleNotActive);
    require!(now < raffle.closes_at, LoyaltyError::RaffleClosed);
    require!(raffle.staked_entries.len() < MAX_RAFFLE_ENTRIES, LoyaltyError::RaffleFull);
    require!(badge_index < 10, LoyaltyError::BadgeNotUnlocked);
    require!(card.achievements[badge_index as usize], LoyaltyError::BadgeNotUnlocked);

    // Cross-raffle lock: if already staked in a different raffle, reject
    if let Some(locked_raffle) = card.staked_badge_raffle {
        require!(locked_raffle == raffle.key(), LoyaltyError::BadgeCurrentlyStaked);
    }

    // Prevent staking the exact same badge multiple times in the same raffle
    for (i, staker) in raffle.staked_entries.iter().enumerate() {
        if staker == &ctx.accounts.customer.key() && raffle.staked_badges[i] == badge_index {
            return err!(LoyaltyError::BadgeAlreadyStaked);
        }
    }

    raffle.staked_entries.push(ctx.accounts.customer.key());
    raffle.staked_badges.push(badge_index);

    // Lock the badge to this raffle
    card.staked_badge_raffle = Some(raffle.key());

    Ok(())
}
