import { Connection, PublicKey } from '@solana/web3.js';

export type Tier = 'Bronze' | 'Silver' | 'Gold';

export interface LoyaltyCard {
  merchant: string;
  customer: string;
  stampBalance: number;
  tier: Tier;
  streakCount: number;
  lastPurchaseTs: number;
  totalPurchases: number;
  totalSpentLamports: number;
  achievements: boolean[]; // 10 achievements
}

export interface MerchantState {
  owner: string;
  storeName: string;
  pointRate: number;
  redemptionRate: number;
  totalCustomers: number;
  totalVolumeLamports: number;
}

/**
 * Reads the actual lamport amount from a confirmed transaction.
 * Authoritative on-chain query to ensure the merchant awards points based on the actual transfer.
 */
export const getActualTxAmountLamports = async (
  connection: Connection,
  txSignature: string,
  recipientPubkey: PublicKey
): Promise<number> => {
  const tx = await connection.getTransaction(txSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || !tx.meta) {
    throw new Error('Transaction not found or missing metadata on-chain');
  }

  const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;
  const idx = accountKeys.findIndex(k => k.equals(recipientPubkey));
  if (idx === -1) {
    throw new Error('Recipient merchant address not found in transaction accounts');
  }

  const pre = tx.meta.preBalances[idx];
  const post = tx.meta.postBalances[idx];
  return post - pre; // Actual lamports received by the merchant
};

/**
 * SIMULATED ON-CHAIN OPERATIONS
 * Storing data in localStorage under 'vibestamp_sim_state' to enable interactive prototyping
 * until the Anchor program is deployed.
 */
const getSimData = () => {
  try {
    const raw = localStorage.getItem('vibestamp_sim_state');
    return raw ? JSON.parse(raw) : { merchants: {}, loyaltyCards: {} };
  } catch {
    return { merchants: {}, loyaltyCards: {} };
  }
};

const saveSimData = (data: any) => {
  localStorage.setItem('vibestamp_sim_state', JSON.stringify(data));
};

export const getMerchantState = async (merchantPubkey: string): Promise<MerchantState | null> => {
  const data = getSimData();
  const m = data.merchants[merchantPubkey];
  if (!m) {
    // If not in state, look in vibestamp_merchant_profile as a fallback
    const savedProfile = localStorage.getItem('vibestamp_merchant_profile');
    if (savedProfile) {
      try {
        const p = JSON.parse(savedProfile);
        if (p.walletPublicKey === merchantPubkey) {
          const newState: MerchantState = {
            owner: p.walletPublicKey,
            storeName: p.storeName,
            pointRate: p.pointRate,
            redemptionRate: p.redemptionRate,
            totalCustomers: 0,
            totalVolumeLamports: 0,
          };
          data.merchants[merchantPubkey] = newState;
          saveSimData(data);
          return newState;
        }
      } catch {}
    }
    return null;
  }
  return m;
};

export const initializeMerchantState = async (
  merchantPubkey: string,
  storeName: string,
  pointRate: number,
  redemptionRate: number
): Promise<MerchantState> => {
  const data = getSimData();
  const newState: MerchantState = {
    owner: merchantPubkey,
    storeName,
    pointRate,
    redemptionRate,
    totalCustomers: 0,
    totalVolumeLamports: 0,
  };
  data.merchants[merchantPubkey] = newState;
  saveSimData(data);
  return newState;
};

export const getMerchantCustomers = async (merchantPubkey: string): Promise<LoyaltyCard[]> => {
  const data = getSimData();
  const cards: LoyaltyCard[] = [];
  for (const key in data.loyaltyCards) {
    const card = data.loyaltyCards[key];
    if (card.merchant === merchantPubkey) {
      cards.push(card);
    }
  }
  return cards.sort((a, b) => b.lastPurchaseTs - a.lastPurchaseTs);
};

export const getLoyaltyCard = async (
  merchantPubkey: string,
  customerPubkey: string
): Promise<LoyaltyCard | null> => {
  const data = getSimData();
  const key = `${merchantPubkey}_${customerPubkey}`;
  return data.loyaltyCards[key] || null;
};

export const recordPurchase = async (
  merchantPubkey: string,
  customerPubkey: string,
  amountLamports: number,
  txSignature?: string
): Promise<{ card: LoyaltyCard; pointsEarned: number; streakBonus: number; tierBonus: number }> => {
  const data = getSimData();
  const key = `${merchantPubkey}_${customerPubkey}`;
  const now = Math.floor(Date.now() / 1000);

  if (!data.processedSignatures) {
    data.processedSignatures = {};
  }

  if (txSignature && data.processedSignatures[txSignature]) {
    const cached = data.processedSignatures[txSignature];
    const currentCard: LoyaltyCard = data.loyaltyCards[key] || {
      merchant: merchantPubkey,
      customer: customerPubkey,
      stampBalance: 0,
      tier: 'Bronze',
      streakCount: 0,
      lastPurchaseTs: 0,
      totalPurchases: 0,
      totalSpentLamports: 0,
      achievements: Array(10).fill(false),
    };
    return {
      card: currentCard,
      pointsEarned: cached.pointsEarned,
      streakBonus: cached.streakBonus,
      tierBonus: cached.tierBonus,
    };
  }

  // Fetch or init merchant
  let merchant = data.merchants[merchantPubkey];
  if (!merchant) {
    // fallback initialization
    merchant = {
      owner: merchantPubkey,
      storeName: 'Simulated Store',
      pointRate: 10,
      redemptionRate: 1000,
      totalCustomers: 0,
      totalVolumeLamports: 0,
    };
  }

  // Fetch or init loyalty card
  let card: LoyaltyCard = data.loyaltyCards[key];
  const isNewCustomer = !card;

  if (!card) {
    card = {
      merchant: merchantPubkey,
      customer: customerPubkey,
      stampBalance: 0,
      tier: 'Bronze',
      streakCount: 0,
      lastPurchaseTs: 0,
      totalPurchases: 0,
      totalSpentLamports: 0,
      achievements: Array(10).fill(false),
    };
  }

  // 1. Streak Logic (A week = 7 days. Streak resets if gap > 14 days)
  if (card.lastPurchaseTs > 0) {
    const daysSinceLast = (now - card.lastPurchaseTs) / 86400;
    if (daysSinceLast <= 7) {
      card.streakCount = Math.min(255, card.streakCount + 1);
    } else if (daysSinceLast > 14) {
      card.streakCount = 0;
    }
  } else {
    card.streakCount = 0;
  }

  // Streak bonus: 2 weeks = +25%, 4 weeks = +50%, 8 weeks = +100%
  let streakMultiplier = 0; // percentage
  if (card.streakCount >= 8) {
    streakMultiplier = 100;
  } else if (card.streakCount >= 4) {
    streakMultiplier = 50;
  } else if (card.streakCount >= 2) {
    streakMultiplier = 25;
  }

  // 2. Point Calculations
  let basePoints = 0;
  let bonusPoints = 0;
  let tierBonusPoints = 0;
  let totalPointsEarned = 0;

  if (card.totalPurchases + 1 >= 3) {
    // Base rate: pointRate STAMP per 0.01 SOL (10,000,000 lamports)
    basePoints = Math.floor(amountLamports / 10_000_000) * merchant.pointRate;
    bonusPoints = Math.floor((basePoints * streakMultiplier) / 100);

    // Tier bonus: Silver (+10%), Gold (+25%)
    let tierMultiplier = 0;
    if (card.tier === 'Silver') {
      tierMultiplier = 10;
    } else if (card.tier === 'Gold') {
      tierMultiplier = 25;
    }
    tierBonusPoints = Math.floor((basePoints * tierMultiplier) / 100);
    totalPointsEarned = basePoints + bonusPoints + tierBonusPoints;
  }

  // 3. Update Card Data
  card.stampBalance += totalPointsEarned;
  card.lastPurchaseTs = now;
  card.totalPurchases += 1;
  card.totalSpentLamports += amountLamports;

  // 4. Tier updates
  if (card.stampBalance >= 20000) {
    card.tier = 'Gold';
  } else if (card.stampBalance >= 5000) {
    card.tier = 'Silver';
  } else {
    card.tier = 'Bronze';
  }

  // 5. Achievement Flags
  if (card.totalPurchases >= 1) card.achievements[0] = true;
  if (card.totalPurchases >= 5) card.achievements[1] = true;
  if (card.totalPurchases >= 10) card.achievements[2] = true;
  if (card.totalPurchases >= 25) card.achievements[3] = true;
  if (card.streakCount >= 2) card.achievements[4] = true;
  if (card.streakCount >= 4) card.achievements[5] = true;
  if (card.streakCount >= 8) card.achievements[6] = true;
  if (card.tier === 'Silver') card.achievements[7] = true;
  if (card.tier === 'Gold') card.achievements[8] = true;
  if (amountLamports >= 1_000_000_000) card.achievements[9] = true; // Big Spender (>=1 SOL)

  // 6. Update Merchant Stats
  if (isNewCustomer) {
    merchant.totalCustomers += 1;
  }
  merchant.totalVolumeLamports += amountLamports;

  if (txSignature) {
    data.processedSignatures[txSignature] = {
      pointsEarned: totalPointsEarned,
      streakBonus: bonusPoints,
      tierBonus: tierBonusPoints,
      timestamp: now,
    };
  }

  // Save state
  data.merchants[merchantPubkey] = merchant;
  data.loyaltyCards[key] = card;
  saveSimData(data);

  return {
    card,
    pointsEarned: totalPointsEarned,
    streakBonus: bonusPoints,
    tierBonus: tierBonusPoints,
  };
};

export const redeemPoints = async (
  merchantPubkey: string,
  customerPubkey: string,
  pointsToRedeem: number
): Promise<LoyaltyCard> => {
  const data = getSimData();
  const key = `${merchantPubkey}_${customerPubkey}`;
  const card: LoyaltyCard = data.loyaltyCards[key];
  if (!card) {
    throw new Error('Loyalty card not found');
  }

  if (card.stampBalance < pointsToRedeem) {
    throw new Error('Insufficient points');
  }

  card.stampBalance -= pointsToRedeem;
  data.loyaltyCards[key] = card;
  saveSimData(data);
  return card;
};

export const updateMerchantRates = async (
  merchantPubkey: string,
  pointRate: number,
  redemptionRate: number
): Promise<MerchantState> => {
  const data = getSimData();
  let merchant = data.merchants[merchantPubkey];
  if (!merchant) {
    merchant = {
      owner: merchantPubkey,
      storeName: 'Simulated Store',
      pointRate: 10,
      redemptionRate: 1000,
      totalCustomers: 0,
      totalVolumeLamports: 0,
    };
  }
  merchant.pointRate = pointRate;
  merchant.redemptionRate = redemptionRate;
  data.merchants[merchantPubkey] = merchant;
  saveSimData(data);
  return merchant;
};

export const getCustomerLoyaltyCards = async (customerPubkey: string): Promise<LoyaltyCard[]> => {
  const data = getSimData();
  const cards: LoyaltyCard[] = [];
  for (const key in data.loyaltyCards) {
    const card = data.loyaltyCards[key];
    if (card.customer === customerPubkey) {
      cards.push(card);
    }
  }
  return cards.sort((a, b) => b.lastPurchaseTs - a.lastPurchaseTs);
};

