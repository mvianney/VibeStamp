import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { 
  User, 
  RefreshCw, 
  ArrowRight, 
  LogOut, 
  ChevronLeft, 
  Camera, 
  Check, 
  Copy, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle, 
  Wallet, 
  Coins, 
  Award, 
  Trophy, 
  Flame,
  Ticket,
  Layers,
  Shield
} from 'lucide-react';
import jsQR from 'jsqr';
import { 
  getMerchantState, 
  getCustomerLoyaltyCards, 
  redeemPoints, 
  getLoyaltyCard,
  exchangePoints,
  stakeBadgeForRaffle,
  getRaffles,
  getExchangeAgreement,
  initializeExchangeAgreement,
  type LoyaltyCard,
  type MerchantState,
  type RaffleState
} from '../loyaltyHelper';
import { simulatePayment } from '../solanaPayHelper';

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export interface CustomerProfile {
  customerName: string;
  walletSecretKey: number[];
  walletPublicKey: string;
}

// ─── One-time setup ──────────────────────────────────────────────────────────
function CustomerSetup({ onComplete }: { onComplete: (p: CustomerProfile) => void }) {
  const navigate = useNavigate();
  const connectionRef = useRef<Connection | null>(null);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    connectionRef.current = new Connection(RPC_URL, 'confirmed');
    setKeypair(Keypair.generate());
  }, []);

  const handleContinue = async () => {
    if (!keypair || !connectionRef.current) return;
    setLoading(true);

    // Auto-airdrop ~5 SOL in three silent 2-SOL requests.
    // Devnet caps individual requests at 2 SOL, so we fire three back-to-back.
    // Any that hit the rate-limiter fail silently — the user still proceeds.
    const conn = connectionRef.current;
    for (let i = 0; i < 2; i++) {
      try {
        const sig = await conn.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);
        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      } catch {
        // Silent fail — rate-limiter or devnet hiccup; proceed regardless
      }
    }

    const profile: CustomerProfile = {
      customerName: customerName.trim(),
      walletSecretKey: Array.from(keypair.secretKey),
      walletPublicKey: keypair.publicKey.toBase58(),
    };
    localStorage.setItem('vibestamp_customer_profile', JSON.stringify(profile));
    setLoading(false);
    onComplete(profile);
  };

  return (
    <div className="setup-page">
      <button className="back-link" onClick={() => navigate('/')} id="btn-back-landing-customer">
        <ChevronLeft size={16} /> Back
      </button>

      <div className="setup-card customer-setup-card">
        <div className="setup-icon-wrap customer-setup-icon">
          <User size={36} />
        </div>
        <h2 className="setup-title">Your VibeStamp Wallet</h2>
        <p className="setup-subtitle">
          A fresh Devnet wallet has been created for you. 4 free SOL will be airdropped to your
          wallet automatically to get you started on VibeStamp — no extra setup needed since
          we're on Devnet.
        </p>

        <div className="setup-form">
          {/* Customer Name */}
          <div className="form-group">
            <label htmlFor="customer-name">Your Name</label>
            <input
              id="customer-name"
              className="input-glow"
              placeholder="e.g. Alex Johnson"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Wallet address */}
          <div className="form-group">
            <label>Your Wallet Address</label>
            <input
              className="input-glow mono"
              readOnly
              value={keypair?.publicKey.toBase58() ?? 'Generating…'}
              style={{ background: 'rgba(0,0,0,0.2)', fontSize: '12px' }}
            />
          </div>

          <button
            className="btn btn-accent setup-submit"
            onClick={handleContinue}
            disabled={!keypair || loading || !customerName.trim()}
            id="btn-enter-customer"
          >
            {loading
              ? <><RefreshCw size={16} className="animate-spin-slow" /> Getting you started…</>
              : <>Continue to VibeStamp <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Main Customer View (Scanner, Pay Screen, Post Payment Receipt, and Loyalty Card Manager) ────────────
function CustomerMain({
  profile,
  onReset,
}: {
  profile: CustomerProfile;
  onReset: () => void;
}) {
  const connection = new Connection(RPC_URL, 'confirmed');

  // Sub-screens: 'loyalty' | 'passport' | 'exchange' | 'raffles' | 'pay' | 'receipt' | 'loyalty-detail'
  const [activeTab, setActiveTab] = useState<'loyalty' | 'passport' | 'exchange' | 'raffles' | 'pay' | 'receipt' | 'loyalty-detail'>('loyalty');
  
  // Wallet state
  const [balance, setBalance] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState(false);

  // Cards & Merchant States list
  const [cards, setCards] = useState<LoyaltyCard[]>([]);
  const [merchantStateMap, setMerchantStateMap] = useState<Record<string, MerchantState>>({});
  const [loadingCards, setLoadingCards] = useState(true);

  // QR Scanning camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Scanned / Parsed Payment request state
  const [scannedUriData, setScannedUriData] = useState<ParsedQr | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [payStatusText, setPayStatusText] = useState('');

  // Successful payment receipt state
  const [receiptData, setReceiptData] = useState<{
    pointsEarned: number;
    streakBonus: number;
    tierBonus: number;
    newBalance: number;
    tier: string;
    memo: string;
  } | null>(null);
  const [txSignature, setTxSignature] = useState('');

  // Selected Card Detail state
  const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(1000);
  const [redeemStatus, setRedeemStatus] = useState<{ success: boolean; msg: string } | null>(null);

  // Points Exchange state
  const [exchangeSourceIndex, setExchangeSourceIndex] = useState<number>(0);
  const [exchangeDestIndex, setExchangeDestIndex] = useState<number>(1);
  const [exchangePointsAmount, setExchangePointsAmount] = useState<number>(100);
  const [isExchanging, setIsExchanging] = useState(false);
  const [exchangeStatus, setExchangeStatus] = useState<{ success: boolean; msg: string } | null>(null);

  // Raffle Arena state
  const [raffles, setRaffles] = useState<RaffleState[]>([]);
  const [loadingRaffles, setLoadingRaffles] = useState(false);
  const [selectedRaffleBadgeIndex, setSelectedRaffleBadgeIndex] = useState<number>(0);
  const [isStaking, setIsStaking] = useState<Record<number, boolean>>({});
  const [stakingStatus, setStakingStatus] = useState<Record<number, { success: boolean; msg: string } | null>>({});

  // Load customer stats
  const refreshBalance = async () => {
    try {
      const bal = await connection.getBalance(new PublicKey(profile.walletPublicKey), 'confirmed');
      setBalance(bal / LAMPORTS_PER_SOL);
    } catch (e) {
      console.error('Failed to fetch SOL balance:', e);
    }
  };

  const loadCustomerData = async () => {
    try {
      setLoadingCards(true);
      const list = await getCustomerLoyaltyCards(connection, profile.walletPublicKey);
      
      const mStates: Record<string, MerchantState> = {};
      for (const card of list) {
        if (!mStates[card.merchant]) {
          const state = await getMerchantState(connection, card.merchant);
          if (state) {
            mStates[card.merchant] = state;
          }
        }
      }
      setCards(list);
      setMerchantStateMap(mStates);
    } catch (e) {
      console.error('Error loading loyalty data:', e);
    } finally {
      setLoadingCards(false);
    }
  };

  // 1. Mount checks (auto-airdrop under 0.1 SOL, fetch list)
  useEffect(() => {
    let active = true;
    async function checkAndAirdrop() {
      try {
        const pubkey = new PublicKey(profile.walletPublicKey);
        const bal = await connection.getBalance(pubkey, 'confirmed');
        const sol = bal / LAMPORTS_PER_SOL;
        if (active) setBalance(sol);
        
        if (sol < 0.1) {
          // Request 2 SOL
          const sig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
          await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
          const finalBal = await connection.getBalance(pubkey, 'confirmed');
          if (active) {
            setBalance(finalBal / LAMPORTS_PER_SOL);
          }
        }
      } catch (e) {
        console.error('Mount airdrop check error:', e);
      }
    }

    checkAndAirdrop();
    loadCustomerData();

    return () => {
      active = false;
    };
  }, [profile.walletPublicKey]);



  // 3. Camera Scanning Effect
  useEffect(() => {
    if (activeTab !== 'loyalty' || !isScanning) return;

    let active = true;
    let stream: MediaStream | null = null;
    let scanInterval: any = null;

    async function startCamera() {
      setCameraError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play();

          scanInterval = setInterval(() => {
            if (videoRef.current && canvasRef.current && active) {
              const video = videoRef.current;
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d');
              if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert'
                });
                if (code && code.data) {
                  // Found QR! Stop scanning and parse
                  clearInterval(scanInterval);
                  setIsScanning(false);
                  handleQrCodeScanned(code.data);
                }
              }
            }
          }, 300);
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setCameraError(err.message || 'Could not access camera. Please verify permissions.');
      }
    }

    startCamera();

    return () => {
      active = false;
      if (scanInterval) clearInterval(scanInterval);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [activeTab, isScanning]);

  // QR parsing handler
  const handleQrCodeScanned = (qrData: string) => {
    try {
      const parsed = parseSolanaPayUri(qrData);
      setScannedUriData(parsed);
      setActiveTab('pay');
    } catch (e: any) {
      console.error(e);
      alert(`Invalid QR code: ${e.message || e}`);
      // Restart scanner
      setActiveTab('loyalty');
      setTimeout(() => setIsScanning(true), 100);
    }
  };

  // 4. Confirm & Broadcast Payment handler
  const handleConfirmPay = async () => {
    if (!scannedUriData) return;
    setIsPaying(true);
    setPayStatusText('Generating Solana Pay transaction...');

    try {
      const customerKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      const merchantPublicKey = new PublicKey(scannedUriData.recipient);
      const referencePublicKey = new PublicKey(scannedUriData.reference);

      // Construct auto memo: "Customer Name - Product Name"
      const productNameClean = scannedUriData.message.replace('Purchase: ', '').trim();
      const autoMemo = `${profile.customerName} - ${productNameClean}`;

      // Fetch the card state before transaction to track points earned
      const prevCard = await getLoyaltyCard(connection, scannedUriData.recipient, profile.walletPublicKey);
      const prevBalance = prevCard ? prevCard.stampBalance : 0;
      const prevPurchases = prevCard ? prevCard.totalPurchases : 0;

      const sig = await simulatePayment({
        connection,
        customerKeypair,
        merchantPublicKey,
        amount: scannedUriData.amount,
        referencePublicKey,
        memo: autoMemo,
        logCallback: (msg) => {
          setPayStatusText(msg);
        }
      });

      setTxSignature(sig);
      setPayStatusText('Waiting for merchant to record reward on-chain...');

      // Poll customer loyalty card PDA on-chain until total purchases count increments
      let updatedCard = null;
      for (let retries = 0; retries < 25; retries++) {
        updatedCard = await getLoyaltyCard(connection, scannedUriData.recipient, profile.walletPublicKey);
        if (updatedCard && updatedCard.totalPurchases > prevPurchases) {
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!updatedCard || updatedCard.totalPurchases <= prevPurchases) {
        throw new Error('Transaction verified, but reward state sync timed out. Please check your card later.');
      }

      const pointsEarned = updatedCard.stampBalance - prevBalance;

      setReceiptData({
        pointsEarned,
        streakBonus: 0,
        tierBonus: 0,
        newBalance: updatedCard.stampBalance,
        tier: updatedCard.tier,
        memo: autoMemo
      });

      setPayStatusText('');
      setIsPaying(false);
      setActiveTab('receipt');
      loadCustomerData();
      await refreshBalance();
    } catch (err: any) {
      console.error(err);
      alert(`Checkout execution failed: ${err.message || err}`);
      setIsPaying(false);
      setPayStatusText('');
    }
  };

  // 5. Points Redemption handler
  const handleRedeemPoints = async () => {
    if (!selectedCard) return;
    setRedeemStatus(null);
    const rate = merchantStateMap[selectedCard.merchant]?.redemptionRate || 1000;
    if (pointsToRedeem <= 0 || pointsToRedeem % rate !== 0) {
      setRedeemStatus({ success: false, msg: `Redemption points must be in increments of ${rate.toLocaleString()} STAMP.` });
      return;
    }
    if (selectedCard.stampBalance < pointsToRedeem) {
      setRedeemStatus({ success: false, msg: 'Insufficient points balance on your loyalty card.' });
      return;
    }

    try {
      const customerKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      setRedeemStatus({ success: true, msg: 'Broadcasting point redemption on-chain...' });
      const tx = await redeemPoints(connection, customerKeypair, selectedCard.merchant, pointsToRedeem);

      // Fetch updated card state
      const updatedCard = await getLoyaltyCard(connection, selectedCard.merchant, profile.walletPublicKey);
      if (!updatedCard) throw new Error('Failed to retrieve updated loyalty card from chain');

      const discountUSD = pointsToRedeem / rate;
      setRedeemStatus({
        success: true,
        msg: `Claimed! Successfully redeemed ${pointsToRedeem.toLocaleString()} STAMP for a $${discountUSD.toFixed(2)} discount reward! Tx: ${tx.slice(0,8)}...`
      });
      setSelectedCard(updatedCard);
      loadCustomerData();
    } catch (e: any) {
      setRedeemStatus({ success: false, msg: e.message || 'Redemption request failed' });
    }
  };

  // 6. Bilateral Points Exchange handler
  const handleExecuteExchange = async () => {
    const sourceCard = cards[exchangeSourceIndex];
    const destCard = cards[exchangeDestIndex];
    if (!sourceCard || !destCard) return;

    setIsExchanging(true);
    setExchangeStatus({ success: true, msg: 'Broadcasting points exchange transaction on-chain...' });

    try {
      const customerKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      
      // Fetch bilateral exchange agreement on-chain.
      // If it doesn't exist, we can automatically initialize it using the merchant's keypair from local storage
      const agreement = await getExchangeAgreement(connection, sourceCard.merchant, destCard.merchant);
      if (!agreement) {
        setExchangeStatus({ success: true, msg: 'Initializing on-chain exchange partnership agreement...' });
        const savedMerchant = localStorage.getItem('vibestamp_merchant_profile');
        if (savedMerchant) {
          const merchantProfile = JSON.parse(savedMerchant);
          if (merchantProfile.walletPublicKey === sourceCard.merchant) {
            const mKeypair = Keypair.fromSecretKey(new Uint8Array(merchantProfile.walletSecretKey));
            await initializeExchangeAgreement(connection, mKeypair, destCard.merchant, 1, 1);
          } else if (merchantProfile.walletPublicKey === destCard.merchant) {
            const mKeypair = Keypair.fromSecretKey(new Uint8Array(merchantProfile.walletSecretKey));
            await initializeExchangeAgreement(connection, mKeypair, sourceCard.merchant, 1, 1);
          }
        }
      }

      setExchangeStatus({ success: true, msg: 'Signing and executing points exchange...' });
      const tx = await exchangePoints(connection, customerKeypair, sourceCard.merchant, destCard.merchant, exchangePointsAmount);
      
      setExchangeStatus({
        success: true,
        msg: `Exchange completed successfully! Tx: ${tx.slice(0, 10)}...`
      });
      setExchangePointsAmount(100);
      loadCustomerData();
    } catch (e: any) {
      console.error(e);
      setExchangeStatus({ success: false, msg: e.message || 'Points exchange failed' });
    } finally {
      setIsExchanging(false);
    }
  };

  // 7. Raffle Arena data fetcher
  const loadRafflesData = async () => {
    setLoadingRaffles(true);
    try {
      const list: RaffleState[] = [];
      for (const card of cards) {
        const rs = await getRaffles(connection, card.merchant);
        list.push(...rs);
      }
      setRaffles(list);
    } catch (e) {
      console.error('Error loading raffles:', e);
    } finally {
      setLoadingRaffles(false);
    }
  };

  // Trigger raffle fetch when switching tabs
  useEffect(() => {
    if (activeTab === 'raffles' && cards.length > 0) {
      loadRafflesData();
    }
  }, [activeTab, cards.length]);

  // 8. Badge Staking handler
  const handleStakeBadge = async (merchantOwner: string, raffleIndex: number) => {
    setIsStaking(prev => ({ ...prev, [raffleIndex]: true }));
    setStakingStatus(prev => ({ ...prev, [raffleIndex]: { success: true, msg: 'Signing and staking badge on-chain...' } }));

    try {
      const customerKeypair = Keypair.fromSecretKey(new Uint8Array(profile.walletSecretKey));
      const tx = await stakeBadgeForRaffle(
        connection,
        customerKeypair,
        merchantOwner,
        raffleIndex,
        selectedRaffleBadgeIndex
      );

      setStakingStatus(prev => ({
        ...prev,
        [raffleIndex]: { success: true, msg: `Entered draw successfully! Tx: ${tx.slice(0, 8)}...` }
      }));

      loadRafflesData();
      loadCustomerData();
    } catch (e: any) {
      console.error(e);
      setStakingStatus(prev => ({
        ...prev,
        [raffleIndex]: { success: false, msg: e.message || 'Failed to stake badge' }
      }));
    } finally {
      setIsStaking(prev => ({ ...prev, [raffleIndex]: false }));
    }
  };

  // Helper parsers
  interface ParsedQr {
    recipient: string;
    amount: number;
    reference: string;
    label: string;
    message: string;
    memo: string;
  }

  const parseSolanaPayUri = (uri: string): ParsedQr => {
    if (!uri.startsWith('solana:')) {
      throw new Error('Invalid protocol. Must start with "solana:"');
    }
    const urlObj = new URL(uri.replace('solana:', 'https://dummy.com/'));
    const recipient = uri.split('?')[0].replace('solana:', '');
    const amount = Number(urlObj.searchParams.get('amount') || '0');
    const reference = urlObj.searchParams.get('reference') || '';
    const label = decodeURIComponent(urlObj.searchParams.get('label') || '');
    const message = decodeURIComponent(urlObj.searchParams.get('message') || '');
    const memo = decodeURIComponent(urlObj.searchParams.get('memo') || '');

    if (!recipient) {
      throw new Error('Missing merchant recipient address');
    }
    if (!reference) {
      throw new Error('Missing transaction reference tracking key');
    }

    return { recipient, amount, reference, label, message, memo };
  };

  const copyWalletKey = () => {
    navigator.clipboard.writeText(profile.walletPublicKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Achievement Badge Helper
  const achievementLabels = [
    { title: 'First Stamp', desc: 'Visited a merchant' },
    { title: 'Stamp Collector', desc: 'Made 5 purchases' },
    { title: 'Loyal Fan', desc: 'Made 10 purchases' },
    { title: 'Super Fan', desc: 'Made 25 purchases' },
    { title: 'Streak Starter', desc: 'Kept active for 2 weeks' },
    { title: 'Streak Master', desc: 'Kept active for 4 weeks' },
    { title: 'Unstoppable', desc: 'Kept active for 8 weeks' },
    { title: 'Silver Member', desc: 'Earned Silver tier' },
    { title: 'Gold Member', desc: 'Earned Gold tier' },
    { title: 'Big Spender', desc: 'Paid single bill ≥ 1 SOL' },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" onClick={() => setActiveTab('loyalty')} style={{ cursor: 'pointer' }}>
          <div className="brand-logo" style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-primary) 100%)' }}>⚡</div>
          <div className="brand-info">
            <h1>{profile.customerName}</h1>
            <p>VibeStamp Loyalty Portal</p>
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
            id="btn-customer-reset"
          >
            <LogOut size={14} /> Reset
          </button>
        </div>
      </header>

      {/* CUSTOMER PROFILE ROW */}
      <div className="profile-banner-wrap" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px 24px', marginBottom: '24px', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>YOUR CUSTOMER WALLET</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {profile.walletPublicKey.slice(0, 8)}...{profile.walletPublicKey.slice(-8)}
            </span>
            <button 
              className="btn btn-secondary btn-sm" 
              style={{ padding: '4px 8px', minWidth: 'auto', fontSize: '11px' }}
              onClick={copyWalletKey}
            >
              {copiedKey ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <Copy size={12} />}
            </button>
            <a 
              href={`https://explorer.solana.com/address/${profile.walletPublicKey}?cluster=devnet`} 
              target="_blank" 
              rel="noreferrer" 
              className="tx-link"
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              Explorer <ExternalLink size={10} />
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Wallet Balance</span>
            <strong className="mono" style={{ fontSize: '20px', color: 'var(--color-primary)' }}>{balance.toFixed(4)} SOL</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <button 
              className="btn btn-secondary"
              disabled={true}
              style={{ padding: '10px 14px', opacity: 0.75, cursor: 'not-allowed', pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
            >
              <Wallet size={14} />
              <span style={{ marginLeft: '6px' }}>Fund Wallet</span>
            </button>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'lowercase', letterSpacing: '0.5px' }}>
              mainnet version only
            </span>
          </div>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS BAR */}
      <div className="sub-nav-tabs" style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button 
          className={`tab-btn ${activeTab === 'loyalty' ? 'active' : ''}`}
          onClick={() => { setActiveTab('loyalty'); setSelectedCard(null); }}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            background: activeTab === 'loyalty' ? 'rgba(20, 241, 149, 0.08)' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'loyalty' ? 'rgba(20, 241, 149, 0.2)' : 'transparent',
            color: activeTab === 'loyalty' ? 'var(--color-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          💳 Loyalty Cards
        </button>
        
        <button 
          className={`tab-btn ${activeTab === 'passport' ? 'active' : ''}`}
          onClick={() => { setActiveTab('passport'); setSelectedCard(null); }}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            background: activeTab === 'passport' ? 'rgba(20, 241, 149, 0.08)' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'passport' ? 'rgba(20, 241, 149, 0.2)' : 'transparent',
            color: activeTab === 'passport' ? 'var(--color-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          🛂 Loyalty Passport
        </button>

        <button 
          className={`tab-btn ${activeTab === 'exchange' ? 'active' : ''}`}
          onClick={() => { setActiveTab('exchange'); setSelectedCard(null); }}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            background: activeTab === 'exchange' ? 'rgba(20, 241, 149, 0.08)' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'exchange' ? 'rgba(20, 241, 149, 0.2)' : 'transparent',
            color: activeTab === 'exchange' ? 'var(--color-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          🔁 Points Exchange
        </button>

        <button 
          className={`tab-btn ${activeTab === 'raffles' ? 'active' : ''}`}
          onClick={() => { setActiveTab('raffles'); setSelectedCard(null); }}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            background: activeTab === 'raffles' ? 'rgba(20, 241, 149, 0.08)' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'raffles' ? 'rgba(20, 241, 149, 0.2)' : 'transparent',
            color: activeTab === 'raffles' ? 'var(--color-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          🎟️ Raffle Arena
        </button>
      </div>

      <main className="dashboard-content">
        
        {/* LOYALTY TAB */}
        {activeTab === 'loyalty' && (
          <div className="customer-dashboard-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'start' }}>
            
            {/* LEFT COLUMN: LOYALTY CARDS */}
            <div className="loyalty-cards-section" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Your Loyalty Cards</h2>
              </div>

              {loadingCards ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <RefreshCw className="animate-spin-slow" size={32} style={{ color: 'var(--color-accent)' }} />
                  <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Retrieving your loyalty card PDAs...</p>
                </div>
              ) : cards.length === 0 ? (
                <div className="empty-state" style={{ padding: '60px 24px', background: 'var(--bg-surface)', border: '1px dashed var(--border-color)', borderRadius: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>💳</div>
                  <h3>No Loyalty Cards Yet</h3>
                  <p style={{ maxWidth: '320px', margin: '8px auto', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Scan a VibeStamp payment QR code at any merchant store to earn points and claim your card instantly!
                  </p>
                </div>
              ) : (
                <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                  {cards.map(card => {
                    const mState = merchantStateMap[card.merchant];
                    const storeName = mState?.storeName || 'Simulated Store';
                    return (
                      <div 
                        key={card.merchant}
                        className={`loyalty-pass-card ${card.tier.toLowerCase()}`}
                        onClick={() => {
                          setSelectedCard(card);
                          setRedeemStatus(null);
                          setActiveTab('loyalty-detail');
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="loyalty-pass-header">
                          <div>
                            <div className="loyalty-pass-store">{storeName}</div>
                            <div className="loyalty-pass-merchant">
                              {card.merchant.slice(0, 6)}...{card.merchant.slice(-6)}
                            </div>
                          </div>
                          <span className={`badge-tier ${card.tier.toLowerCase()}`}>
                            {card.tier === 'Gold' ? '🥇 Gold' : card.tier === 'Silver' ? '🥈 Silver' : '🥉 Bronze'}
                          </span>
                        </div>

                        <div className="loyalty-pass-balance">
                          <span className="loyalty-pass-bal-label">STAMP BALANCE</span>
                          <span className="loyalty-pass-bal-val">{card.stampBalance.toLocaleString()}</span>
                        </div>

                        <div className="loyalty-pass-footer">
                          <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: card.streakCount > 0 ? '#ff5a00' : 'var(--text-muted)' }}>
                            <Flame size={14} /> {card.streakCount > 0 ? `${card.streakCount}-week streak` : 'No streak'}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {card.totalPurchases} visit{card.totalPurchases === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: SCANNING CARD */}
            <div className="scanner-section panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color)', minHeight: '340px', justifyContent: 'center', alignItems: 'center' }}>
              {!isScanning ? (
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px 0' }}>
                  <div style={{ fontSize: '48px', color: 'var(--color-accent)' }}>📷</div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Pay & Claim Rewards</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '280px', margin: '0 auto' }}>
                    Open the camera scanner to scan a merchant's payment QR code, send SOL/USDC on Devnet, and claim STAMP rewards!
                  </p>
                  <button 
                    className="btn btn-accent"
                    onClick={() => setIsScanning(true)}
                    style={{ padding: '12px 24px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}
                  >
                    <Camera size={16} /> Start Camera Scanner
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Scanner Active</h2>
                      <button className="btn btn-secondary btn-sm" onClick={() => setIsScanning(false)} style={{ padding: '4px 8px', minWidth: 'auto', fontSize: '11px' }}>
                        Cancel
                      </button>
                    </div>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Align the merchant's Solana Pay QR code to checkout.
                    </p>
                  </div>

                  {cameraError ? (
                    <div className="panel" style={{ padding: '24px', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
                      <AlertTriangle size={32} style={{ color: 'var(--color-secondary)' }} />
                      <h3>Camera Permission Required</h3>
                      <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', textAlign: 'center' }}>{cameraError}</p>
                      <button className="btn btn-secondary btn-sm" onClick={() => setIsScanning(false)}>
                        Go Back
                      </button>
                    </div>
                  ) : (
                    <div className="scanner-viewport" style={{ margin: '0 auto', width: '100%', maxWidth: '320px' }}>
                      <video ref={videoRef} className="scanner-video" style={{ width: '100%', borderRadius: '16px', transform: 'scaleX(-1)' }} />
                      <div className="scanner-overlay-box">
                        <div className="scanner-target-corners" />
                        <div className="scanner-laser" />
                      </div>
                    </div>
                  )}

                  <canvas ref={canvasRef} style={{ display: 'none' }} />

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>
                    Powered by standard Solana Pay protocol queries.
                  </div>
                </>
              )}
            </div>

          </div>
        )}

        {/* PASSPORT TAB */}
        {activeTab === 'passport' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Your Loyalty Passport</h2>
            
            {/* Passport Stats Widgets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <div className="panel" style={{ padding: '16px 20px', textAlign: 'center', background: 'var(--bg-surface)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Stores Visited</span>
                <strong style={{ fontSize: '28px', color: 'var(--color-primary)', display: 'block', marginTop: '6px' }}>{cards.length}</strong>
              </div>
              <div className="panel" style={{ padding: '16px 20px', textAlign: 'center', background: 'var(--bg-surface)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total STAMP Balance</span>
                <strong style={{ fontSize: '28px', color: 'var(--color-accent)', display: 'block', marginTop: '6px' }}>
                  {cards.reduce((sum, c) => sum + c.stampBalance, 0).toLocaleString()}
                </strong>
              </div>
              <div className="panel" style={{ padding: '16px 20px', textAlign: 'center', background: 'var(--bg-surface)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ecosystem Visits</span>
                <strong style={{ fontSize: '28px', color: 'var(--text-primary)', display: 'block', marginTop: '6px' }}>
                  {cards.reduce((sum, c) => sum + c.totalPurchases, 0)}
                </strong>
              </div>
              <div className="panel" style={{ padding: '16px 20px', textAlign: 'center', background: 'var(--bg-surface)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>cNFT Badges Earned</span>
                <strong style={{ fontSize: '28px', color: '#ffd700', display: 'block', marginTop: '6px' }}>
                  {cards.reduce((sum, c) => sum + c.achievements.filter(Boolean).length, 0)} / {cards.length * 10}
                </strong>
              </div>
            </div>

            {/* Passport metadata panel */}
            <div className="setup-panel" style={{ padding: '20px', background: 'rgba(20,241,149,0.03)', border: '1px solid rgba(20,241,149,0.1)', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '32px' }}>🛂</div>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 700 }}>Ecosystem Passport PDA Verified</h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Your loyalty credentials are securely tied to your Solana wallet on-chain.
                  </p>
                </div>
              </div>
              <div className="network-badge" style={{ background: 'rgba(20,241,149,0.1)', color: 'var(--color-primary)' }}>
                Active Passport
              </div>
            </div>

            {/* Global Badge Gallery */}
            <div className="panel" style={{ padding: '24px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Shield size={18} style={{ color: 'var(--color-primary)' }} /> Ecosystem cNFT Badge Gallery
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                View all achievement badges issued to your customer wallet across the entire VibeStamp network.
              </p>

              {cards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  Unlock badges by completing store achievements!
                </div>
              ) : (
                <div className="achievements-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                  {cards.flatMap(card => {
                    const storeName = merchantStateMap[card.merchant]?.storeName || 'Store';
                    return card.achievements.map((earned, idx) => {
                      if (!earned) return null;
                      const label = achievementLabels[idx];
                      return (
                        <div key={`${card.merchant}_${idx}`} className="achievement-badge earned" style={{ border: '1px solid rgba(20, 241, 149, 0.12)', background: 'rgba(20, 241, 149, 0.02)', padding: '16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div className="achievement-icon" style={{ background: 'rgba(20, 241, 149, 0.08)', color: 'var(--color-primary)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                            <Trophy size={16} />
                          </div>
                          <div className="achievement-title" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{label.title}</div>
                          <div className="achievement-desc" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{label.desc}</div>
                          <div style={{ marginTop: '6px', fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-accent)', fontWeight: 600 }}>
                            {storeName}
                          </div>
                        </div>
                      );
                    });
                  }).filter(Boolean)}
                  {cards.reduce((sum, c) => sum + c.achievements.filter(Boolean).length, 0) === 0 && (
                    <div style={{ textAlign: 'center', gridColumn: '1 / -1', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No badges unlocked yet. Keep scanning to earn achievements!
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* EXCHANGE TAB */}
        {activeTab === 'exchange' && (
          <div className="panel" style={{ padding: '32px', maxWidth: '640px', margin: '0 auto', border: '1px solid var(--border-color)' }}>
            <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '24px' }}>
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>🔁</div>
              <h2 style={{ fontSize: '22px', fontWeight: 800 }}>Point Exchange Portal</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Bilateral cross-merchant point exchange. Convert STAMP points between partner stores.
              </p>
            </div>

            {cards.length < 2 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                ⚠️ You need loyalty cards from at least two different merchants to exchange points. Keep shopping!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>From Store (Source)</label>
                    <select
                      className="input-glow"
                      value={exchangeSourceIndex}
                      onChange={(e) => setExchangeSourceIndex(Number(e.target.value))}
                      style={{ width: '100%', background: 'var(--bg-input)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      {cards.map((c, idx) => (
                        <option key={idx} value={idx}>
                          {merchantStateMap[c.merchant]?.storeName || 'Store'} ({c.stampBalance.toLocaleString()} pts)
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>To Store (Destination)</label>
                    <select
                      className="input-glow"
                      value={exchangeDestIndex}
                      onChange={(e) => setExchangeDestIndex(Number(e.target.value))}
                      style={{ width: '100%', background: 'var(--bg-input)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      {cards.map((c, idx) => (
                        <option key={idx} value={idx} disabled={idx === exchangeSourceIndex}>
                          {merchantStateMap[c.merchant]?.storeName || 'Store'} ({c.stampBalance.toLocaleString()} pts)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Points to Convert</label>
                  <input
                    type="number"
                    className="input-glow mono"
                    value={exchangePointsAmount}
                    onChange={(e) => setExchangePointsAmount(Number(e.target.value))}
                    min={1}
                    max={cards[exchangeSourceIndex]?.stampBalance || 0}
                    placeholder="Enter point amount"
                    style={{ width: '100%', background: 'var(--bg-input)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Max available: <strong>{(cards[exchangeSourceIndex]?.stampBalance || 0).toLocaleString()} STAMP</strong>
                  </div>
                </div>

                {/* Exchange rate simulation / on-chain preview */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Bilateral Conversion Rate:</span>
                    <strong style={{ color: 'var(--color-primary)' }}>1 : 1.00 (Fixed Devnet Rate)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                    <span>You will receive:</span>
                    <strong style={{ color: 'var(--color-accent)', fontSize: '15px' }}>
                      {exchangePointsAmount.toLocaleString()} STAMP
                    </strong>
                  </div>
                </div>

                {exchangeStatus && (
                  <div style={{
                    padding: '12px',
                    borderRadius: '12px',
                    fontSize: '12.5px',
                    border: exchangeStatus.success ? '1px solid rgba(20, 241, 149, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                    background: exchangeStatus.success ? 'rgba(20, 241, 149, 0.02)' : 'rgba(239, 68, 68, 0.02)',
                    color: exchangeStatus.success ? 'var(--color-primary)' : 'var(--color-secondary)',
                    textAlign: 'center'
                  }}>
                    {exchangeStatus.msg}
                  </div>
                )}

                <button
                  className="btn btn-accent"
                  disabled={isExchanging || exchangePointsAmount <= 0 || exchangePointsAmount > (cards[exchangeSourceIndex]?.stampBalance || 0)}
                  onClick={handleExecuteExchange}
                  style={{ padding: '14px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  {isExchanging ? (
                    <><RefreshCw className="animate-spin-slow" size={16} /> Broadcasting transaction...</>
                  ) : (
                    <><Layers size={16} /> Execute Point Exchange</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* RAFFLE ARENA TAB */}
        {activeTab === 'raffles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Raffle Arena</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Stake your achievement badges to enter merchant draws and win SOL prizes.
                </p>
              </div>
              <button 
                onClick={loadRafflesData} 
                className="btn btn-secondary btn-sm"
                disabled={loadingRaffles}
              >
                <RefreshCw size={12} className={loadingRaffles ? 'animate-spin-slow' : ''} style={{ marginRight: '6px' }} /> Refresh Arena
              </button>
            </div>

            {loadingRaffles ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <RefreshCw className="animate-spin-slow" size={32} style={{ color: 'var(--color-accent)' }} />
                <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Fetching active on-chain raffles...</p>
              </div>
            ) : raffles.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 24px', background: 'var(--bg-surface)', border: '1px dashed var(--border-color)', borderRadius: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎟️</div>
                <h3>No Active Raffles Found</h3>
                <p style={{ maxWidth: '360px', margin: '8px auto', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Merchant stores create on-chain raffles from their dashboard. Visited stores currently do not have active drawings.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {raffles.map((raffle, idx) => {
                  const mState = merchantStateMap[raffle.merchant];
                  const storeName = mState?.storeName || 'Merchant Store';
                  const isClosed = Date.now() / 1000 >= raffle.closesAt || !raffle.active;
                  
                  // Check if customer is already entered
                  const entryIdx = raffle.stakedEntries.indexOf(profile.walletPublicKey);
                  const isEntered = entryIdx !== -1;
                  const enteredBadgeIdx = isEntered ? raffle.stakedBadges[entryIdx] : -1;

                  // Find eligible customer card for this merchant
                  const customerCard = cards.find(c => c.merchant === raffle.merchant);
                  const unlockedBadgeIndices = customerCard 
                    ? customerCard.achievements.map((unlocked, index) => unlocked ? index : -1).filter(index => index !== -1)
                    : [];

                  return (
                    <div key={idx} className="panel" style={{ padding: '24px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span className="network-badge" style={{ background: isClosed ? 'rgba(255,255,255,0.05)' : 'rgba(20,241,149,0.08)', color: isClosed ? 'var(--text-muted)' : 'var(--color-primary)' }}>
                            {isClosed ? 'Closed' : 'Active'}
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Raffle #{raffle.raffleIndex}</strong>
                        </div>
                        
                        <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{storeName}</h3>
                        <p className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Merchant: {raffle.merchant.slice(0, 10)}...{raffle.merchant.slice(-8)}
                        </p>

                        <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Prize Pool</span>
                            <strong className="mono" style={{ fontSize: '18px', color: 'var(--color-primary)' }}>
                              {(raffle.prizeLamports / LAMPORTS_PER_SOL).toFixed(3)} SOL
                            </strong>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Total Entries</span>
                            <strong className="mono" style={{ fontSize: '18px', color: 'var(--color-accent)' }}>
                              {raffle.stakedEntries.length} tickets
                            </strong>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Closes At</span>
                            <strong className="mono" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                              {new Date(raffle.closesAt * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px solid var(--border-color)', paddingLeft: '24px' }}>
                        {isEntered ? (
                          <div style={{ background: 'rgba(20,241,149,0.03)', border: '1px solid rgba(20,241,149,0.1)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px', color: 'var(--color-primary)' }}><Ticket size={24} /></div>
                            <strong style={{ display: 'block', fontSize: '14px', color: 'var(--color-primary)', marginTop: '4px' }}>You are Entered!</strong>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Staked Badge: <strong>{achievementLabels[enteredBadgeIdx]?.title || `Badge #${enteredBadgeIdx}`}</strong>
                            </span>
                          </div>
                        ) : isClosed ? (
                          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                            {raffle.winner ? (
                              <div>
                                🏆 Winner Selected:
                                <strong className="mono" style={{ display: 'block', color: 'var(--color-accent)', fontSize: '12px', marginTop: '4px' }}>
                                  {raffle.winner.slice(0, 10)}...{raffle.winner.slice(-8)}
                                </strong>
                              </div>
                            ) : (
                              'Drawing closed with no winner selected.'
                            )}
                          </div>
                        ) : unlockedBadgeIndices.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '16px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                            ⚠️ You haven't unlocked any badges at this store yet. Earn a badge first to qualify!
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div className="form-group">
                              <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Select Badge to Stake</label>
                              <select
                                className="input-glow"
                                value={selectedRaffleBadgeIndex}
                                onChange={(e) => setSelectedRaffleBadgeIndex(Number(e.target.value))}
                                style={{ width: '100%', background: 'var(--bg-input)', padding: '10px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                              >
                                {unlockedBadgeIndices.map(badgeIndex => (
                                  <option key={badgeIndex} value={badgeIndex}>
                                    {achievementLabels[badgeIndex]?.title}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {stakingStatus[raffle.raffleIndex] && (
                              <div style={{
                                padding: '8px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                border: stakingStatus[raffle.raffleIndex]?.success ? '1px solid rgba(20, 241, 149, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                                background: stakingStatus[raffle.raffleIndex]?.success ? 'rgba(20, 241, 149, 0.02)' : 'rgba(239, 68, 68, 0.02)',
                                color: stakingStatus[raffle.raffleIndex]?.success ? 'var(--color-primary)' : 'var(--color-secondary)',
                                textAlign: 'center'
                              }}>
                                {stakingStatus[raffle.raffleIndex]?.msg}
                              </div>
                            )}

                            <button
                              className="btn btn-accent btn-sm"
                              onClick={() => handleStakeBadge(raffle.merchant, raffle.raffleIndex)}
                              disabled={isStaking[raffle.raffleIndex]}
                              style={{ width: '100%', padding: '10px' }}
                            >
                              {isStaking[raffle.raffleIndex] ? (
                                <><RefreshCw className="animate-spin-slow" size={12} /> Staking...</>
                              ) : (
                                'Stake Badge to Enter Draw'
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PAY SCREEN TAB */}
        {activeTab === 'pay' && scannedUriData && (
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <div className="panel" style={{ padding: '32px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', textAlign: 'center' }}>
                <span className="network-badge" style={{ marginBottom: '8px' }}>
                  <Coins size={14} /> Transaction Request
                </span>
                <h2 style={{ fontSize: '22px', fontWeight: 800 }}>Confirm Checkout</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '10px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Merchant Store:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{scannedUriData.label || 'VibeStamp Store'}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '10px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Recipient Address:</span>
                  <span className="mono" style={{ fontSize: '12px' }}>
                    {scannedUriData.recipient.slice(0, 8)}...{scannedUriData.recipient.slice(-8)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '10px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Product details:</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {scannedUriData.message.replace('Purchase: ', '')}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '10px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>On-Chain Memo:</span>
                  <span className="mono" style={{ color: 'var(--color-accent)' }}>
                    {profile.customerName} - {scannedUriData.message.replace('Purchase: ', '')}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(20, 241, 149, 0.03)', border: '1px solid rgba(20, 241, 149, 0.1)', padding: '16px', borderRadius: '16px', borderStyle: 'solid', borderWidth: '1px', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Payment Amount</span>
                  <strong className="mono" style={{ fontSize: '32px', color: 'var(--color-primary)' }}>
                    {scannedUriData.amount.toFixed(4)} SOL
                  </strong>
                </div>
              </div>

              {isPaying ? (
                <div style={{ textAlign: 'center', padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <RefreshCw className="animate-spin-slow" size={28} style={{ color: 'var(--color-accent)' }} />
                  <p className="mono" style={{ fontSize: '12.5px', color: 'var(--color-accent)' }}>{payStatusText}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ flex: 1, padding: '14px' }} 
                    onClick={() => {
                      setScannedUriData(null);
                      setActiveTab('loyalty');
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-accent" 
                    style={{ flex: 2, padding: '14px' }}
                    onClick={handleConfirmPay}
                    disabled={balance < scannedUriData.amount}
                  >
                    {balance < scannedUriData.amount ? 'Insufficient Balance' : 'Confirm & Pay'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* POST PAYMENT TAB */}
        {activeTab === 'receipt' && receiptData && (
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <div className="panel" style={{ padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', border: '1px solid var(--border-color)' }}>
              
              <div className="success-icon-circle" style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(20, 241, 149, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                <CheckCircle size={36} />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Payment Confirmed!</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Your transaction signed and cleared successfully on Solana Devnet.
              </p>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>On-Chain Memo:</span>
                  <strong className="mono" style={{ color: 'var(--color-accent)' }}>{receiptData.memo}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Base points earned:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    +{receiptData.pointsEarned - receiptData.streakBonus - receiptData.tierBonus} STAMP
                  </strong>
                </div>

                {receiptData.streakBonus > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#ff5a00' }}>🔥 Streak Bonus:</span>
                    <strong style={{ color: '#ff5a00' }}>+{receiptData.streakBonus}</strong>
                  </div>
                )}

                {receiptData.tierBonus > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-accent)' }}>⚡ Tier Bonus:</span>
                    <strong style={{ color: 'var(--color-accent)' }}>+{receiptData.tierBonus}</strong>
                  </div>
                )}

                <div style={{ borderTop: '1px dashed var(--border-color)', margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ fontWeight: 600 }}>Total Earned:</span>
                  <strong style={{ color: 'var(--color-primary)' }}>+{receiptData.pointsEarned} STAMP</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>New Card Balance:</span>
                  <strong className="mono">{receiptData.newBalance.toLocaleString()} STAMP</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Customer Tier:</span>
                  <span className={`badge-tier ${receiptData.tier.toLowerCase()}`}>{receiptData.tier}</span>
                </div>
              </div>

              <a 
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="tx-link mono"
                style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', margin: '8px 0' }}
              >
                View Transaction on Explorer <ExternalLink size={12} />
              </a>

              <button 
                onClick={() => {
                  setReceiptData(null);
                  setTxSignature('');
                  setActiveTab('loyalty');
                }}
                className="btn btn-accent"
                style={{ width: '100%', padding: '14px' }}
              >
                View My Loyalty Cards
              </button>
            </div>
          </div>
        )}

        {/* LOYALTY DETAIL TAB */}
        {activeTab === 'loyalty-detail' && selectedCard && (
          <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('loyalty')}>
                <ChevronLeft size={16} /> Back to cards
              </button>
            </div>

            {/* CARD BANNER PANEL */}
            <div className={`loyalty-pass-card ${selectedCard.tier.toLowerCase()}`} style={{ cursor: 'default' }}>
              <div className="loyalty-pass-header">
                <div>
                  <div className="loyalty-pass-store" style={{ fontSize: '24px' }}>
                    {merchantStateMap[selectedCard.merchant]?.storeName || 'Simulated Store'}
                  </div>
                  <div className="loyalty-pass-merchant mono" style={{ fontSize: '12px' }}>
                    Merchant: {selectedCard.merchant}
                  </div>
                </div>
                <span className={`badge-tier ${selectedCard.tier.toLowerCase()}`} style={{ fontSize: '12px', padding: '6px 12px' }}>
                  {selectedCard.tier === 'Gold' ? '🥇 Gold' : selectedCard.tier === 'Silver' ? '🥈 Silver' : '🥉 Bronze'}
                </span>
              </div>

              <div className="loyalty-pass-balance" style={{ marginBottom: '24px' }}>
                <span className="loyalty-pass-bal-label" style={{ fontSize: '12px' }}>STAMP POINT BALANCE</span>
                <span className="loyalty-pass-bal-val" style={{ fontSize: '48px' }}>{selectedCard.stampBalance.toLocaleString()}</span>
              </div>

              {/* Progress Bar to next Tier */}
              {selectedCard.tier !== 'Gold' && (
                <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Tier Progress: <strong>{selectedCard.tier}</strong> → <strong>{selectedCard.tier === 'Bronze' ? 'Silver' : 'Gold'}</strong>
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {selectedCard.stampBalance.toLocaleString()} / {selectedCard.tier === 'Bronze' ? '5,000' : '20,000'} STAMP
                    </span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
                      width: `${Math.min(100, (selectedCard.stampBalance / (selectedCard.tier === 'Bronze' ? 5000 : 20000)) * 100)}%`
                    }} />
                  </div>
                </div>
              )}

              {selectedCard.tier === 'Gold' && (
                <div style={{ marginTop: '16px', background: 'rgba(255, 215, 0, 0.05)', border: '1px solid rgba(255, 215, 0, 0.15)', borderRadius: '20px', padding: '12px 16px', color: '#ffd700', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  👑 Max Tier Level Achieved! Silver & Gold multipliers active (+25% bonus).
                </div>
              )}

              <div className="loyalty-pass-footer" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '20px' }}>
                <span style={{ fontSize: '13px', color: selectedCard.streakCount > 0 ? '#ff5a00' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Flame size={16} /> {selectedCard.streakCount > 0 ? `${selectedCard.streakCount}-week streak (Active)` : 'Streak inactive (Visit weekly for bonuses)'}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Total visits: <strong>{selectedCard.totalPurchases}</strong>
                </span>
              </div>
            </div>

            {/* ACHIEVEMENTS GRID */}
            <div className="panel" style={{ padding: '24px' }}>
              <div className="panel-header" style={{ marginBottom: '16px' }}>
                <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={18} style={{ color: 'var(--color-primary)' }} /> Card Achievements & Badges
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {selectedCard.achievements.filter(Boolean).length} / 10 Earned
                </span>
              </div>

              <div className="achievements-grid">
                {achievementLabels.map((badge, idx) => {
                  const earned = selectedCard.achievements[idx];
                  return (
                    <div key={idx} className={`achievement-badge ${earned ? 'earned' : 'locked'}`}>
                      <div className="achievement-icon">
                        {earned ? <Trophy size={16} /> : <Award size={16} />}
                      </div>
                      <div className="achievement-title">{badge.title}</div>
                      <div className="achievement-desc">{badge.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* POINTS REDEMPTION BLOCK */}
            <div className="panel" style={{ padding: '24px' }}>
              <div className="panel-header" style={{ marginBottom: '16px' }}>
                <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Coins size={18} style={{ color: 'var(--color-accent)' }} /> Redeem Points for Reward Discounts
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    Redeem your STAMP points to get instant discount vouchers at this store. Point conversions are governed by the merchant's on-chain rates.
                  </p>

                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Redemption Rate:</span>
                      <strong style={{ color: 'var(--color-accent)' }}>
                        {(merchantStateMap[selectedCard.merchant]?.redemptionRate || 1000).toLocaleString()} STAMP = $1.00 USD
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Maximum Discount Available:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        ${(selectedCard.stampBalance / (merchantStateMap[selectedCard.merchant]?.redemptionRate || 1000)).toFixed(2)} USD
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="setup-form" style={{ gap: '14px' }}>
                  <div className="form-group">
                    <label>Points to Redeem</label>
                    <input 
                      type="number"
                      className="input-glow mono"
                      value={pointsToRedeem}
                      step={merchantStateMap[selectedCard.merchant]?.redemptionRate || 1000}
                      min={merchantStateMap[selectedCard.merchant]?.redemptionRate || 1000}
                      onChange={(e) => setPointsToRedeem(Number(e.target.value))}
                    />
                  </div>

                  <button 
                    className="btn btn-accent"
                    style={{ width: '100%', padding: '12px' }}
                    onClick={handleRedeemPoints}
                    disabled={selectedCard.stampBalance < pointsToRedeem || pointsToRedeem <= 0}
                  >
                    Claim Voucher Reward
                  </button>

                  {redeemStatus && (
                    <div style={{
                      marginTop: '8px',
                      padding: '12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      border: redeemStatus.success ? '1px solid rgba(20, 241, 149, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                      background: redeemStatus.success ? 'rgba(20, 241, 149, 0.02)' : 'rgba(239, 68, 68, 0.02)',
                      color: redeemStatus.success ? 'var(--color-primary)' : 'var(--color-secondary)',
                      textAlign: 'center'
                    }}>
                      {redeemStatus.msg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// ─── Page root ───────────────────────────────────────────────────────────────
export default function CustomerPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('vibestamp_customer_profile');
    if (saved) {
      try {
        setProfile(JSON.parse(saved));
      } catch (_) {
        localStorage.removeItem('vibestamp_customer_profile');
      }
    }
    setLoading(false);
  }, []);

  const handleReset = () => {
    localStorage.removeItem('vibestamp_customer_profile');
    setProfile(null);
  };

  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!profile) return <CustomerSetup onComplete={setProfile} />;
  return <CustomerMain profile={profile} onReset={handleReset} />;
}
