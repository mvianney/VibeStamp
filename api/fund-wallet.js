import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
// In-memory rate limit cache for address/IP limiting (cleared on serverless cold starts)
const rateLimitCache = new Map();
export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { recipient } = req.body;
    if (!recipient) {
        return res.status(400).json({ error: 'Recipient address is required' });
    }
    // Get client IP for rate limiting
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const currentTime = Date.now();
    const ONE_HOUR = 3600000; // 1 hour in ms
    // Rate limit check: max 1 request per recipient address per hour
    const addressKey = `addr_${recipient}`;
    const lastAddressRequest = rateLimitCache.get(addressKey);
    if (lastAddressRequest && (currentTime - lastAddressRequest < ONE_HOUR)) {
        const timeRemaining = Math.ceil((ONE_HOUR - (currentTime - lastAddressRequest)) / 60000);
        return res.status(429).json({ error: `Rate limit exceeded for this address. Please try again in ${timeRemaining} minutes.` });
    }
    // Validate recipient public key
    let recipientPubkey;
    try {
        recipientPubkey = new PublicKey(recipient);
    }
    catch (err) {
        return res.status(400).json({ error: 'Invalid recipient address' });
    }
    // Load faucet private key from environment variables
    const faucetSecret = process.env.FAUCET_PRIVATE_KEY;
    if (!faucetSecret) {
        console.error('FAUCET_PRIVATE_KEY environment variable is not configured');
        return res.status(500).json({ error: 'Faucet server configuration error' });
    }
    let faucetKeypair;
    try {
        const secretBytes = JSON.parse(faucetSecret);
        faucetKeypair = Keypair.fromSecretKey(new Uint8Array(secretBytes));
    }
    catch (err) {
        console.error('Failed to parse FAUCET_PRIVATE_KEY secret key bytes:', err);
        return res.status(500).json({ error: 'Faucet secret key parse error' });
    }
    const rpcUrl = process.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    try {
        // Check recipient balance
        const recipientBal = await connection.getBalance(recipientPubkey, 'confirmed');
        const threshold = 0.1 * LAMPORTS_PER_SOL;
        if (recipientBal >= threshold) {
            return res.status(200).json({
                success: false,
                message: 'Wallet balance is already sufficient (>= 0.1 SOL). No funding needed.',
                balance: recipientBal / LAMPORTS_PER_SOL
            });
        }
        // Check faucet balance first to prevent crash
        const faucetBal = await connection.getBalance(faucetKeypair.publicKey, 'confirmed');
        const fundingAmount = 0.05 * LAMPORTS_PER_SOL; // Send 0.05 SOL
        const fee = 5000; // standard solana fee estimate
        if (faucetBal < fundingAmount + fee) {
            console.error(`Faucet wallet balance is too low: ${faucetBal / LAMPORTS_PER_SOL} SOL`);
            return res.status(500).json({ error: 'Faucet liquidity is depleted. Please contact admin.' });
        }
        // Build and send transfer transaction
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        const tx = new Transaction({ feePayer: faucetKeypair.publicKey, blockhash, lastValidBlockHeight }).add(SystemProgram.transfer({
            fromPubkey: faucetKeypair.publicKey,
            toPubkey: recipientPubkey,
            lamports: fundingAmount,
        }));
        tx.sign(faucetKeypair);
        const signature = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        // Update rate limit cache
        rateLimitCache.set(addressKey, currentTime);
        // Monitor Log Safeguard
        console.log(`[FAUCET FUNDING SUCCESS] Recipient: ${recipient}, Amount: 0.05 SOL, IP: ${ip}, Sig: ${signature}, Time: ${new Date(currentTime).toISOString()}`);
        const newBalance = await connection.getBalance(recipientPubkey, 'confirmed');
        return res.status(200).json({
            success: true,
            signature,
            amount: 0.05,
            balance: newBalance / LAMPORTS_PER_SOL
        });
    }
    catch (error) {
        console.error('[FAUCET FUNDING ERROR]', error);
        return res.status(500).json({ error: `Funding transaction failed: ${error.message || error}` });
    }
}
