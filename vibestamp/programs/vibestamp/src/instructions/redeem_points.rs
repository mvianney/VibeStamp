use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct RedeemPoints<'info> {
    #[account(
        mut,
        seeds = [b"loyalty_card", merchant_state.key().as_ref(), customer.key().as_ref()],
        bump = loyalty_card.bump
    )]
    pub loyalty_card: Account<'info, LoyaltyCard>,

    #[account(
        seeds = [b"merchant", merchant_state.owner.as_ref()],
        bump = merchant_state.bump
    )]
    pub merchant_state: Account<'info, MerchantState>,

    #[account(mut)]
    pub customer: Signer<'info>,
}

pub fn handler(ctx: Context<RedeemPoints>, points_to_redeem: u64) -> Result<()> {
    let card = &mut ctx.accounts.loyalty_card;
    let merchant = &ctx.accounts.merchant_state;

    require!(card.stamp_balance >= points_to_redeem, LoyaltyError::InsufficientPoints);
    require!(points_to_redeem >= merchant.redemption_rate, LoyaltyError::BelowMinimumRedemption);

    card.stamp_balance = card.stamp_balance.saturating_sub(points_to_redeem);

    // After point deduction, check if they get downgraded (optional, usually tier is permanent lifetime but let's update dynamically)
    card.tier = match card.stamp_balance {
        0..=4_999 => Tier::Bronze,
        5_000..=19_999 => Tier::Silver,
        _ => Tier::Gold,
    };

    Ok(())
}
