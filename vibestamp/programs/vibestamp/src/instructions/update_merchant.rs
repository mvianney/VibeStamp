use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct UpdateMerchant<'info> {
    #[account(
        mut,
        seeds = [b"merchant", owner.key().as_ref()],
        bump = merchant_state.bump,
        has_one = owner
    )]
    pub merchant_state: Account<'info, MerchantState>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateMerchant>,
    store_name: String,
    point_rate: u64,
    redemption_rate: u64,
    referral_bonus_stamp: u64,
) -> Result<()> {
    require!(point_rate >= 10 && point_rate <= 100, LoyaltyError::InvalidPointRate);
    require!(redemption_rate >= 500 && redemption_rate <= 5000, LoyaltyError::InvalidRedemptionRate);

    let merchant = &mut ctx.accounts.merchant_state;
    merchant.store_name = if store_name.len() > 50 { store_name[..50].to_string() } else { store_name };
    merchant.point_rate = point_rate;
    merchant.redemption_rate = redemption_rate;
    merchant.referral_bonus_stamp = referral_bonus_stamp;

    Ok(())
}
