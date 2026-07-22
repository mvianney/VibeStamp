# Solana Pay POS & Merchant Dashboard ⚡

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20App-blueviolet?style=for-the-badge&logo=vercel)](https://vibepay-pos.vercel.app)
[![GitHub Repo](https://img.shields.io/badge/GitHub-mvianney%2Fvibepay--pos-181717?style=for-the-badge&logo=github)](https://github.com/mvianney/vibepay-pos)
[![Solana Devnet](https://img.shields.io/badge/Network-Solana%20Devnet-9945FF?style=for-the-badge&logo=solana)](https://explorer.solana.com/?cluster=devnet)

---

### 🌟 About the Project (Bounty Submission)

**Solana Pay POS & Merchant Dashboard** is a premium, fully-interactive Point-of-Sale system and merchant dashboard powered by Solana Pay — built for the Solana Blockchain 101 Kathmandu Workshop Hackathon. The application allows merchants to generate standard-compliant Solana Pay QR codes for USDC/SOL purchases and scan onchain transactions in real time on Solana Devnet. To provide an optimal demo experience, the dApp features a built-in **Customer Wallet Simulator** that can airdrop SOL, deploy/mint a custom simulated USDC token (sUSDC), build standard transfers containing the unique transaction reference keys, and broadcast transactions directly to the RPC — enabling judges and users to test the full end-to-end checkout flow directly from their browser without needing a mobile Solana wallet.

---

### 🔗 Live Demo

> **Try it live:** [https://vibepay-pos.vercel.app](https://vibepay-pos.vercel.app)
>
> No wallet extension needed — use the built-in **Customer Wallet Simulator** to run the full checkout flow from your browser.

---

### 🚀 How to Run Locally

Follow these quick steps to get the POS running on your machine:

1. **Clone and Install Dependencies:**
   ```bash
   git clone https://github.com/mvianney/vibepay-pos
   cd vibepay-pos
   npm install
   ```

2. **Run Dev Server:**
   ```bash
   npm run dev
   ```
   Open your browser to the local URL (usually `http://localhost:5173`).

---

### 💡 Step-by-Step Demo Guide (USDC & SOL Checkout)

#### 1. SOL Checkout Simulation
- Click on any product (e.g. *Solana Blend Coffee*) to add it to the cart, or enter a custom amount.
- Toggle the payment currency to **SOL** (default) in the storefront header.
- Click **"Generate Solana Pay QR"**. The gateway will generate the QR code and begin live scanning.
- Look at the **Customer Wallet Simulator** on the right side. If it has 0 SOL, click **"Fund Customer SOL"** to request a Devnet airdrop.
- Once the customer has enough SOL, click **"Simulate Customer Payment"**.
- You will see the transaction execute, sign, and broadcast in the simulator console. Within seconds, the merchant monitor will detect the transaction on-chain and trigger the success confirmation screen!

#### 2. USDC Checkout Simulation
- Toggle the payment currency to **USDC** in the storefront header.
- Under **Merchant Portal Configuration**, click **"Initialize sUSDC Mint & Fund Customer"**.
- This will deploy a custom token mint on-chain and mint **250 sUSDC** directly to the simulator wallet (while saving the custom mint address to your local browser state).
- Select products, click **"Generate Solana Pay QR"** to initiate a USDC checkout.
- Click **"Simulate Customer Payment"** to execute the onchain token transfer! The dashboard will scan the reference key and confirm the payment.

---

### 🛒 Products

| Product | SOL Price | USDC Price |
|---|---|---|
| Solana Blend Coffee ☕ | 0.02 SOL | 2.00 sUSDC |
| DePIN Sticker Pack 🏷️ | 0.005 SOL | 0.50 sUSDC |
| Saga Case v2 📱 | 0.12 SOL | 12.00 sUSDC |
| DePIN Sandbox Node 🖥️ | 0.45 SOL | 45.00 sUSDC |

You can also enter a **custom amount** with a custom message and memo for arbitrary payment requests.

---

### 🛠️ Architecture & Specifications

The frontend and local wallet components integrate seamlessly with the on-chain loyalty program:
- **Solana Pay Protocol**: Fully conforms to the Solana Pay transaction request scheme. Generates QR codes representing: `solana:<recipient>?amount=<amount>&reference=<reference>&label=<label>&message=<message>&memo=<memo>`.
- **Onchain Scanning**: Queries signatures containing the unique non-signing `reference` key on Devnet to confirm payment without server dependencies.
- **Persistent Wallets**: Merchant and customer keypairs are persisted to `localStorage` so your wallets and token mint survive page refreshes.
- **Vite & React (TypeScript)**: Blazing fast Hot Module Replacement (HMR).
- **Vanilla CSS Styling**: Deep-slate dark theme, neon gradients, animations, and fully responsive grid layout — using [Outfit](https://fonts.google.com/specimen/Outfit) and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) from Google Fonts.
- **Zero-Dependency SDK Implementation**: Raw instruction buffers used for Token Program interaction (SystemProgram, ATA creation, MintTo, Token Transfer) keeping the bundle size ultra-lean.

---

### 📜 VibeStamp Protocol & On-chain Specifications

VibeStamp is an on-chain loyalty program built on Solana, tracking customer achievements, points, exchanges, and community raffles.

#### 1. Token Standards
- **STAMP Points**: Minted as **Token-2022 Non-Transferable (Soulbound)** tokens. STAMP tokens cannot be transferred directly between standard wallets, preventing secondary point speculation while ensuring all point logic goes through protocol channels.
- **Achievement Badges**: Minted as **Token-2022 Non-Transferable (Soulbound)** assets (not cNFTs or standard NFTs). Unlocked achievement states are stored as booleans on the customer's on-chain `LoyaltyCard` account and are verified by the program during staking.

#### 2. Loyalty Activation Rule
To optimize on-chain storage and transaction fees:
- **Client-side Tracking (Purchases 1 & 2)**: The first two transactions are recorded locally in the merchant's browser state (`localStorage`). No on-chain accounts are allocated for the customer yet.
- **On-chain Activation (Purchase 3)**: On the customer's 3rd purchase at a merchant, the program allocates and initializes a customer `LoyaltyCard` PDA account on-chain. All subsequent purchases trigger on-chain checks.

#### 3. Loyalty Passport PDA
A customer's lifetime loyalty stats across all participating merchants are aggregated in a single `PassportState` PDA.
- **Seeds**: `[b"passport", customer_pubkey]`
- **Fields**:
  - `customer: Pubkey` — The customer's wallet address.
  - `total_stores_visited: u32` — Number of unique merchants activated.
  - `total_stamp_earned_lifetime: u64` — Total STAMP points accumulated historically.
  - `total_badges_unlocked: u32` — Total badges earned across all merchants.
  - `first_visit_timestamp: i64` — Unix timestamp of the customer's first purchase.
  - `last_updated: i64` — Unix timestamp of the latest update.
  - `bump: u8` — PDA bump seed.
- **Update Frequency**: The Passport is initialized on the customer's first purchase at any store and is updated on subsequent purchases, but details like `total_stores_visited` only increment upon a merchant relationship being activated (the 3rd purchase).

#### 4. Bilateral Point Exchange
Customers can convert points earned at Merchant A into points for Merchant B.
- **Instruction**: `exchange_points`
- **Requirements**:
  - A pre-existing `ExchangeAgreement` PDA initialized by the merchants, defining the conversion rates.
  - The customer must already have an active `LoyaltyCard` at the destination merchant (the exchange cannot bypass the 3-purchase activation rule).
  - Exchange rate conversion base is 100 (i.e., a rate of 100 represents a 1:1 conversion).

#### 5. Raffle Arena
Merchants can host loyalty raffles to distribute prizes to customers who stake unlocked achievement badges.
- **Instructions**: `create_raffle`, `stake_badge_for_raffle`, `draw_raffle`.
- **Badge Locking**: When a customer stakes a badge into a raffle, the badge is locked on-chain by writing the raffle PDA key to `staked_badge_raffle: Option<Pubkey>` on their `LoyaltyCard`. This prevents the customer from double-staking the same badge in other active raffles.
- **On-chain Randomness**: The raffle draw determines the winner index on-chain using:
  ```rust
  let seed = slot.wrapping_mul(1_000_003).wrapping_add(now as u64).wrapping_add(staked_entries.len() as u64);
  let winner_idx = (seed as usize) % staked_entries.len();
  ```
  This eliminates the need for the client to predict the winning slot.
- **Badge Recovery**: Badges are unlocked (set back to `None`) for all participants immediately after the draw, regardless of win/loss.
- **Prize Funding**: The merchant funds the raffle prize in lamports during creation. The drawn winner receives the prize balance directly as a transfer.

#### 6. Referral Welcome Bonus
A welcome reward is awarded to a customer when they make their first purchase at a new merchant while holding a badge from another merchant.
- **Verification**: The client passes the other merchant's `LoyaltyCard` PDA as a remaining account to the `record_purchase` instruction, proving the customer holds an achievement badge from a separate activated relationship.

#### 7. Merchant-Configurable Rates
Merchants can adjust their rewards settings directly from the dashboard:
- **Point Rate**: Range of `10` to `100` STAMP per 0.01 SOL (default is `100`).
- **Redemption Rate**: Defines points needed per dollar of discount (default is `1,000` STAMP = $1).
Both settings are configurable post-registration and affect future transactions.

#### 8. Technical Tradeoffs & Constraints
- **Pseudo-random Raffle Draw**: Winner selection uses slot and timestamp variables. While suitable for loyalty program raffles, it is not cryptographically secure against validator front-running/manipulation like a Chainlink VRF.
- **One-Badge-Stake Limit**: A badge can only be staked in one raffle at a time to prevent duplicate entry attacks.
- **Pre-activation Client Tracking**: First two purchases are tracked locally to save on-chain rent and transaction fees for non-returning customers, sacrificing immutable trust for cost-efficiency.

#### 9. Devnet Transaction Examples
Explore the protocol execution on the Solana Devnet Explorer:
- **Purchase (`record_purchase`) & Passport Init**: [Transaction Link](https://explorer.solana.com/tx/29mbTU5mSGsT6wYXBKLAB7xvr8qtrpFsHmdbFrrSwKHJ53vE2YoyMZ4jrEoWGxBiHpiMpECq4vkHRDszE9Rtui7X?cluster=devnet)
- **Raffle Create**: [Transaction Link](https://explorer.solana.com/tx/3R7fq9PQYMsS8V9nqmnpPhWveGz432F6mKUMG4ykV7RvJzdssieXr7o8RWGMp2exPTyDTdpcreiCc4Qh6S6nYc7y?cluster=devnet)
- **Raffle Stake Badge**: [Transaction Link](https://explorer.solana.com/tx/3xnKHPnGdCGRkW2eJ4uy98BoZcHtmcg6WAgfHU1h22bDXZ6hBXPr4SWkq1NbV8FpSm89kxNzADK7JmaQFnNkpdet?cluster=devnet)
- **Raffle Draw**: [Transaction Link](https://explorer.solana.com/tx/2t9myHj6oMqCnfFa7tB7bs5QgomGa3gMdMLqo1XELQ3eMTABfq7uYbkB4YZhtwyhUbw87XetMp2WnwTTBSfShWYP?cluster=devnet)
- **Point Exchange (`exchange_points`)**: *[Placeholder: Run to generate signature]*
- **Referral Welcome Bonus Purchase**: *[Placeholder: Run to generate signature]*
