use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct ExchangePoints<'info> {
    #[account(
        mut,
        seeds = [b"loyalty_card", exchange_agreement.merchant_a.as_ref(), customer.key().as_ref()],
        bump = loyalty_card_a.bump
    )]
    pub loyalty_card_a: Account<'info, LoyaltyCard>,

    #[account(
        init_if_needed,
        payer = customer,
        space = LoyaltyCard::SPACE,
        seeds = [b"loyalty_card", exchange_agreement.merchant_b.as_ref(), customer.key().as_ref()],
        bump
    )]
    pub loyalty_card_b: Account<'info, LoyaltyCard>,

    #[account(
        seeds = [b"exchange", exchange_agreement.merchant_a.as_ref(), exchange_agreement.merchant_b.as_ref()],
        bump = exchange_agreement.bump
    )]
    pub exchange_agreement: Account<'info, ExchangeAgreement>,

    #[account(mut)]
    pub customer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ExchangePoints>, points_to_exchange: u64) -> Result<()> {
    let card_a = &mut ctx.accounts.loyalty_card_a;
    let card_b = &mut ctx.accounts.loyalty_card_b;
    let agreement = &ctx.accounts.exchange_agreement;

    require!(agreement.active, LoyaltyError::ExchangeNotActive);
    require!(card_a.stamp_balance >= points_to_exchange, LoyaltyError::InsufficientPoints);

    // If card_b was just created, initialize its fields
    if card_b.total_purchases == 0 {
        card_b.merchant = agreement.merchant_b;
        card_b.customer = ctx.accounts.customer.key();
        card_b.stamp_balance = 0;
        card_b.tier = Tier::Bronze;
        card_b.streak_count = 0;
        card_b.last_purchase_ts = 0;
        card_b.total_purchases = 0;
        card_b.total_spent_lamports = 0;
        card_b.achievements = [false; 10];
        card_b.referral_claimed = false;
        card_b.bump = ctx.bumps.loyalty_card_b;
    }

    // Math: points_to_b = (points_to_exchange * rate_a_to_b) / 100
    let points_to_b = points_to_exchange
        .checked_mul(agreement.rate_a_to_b)
        .and_then(|val| val.checked_div(100))
        .ok_or(LoyaltyError::MathOverflow)?;

    card_a.stamp_balance = card_a.stamp_balance.saturating_sub(points_to_exchange);
    card_b.stamp_balance = card_b.stamp_balance.saturating_add(points_to_b);

    // Update tier levels
    card_a.tier = match card_a.stamp_balance {
        0..=4_999 => Tier::Bronze,
        5_000..=19_999 => Tier::Silver,
        _ => Tier::Gold,
    };

    card_b.tier = match card_b.stamp_balance {
        0..=4_999 => Tier::Bronze,
        5_000..=19_999 => Tier::Silver,
        _ => Tier::Gold,
    };

    Ok(())
}
