import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import idl from './idl/vibestamp.json';

// Deployed Program ID
export const PROGRAM_ID = new PublicKey('2Y171N7NVjqtjguLHrNwXfA5w7yHW4hkJAbNySBw7pmQ');

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
  referralClaimed: boolean;
  stakedBadgeRaffle: string | null;
}

export interface MerchantState {
  owner: string;
  storeName: string;
  pointRate: number;
  redemptionRate: number;
  referralBonusStamp: number;
  totalCustomers: number;
  totalVolumeLamports: number;
}

export interface ExchangeAgreement {
  merchantA: string;
  merchantB: string;
  rateAToB: number;
  rateBToA: number;
  active: boolean;
}

export interface RaffleState {
  merchant: string;
  raffleIndex: number;
  prizeLamports: number;
  closesAt: number;
  stakedEntries: string[];
  stakedBadges: number[];
  winner: string | null;
  active: boolean;
}

export interface PassportState {
  customer: string;
  totalStoresVisited: number;
  totalStampEarnedLifetime: number;
  totalBadgesUnlocked: number;
  firstVisitTimestamp: number;
  lastUpdated: number;
  bump: number;
}

// Helper to instantiate Anchor Program using client keypair
const getProgram = (connection: Connection, walletKeypair?: Keypair): any => {
  const wallet = walletKeypair ? {
    publicKey: walletKeypair.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.partialSign(walletKeypair);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach(tx => tx.partialSign(walletKeypair));
      return txs;
    }
  } : {
    publicKey: PublicKey.default,
    signTransaction: async (tx: Transaction) => tx,
    signAllTransactions: async (txs: Transaction[]) => txs
  };

  const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  return new Program(idl as any, provider);
};

// ─── PDA Derivation Helpers ──────────────────────────────────────────────────

export const getMerchantStatePda = (merchantOwner: PublicKey): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('merchant'), merchantOwner.toBuffer()],
    PROGRAM_ID
  )[0];
};

export const getLoyaltyCardPda = (merchantOwner: PublicKey, customer: PublicKey): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('loyalty_card'), merchantOwner.toBuffer(), customer.toBuffer()],
    PROGRAM_ID
  )[0];
};

export const getExchangeAgreementPda = (merchantA: PublicKey, merchantB: PublicKey): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('exchange'), merchantA.toBuffer(), merchantB.toBuffer()],
    PROGRAM_ID
  )[0];
};

export const getRafflePda = (merchantOwner: PublicKey, raffleIndex: number): PublicKey => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(raffleIndex));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('raffle'), merchantOwner.toBuffer(), buffer],
    PROGRAM_ID
  )[0];
};

export const getPassportPda = (customer: PublicKey): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('passport'), customer.toBuffer()],
    PROGRAM_ID
  )[0];
};

// ─── On-Chain RPC Methods ────────────────────────────────────────────────────

export const getMerchantState = async (
  connection: Connection,
  merchantPubkey: string
): Promise<MerchantState | null> => {
  try {
    const program = getProgram(connection);
    const pda = getMerchantStatePda(new PublicKey(merchantPubkey));
    const state: any = await program.account.merchantState.fetch(pda);
    return {
      owner: state.owner.toBase58(),
      storeName: state.storeName,
      pointRate: state.pointRate.toNumber(),
      redemptionRate: state.redemptionRate.toNumber(),
      referralBonusStamp: state.referralBonusStamp.toNumber(),
      totalCustomers: state.totalCustomers,
      totalVolumeLamports: state.totalVolumeLamports.toNumber(),
    };
  } catch (e) {
    console.warn(`MerchantState account not found for ${merchantPubkey}:`, e);
    return null;
  }
};

export const initializeMerchantState = async (
  connection: Connection,
  signerKeypair: Keypair,
  storeName: string,
  pointRate: number,
  redemptionRate: number,
  referralBonusStamp: number
): Promise<string> => {
  const program = getProgram(connection, signerKeypair);
  const pda = getMerchantStatePda(signerKeypair.publicKey);
  
  const tx = await program.methods
    .initializeMerchant(storeName, new BN(pointRate), new BN(redemptionRate), new BN(referralBonusStamp))
    .accounts({
      merchantState: pda,
      signer: signerKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([signerKeypair])
    .rpc();
  return tx;
};

export const getLoyaltyCard = async (
  connection: Connection,
  merchantPubkey: string,
  customerPubkey: string
): Promise<LoyaltyCard | null> => {
  try {
    const program = getProgram(connection);
    const pda = getLoyaltyCardPda(new PublicKey(merchantPubkey), new PublicKey(customerPubkey));
    const card: any = await program.account.loyaltyCard.fetch(pda);
    return {
      merchant: card.merchant.toBase58(),
      customer: card.customer.toBase58(),
      stampBalance: card.stampBalance.toNumber(),
      tier: card.tier.hasOwnProperty('gold') ? 'Gold' : card.tier.hasOwnProperty('silver') ? 'Silver' : 'Bronze',
      streakCount: card.streakCount,
      lastPurchaseTs: card.lastPurchaseTs.toNumber(),
      totalPurchases: card.totalPurchases,
      totalSpentLamports: card.totalSpentLamports.toNumber(),
      achievements: card.achievements,
      referralClaimed: card.referralClaimed,
      stakedBadgeRaffle: card.stakedBadgeRaffle ? card.stakedBadgeRaffle.toBase58() : null,
    };
  } catch (e) {
    return null;
  }
};

export const getMerchantCustomers = async (
  connection: Connection,
  merchantPubkey: string
): Promise<LoyaltyCard[]> => {
  try {
    const program = getProgram(connection);
    // LoyaltyCard merchant field starts at offset 8 (discriminator is 8 bytes)
    const list = await program.account.loyaltyCard.all([
      { memcmp: { offset: 8, bytes: merchantPubkey } }
    ]);
    return list.map((item: any) => {
      const card = item.account as any;
      return {
        merchant: card.merchant.toBase58(),
        customer: card.customer.toBase58(),
        stampBalance: card.stampBalance.toNumber(),
        tier: card.tier.hasOwnProperty('gold') ? 'Gold' : card.tier.hasOwnProperty('silver') ? 'Silver' : 'Bronze',
        streakCount: card.streakCount,
        lastPurchaseTs: card.lastPurchaseTs.toNumber(),
        totalPurchases: card.totalPurchases,
        totalSpentLamports: card.totalSpentLamports.toNumber(),
        achievements: card.achievements,
        referralClaimed: card.referralClaimed,
        stakedBadgeRaffle: card.stakedBadgeRaffle ? card.stakedBadgeRaffle.toBase58() : null,
      };
    }).sort((a: any, b: any) => b.lastPurchaseTs - a.lastPurchaseTs);
  } catch (e) {
    console.error('Error fetching merchant customers:', e);
    return [];
  }
};

export const getCustomerLoyaltyCards = async (
  connection: Connection,
  customerPubkey: string
): Promise<LoyaltyCard[]> => {
  try {
    const program = getProgram(connection);
    // LoyaltyCard customer field starts at offset 8 (discriminator) + 32 (merchant pubkey) = 40 bytes
    const list = await program.account.loyaltyCard.all([
      { memcmp: { offset: 40, bytes: customerPubkey } }
    ]);
    return list.map((item: any) => {
      const card = item.account as any;
      return {
        merchant: card.merchant.toBase58(),
        customer: card.customer.toBase58(),
        stampBalance: card.stampBalance.toNumber(),
        tier: card.tier.hasOwnProperty('gold') ? 'Gold' : card.tier.hasOwnProperty('silver') ? 'Silver' : 'Bronze',
        streakCount: card.streakCount,
        lastPurchaseTs: card.lastPurchaseTs.toNumber(),
        totalPurchases: card.totalPurchases,
        totalSpentLamports: card.totalSpentLamports.toNumber(),
        achievements: card.achievements,
        referralClaimed: card.referralClaimed,
        stakedBadgeRaffle: card.stakedBadgeRaffle ? card.stakedBadgeRaffle.toBase58() : null,
      };
    }).sort((a: any, b: any) => b.lastPurchaseTs - a.lastPurchaseTs);
  } catch (e) {
    console.error('Error fetching customer loyalty cards:', e);
    return [];
  }
};

export const recordPurchase = async (
  connection: Connection,
  merchantSignerKeypair: Keypair,
  customerPubkey: string,
  amountLamports: number,
  otherMerchantCardPubkey?: string
): Promise<string> => {
  const program = getProgram(connection, merchantSignerKeypair);
  const customerPublicKey = new PublicKey(customerPubkey);
  const cardPda = getLoyaltyCardPda(merchantSignerKeypair.publicKey, customerPublicKey);
  const merchantPda = getMerchantStatePda(merchantSignerKeypair.publicKey);

  const builder = program.methods
    .recordPurchase(new BN(amountLamports))
    .accounts({
      loyaltyCard: cardPda,
      merchantState: merchantPda,
      passport: getPassportPda(customerPublicKey),
      merchantSigner: merchantSignerKeypair.publicKey,
      customer: customerPublicKey,
      systemProgram: SystemProgram.programId,
    });

  if (otherMerchantCardPubkey) {
    builder.remainingAccounts([
      {
        pubkey: new PublicKey(otherMerchantCardPubkey),
        isWritable: false,
        isSigner: false,
      }
    ]);
  }

  const tx = await builder.signers([merchantSignerKeypair]).rpc();
  return tx;
};

export const redeemPoints = async (
  connection: Connection,
  customerKeypair: Keypair,
  merchantPubkey: string,
  pointsToRedeem: number
): Promise<string> => {
  const program = getProgram(connection, customerKeypair);
  const merchantPublicKey = new PublicKey(merchantPubkey);
  const cardPda = getLoyaltyCardPda(merchantPublicKey, customerKeypair.publicKey);
  const merchantPda = getMerchantStatePda(merchantPublicKey);

  const tx = await program.methods
    .redeemPoints(new BN(pointsToRedeem))
    .accounts({
      loyaltyCard: cardPda,
      merchantState: merchantPda,
      customer: customerKeypair.publicKey,
    })
    .signers([customerKeypair])
    .rpc();
  return tx;
};

export const updateMerchantRates = async (
  connection: Connection,
  merchantKeypair: Keypair,
  pointRate: number,
  redemptionRate: number,
  referralBonusStamp: number
): Promise<string> => {
  const program = getProgram(connection, merchantKeypair);
  const pda = getMerchantStatePda(merchantKeypair.publicKey);
  const storeName = await storeNameFromStateOrParams(program, pda);

  const tx = await program.methods
    .updateMerchant(storeName, new BN(pointRate), new BN(redemptionRate), new BN(referralBonusStamp))
    .accounts({
      merchantState: pda,
      owner: merchantKeypair.publicKey,
    } as any)
    .signers([merchantKeypair])
    .rpc();
  return tx;
};

const storeNameFromStateOrParams = async (program: any, pda: PublicKey): Promise<string> => {
  try {
    const s = await program.account.merchantState.fetch(pda);
    return s.storeName;
  } catch {
    return "Store";
  }
};

// ─── Points Exchange Agreement Methods ───────────────────────────────────────

export const initializeExchangeAgreement = async (
  connection: Connection,
  merchantAKeypair: Keypair,
  merchantBPubkey: string,
  rateAToB: number,
  rateBToA: number
): Promise<string> => {
  const program = getProgram(connection, merchantAKeypair);
  const merchantBPublicKey = new PublicKey(merchantBPubkey);
  const agreementPda = getExchangeAgreementPda(merchantAKeypair.publicKey, merchantBPublicKey);

  const tx = await program.methods
    .initializeExchangeAgreement(merchantBPublicKey, new BN(rateAToB), new BN(rateBToA))
    .accounts({
      exchangeAgreement: agreementPda,
      merchantA: merchantAKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchantAKeypair])
    .rpc();
  return tx;
};

export const getExchangeAgreement = async (
  connection: Connection,
  merchantAOwner: string,
  merchantBOwner: string
): Promise<ExchangeAgreement | null> => {
  try {
    const program = getProgram(connection);
    const pda = getExchangeAgreementPda(new PublicKey(merchantAOwner), new PublicKey(merchantBOwner));
    const agreement: any = await program.account.exchangeAgreement.fetch(pda);
    return {
      merchantA: agreement.merchantA.toBase58(),
      merchantB: agreement.merchantB.toBase58(),
      rateAToB: agreement.rateAToB.toNumber(),
      rateBToA: agreement.rateBToA.toNumber(),
      active: agreement.active,
    };
  } catch (e) {
    return null;
  }
};

export const exchangePoints = async (
  connection: Connection,
  customerKeypair: Keypair,
  merchantAOwner: string,
  merchantBOwner: string,
  pointsToExchange: number
): Promise<string> => {
  const program = getProgram(connection, customerKeypair);
  const merchantAPubkey = new PublicKey(merchantAOwner);
  const merchantBPubkey = new PublicKey(merchantBOwner);

  const cardAPda = getLoyaltyCardPda(merchantAPubkey, customerKeypair.publicKey);
  const cardBPda = getLoyaltyCardPda(merchantBPubkey, customerKeypair.publicKey);
  const agreementPda = getExchangeAgreementPda(merchantAPubkey, merchantBPubkey);

  const tx = await program.methods
    .exchangePoints(new BN(pointsToExchange))
    .accounts({
      loyaltyCardA: cardAPda,
      loyaltyCardB: cardBPda,
      exchangeAgreement: agreementPda,
      customer: customerKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([customerKeypair])
    .rpc();
  return tx;
};

// ─── Raffles Staking Methods ──────────────────────────────────────────────────

export const createRaffle = async (
  connection: Connection,
  merchantKeypair: Keypair,
  raffleIndex: number,
  prizeLamports: number,
  durationSeconds: number
): Promise<string> => {
  const program = getProgram(connection, merchantKeypair);
  const rafflePda = getRafflePda(merchantKeypair.publicKey, raffleIndex);

  const tx = await program.methods
    .createRaffle(new BN(raffleIndex), new BN(prizeLamports), new BN(durationSeconds))
    .accounts({
      raffle: rafflePda,
      merchant: merchantKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchantKeypair])
    .rpc();
  return tx;
};

export const stakeBadgeForRaffle = async (
  connection: Connection,
  customerKeypair: Keypair,
  merchantOwner: string,
  raffleIndex: number,
  badgeIndex: number
): Promise<string> => {
  const program = getProgram(connection, customerKeypair);
  const merchantPublicKey = new PublicKey(merchantOwner);
  const rafflePda = getRafflePda(merchantPublicKey, raffleIndex);
  const cardPda = getLoyaltyCardPda(merchantPublicKey, customerKeypair.publicKey);

  const tx = await program.methods
    .stakeBadgeForRaffle(badgeIndex)
    .accounts({
      raffle: rafflePda,
      loyaltyCard: cardPda,
      customer: customerKeypair.publicKey,
    })
    .signers([customerKeypair])
    .rpc();
  return tx;
};

export const drawRaffle = async (
  connection: Connection,
  merchantKeypair: Keypair,
  raffleIndex: number
): Promise<string> => {
  const program = getProgram(connection, merchantKeypair);
  const rafflePda = getRafflePda(merchantKeypair.publicKey, raffleIndex);

  // Fetch raffle to get staked entries for remaining accounts
  const raffle: any = await program.account.raffle.fetch(rafflePda);
  const stakedEntries: PublicKey[] = raffle.stakedEntries;

  // Get unique stakers (preserving PublicKey objects)
  const uniqueStakerMap = new Map<string, PublicKey>();
  for (const entry of stakedEntries) {
    uniqueStakerMap.set(entry.toBase58(), entry);
  }
  const uniqueStakers = [...uniqueStakerMap.values()];

  // Build remaining accounts: [wallet_0, card_0, wallet_1, card_1, ...]
  const remainingAccounts = uniqueStakers.flatMap((staker: PublicKey) => {
    const cardPda = getLoyaltyCardPda(merchantKeypair.publicKey, staker);
    return [
      { pubkey: staker, isWritable: true, isSigner: false },
      { pubkey: cardPda, isWritable: true, isSigner: false },
    ];
  });

  const tx = await program.methods
    .drawRaffle()
    .accounts({
      raffle: rafflePda,
      merchant: merchantKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .signers([merchantKeypair])
    .rpc();
  return tx;
};

export const getRaffles = async (
  connection: Connection,
  merchantPubkey: string
): Promise<RaffleState[]> => {
  try {
    const program = getProgram(connection);
    // Raffle merchant field starts at offset 8
    const list = await program.account.raffle.all([
      { memcmp: { offset: 8, bytes: merchantPubkey } }
    ]);
    return list.map((item: any) => {
      const r = item.account as any;
      return {
        merchant: r.merchant.toBase58(),
        raffleIndex: r.raffleIndex.toNumber(),
        prizeLamports: r.prizeLamports.toNumber(),
        closesAt: r.closesAt.toNumber(),
        stakedEntries: r.stakedEntries.map((e: any) => e.toBase58()),
        stakedBadges: r.stakedBadges,
        winner: r.winner ? r.winner.toBase58() : null,
        active: r.active,
      };
    }).sort((a: any, b: any) => b.raffleIndex - a.raffleIndex);
  } catch (e) {
    console.error('Error fetching raffles:', e);
    return [];
  }
};

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

export const getPassportState = async (
  connection: Connection,
  customerPubkey: string
): Promise<PassportState | null> => {
  try {
    const program = getProgram(connection);
    const pda = getPassportPda(new PublicKey(customerPubkey));
    const state: any = await program.account.passportState.fetch(pda);
    return {
      customer: state.customer.toBase58(),
      totalStoresVisited: state.totalStoresVisited,
      totalStampEarnedLifetime: state.totalStampEarnedLifetime.toNumber(),
      totalBadgesUnlocked: state.totalBadgesUnlocked,
      firstVisitTimestamp: state.firstVisitTimestamp.toNumber(),
      lastUpdated: state.lastUpdated.toNumber(),
      bump: state.bump,
    };
  } catch (e) {
    return null;
  }
};

export const initializePassport = async (
  connection: Connection,
  payerKeypair: Keypair,
  customerPubkey: string
): Promise<string> => {
  const program = getProgram(connection, payerKeypair);
  const customerPublicKey = new PublicKey(customerPubkey);
  const pda = getPassportPda(customerPublicKey);
  
  const tx = await program.methods
    .initializePassport()
    .accounts({
      passport: pda,
      customer: customerPublicKey,
      payer: payerKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payerKeypair])
    .rpc();
  return tx;
};
