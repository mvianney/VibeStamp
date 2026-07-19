import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Store, RefreshCw, ArrowRight, LogOut, ChevronLeft } from 'lucide-react';

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Earn-rate bounds: STAMP per 0.01 SOL
export const MIN_POINT_RATE = 10;
export const MAX_POINT_RATE = 100;
export const DEFAULT_POINT_RATE = 10;

// Redemption-rate bounds: STAMP per $1 of discount
export const MIN_REDEMPTION_RATE = 1000;
export const MAX_REDEMPTION_RATE = 5000;
export const DEFAULT_REDEMPTION_RATE = 1000;

export interface MerchantProfile {
  storeName: string;
  pointRate: number;       // STAMP per 0.01 SOL — range [10, 100]
  redemptionRate: number;  // STAMP per $1 discount — range [500, 5000]
  walletSecretKey: number[];
  walletPublicKey: string;
  referralBonusStamp?: number;
}

// ─── One-time setup form ────────────────────────────────────────────────────
function MerchantSetup({ onComplete }: { onComplete: (p: MerchantProfile) => void }) {
  const navigate = useNavigate();
  const connectionRef = useRef<Connection | null>(null);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [storeName, setStoreName] = useState('');
  const [pointRate, setPointRate] = useState(DEFAULT_POINT_RATE);
  const [redemptionRate, setRedemptionRate] = useState(DEFAULT_REDEMPTION_RATE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    connectionRef.current = new Connection(RPC_URL, 'confirmed');
    setKeypair(Keypair.generate());
  }, []);

  const handleSave = async () => {
    if (!keypair || !storeName.trim()) return;
    setSaving(true);

    // Clamp values to valid range (mirrors the on-chain require! guard)
    const clampedPointRate = Math.min(MAX_POINT_RATE, Math.max(MIN_POINT_RATE, pointRate));
    const clampedRedemptionRate = Math.min(MAX_REDEMPTION_RATE, Math.max(MIN_REDEMPTION_RATE, redemptionRate));

    const profile: MerchantProfile = {
      storeName: storeName.trim(),
      pointRate: clampedPointRate,
      redemptionRate: clampedRedemptionRate,
      walletSecretKey: Array.from(keypair.secretKey),
      walletPublicKey: keypair.publicKey.toBase58(),
    };
    localStorage.setItem('vibestamp_merchant_profile', JSON.stringify(profile));

    // Silently airdrop 2 SOL so the merchant wallet can cover on-chain fees.
    // Fire-and-forget: failure is non-blocking — devnet faucet may rate-limit.
    if (connectionRef.current) {
      try {
        const sig = await connectionRef.current.requestAirdrop(
          keypair.publicKey,
          2 * LAMPORTS_PER_SOL
        );
        const { blockhash, lastValidBlockHeight } =
          await connectionRef.current.getLatestBlockhash();
        await connectionRef.current.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          'confirmed'
        );

        // Call the on-chain initialization
        await initializeMerchantState(
          connectionRef.current,
          keypair,
          storeName.trim(),
          clampedPointRate,
          clampedRedemptionRate,
          500 // default 500 referral bonus points
        );
      } catch (e) {
        console.warn('Background setup/airdrop failed:', e);
      }
    }

    setSaving(false);
    onComplete(profile);
  };

  return (
    <div className="setup-page">
      <button className="back-link" onClick={() => navigate('/')} id="btn-back-landing-merchant">
        <ChevronLeft size={16} /> Back
      </button>

      <div className="setup-card merchant-setup-card">
        <div className="setup-icon-wrap merchant-setup-icon">
          <Store size={36} />
        </div>
        <h2 className="setup-title">Set Up Your Store</h2>
        <p className="setup-subtitle">
          One-time setup — these details are saved locally and used throughout the merchant portal.
        </p>

        <div className="setup-form">
          {/* Store Name */}
          <div className="form-group">
            <label htmlFor="store-name">Store Name</label>
            <input
              id="store-name"
              className="input-glow"
              placeholder="e.g. The Vibing Coffee House"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
            />
          </div>

          {/* Point Rate */}
          <div className="form-group">
            <label htmlFor="point-rate">
              STAMP Earn Rate
              <span className="label-muted"> · {MIN_POINT_RATE}–{MAX_POINT_RATE} STAMP per 0.01 SOL</span>
            </label>
            <div className="rate-slider-row">
              <input
                id="point-rate"
                type="range"
                className="rate-slider"
                value={pointRate}
                min={MIN_POINT_RATE}
                max={MAX_POINT_RATE}
                step={10}
                onChange={e => setPointRate(Number(e.target.value))}
              />
              <span className="rate-slider-value">{pointRate}</span>
            </div>
            <span className="field-hint">
              A customer spending 0.1 SOL earns&nbsp;
              <strong style={{ color: 'var(--color-primary)' }}>{pointRate * 10} STAMP</strong>.
              &nbsp;Range: {MIN_POINT_RATE} (default) – {MAX_POINT_RATE} max.
            </span>
          </div>

          {/* Redemption Rate */}
          <div className="form-group">
            <label htmlFor="redemption-rate">
              Redemption Rate
              <span className="label-muted"> · STAMP per $1 discount</span>
            </label>
            <div className="rate-slider-row">
              <input
                id="redemption-rate"
                type="range"
                className="rate-slider redemption-slider"
                value={redemptionRate}
                min={MIN_REDEMPTION_RATE}
                max={MAX_REDEMPTION_RATE}
                step={100}
                onChange={e => setRedemptionRate(Number(e.target.value))}
              />
              <span className="rate-slider-value">{redemptionRate.toLocaleString()}</span>
            </div>
            <div className="redemption-preview">
              <span className="redemption-preview-row">
                <span>1,000 STAMP →</span>
                <strong style={{ color: 'var(--color-accent)' }}>
                  ${(1000 / redemptionRate).toFixed(2)} discount
                </strong>
              </span>
              <span className="redemption-preview-row">
                <span>5,000 STAMP →</span>
                <strong style={{ color: 'var(--color-accent)' }}>
                  ${(5000 / redemptionRate).toFixed(2)} discount
                </strong>
              </span>
            </div>
            <span className="field-hint">
              Default: 1,000. Lower = more generous. Range: {MIN_REDEMPTION_RATE.toLocaleString()} (generous) – {MAX_REDEMPTION_RATE.toLocaleString()} (strict).
            </span>
          </div>

          {/* Merchant Wallet */}
          <div className="form-group">
            <label>
              Merchant Wallet <span className="label-muted">(auto-generated · Devnet only)</span>
            </label>
            <input
              className="input-glow mono"
              readOnly
              value={keypair?.publicKey.toBase58() ?? 'Generating…'}
              style={{ background: 'rgba(0,0,0,0.2)', fontSize: '12px' }}
            />
            <span className="field-hint wallet-credit-hint">
              ⚡ 2 SOL will be credited to your wallet for on-chain transaction fees.
            </span>
          </div>

          <button
            className="btn btn-primary setup-submit"
            onClick={handleSave}
            disabled={!storeName.trim() || !keypair || saving}
            id="btn-launch-merchant"
          >
            {saving
              ? <><RefreshCw size={18} className="animate-spin-slow" /> Setting up your wallet…</>
              : <>Launch Merchant Portal <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Merchant Dashboard ──────────────────────────────────────────────────
import { 
  Plus, Users, Coins, Percent, ExternalLink, 
  Copy, Check, CheckCircle, Wallet, AlertTriangle 
} from 'lucide-react';
import QRCode from 'qrcode';
import { 
  getMerchantCustomers, 
  recordPurchase, 
  getActualTxAmountLamports,
  updateMerchantRates,
  initializeMerchantState,
  getLoyaltyCard,
  getCustomerLoyaltyCards,
  getLoyaltyCardPda,
  createRaffle,
  drawRaffle,
  getRaffles,
  initializeExchangeAgreement,
  type LoyaltyCard,
  type RaffleState
} from '../loyaltyHelper';
import { buildSolanaPayUri, findReferenceTransaction, simulatePayment } from '../solanaPayHelper';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decodeBase58(str: string): Uint8Array {
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    let value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) throw new Error('Invalid Base58 character');
    for (let j = 0; j < bytes.length; j++) {
      value += bytes[j] * 58;
      bytes[j] = value & 0xff;
      value >>= 8;
    }
    while (value > 0) {
      bytes.push(value & 0xff);
      value >>= 8;
    }
  }
  // Add leading zeros
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function MerchantDashboard({
  profile,
  onReset,
  onUpdate,
}: {
  profile: MerchantProfile;
  onReset: () => void;
  onUpdate: (p: MerchantProfile) => void;
}) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const merchantPublicKey = new PublicKey(profile.walletPublicKey);

  // Dashboard Stats & Customers
  const [customers, setCustomers] = useState<LoyaltyCard[]>([]);
  const [storeBalance, setStoreBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState<boolean>(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Edit Settings State
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editPointRate, setEditPointRate] = useState(profile.pointRate);
  const [editRedemptionRate, setEditRedemptionRate] = useState(profile.redemptionRate);
  const [savingSettings, setSavingSettings] = useState(false);

  // Payment Form & QR State
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [productName, setProductName] = useState('');
  const [amountSol, setAmountSol] = useState(0.01);

  
  // Checkout Polling & Success State
  const [checkoutStep, setCheckoutStep] = useState<'idle' | 'generating' | 'waiting' | 'confirming' | 'success'>('idle');
  const [referenceKeypair, setReferenceKeypair] = useState<Keypair | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [solanaPayUri, setSolanaPayUri] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [receipt, setReceipt] = useState<{
    customer: string;
    amountPaid: number;
    pointsEarned: number;
    streakBonus: number;
    tierBonus: number;
    newBalance: number;
    tier: string;
    memo: string;
  } | null>(null);

  // Copied indicator
  const [copiedLink, setCopiedLink] = useState(false);

  // Customer Simulator Wallet State
  const [simCustomerKeypair, setSimCustomerKeypair] = useState<Keypair | null>(null);
  const [simCustomerBalance, setSimCustomerBalance] = useState(0);
  const [simFunding, setSimFunding] = useState(false);
  const [simPaying, setSimPaying] = useState(false);
  const [simConsole, setSimConsole] = useState<{ text: string; type: 'info' | 'success' | 'error' }[]>([]);

  // Raffle Manager State
  const [raffleIndexToCreate, setRaffleIndexToCreate] = useState<number>(1);
  const [rafflePrizeToCreate, setRafflePrizeToCreate] = useState<number>(0.05);
  const [raffleDurationToCreate] = useState<number>(300);
  const [isCreatingRaffle, setIsCreatingRaffle] = useState(false);
  const [createRaffleStatus, setCreateRaffleStatus] = useState<{ success: boolean; msg: string } | null>(null);
  const [merchantRaffles, setMerchantRaffles] = useState<RaffleState[]>([]);
  const [loadingMerchantRaffles, setLoadingMerchantRaffles] = useState(false);
  const [isDrawingRaffle, setIsDrawingRaffle] = useState<Record<number, boolean>>({});
  const [drawingStatus, setDrawingStatus] = useState<Record<number, { success: boolean; msg: string } | null>>({});

  // Bilateral Exchange Agreement State
  const [partnerMerchant, setPartnerMerchant] = useState('');
  const [rateAToB, setRateAToB] = useState(100);
  const [rateBToA, setRateBToA] = useState(100);
  const [exchangeAgreementStatus, setExchangeAgreementStatus] = useState<{ success: boolean; msg: string } | null>(null);
  const [isSubmittingExchange, setIsSubmittingExchange] = useState(false);

  const handleCreateOrUpdateExchangeAgreement = async () => {
    if (!partnerMerchant.trim()) {
      setExchangeAgreementStatus({ success: false, msg: 'Please enter a valid partner merchant public key.' });
      return;
    }

    let partnerPubkey: PublicKey;
    try {
      partnerPubkey = new PublicKey(partnerMerchant.trim());
    } catch (e) {
      setExchangeAgreementStatus({ success: false, msg: 'Invalid partner merchant public key address.' });
      return;
    }

    setIsSubmittingExchange(true);
    setExchangeAgreementStatus({ success: true, msg: 'Broadcasting partnership agreement on-chain...' });

    try {
      const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      
      const tx = await initializeExchangeAgreement(
        connection,
        merchantKeypair,
        partnerPubkey.toBase58(),
        rateAToB,
        rateBToA
      );

      setExchangeAgreementStatus({
        success: true,
        msg: `Agreement configured successfully! Tx: ${tx.slice(0, 10)}...`
      });
      setPartnerMerchant('');
      setRateAToB(100);
      setRateBToA(100);
      await refreshBalance();
    } catch (e: any) {
      console.error(e);
      setExchangeAgreementStatus({ success: false, msg: e.message || 'Failed to establish exchange agreement' });
    } finally {
      setIsSubmittingExchange(false);
    }
  };

  const loadMerchantRaffles = async () => {
    setLoadingMerchantRaffles(true);
    try {
      const list = await getRaffles(connection, profile.walletPublicKey);
      setMerchantRaffles(list);
      if (list.length > 0) {
        const maxIdx = Math.max(...list.map(r => r.raffleIndex));
        setRaffleIndexToCreate(maxIdx + 1);
      }
    } catch (e) {
      console.error('Failed to load merchant raffles:', e);
    } finally {
      setLoadingMerchantRaffles(false);
    }
  };

  // Load merchant SOL balance
  const refreshBalance = async () => {
    setLoadingBalance(true);
    setBalanceError(null);
    try {
      const bal = await connection.getBalance(merchantPublicKey, 'confirmed');
      setStoreBalance(bal / LAMPORTS_PER_SOL);
    } catch (e: any) {
      console.error('Failed to fetch store SOL balance:', e);
      setBalanceError(e.message || 'Failed to fetch balance');
    } finally {
      setLoadingBalance(false);
    }
  };

  // 1. Fetch dashboard data
  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setLoadingStats(true);
        const list = await getMerchantCustomers(connection, profile.walletPublicKey);
        
        // Load balance
        setLoadingBalance(true);
        setBalanceError(null);
        const bal = await connection.getBalance(merchantPublicKey, 'confirmed');
        if (active) {
          setStoreBalance(bal / LAMPORTS_PER_SOL);
          setCustomers(list);
          setLoadingBalance(false);
        }
        
        await loadMerchantRaffles();
      } catch (err: any) {
        console.error('Error loading merchant dashboard data:', err);
        if (active) {
          setBalanceError(err.message || 'Failed to fetch balance');
          setLoadingBalance(false);
        }
      } finally {
        if (active) setLoadingStats(false);
      }
    }
    loadData();
    // Sync settings state when profile changes
    setEditPointRate(profile.pointRate);
    setEditRedemptionRate(profile.redemptionRate);

    return () => {
      active = false;
    };
  }, [profile, refreshTrigger]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      // 1. Update simulated store rates in local database
      const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      await updateMerchantRates(connection, merchantKeypair, editPointRate, editRedemptionRate, profile.referralBonusStamp || 500);

      // 2. Update persistent profile in localStorage and React state
      const updatedProfile = { 
        ...profile, 
        pointRate: editPointRate, 
        redemptionRate: editRedemptionRate 
      };
      localStorage.setItem('vibestamp_merchant_profile', JSON.stringify(updatedProfile));
      
      // Update parent state
      onUpdate(updatedProfile);
      await refreshBalance();
      setIsEditingSettings(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Failed to update store settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  // 2. Setup/Fetch Simulated Customer Wallet
  useEffect(() => {
    const saved = localStorage.getItem('vibestamp_sim_customer_key');
    let keypair: Keypair;
    if (saved) {
      try {
        keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(saved)));
      } catch {
        keypair = Keypair.generate();
        localStorage.setItem('vibestamp_sim_customer_key', JSON.stringify(Array.from(keypair.secretKey)));
      }
    } else {
      keypair = Keypair.generate();
      localStorage.setItem('vibestamp_sim_customer_key', JSON.stringify(Array.from(keypair.secretKey)));
    }
    setSimCustomerKeypair(keypair);

    // Initial log
    setSimConsole([
      { text: `Simulator initialized with address: ${keypair.publicKey.toBase58().slice(0,8)}...${keypair.publicKey.toBase58().slice(-8)}`, type: 'info' },
      { text: 'Use "Fund Simulator" below to get Devnet SOL, then tap "Simulate Customer Payment".', type: 'info' }
    ]);

    // Fetch initial balance
    async function checkBal() {
      try {
        const bal = await connection.getBalance(keypair.publicKey, 'confirmed');
        setSimCustomerBalance(bal / LAMPORTS_PER_SOL);
      } catch {}
    }
    checkBal();
  }, []);

  // Update simulator balance
  const refreshSimBalance = async (pubkey: PublicKey) => {
    try {
      const bal = await connection.getBalance(pubkey, 'confirmed');
      setSimCustomerBalance(bal / LAMPORTS_PER_SOL);
    } catch {}
  };

  // Fund Simulated Customer Wallet
  const handleFundSimCustomer = async () => {
    if (!simCustomerKeypair) return;
    setSimFunding(true);
    setSimConsole(prev => [...prev, { text: 'Requesting airdrop of 2 SOL from Devnet faucet...', type: 'info' }]);
    try {
      const sig = await connection.requestAirdrop(simCustomerKeypair.publicKey, 2 * LAMPORTS_PER_SOL);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      await refreshSimBalance(simCustomerKeypair.publicKey);
      setSimConsole(prev => [...prev, { text: 'Airdrop confirmed! 2 SOL added to simulator wallet.', type: 'success' }]);
    } catch (err) {
      console.error(err);
      setSimConsole(prev => [...prev, { text: 'Airdrop rate limit hit. Try again in 30 seconds.', type: 'error' }]);
    } finally {
      setSimFunding(false);
    }
  };

  // 3. QR Generation & Solana Pay Checkout Flow
  const handleGenerateCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || amountSol <= 0) return;

    setCheckoutStep('generating');
    const refKeypair = Keypair.generate();
    setReferenceKeypair(refKeypair);

    // Build standard-compliant Solana Pay URI
    const uri = buildSolanaPayUri({
      recipient: profile.walletPublicKey,
      amount: amountSol,
      reference: refKeypair.publicKey.toBase58(),
      label: profile.storeName,
      message: `Purchase: ${productName.trim()}`
    });

    setSolanaPayUri(uri);

    try {
      const dataUrl = await QRCode.toDataURL(uri);
      setQrCodeUrl(dataUrl);
      setCheckoutStep('waiting');
      setSimConsole(prev => [...prev, { text: `New payment request detected: ${amountSol} SOL for ${productName.trim()}`, type: 'info' }]);
    } catch (err) {
      console.error('QR code generation failed:', err);
      setCheckoutStep('idle');
    }
  };

  // Poll for Transaction Reference on-chain
  useEffect(() => {
    if (checkoutStep !== 'waiting' || !referenceKeypair) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const txRef = await findReferenceTransaction(connection, referenceKeypair.publicKey);
        if (txRef && active) {
          clearInterval(interval);
          setTxSignature(txRef.signature);
          setCheckoutStep('confirming');
          confirmTransactionOnChain(txRef.signature);
        }
      } catch (e) {
        console.error('Reference polling check:', e);
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [checkoutStep, referenceKeypair]);

  // Confirm and parse transaction from Devnet RPC
  const confirmTransactionOnChain = async (sig: string) => {
    try {
      // 1. Wait for confirmations
      let confirmed = false;
      for (let retries = 0; retries < 10; retries++) {
        const status = await connection.getSignatureStatus(sig);
        const confirmation = status?.value?.confirmationStatus;
        if (confirmation === 'confirmed' || confirmation === 'finalized') {
          confirmed = true;
          break;
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!confirmed) {
        throw new Error('On-chain transaction confirmation timed out');
      }

      // 2. Fetch transaction details and compute actual lamports transferred
      const lamports = await getActualTxAmountLamports(connection, sig, merchantPublicKey);

      // 3. Fetch transaction to get sender address
      const txDetails = await connection.getTransaction(sig, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      if (!txDetails || !txDetails.meta) {
        throw new Error('Could not fetch fully confirmed transaction details');
      }

      const keys = txDetails.transaction.message.getAccountKeys().staticAccountKeys;
      // Sender is the first signer
      const sender = keys[0].toBase58();

      // Extract and decode memo from Solana Memo Program instruction
      let extractedMemo = 'None';
      try {
        const instructions = txDetails.transaction.message.compiledInstructions;
        const memoInst = instructions.find(inst => {
          const programId = keys[inst.programIdIndex];
          return programId.toBase58() === 'Mem0111111111111111111111111111111111111111';
        });
        if (memoInst && memoInst.data) {
          const dataBytes = typeof memoInst.data === 'string' ? decodeBase58(memoInst.data) : memoInst.data;
          extractedMemo = new TextDecoder().decode(dataBytes);
        }
      } catch (e) {
        console.warn('Failed to parse transaction memo:', e);
      }

      const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      
      // Fetch card state before purchase to calculate points earned
      const cardBefore = await getLoyaltyCard(connection, profile.walletPublicKey, sender);
      const prevBalance = cardBefore ? cardBefore.stampBalance : 0;

      // Track customer transaction counts locally per merchant
      const countsKey = `vibestamp_merchant_tx_counts_${profile.walletPublicKey}`;
      const counts = JSON.parse(localStorage.getItem(countsKey) || '{}');
      let customerTxCount = counts[sender] || 0;
      if (cardBefore) {
        customerTxCount = Math.max(customerTxCount, 3) + 1;
      } else {
        customerTxCount += 1;
      }
      counts[sender] = customerTxCount;
      localStorage.setItem(countsKey, JSON.stringify(counts));

      // Find any other merchant card to pass as remaining account for referral bonus
      const customerCards = await getCustomerLoyaltyCards(connection, sender);
      const otherCard = customerCards.find(c => c.merchant !== profile.walletPublicKey && c.totalPurchases > 0);
      const otherCardPda = otherCard ? getLoyaltyCardPda(new PublicKey(otherCard.merchant), new PublicKey(sender)) : undefined;

      let pointsEarned = 0;
      let newBalance = 0;
      let tier = 'Bronze';
      let streakBonus = 0;
      let tierBonus = 0;

      if (customerTxCount >= 3) {
        setSimConsole(prev => [...prev, { text: `Active customer transaction ${customerTxCount} - Executing on-chain loyalty check...`, type: 'info' }]);
        
        // Call recordPurchase on-chain
        await recordPurchase(
          connection,
          merchantKeypair,
          sender,
          lamports,
          otherCardPda?.toBase58()
        );

        // Fetch updated card state
        const card = await getLoyaltyCard(connection, profile.walletPublicKey, sender);
        if (!card) throw new Error("Failed to fetch updated loyalty card from chain");
        pointsEarned = card.stampBalance - prevBalance;
        newBalance = card.stampBalance;
        tier = card.tier;

        // Calculate bonuses based on formulas:
        const basePoints = Math.floor(lamports / 10_000_000) * (profile.pointRate || 50);
        
        let streakBonusPercent = 0;
        if (card.streakCount >= 8) streakBonusPercent = 100;
        else if (card.streakCount >= 4) streakBonusPercent = 50;
        else if (card.streakCount >= 2) streakBonusPercent = 25;
        streakBonus = Math.floor(basePoints * streakBonusPercent / 100);

        let tierBonusPercent = 0;
        const prevTier = cardBefore ? cardBefore.tier : 'Bronze';
        if (prevTier === 'Gold') tierBonusPercent = 25;
        else if (prevTier === 'Silver') tierBonusPercent = 10;
        tierBonus = Math.floor(basePoints * tierBonusPercent / 100);
      } else {
        // Pre-loyalty transaction
        pointsEarned = 0;
        newBalance = 0;
        tier = 'Bronze';
        setSimConsole(prev => [...prev, { text: `Pre-loyalty checkout ${customerTxCount}/2 recorded locally for customer ${sender.slice(0, 8)}...`, type: 'info' }]);
      }

      // Update receipts & trigger refresh
      setReceipt({
        customer: sender,
        amountPaid: lamports / LAMPORTS_PER_SOL,
        pointsEarned,
        streakBonus,
        tierBonus,
        newBalance,
        tier,
        memo: extractedMemo
      });

      setCheckoutStep('success');
      await refreshBalance();
      setRefreshTrigger(prev => prev + 1);

      // Refresh simulated customer balance if they were the payer
      if (simCustomerKeypair && sender === simCustomerKeypair.publicKey.toBase58()) {
        await refreshSimBalance(simCustomerKeypair.publicKey);
      }
    } catch (err: any) {
      console.error(err);
      setSimConsole(prev => [...prev, { text: `Checkout validation failed: ${err.message || err}`, type: 'error' }]);
      setCheckoutStep('waiting');
    }
  };

  // Simulate payment using built-in wallet
  const handleSimulatePayment = async () => {
    if (!simCustomerKeypair || !referenceKeypair || checkoutStep !== 'waiting') return;
    setSimPaying(true);
    setSimConsole(prev => [...prev, { text: 'Broadcasting simulated checkout transaction on-chain...', type: 'info' }]);

    // Retrieve customer name from localStorage profile if registered, fallback to 'Simulator Guest'
    let customerName = 'Simulator Guest';
    try {
      const savedProfile = localStorage.getItem('vibestamp_customer_profile');
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        if (p.customerName) {
          customerName = p.customerName;
        }
      }
    } catch {}

    const autoMemo = `${customerName} - ${productName.trim()}`;

    try {
      await simulatePayment({
        connection,
        customerKeypair: simCustomerKeypair,
        merchantPublicKey,
        amount: amountSol,
        referencePublicKey: referenceKeypair.publicKey,
        memo: autoMemo,
        logCallback: (msg, type) => {
          setSimConsole(prev => [...prev, { text: msg, type: type || 'info' }]);
        }
      });
      // The polling loop will automatically pick up the tx signature!
    } catch (err: any) {
      console.error(err);
      setSimConsole(prev => [...prev, { text: `Simulation error: ${err.message || err}`, type: 'error' }]);
    } finally {
      setSimPaying(false);
    }
  };

  // Raffle Manager Handlers
  const handleCreateRaffle = async () => {
    setIsCreatingRaffle(true);
    setCreateRaffleStatus({ success: true, msg: 'Initializing on-chain raffle and locking prize pool...' });

    try {
      const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      const prizeLamports = Math.round(rafflePrizeToCreate * LAMPORTS_PER_SOL);
      const tx = await createRaffle(
        connection,
        merchantKeypair,
        raffleIndexToCreate,
        prizeLamports,
        raffleDurationToCreate
      );
      setCreateRaffleStatus({
        success: true,
        msg: `Raffle #${raffleIndexToCreate} created on-chain! Tx: ${tx.slice(0, 8)}...`
      });
      setRaffleIndexToCreate(prev => prev + 1);
      loadMerchantRaffles();
      await refreshBalance();
    } catch (e: any) {
      console.error(e);
      setCreateRaffleStatus({ success: false, msg: e.message || 'Failed to create raffle' });
    } finally {
      setIsCreatingRaffle(false);
    }
  };

  const handleDrawRaffle = async (raffleIndex: number) => {
    setIsDrawingRaffle(prev => ({ ...prev, [raffleIndex]: true }));
    setDrawingStatus(prev => ({ ...prev, [raffleIndex]: { success: true, msg: 'Drawing winner on-chain...' } }));

    try {
      const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      const tx = await drawRaffle(connection, merchantKeypair, raffleIndex);

      setDrawingStatus(prev => ({
        ...prev,
        [raffleIndex]: { success: true, msg: `Raffle drawn! Tx: ${tx.slice(0, 8)}...` }
      }));

      loadMerchantRaffles();
      await refreshBalance();
    } catch (e: any) {
      console.error(e);
      setDrawingStatus(prev => ({
        ...prev,
        [raffleIndex]: { success: false, msg: e.message || 'Draw execution failed' }
      }));
    } finally {
      setIsDrawingRaffle(prev => ({ ...prev, [raffleIndex]: false }));
    }
  };

  const copyCheckoutLink = () => {
    navigator.clipboard.writeText(solanaPayUri);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleResetCheckout = () => {
    setProductName('');
    setAmountSol(0.01);
    setQrCodeUrl('');
    setSolanaPayUri('');
    setTxSignature('');
    setReferenceKeypair(null);
    setReceipt(null);
    setCheckoutStep('idle');
  };

  const handleSimulateInstantSuccess = () => {
    let customerName = 'Simulator Guest';
    try {
      const savedProfile = localStorage.getItem('vibestamp_customer_profile');
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        if (p.customerName) {
          customerName = p.customerName;
        }
      }
    } catch {}

    setReceipt({
      customer: '7xKXa8B5Wc1m...SimulatedPayerKey...9pQr',
      amountPaid: amountSol,
      pointsEarned: 250,
      streakBonus: 50,
      tierBonus: 20,
      newBalance: 1250,
      tier: 'Gold',
      memo: `${customerName} - ${productName.trim() || 'Premium Coffee'}`
    });
    setCheckoutStep('success');
  };



  const isCheckoutActive = checkoutStep === 'waiting' || checkoutStep === 'confirming' || checkoutStep === 'success';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">⚡</div>
          <div className="brand-info">
            <h1>VibeStamp</h1>
            <p>{profile.storeName} · Merchant Dashboard</p>
          </div>
        </div>
        <div className="header-actions">
          <div className="network-badge">
            <span className="network-dot" />
            Devnet
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={onReset}
            id="btn-merchant-reset"
          >
            <LogOut size={14} /> Reset Store
          </button>
        </div>
      </header>

      <main className="dashboard-content" style={{ padding: '24px', maxWidth: '1400px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
        
        {/* STATS ROW */}
        <div className="merchant-stats-row">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(20, 241, 149, 0.1)', color: 'var(--color-primary)' }}><Wallet size={20} /></div>
            <div className="stat-info" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span className="stat-label">Store Balance</span>
                <button
                  onClick={refreshBalance}
                  disabled={loadingBalance}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: loadingBalance ? 0.5 : 0.8,
                    transition: 'opacity 0.2s',
                  }}
                  title="Refresh Balance"
                  id="btn-refresh-balance-merchant"
                >
                  <RefreshCw size={12} className={loadingBalance ? "spin" : ""} style={{ animation: loadingBalance ? 'spin 1s linear infinite' : 'none' }} />
                </button>
              </div>
              {loadingBalance ? (
                <span className="stat-value" style={{ fontStyle: 'italic', fontSize: '16px' }}>Loading...</span>
              ) : balanceError ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="stat-value" style={{ fontSize: '13px', color: 'var(--color-secondary)' }}>Error fetching balance</span>
                  <button
                    onClick={refreshBalance}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: '11px',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <span className="stat-value">{storeBalance.toFixed(4)} SOL</span>
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Users size={20} /></div>
            <div className="stat-info">
              <span className="stat-label">Total Customers gained by the store</span>
              <span className="stat-value">{loadingStats ? '...' : customers.length}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Coins size={20} /></div>
            <div className="stat-info">
              <span className="stat-label">Earn Rate</span>
              <span className="stat-value">{profile.pointRate} STAMP / 0.01 SOL</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Percent size={20} /></div>
            <div className="stat-info">
              <span className="stat-label">Redemption Rate</span>
              <span className="stat-value">{profile.redemptionRate.toLocaleString()} = $1</span>
            </div>
          </div>
        </div>

        {/* MERCHANT METADATA BANNER */}
        <div className="setup-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', padding: '16px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>Merchant Keypair Account</span>
            <a 
              href={`https://explorer.solana.com/address/${profile.walletPublicKey}?cluster=devnet`} 
              target="_blank" 
              rel="noreferrer"
              className="tx-link mono" 
              style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {profile.walletPublicKey} <ExternalLink size={12} />
            </a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setIsEditingSettings(!isEditingSettings);
                setEditPointRate(profile.pointRate);
                setEditRedemptionRate(profile.redemptionRate);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              ⚙️ Adjust Rates
            </button>
            <span className="field-hint" style={{ margin: 0 }}>On-Chain Program:</span>
            <span className="network-badge" style={{ background: 'rgba(153, 69, 255, 0.08)', border: '1px solid rgba(153, 69, 255, 0.2)', color: 'var(--color-secondary)' }}>
              VibeStamp v2.0
            </span>
          </div>
        </div>

        {/* RATES EDITING PANEL */}
        {isEditingSettings && (
          <div className="panel" style={{ padding: '24px', animation: 'slide-down 0.2s ease forwards' }}>
            <h3 style={{ color: 'var(--color-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ Modify Store Reward Parameters
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Updating these parameters will modify the values on-chain for the MerchantState PDA. Customers will immediately start earning and redeeming points under the new rates.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Point Rate */}
              <div className="form-group">
                <label>
                  STAMP Earn Rate
                  <span className="label-muted"> · {MIN_POINT_RATE}–{MAX_POINT_RATE} STAMP per 0.01 SOL</span>
                </label>
                <div className="rate-slider-row">
                  <input
                    type="range"
                    className="rate-slider"
                    value={editPointRate}
                    min={MIN_POINT_RATE}
                    max={MAX_POINT_RATE}
                    step={10}
                    onChange={e => setEditPointRate(Number(e.target.value))}
                  />
                  <span className="rate-slider-value">{editPointRate}</span>
                </div>
                <span className="field-hint">
                  Customers will earn <strong style={{ color: 'var(--color-primary)' }}>{editPointRate * 10} STAMP</strong> per 0.1 SOL spent.
                </span>
              </div>

              {/* Redemption Rate */}
              <div className="form-group">
                <label>
                  Redemption Rate
                  <span className="label-muted"> · STAMP per $1 discount</span>
                </label>
                <div className="rate-slider-row">
                  <input
                    type="range"
                    className="rate-slider redemption-slider"
                    value={editRedemptionRate}
                    min={MIN_REDEMPTION_RATE}
                    max={MAX_REDEMPTION_RATE}
                    step={100}
                    onChange={e => setEditRedemptionRate(Number(e.target.value))}
                  />
                  <span className="rate-slider-value">{editRedemptionRate.toLocaleString()}</span>
                </div>
                <span className="field-hint">
                  Customers redeem <strong style={{ color: 'var(--color-accent)' }}>{editRedemptionRate.toLocaleString()} STAMP</strong> to get a $1 discount.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => setIsEditingSettings(false)}
                disabled={savingSettings}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handleSaveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? 'Saving Changes...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* TWO COLUMN DASHBOARD GRID (Always rendered in background) */}
        <div className="dashboard-grid">
          
          {/* LEFT COLUMN: LOYALTY DASHBOARD */}
          <div className="panel" style={{ minHeight: '400px' }}>
            <div className="panel-header">
              <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} /> Loyalty Directory
                <span className="network-badge" style={{ fontSize: '11px', background: 'rgba(255, 215, 0, 0.08)', border: '1px solid rgba(255, 215, 0, 0.25)', color: '#ffd700' }}>
                  {loadingStats ? '...' : customers.filter(c => c.totalPurchases >= 3).length} Loyal (≥3 visits)
                </span>
              </h2>
              <button 
                onClick={() => setRefreshTrigger(prev => prev + 1)}
                className="btn btn-secondary btn-sm"
                title="Refresh customer database"
              >
                <RefreshCw size={12} className={loadingStats ? 'animate-spin-slow' : ''} /> Refresh
              </button>
            </div>

            {customers.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                <h3>No Customers Registered Yet</h3>
                <p style={{ maxWidth: '320px', margin: '8px auto', fontSize: '13px', color: 'var(--text-muted)' }}>
                  Once customer checkouts are processed on Devnet, loyalty card records will automatically populate here.
                </p>
              </div>
            ) : (
              <div className="logs-table-wrapper" style={{ overflowY: 'auto', maxHeight: '480px' }}>
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Customer Address</th>
                      <th>Loyalty Tier</th>
                      <th>STAMP Balance</th>
                      <th>Weekly Streak</th>
                      <th>Total Visits</th>
                      <th>Last Visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.customer}>
                        <td className="mono" style={{ fontSize: '13px' }}>
                          <a 
                            href={`https://explorer.solana.com/address/${c.customer}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                            className="tx-link"
                          >
                            {c.customer.slice(0, 6)}…{c.customer.slice(-6)}
                          </a>
                        </td>
                        <td>
                          <span className={`badge-tier ${c.tier.toLowerCase()}`}>
                            {c.tier === 'Gold' ? '🥇 Gold' : c.tier === 'Silver' ? '🥈 Silver' : '🥉 Bronze'}
                          </span>
                        </td>
                        <td className="mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                          {c.stampBalance.toLocaleString()}
                        </td>
                        <td className="mono" style={{ color: c.streakCount > 0 ? '#ff5a00' : 'var(--text-muted)' }}>
                          {c.streakCount > 0 ? `🔥 ${c.streakCount} weeks` : '0 weeks'}
                        </td>
                        <td className="mono">{c.totalPurchases}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {c.lastPurchaseTs > 0 
                            ? new Date(c.lastPurchaseTs * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                            : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: QUICK ACTION / PAYMENT PORTAL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* PANEL FOR NEW PAYMENT / TERMINAL */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">
                  <Coins size={20} /> Checkout Terminal
                </h2>
                {showPaymentForm && (
                  <button 
                    onClick={() => { setShowPaymentForm(false); handleResetCheckout(); }}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {!showPaymentForm ? (
                <div style={{ padding: '16px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '64px' }}>💳</div>
                    <h3 style={{ marginBottom: '6px' }}>Collect New Payment</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '280px', margin: '0 auto' }}>
                      Create new on-chain transaction requests by generate scanning QR codes
                    </p>
                  <button 
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '14px' }}
                    onClick={() => setShowPaymentForm(true)}
                  >
                    <Plus size={18} /> Generate New Payment QR
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* IDEAL INPUT FORM */}
                  {checkoutStep === 'idle' && (
                    <form onSubmit={handleGenerateCheckout} className="setup-form" style={{ gap: '14px' }}>
                      <div className="form-group">
                        <label htmlFor="product-name">Product / Service</label>
                        <input
                          id="product-name"
                          required
                          className="input-glow"
                          placeholder="e.g. Premium Coffee"
                          value={productName}
                          onChange={e => setProductName(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="amount-sol">Amount (SOL)</label>
                        <input
                          id="amount-sol"
                          required
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          className="input-glow mono"
                          value={amountSol}
                          onChange={e => setAmountSol(Number(e.target.value))}
                        />
                      </div>

                      <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '6px' }}>
                        Generate Solana Pay QR
                      </button>
                    </form>
                  )}

                  {/* LOADING STATE */}
                  {checkoutStep === 'generating' && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <RefreshCw size={36} className="animate-spin-slow" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }} />
                      <p>Building transaction instructions...</p>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* PANEL FOR RAFFLE MANAGER */}
            <div className="panel" style={{ marginTop: '24px' }}>
              <div className="panel-header">
                <h2 className="panel-title">
                  🎟️ Raffle Manager
                </h2>
                <button 
                  onClick={loadMerchantRaffles} 
                  className="btn btn-secondary btn-sm"
                  disabled={loadingMerchantRaffles}
                  style={{ minWidth: 'auto', padding: '6px 10px' }}
                >
                  <RefreshCw size={12} className={loadingMerchantRaffles ? 'animate-spin-slow' : ''} />
                </button>
              </div>

              {/* Create Raffle Form */}
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Create New Raffle</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>Raffle Index</label>
                    <input 
                      type="number" 
                      className="input-glow mono" 
                      style={{ width: '100%', padding: '8px', fontSize: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      value={raffleIndexToCreate} 
                      onChange={e => setRaffleIndexToCreate(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>Prize (SOL)</label>
                    <input 
                      type="number" 
                      className="input-glow mono" 
                      style={{ width: '100%', padding: '8px', fontSize: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      step="0.01" 
                      value={rafflePrizeToCreate} 
                      onChange={e => setRafflePrizeToCreate(Number(e.target.value))}
                    />
                  </div>
                </div>

                {createRaffleStatus && (
                  <div style={{
                    padding: '8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    border: createRaffleStatus.success ? '1px solid rgba(20, 241, 149, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                    background: createRaffleStatus.success ? 'rgba(20, 241, 149, 0.02)' : 'rgba(239, 68, 68, 0.02)',
                    color: createRaffleStatus.success ? 'var(--color-primary)' : 'var(--color-secondary)',
                    marginBottom: '12px',
                    textAlign: 'center'
                  }}>
                    {createRaffleStatus.msg}
                  </div>
                )}

                <button 
                  className="btn btn-accent btn-sm" 
                  style={{ width: '100%' }}
                  disabled={isCreatingRaffle || rafflePrizeToCreate <= 0}
                  onClick={handleCreateRaffle}
                >
                  {isCreatingRaffle ? 'Creating on-chain...' : 'Launch Raffle'}
                </button>
              </div>

              {/* Active Raffles list */}
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Raffles History</h4>
                {loadingMerchantRaffles ? (
                  <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)' }}>
                    Loading raffles...
                  </div>
                ) : merchantRaffles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No raffles created yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '280px', overflowY: 'auto' }}>
                    {merchantRaffles.map((r, idx) => {
                      const isClosed = Date.now() / 1000 >= r.closesAt || !r.active;
                      return (
                        <div key={idx} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                            <strong>Raffle #{r.raffleIndex}</strong>
                            <span style={{ color: isClosed ? 'var(--text-muted)' : 'var(--color-primary)', fontWeight: 600 }}>
                              {isClosed ? 'Closed' : 'Active'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span>Prize: <strong className="mono">{(r.prizeLamports / LAMPORTS_PER_SOL).toFixed(3)} SOL</strong></span>
                            <span>Entries: <strong className="mono">{r.stakedEntries.length}</strong></span>
                          </div>

                          {drawingStatus[r.raffleIndex] && (
                            <div style={{
                              padding: '6px',
                              borderRadius: '6px',
                              fontSize: '10px',
                              border: drawingStatus[r.raffleIndex]?.success ? '1px solid rgba(20, 241, 149, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                              background: drawingStatus[r.raffleIndex]?.success ? 'rgba(20, 241, 149, 0.02)' : 'rgba(239, 68, 68, 0.02)',
                              color: drawingStatus[r.raffleIndex]?.success ? 'var(--color-primary)' : 'var(--color-secondary)',
                              textAlign: 'center'
                            }}>
                              {drawingStatus[r.raffleIndex]?.msg}
                            </div>
                          )}

                          {r.active && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ width: '100%', padding: '6px', fontSize: '11px' }}
                              disabled={isDrawingRaffle[r.raffleIndex] || r.stakedEntries.length === 0}
                              onClick={() => handleDrawRaffle(r.raffleIndex)}
                            >
                              {r.stakedEntries.length === 0 ? 'Waiting for entries' : isDrawingRaffle[r.raffleIndex] ? 'Drawing...' : 'Draw Winner'}
                            </button>
                          )}

                          {r.winner && (
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
                              🏆 Winner: <strong className="mono" style={{ color: 'var(--color-accent)' }}>{r.winner.slice(0, 6)}...{r.winner.slice(-6)}</strong>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* PANEL FOR BILATERAL POINTS EXCHANGE PARTNERSHIPS */}
            <div className="panel" style={{ marginTop: '24px' }}>
              <div className="panel-header">
                <h2 className="panel-title">
                  🤝 Bilateral Points Exchange Manager
                </h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Set up a direct, bilateral points exchange partnership with another merchant. 
                  Once configured on-chain, opted-in customers who hold active cards at both stores can swap points between your programs.
                </p>

                <div className="form-group">
                  <label style={{ fontSize: '10.5px', display: 'block', marginBottom: '4px' }}>Partner Merchant Wallet Address (PublicKey)</label>
                  <input 
                    type="text" 
                    placeholder="Enter partner merchant PublicKey..."
                    className="input-glow mono" 
                    style={{ width: '100%', padding: '10px', fontSize: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    value={partnerMerchant} 
                    onChange={e => setPartnerMerchant(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '10.5px', display: 'block', marginBottom: '4px' }}>Your Points to Partner's (rate 100 = 1:1)</label>
                    <input 
                      type="number" 
                      className="input-glow mono" 
                      style={{ width: '100%', padding: '10px', fontSize: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      min="1"
                      value={rateAToB} 
                      onChange={e => setRateAToB(Number(e.target.value))}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                      Multiplier rate (e.g. 100 is 1:1, 150 is 1.5x, 50 is 0.5x).
                    </span>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '10.5px', display: 'block', marginBottom: '4px' }}>Partner's Points to Yours (rate 100 = 1:1)</label>
                    <input 
                      type="number" 
                      className="input-glow mono" 
                      style={{ width: '100%', padding: '10px', fontSize: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      min="1"
                      value={rateBToA} 
                      onChange={e => setRateBToA(Number(e.target.value))}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                      Reverse multiplier rate.
                    </span>
                  </div>
                </div>

                {exchangeAgreementStatus && (
                  <div style={{
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    border: exchangeAgreementStatus.success ? '1px solid rgba(20, 241, 149, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                    background: exchangeAgreementStatus.success ? 'rgba(20, 241, 149, 0.02)' : 'rgba(239, 68, 68, 0.02)',
                    color: exchangeAgreementStatus.success ? 'var(--color-primary)' : 'var(--color-secondary)',
                    textAlign: 'center'
                  }}>
                    {exchangeAgreementStatus.msg}
                  </div>
                )}

                <button 
                  className="btn btn-accent btn-sm" 
                  disabled={isSubmittingExchange}
                  onClick={handleCreateOrUpdateExchangeAgreement}
                  style={{ padding: '10px 16px', fontSize: '12px' }}
                >
                  {isSubmittingExchange ? 'Establishing Partnership...' : 'Initialize / Update Exchange Agreement'}
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* CENTERED HOVER MODAL OVERLAY WITH BLURRED BACKDROP */}
        {isCheckoutActive && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(5, 6, 10, 0.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            overflowY: 'auto'
          }}>
            <div style={{
              maxWidth: '600px',
              width: '100%',
              maxHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              margin: 'auto'
            }}>
              
              {/* Checkout Panel */}
              <div className="panel" style={{ width: '100%', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Coins size={20} /> {checkoutStep === 'success' ? 'Checkout Receipt' : 'Active Checkout'}
                  </h2>
                  {checkoutStep !== 'success' && (
                    <button 
                      onClick={() => { setShowPaymentForm(false); handleResetCheckout(); }}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel Checkout
                    </button>
                  )}
                </div>

                {/* Waiting QR View */}
                {checkoutStep === 'waiting' && (
                  <div className="checkout-view" style={{ width: '100%' }}>
                    <div className="status-badge-live">
                      <span className="status-dot-pulse" />
                      LIVE SCANNING FOR DEVNET TX
                    </div>

                    <div className="qr-container-outer" style={{ width: '260px', height: '260px', marginTop: '16px' }}>
                      <div className="qr-scan-line" />
                      <div className="qr-canvas-wrapper" style={{ width: '220px', height: '220px' }}>
                        {qrCodeUrl ? <img src={qrCodeUrl} alt="Solana Pay QR" style={{ width: '100%', height: '100%' }} /> : <div style={{ width: 200, height: 200, background: '#eee' }} />}
                      </div>
                    </div>

                    <div className="amount-display" style={{ marginTop: '16px' }}>
                      <span className="amount-label">Checkout Amount</span>
                      <span className="amount-val">{amountSol.toFixed(4)} SOL</span>
                      {productName && <span className="field-hint" style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '4px' }}>{productName}</span>}
                    </div>

                    <div className="copy-link-section" style={{ width: '100%', marginTop: '16px' }}>
                      <span className="copy-text">{solanaPayUri}</span>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        style={{ padding: '6px 10px', minWidth: '40px' }}
                        onClick={copyCheckoutLink}
                        type="button"
                      >
                        {copiedLink ? <Check size={14} style={{ color: 'var(--color-primary)' }} /> : <Copy size={14} />}
                      </button>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', marginTop: '16px', padding: '10px', fontSize: '12.5px', color: 'var(--color-accent)', borderColor: 'rgba(20, 241, 149, 0.2)' }}
                      onClick={handleSimulateInstantSuccess}
                      type="button"
                    >
                      🧪 Instant Success Screen (Skip On-Chain Polling)
                    </button>
                  </div>
                )}

                {/* Confirming View */}
                {checkoutStep === 'confirming' && (
                  <div style={{ textAlign: 'center', padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <RefreshCw size={36} className="animate-spin-slow" style={{ color: 'var(--color-accent)' }} />
                    <div>
                      <h3>Transaction Found!</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Fetching balance changes from Devnet RPC blocks and computing on-chain loyalty calculations...
                      </p>
                    </div>
                  </div>
                )}

                {/* Success View */}
                {checkoutStep === 'success' && receipt && (
                  <div className="success-overlay" style={{ width: '100%', padding: '20px 0 0 0' }}>
                    <div className="success-icon-circle" style={{ marginBottom: '12px' }}>
                      <CheckCircle size={40} />
                    </div>
                    <h2 className="success-title">Payment Confirmed!</h2>
                    
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', textAlign: 'left', marginTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>On-Chain Memo:</span>
                        <strong className="mono" style={{ color: 'var(--color-accent)' }}>{receipt.memo}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Amount Paid:</span>
                        <strong className="mono" style={{ color: 'var(--color-primary)' }}>{receipt.amountPaid.toFixed(4)} SOL</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Payer Customer:</span>
                        <span className="mono">{receipt.customer.slice(0,8)}...{receipt.customer.slice(-8)}</span>
                      </div>
                      <div style={{ borderTop: '1px dashed var(--border-color)', margin: '4px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Base STAMP Earned:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>+{receipt.pointsEarned - receipt.streakBonus - receipt.tierBonus}</strong>
                      </div>
                      {receipt.streakBonus > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#ff5a00' }}>🔥 Streak Bonus:</span>
                          <strong style={{ color: '#ff5a00' }}>+{receipt.streakBonus}</strong>
                        </div>
                      )}
                      {receipt.tierBonus > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--color-accent)' }}>⚡ Tier Bonus:</span>
                          <strong style={{ color: 'var(--color-accent)' }}>+{receipt.tierBonus}</strong>
                        </div>
                      )}
                      <div style={{ borderTop: '1px dashed var(--border-color)', margin: '4px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                        <span style={{ fontWeight: 600 }}>Total Earned:</span>
                        <strong style={{ color: 'var(--color-primary)' }}>+{receipt.pointsEarned} STAMP</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>New Card Balance:</span>
                        <strong className="mono">{receipt.newBalance.toLocaleString()} STAMP</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Customer Tier:</span>
                        <span className={`badge-tier ${receipt.tier.toLowerCase()}`}>{receipt.tier}</span>
                      </div>
                    </div>

                    <a 
                      href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="tx-link mono"
                      style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', margin: '20px 0' }}
                    >
                      View Solana Devnet Explorer <ExternalLink size={12} />
                    </a>

                    <button 
                      onClick={() => { setShowPaymentForm(false); handleResetCheckout(); }}
                      className="btn btn-accent"
                      style={{ width: '100%', marginTop: '8px' }}
                    >
                      Complete Order
                    </button>
                  </div>
                )}
              </div>

              {/* Customer Simulator panel (rendered directly underneath checkout card inside the overlay) */}
              {checkoutStep === 'waiting' && (
                <div className="simulator-panel" style={{ width: '100%', borderStyle: 'solid', borderWidth: '1px', background: 'rgba(20, 241, 149, 0.04)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
                  <div className="simulator-header">
                    <div className="sim-title">
                      <Wallet size={14} /> Devnet Customer Wallet Simulator
                    </div>
                  </div>

                  <div className="wallet-details">
                    <div className="wallet-address-copy">
                      <span>
                        {simCustomerKeypair 
                          ? `${simCustomerKeypair.publicKey.toBase58().slice(0, 10)}...${simCustomerKeypair.publicKey.toBase58().slice(-8)}` 
                          : 'Generating…'}
                      </span>
                    </div>
                    <div className="wallet-bal">
                      <span style={{ color: 'var(--text-secondary)' }}>Simulator Balance:</span>
                      <span className="wallet-bal-val">{simCustomerBalance.toFixed(4)} SOL</span>
                    </div>
                  </div>

                  <div className="sim-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={simFunding || !simCustomerKeypair}
                      onClick={handleFundSimCustomer}
                    >
                      {simFunding ? 'Requesting…' : 'Fund Simulator SOL'}
                    </button>
                    <button
                      className="btn btn-accent btn-sm"
                      disabled={simPaying || !simCustomerKeypair || simCustomerBalance < amountSol}
                      onClick={handleSimulatePayment}
                    >
                      {simPaying ? 'Broadcasting…' : 'Simulate Customer Payment'}
                    </button>
                  </div>

                  {/* Console output display */}
                  <div className="sim-console">
                    {simConsole.map((log, idx) => (
                      <div key={idx} className={`sim-console-line ${log.type}`}>
                        {log.type === 'error' && <AlertTriangle size={10} style={{ marginRight: '4px' }} />}
                        {log.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}


// ─── Page root ───────────────────────────────────────────────────────────────
export default function MerchantPage() {
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('vibestamp_merchant_profile');
    if (saved) {
      try {
        setProfile(JSON.parse(saved));
      } catch (_) {
        localStorage.removeItem('vibestamp_merchant_profile');
      }
    }
    setLoading(false);
  }, []);

  const handleReset = () => {
    localStorage.removeItem('vibestamp_merchant_profile');
    setProfile(null);
  };

  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!profile) return <MerchantSetup onComplete={setProfile} />;
  return <MerchantDashboard profile={profile} onReset={handleReset} onUpdate={setProfile} />;
}
