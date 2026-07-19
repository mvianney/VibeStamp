use anchor_lang::prelude::*;

#[error_code]
pub enum LoyaltyError {
    #[msg("Earn rate must be between 10 and 100 STAMP per 0.01 SOL.")]
    InvalidPointRate,
    #[msg("Redemption rate must be between 500 and 5000 STAMP per $1 discount.")]
    InvalidRedemptionRate,
    #[msg("Customer has insufficient points balance.")]
    InsufficientPoints,
    #[msg("Redemption points must be at least the merchant's redemption rate ($1 equivalent).")]
    BelowMinimumRedemption,
    #[msg("Points exchange agreement is inactive.")]
    ExchangeNotActive,
    #[msg("Math calculation overflowed.")]
    MathOverflow,
    #[msg("Raffle is inactive.")]
    RaffleNotActive,
    #[msg("Raffle has closed or expired.")]
    RaffleClosed,
    #[msg("Raffle is still active and cannot be drawn yet.")]
    RaffleNotClosedYet,
    #[msg("Raffle entries are full.")]
    RaffleFull,
    #[msg("Selected achievement badge has not been unlocked by the customer.")]
    BadgeNotUnlocked,
    #[msg("Selected achievement badge has already been staked in this raffle.")]
    BadgeAlreadyStaked,
    #[msg("Badge is already staked in another active raffle.")]
    BadgeCurrentlyStaked,
    #[msg("No entries found in this raffle.")]
    NoStakerInRaffle,
    #[msg("Customer has already claimed a referral bonus at this store.")]
    ReferralAlreadyClaimed,
    #[msg("The provided card does not belong to this customer.")]
    InvalidCustomerCard,
}
