import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js'

const rateLimitCache = new Map<string, number>();

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'api-faucet-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/fund-wallet')) {
              // Set CORS headers
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

              if (req.method === 'OPTIONS') {
                res.statusCode = 200;
                res.end();
                return;
              }

              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
              }

              // Read the POST request body
              let body = '';
              req.on('data', chunk => {
                body += chunk.toString();
              });

              req.on('end', async () => {
                try {
                  const { recipient } = JSON.parse(body);
                  if (!recipient) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Recipient address is required' }));
                    return;
                  }

                  const currentTime = Date.now();
                  const ONE_HOUR = 3600000;

                  const addressKey = `addr_${recipient}`;

                  const lastAddressRequest = rateLimitCache.get(addressKey);

                  if (lastAddressRequest && (currentTime - lastAddressRequest < ONE_HOUR)) {
                    const timeRemaining = Math.ceil((ONE_HOUR - (currentTime - lastAddressRequest)) / 60000);
                    res.statusCode = 429;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: `Rate limit exceeded for this address. Please try again in ${timeRemaining} minutes.` }));
                    return;
                  }

                  let recipientPubkey: PublicKey;
                  try {
                    recipientPubkey = new PublicKey(recipient);
                  } catch (err) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Invalid recipient address' }));
                    return;
                  }

                  const faucetSecret = env.FAUCET_PRIVATE_KEY;
                  if (!faucetSecret) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'FAUCET_PRIVATE_KEY not set locally in env' }));
                    return;
                  }

                  const secretBytes = JSON.parse(faucetSecret);
                  const faucetKeypair = Keypair.fromSecretKey(new Uint8Array(secretBytes));

                  const rpcUrl = env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
                  const connection = new Connection(rpcUrl, 'confirmed');

                  // Check recipient balance
                  const recipientBal = await connection.getBalance(recipientPubkey, 'confirmed');
                  const threshold = 0.1 * LAMPORTS_PER_SOL;

                  if (recipientBal >= threshold) {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                      success: false,
                      message: 'Wallet balance is already sufficient (>= 0.1 SOL). No funding needed.',
                      balance: recipientBal / LAMPORTS_PER_SOL
                    }));
                    return;
                  }

                  // Check faucet balance
                  const faucetBal = await connection.getBalance(faucetKeypair.publicKey, 'confirmed');
                  const fundingAmount = 0.05 * LAMPORTS_PER_SOL;
                  const fee = 5000;

                  if (faucetBal < fundingAmount + fee) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Faucet wallet balance is too low.' }));
                    return;
                  }

                  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                  const tx = new Transaction({ feePayer: faucetKeypair.publicKey, blockhash, lastValidBlockHeight }).add(
                    SystemProgram.transfer({
                      fromPubkey: faucetKeypair.publicKey,
                      toPubkey: recipientPubkey,
                      lamports: fundingAmount,
                    })
                  );

                  tx.sign(faucetKeypair);
                  const signature = await connection.sendRawTransaction(tx.serialize());
                  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

                  rateLimitCache.set(addressKey, currentTime);

                  console.log(`[LOCAL FAUCET SUCCESS] Recipient: ${recipient}, Sig: ${signature}`);

                  const newBalance = await connection.getBalance(recipientPubkey, 'confirmed');

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: true,
                    signature,
                    amount: 0.05,
                    balance: newBalance / LAMPORTS_PER_SOL
                  }));

                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message || err }));
                }
              });
            } else {
              next();
            }
          });
        }
      }
    ]
  };
});
