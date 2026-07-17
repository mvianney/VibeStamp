pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2Y171N7NVjqtjguLHrNwXfA5w7yHW4hkJAbNySBw7pmQ");

#[program]
pub mod vibestamp {
    use super::*;

    pub fn initialize_merchant(
        ctx: Context<InitializeMerchant>,
        store_name: String,
        point_rate: u64,
        redemption_rate: u64,
        referral_bonus_stamp: u64,
    ) -> Result<()> {
        instructions::initialize_merchant::handler(ctx, store_name, point_rate, redemption_rate, referral_bonus_stamp)
    }

    pub fn update_merchant(
        ctx: Context<UpdateMerchant>,
        store_name: String,
        point_rate: u64,
        redemption_rate: u64,
        referral_bonus_stamp: u64,
    ) -> Result<()> {
        instructions::update_merchant::handler(ctx, store_name, point_rate, redemption_rate, referral_bonus_stamp)
    }

    pub fn record_purchase(ctx: Context<RecordPurchase>, amount_lamports: u64) -> Result<()> {
        instructions::record_purchase::handler(ctx, amount_lamports)
    }

    pub fn redeem_points(ctx: Context<RedeemPoints>, points_to_redeem: u64) -> Result<()> {
        instructions::redeem_points::handler(ctx, points_to_redeem)
    }

    pub fn initialize_exchange_agreement(
        ctx: Context<InitializeExchangeAgreement>,
        merchant_b: Pubkey,
        rate_a_to_b: u64,
        rate_b_to_a: u64,
    ) -> Result<()> {
        instructions::initialize_exchange_agreement::handler(ctx, merchant_b, rate_a_to_b, rate_b_to_a)
    }

    pub fn exchange_points(ctx: Context<ExchangePoints>, points_to_exchange: u64) -> Result<()> {
        instructions::exchange_points::handler(ctx, points_to_exchange)
    }

    pub fn create_raffle(
        ctx: Context<CreateRaffle>,
        raffle_index: u64,
        prize_lamports: u64,
        duration_seconds: u64,
    ) -> Result<()> {
        instructions::create_raffle::handler(ctx, raffle_index, prize_lamports, duration_seconds)
    }

    pub fn stake_badge_for_raffle(ctx: Context<StakeBadgeForRaffle>, badge_index: u8) -> Result<()> {
        instructions::stake_badge_for_raffle::handler(ctx, badge_index)
    }

    pub fn draw_raffle(ctx: Context<DrawRaffle>) -> Result<()> {
        instructions::draw_raffle::handler(ctx)
    }

    pub fn initialize_passport(ctx: Context<InitializePassport>) -> Result<()> {
        instructions::initialize_passport::handler(ctx)
    }
}
