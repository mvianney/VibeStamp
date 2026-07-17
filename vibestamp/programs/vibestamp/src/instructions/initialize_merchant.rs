use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
#[instruction(store_name: String, point_rate: u64, redemption_rate: u64)]
pub struct InitializeMerchant<'info> {
    #[account(
        init,
        payer = signer,
        space = MerchantState::SPACE,
        seeds = [b"merchant", signer.key().as_ref()],
        bump
    )]
    pub merchant_state: Account<'info, MerchantState>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeMerchant>,
    store_name: String,
    point_rate: u64,
    redemption_rate: u64,
    referral_bonus_stamp: u64,
) -> Result<()> {
    require!(point_rate >= 10 && point_rate <= 100, LoyaltyError::InvalidPointRate);
    require!(redemption_rate >= 500 && redemption_rate <= 5000, LoyaltyError::InvalidRedemptionRate);

    let merchant = &mut ctx.accounts.merchant_state;
    merchant.owner = ctx.accounts.signer.key();
    merchant.store_name = if store_name.len() > 50 { store_name[..50].to_string() } else { store_name };
    merchant.point_rate = point_rate;
    merchant.redemption_rate = redemption_rate;
    merchant.referral_bonus_stamp = referral_bonus_stamp;
    merchant.total_customers = 0;
    merchant.total_volume_lamports = 0;
    merchant.bump = ctx.bumps.merchant_state;

    Ok(())
}
