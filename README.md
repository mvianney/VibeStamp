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

- **Solana Pay Protocol**: Fully conforms to the Solana Pay transaction request scheme. Generates QR codes representing: `solana:<recipient>?amount=<amount>&reference=<reference>&label=<label>&message=<message>&memo=<memo>`.
- **Onchain Scanning**: Queries signatures containing the unique non-signing `reference` key on Devnet to confirm payment without server dependencies.
- **Persistent Wallets**: Merchant and customer keypairs are persisted to `localStorage` so your wallets and token mint survive page refreshes.
- **Vite & React (TypeScript)**: Blazing fast Hot Module Replacement (HMR).
- **Vanilla CSS Styling**: Deep-slate dark theme, neon gradients, animations, and fully responsive grid layout — using [Outfit](https://fonts.google.com/specimen/Outfit) and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) from Google Fonts.
- **Zero-Dependency SDK Implementation**: Raw instruction buffers used for Token Program interaction (SystemProgram, ATA creation, MintTo, Token Transfer) keeping the bundle size ultra-lean.
