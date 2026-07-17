use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(merchant_b: Pubkey)]
pub struct InitializeExchangeAgreement<'info> {
    #[account(
        init,
        payer = merchant_a,
        space = ExchangeAgreement::SPACE,
        seeds = [b"exchange", merchant_a.key().as_ref(), merchant_b.as_ref()],
        bump
    )]
    pub exchange_agreement: Account<'info, ExchangeAgreement>,

    #[account(mut)]
    pub merchant_a: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeExchangeAgreement>,
    merchant_b: Pubkey,
    rate_a_to_b: u64,
    rate_b_to_a: u64,
) -> Result<()> {
    let agreement = &mut ctx.accounts.exchange_agreement;
    agreement.merchant_a = ctx.accounts.merchant_a.key();
    agreement.merchant_b = merchant_b;
    agreement.rate_a_to_b = rate_a_to_b;
    agreement.rate_b_to_a = rate_b_to_a;
    agreement.active = true;
    agreement.bump = ctx.bumps.exchange_agreement;

    Ok(())
}
