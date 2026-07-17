use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct RecordPurchase<'info> {
    #[account(
        init_if_needed,
        payer = merchant_signer,
        space = LoyaltyCard::SPACE,
        seeds = [b"loyalty_card", merchant_signer.key().as_ref(), customer.key().as_ref()],
        bump
    )]
    pub loyalty_card: Account<'info, LoyaltyCard>,

    #[account(
        mut,
        seeds = [b"merchant", merchant_signer.key().as_ref()],
        bump = merchant_state.bump
    )]
    pub merchant_state: Account<'info, MerchantState>,

    #[account(mut)]
    pub merchant_signer: Signer<'info>,

    /// CHECK: customer wallet, verified by PDA seeds
    pub customer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RecordPurchase>, amount_lamports: u64) -> Result<()> {
    let card = &mut ctx.accounts.loyalty_card;
    let merchant = &mut ctx.accounts.merchant_state;
    let now = Clock::get()?.unix_timestamp;

    let is_new_customer = card.total_purchases == 0;

    if is_new_customer {
        card.merchant = merchant.key();
        card.customer = ctx.accounts.customer.key();
        card.stamp_balance = 0;
        card.tier = Tier::Bronze;
        card.streak_count = 0;
        card.last_purchase_ts = 0;
        card.total_purchases = 0;
        card.total_spent_lamports = 0;
        card.achievements = [false; 10];
        card.referral_claimed = false;
        card.bump = ctx.bumps.loyalty_card;
    }

    // 1. Streak Logic (7 days consecutive, reset if > 14 days gap)
    if card.last_purchase_ts > 0 {
        let diff_seconds = now - card.last_purchase_ts;
        let days_since_last = diff_seconds / 86400;
        if days_since_last <= 7 {
            card.streak_count = card.streak_count.saturating_add(1);
        } else if days_since_last > 14 {
            card.streak_count = 0;
        }
    } else {
        card.streak_count = 0;
    }

    let streak_bonus_percent: u64 = match card.streak_count {
        8.. => 100,
        4..=7 => 50,
        2..=3 => 25,
        _ => 0,
    };

    // 2. Base Point Calculation (amount / 10_000_000 * point_rate)
    let base_points = (amount_lamports / 10_000_000).saturating_mul(merchant.point_rate);
    let streak_bonus = base_points.saturating_mul(streak_bonus_percent) / 100;

    // 3. Tier Multiplier (Silver +10%, Gold +25%)
    let tier_multiplier = match card.tier {
        Tier::Silver => 10,
        Tier::Gold => 25,
        Tier::Bronze => 0,
    };
    let tier_bonus = base_points.saturating_mul(tier_multiplier) / 100;

    let total_earned = base_points.saturating_add(streak_bonus).saturating_add(tier_bonus);
    card.stamp_balance = card.stamp_balance.saturating_add(total_earned);

    card.last_purchase_ts = now;
    card.total_purchases = card.total_purchases.saturating_add(1);
    card.total_spent_lamports = card.total_spent_lamports.saturating_add(amount_lamports);

    // 4. Check Referral Welcome Bonus via Remaining Accounts
    // The client can supply any other valid LoyaltyCard belonging to the customer
    if !card.referral_claimed && !ctx.remaining_accounts.is_empty() {
        let other_card_info = &ctx.remaining_accounts[0];
        if other_card_info.owner == ctx.program_id {
            // Attempt to deserialize it as a LoyaltyCard
            if let Ok(other_card) = Account::<LoyaltyCard>::try_from(other_card_info) {
                // Ensure it belongs to the customer and is not this same merchant card
                if other_card.customer == card.customer && other_card.merchant != card.merchant {
                    // Check if other card has active history (meaning they are already an active participant)
                    if other_card.total_purchases > 0 {
                        // Grant one-time referral welcome bonus points!
                        card.stamp_balance = card.stamp_balance.saturating_add(merchant.referral_bonus_stamp);
                        card.referral_claimed = true;
                        msg!("Referral welcome bonus of {} STAMP granted from other card of merchant: {:?}", merchant.referral_bonus_stamp, other_card.merchant);
                    }
                }
            }
        }
    }

    // 5. Tier Upgrade Check
    card.tier = match card.stamp_balance {
        0..=4_999 => Tier::Bronze,
        5_000..=19_999 => Tier::Silver,
        _ => Tier::Gold,
    };

    // 6. Update Merchant Totals
    if is_new_customer {
        merchant.total_customers = merchant.total_customers.saturating_add(1);
    }
    merchant.total_volume_lamports = merchant.total_volume_lamports.saturating_add(amount_lamports);

    // 7. Achievement Check
    if card.total_purchases >= 1  { card.achievements[0] = true; } // First Step
    if card.total_purchases >= 5  { card.achievements[1] = true; } // Stamp Collector
    if card.total_purchases >= 10 { card.achievements[2] = true; } // Loyal Fan
    if card.total_purchases >= 25 { card.achievements[3] = true; } // Super Fan
    if card.streak_count >= 2     { card.achievements[4] = true; } // Streak Starter
    if card.streak_count >= 4     { card.achievements[5] = true; } // Streak Master
    if card.streak_count >= 8     { card.achievements[6] = true; } // Unstoppable
    if card.tier == Tier::Silver  { card.achievements[7] = true; } // Silver Member
    if card.tier == Tier::Gold    { card.achievements[8] = true; } // Gold Member
    if amount_lamports >= 1_000_000_000 { card.achievements[9] = true; } // Big Spender

    Ok(())
}
