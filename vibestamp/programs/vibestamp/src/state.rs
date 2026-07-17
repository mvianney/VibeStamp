use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tier {
    Bronze,
    Silver,
    Gold,
}

#[account]
pub struct MerchantState {
    pub owner: Pubkey,
    pub store_name: String,         // max 50 chars
    pub point_rate: u64,            // STAMP per 0.01 SOL (range 10 to 100)
    pub redemption_rate: u64,       // STAMP per $1 discount (range 500 to 5000)
    pub referral_bonus_stamp: u64,  // welcome reward points for holding existing badges
    pub total_customers: u32,
    pub total_volume_lamports: u64,
    pub bump: u8,
}

impl MerchantState {
    pub const SPACE: usize = 8 + 32 + (4 + 50) + 8 + 8 + 8 + 4 + 8 + 1;
}

#[account]
pub struct LoyaltyCard {
    pub merchant: Pubkey,
    pub customer: Pubkey,
    pub stamp_balance: u64,
    pub tier: Tier,
    pub streak_count: u8,
    pub last_purchase_ts: i64,
    pub total_purchases: u32,
    pub total_spent_lamports: u64,
    pub achievements: [bool; 10],
    pub referral_claimed: bool,
    pub bump: u8,
}

impl LoyaltyCard {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1 + 1 + 8 + 4 + 8 + 10 + 1 + 1;
}

#[account]
pub struct ExchangeAgreement {
    pub merchant_a: Pubkey,
    pub merchant_b: Pubkey,
    pub rate_a_to_b: u64,           // base 100 (e.g. 100 = 1:1, 50 = 2:1 A to B, 200 = 1:2 A to B)
    pub rate_b_to_a: u64,
    pub active: bool,
    pub bump: u8,
}

impl ExchangeAgreement {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

pub const MAX_RAFFLE_ENTRIES: usize = 50;

#[account]
pub struct Raffle {
    pub merchant: Pubkey,
    pub raffle_index: u64,
    pub prize_lamports: u64,
    pub closes_at: i64,
    pub staked_entries: Vec<Pubkey>,
    pub staked_badges: Vec<u8>,
    pub winner: Option<Pubkey>,
    pub active: bool,
    pub bump: u8,
}

impl Raffle {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 8 + (4 + MAX_RAFFLE_ENTRIES * 32) + (4 + MAX_RAFFLE_ENTRIES * 1) + 33 + 1 + 1;
}

#[account]
pub struct PassportState {
    pub customer: Pubkey,
    pub total_stores_visited: u32,
    pub total_stamp_earned_lifetime: u64,
    pub total_badges_unlocked: u32,
    pub first_visit_timestamp: i64,
    pub last_updated: i64,
    pub bump: u8,
}

impl PassportState {
    pub const SPACE: usize = 8 + 32 + 4 + 8 + 4 + 8 + 8 + 1;
}

