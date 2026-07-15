import { useNavigate } from 'react-router-dom';
import { Store, User, Zap, Shield, Gift } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* Hero */}
      <header className="landing-hero">
        <div className="landing-logo-ring">
          <Zap size={36} />
        </div>
        <div className="landing-hero-text">
          <h1 className="landing-title">VibeStamp</h1>
          <p className="landing-tagline">On-Chain Loyalty Rewards · Solana Devnet</p>
        </div>
      </header>

      {/* Feature Pills */}
      <div className="landing-pills">
        <span className="pill"><Shield size={13} /> Soulbound STAMP Points</span>
        <span className="pill"><Gift size={13} /> Achievement cNFT Badges</span>
        <span className="pill"><Zap size={13} /> Solana Pay QR Checkout</span>
      </div>

      {/* Role Cards */}
      <main className="role-cards">
        <button
          className="role-card merchant-card"
          onClick={() => navigate('/merchant')}
          id="btn-merchant"
        >
          <div className="role-icon merchant-icon">
            <Store size={36} />
          </div>
          <div className="role-card-body">
            <h2>Continue as Merchant</h2>
            <p>
              Register your store, generate Solana Pay QR codes, and reward loyal
              customers with STAMP points and achievement badges.
            </p>
          </div>
          <span className="role-cta merchant-cta">Enter Merchant Portal →</span>
        </button>

        <button
          className="role-card customer-card"
          onClick={() => navigate('/customer')}
          id="btn-customer"
        >
          <div className="role-icon customer-icon">
            <User size={36} />
          </div>
          <div className="role-card-body">
            <h2>Continue as Customer</h2>
            <p>
              Scan QR codes to pay, earn STAMP points, unlock cNFT achievement
              badges, and track your loyalty with every visit.
            </p>
          </div>
          <span className="role-cta customer-cta">Enter Customer Wallet →</span>
        </button>
      </main>

      <footer className="landing-footer">
        <p>Running on Solana Devnet · VibeStamp Loyalty Protocol · Escaping traditional siloed points</p>
      </footer>
    </div>
  );
}
