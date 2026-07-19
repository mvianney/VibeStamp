/**
 * Devnet integration test for Receipt Bonus Calculations:
 * Verifies that the frontend formulas for streak and tier bonuses
 * match the actual on-chain stamp balance increases exactly.
 * 
 * Run with: npx -y tsx scratch/test_receipt_bonus.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import BN from 'bn.js';
import * as fs from 'fs';
import * as path from 'path';

// Load IDL
const idlPath = '/home/mickey/nepalmini/src/idl/vibestamp.json';
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

const PROGRAM_ID = new PublicKey('2Y171N7NVjqtjguLHrNwXfA5w7yHW4hkJAbNySBw7pmQ');
const RPC_URL = 'https://api.devnet.solana.com';

function getMerchantStatePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('merchant'), owner.toBuffer()], PROGRAM_ID)[0];
}
function getLoyaltyCardPda(merchant: PublicKey, customer: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('loyalty_card'), merchant.toBuffer(), customer.toBuffer()], PROGRAM_ID)[0];
}
function getPassportPda(customer: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('passport'), customer.toBuffer()], PROGRAM_ID)[0];
}

function getProgram(connection: Connection, keypair: Keypair): any {
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: any) => { tx.partialSign(keypair); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(keypair)); return txs; },
  };
  const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  return new Program(idl as any, provider);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Load the deployer/merchant wallet
  const merchantSecretPath = path.resolve(process.env.HOME || '~', '.config/solana/id.json');
  const merchantSecret = JSON.parse(fs.readFileSync(merchantSecretPath, 'utf-8'));
  const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(merchantSecret));
  
  // Generate a test customer
  const customerKeypair = Keypair.generate();
  
  const program = getProgram(connection, merchantKeypair);
  
  console.log('=== Receipt Bonus Calculation Tests ===');
  console.log(`Merchant: ${merchantKeypair.publicKey.toBase58()}`);
  console.log(`Customer: ${customerKeypair.publicKey.toBase58()}`);
  console.log('');

  // Fund customer
  console.log('Funding customer from merchant...');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const { Transaction, SystemProgram } = await import('@solana/web3.js');
  const txTransfer = new Transaction({ feePayer: merchantKeypair.publicKey, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({
      fromPubkey: merchantKeypair.publicKey,
      toPubkey: customerKeypair.publicKey,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    })
  );
  txTransfer.sign(merchantKeypair);
  const signature = await connection.sendRawTransaction(txTransfer.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log(`  Fund tx: ${signature}`);
  await sleep(2000);

  const merchantPda = getMerchantStatePda(merchantKeypair.publicKey);
  const merchantState: any = await program.account.merchantState.fetch(merchantPda);
  const pointRate = merchantState.pointRate.toNumber();
  console.log(`Merchant Point Rate: ${pointRate} STAMP per 0.01 SOL\n`);

  // Simulate localStorage tracking of customer transaction count
  let customerTxCount = 0;
  
  const cardPda = getLoyaltyCardPda(merchantKeypair.publicKey, customerKeypair.publicKey);
  const passportPda = getPassportPda(customerKeypair.publicKey);

  for (let i = 1; i <= 5; i++) {
    console.log(`\n--- Transaction #${i} ---`);
    const cardBefore: any = await program.account.loyaltyCard.fetchNullable(cardPda);
    const prevBalance = cardBefore ? cardBefore.stampBalance.toNumber() : 0;
    
    // Update local count
    if (cardBefore) {
      customerTxCount = Math.max(customerTxCount, 3) + 1;
    } else {
      customerTxCount += 1;
    }
    console.log(`  Local Customer Transaction Count: ${customerTxCount}`);

    let pointsEarned = 0;
    let newBalance = 0;
    let tier = 'Bronze';
    let streakBonus = 0;
    let tierBonus = 0;

    const amountLamports = 100_000_000; // 0.1 SOL = 10 base points (since 10_000_000 lamports = 1 unit)
    
    if (customerTxCount >= 3) {
      console.log('  Triggering on-chain recordPurchase...');
      const tx = await program.methods
        .recordPurchase(new BN(amountLamports))
        .accounts({
          loyaltyCard: cardPda,
          merchantState: merchantPda,
          passport: passportPda,
          merchantSigner: merchantKeypair.publicKey,
          customer: customerKeypair.publicKey,
        })
        .signers([merchantKeypair])
        .rpc();
      console.log(`  Tx confirmed: ${tx}`);
      
      const cardAfter: any = await program.account.loyaltyCard.fetch(cardPda);
      pointsEarned = cardAfter.stampBalance.toNumber() - prevBalance;
      newBalance = cardAfter.stampBalance.toNumber();
      
      // Map tier enum
      tier = cardAfter.tier.hasOwnProperty('gold') ? 'Gold' : cardAfter.tier.hasOwnProperty('silver') ? 'Silver' : 'Bronze';

      // Compute bonuses using the same logic we put in MerchantPage.tsx:
      const basePoints = Math.floor(amountLamports / 10_000_000) * pointRate;
      
      let streakBonusPercent = 0;
      if (cardAfter.streakCount >= 8) streakBonusPercent = 100;
      else if (cardAfter.streakCount >= 4) streakBonusPercent = 50;
      else if (cardAfter.streakCount >= 2) streakBonusPercent = 25;
      streakBonus = Math.floor(basePoints * streakBonusPercent / 100);

      let tierBonusPercent = 0;
      const prevTier = cardBefore ? (cardBefore.tier.hasOwnProperty('gold') ? 'Gold' : cardBefore.tier.hasOwnProperty('silver') ? 'Silver' : 'Bronze') : 'Bronze';
      if (prevTier === 'Gold') tierBonusPercent = 25;
      else if (prevTier === 'Silver') tierBonusPercent = 10;
      tierBonus = Math.floor(basePoints * tierBonusPercent / 100);

      console.log('  [Calculated Receipt]');
      console.log(`    Base Points:   ${basePoints}`);
      console.log(`    Streak Count:  ${cardAfter.streakCount}`);
      console.log(`    Streak Bonus:  ${streakBonus} (${streakBonusPercent}%)`);
      console.log(`    Prev Tier:     ${prevTier}`);
      console.log(`    Tier Bonus:    ${tierBonus} (${tierBonusPercent}%)`);
      console.log(`    Total Earned:  ${pointsEarned}`);
      console.log(`    New Balance:   ${newBalance}`);
      console.log(`    New Tier:      ${tier}`);

      // Verify that total earned matches base + streak + tier bonus
      const expectedTotal = basePoints + streakBonus + tierBonus;
      if (pointsEarned === expectedTotal) {
        console.log(`  ✅ Receipt verification SUCCESS: Earned points matches calculation!`);
      } else {
        console.log(`  ❌ Receipt verification FAILED: expected ${expectedTotal}, got ${pointsEarned}`);
      }
    } else {
      console.log('  Local recording only (Checkout < 3)');
    }
    await sleep(2000);
  }
}

main().catch(console.error);
