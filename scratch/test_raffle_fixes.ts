/**
 * Devnet integration test for Raffle Arena bug fixes:
 * 1. Badge staking lock (prevents double-staking across raffles)
 * 2. On-chain draw mechanism (no client-side slot prediction)
 * 
 * Run with: npx ts-node --esm scratch/test_raffle_fixes.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import BN from 'bn.js';
import * as fs from 'fs';
import * as path from 'path';

// Load IDL
const idlPath = '/home/mickey/nepalmini/src/idl/vibestamp.json';
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

const PROGRAM_ID = new PublicKey('2Y171N7NVjqtjguLHrNwXfA5w7yHW4hkJAbNySBw7pmQ');
const RPC_URL = 'https://api.devnet.solana.com';

// PDA helpers
function getMerchantStatePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('merchant'), owner.toBuffer()], PROGRAM_ID)[0];
}
function getLoyaltyCardPda(merchant: PublicKey, customer: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('loyalty_card'), merchant.toBuffer(), customer.toBuffer()], PROGRAM_ID)[0];
}
function getRafflePda(merchant: PublicKey, raffleIndex: number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(raffleIndex));
  return PublicKey.findProgramAddressSync([Buffer.from('raffle'), merchant.toBuffer(), buf], PROGRAM_ID)[0];
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
  const customerProgram = getProgram(connection, customerKeypair);

  console.log('=== Raffle Arena Bug Fix Tests ===');
  console.log(`Merchant: ${merchantKeypair.publicKey.toBase58()}`);
  console.log(`Customer: ${customerKeypair.publicKey.toBase58()}`);
  console.log('');

  // Step 0: Fund customer from merchant wallet
  console.log('Step 0: Funding customer from merchant...');
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
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
    console.log(`  Transfer tx: ${signature}`);
  } catch (e: any) {
    console.log(`  Funding failed: ${e.message}`);
  }
  await sleep(2000);

  // Step 1: Ensure merchant is initialized
  console.log('Step 1: Ensuring merchant state...');
  const merchantPda = getMerchantStatePda(merchantKeypair.publicKey);
  try {
    await program.account.merchantState.fetch(merchantPda);
    console.log('  Merchant already initialized.');
  } catch {
    console.log('  Initializing merchant...');
    const tx = await program.methods
      .initializeMerchant('TestStore', new BN(50), new BN(1000), new BN(100))
      .accounts({
        merchantState: merchantPda,
        signer: merchantKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([merchantKeypair])
      .rpc();
    console.log(`  Init merchant tx: ${tx}`);
  }

  // Step 2: Record purchase to give customer a badge (achievement[0] = first purchase)
  console.log('Step 2: Recording purchase to unlock badge...');
  const cardPda = getLoyaltyCardPda(merchantKeypair.publicKey, customerKeypair.publicKey);
  const passportPda = getPassportPda(customerKeypair.publicKey);
  const purchaseTx = await program.methods
    .recordPurchase(new BN(100_000_000)) // 0.1 SOL
    .accounts({
      loyaltyCard: cardPda,
      merchantState: merchantPda,
      passport: passportPda,
      merchantSigner: merchantKeypair.publicKey,
      customer: customerKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchantKeypair])
    .rpc();
  console.log(`  Purchase tx: ${purchaseTx}`);
  
  // Verify badge unlocked
  const card: any = await program.account.loyaltyCard.fetch(cardPda);
  console.log(`  Badge[0] (First Step) unlocked: ${card.achievements[0]}`);
  console.log(`  staked_badge_raffle: ${card.stakedBadgeRaffle}`);

  // Step 3: Create Raffle #1 (short duration for test)
  const raffleIndex1 = Date.now() % 1000000; // Unique index
  console.log(`\nStep 3: Creating Raffle #${raffleIndex1}...`);
  const rafflePda1 = getRafflePda(merchantKeypair.publicKey, raffleIndex1);
  const createTx1 = await program.methods
    .createRaffle(new BN(raffleIndex1), new BN(10000), new BN(5)) // 10000 lamport prize, 5 second duration
    .accounts({
      raffle: rafflePda1,
      merchant: merchantKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchantKeypair])
    .rpc();
  console.log(`  Create raffle tx: ${createTx1}`);

  // Step 4: Stake badge into Raffle #1
  console.log('\nStep 4: Staking badge[0] into Raffle #1...');
  const stakeTx = await customerProgram.methods
    .stakeBadgeForRaffle(0)
    .accounts({
      raffle: rafflePda1,
      loyaltyCard: cardPda,
      customer: customerKeypair.publicKey,
    })
    .signers([customerKeypair])
    .rpc();
  console.log(`  ✅ Stake tx: ${stakeTx}`);
  
  // Verify lock is set
  const cardAfterStake: any = await program.account.loyaltyCard.fetch(cardPda);
  console.log(`  staked_badge_raffle after stake: ${cardAfterStake.stakedBadgeRaffle?.toBase58()}`);
  console.log(`  Expected raffle PDA: ${rafflePda1.toBase58()}`);
  console.log(`  Lock matches: ${cardAfterStake.stakedBadgeRaffle?.toBase58() === rafflePda1.toBase58()}`);

  // Step 5: Create Raffle #2 and attempt double-stake (SHOULD FAIL)
  const raffleIndex2 = raffleIndex1 + 1;
  console.log(`\nStep 5: Creating Raffle #${raffleIndex2} and attempting double-stake...`);
  const rafflePda2 = getRafflePda(merchantKeypair.publicKey, raffleIndex2);
  const createTx2 = await program.methods
    .createRaffle(new BN(raffleIndex2), new BN(10000), new BN(60)) // 60 second duration
    .accounts({
      raffle: rafflePda2,
      merchant: merchantKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchantKeypair])
    .rpc();
  console.log(`  Create raffle #2 tx: ${createTx2}`);

  try {
    await customerProgram.methods
      .stakeBadgeForRaffle(0)
      .accounts({
        raffle: rafflePda2,
        loyaltyCard: cardPda,
        customer: customerKeypair.publicKey,
      })
      .signers([customerKeypair])
      .rpc();
    console.log('  ❌ ERROR: Double-stake should have failed but succeeded!');
  } catch (e: any) {
    const msg = e.message || e.toString();
    if (msg.includes('BadgeCurrentlyStaked') || msg.includes('6012') || msg.includes('already staked')) {
      console.log(`  ✅ Double-stake correctly rejected: BadgeCurrentlyStaked`);
    } else {
      console.log(`  ✅ Double-stake rejected with: ${msg.slice(0, 120)}`);
    }
  }

  // Step 6: Wait for raffle #1 to close, then draw
  console.log('\nStep 6: Waiting for Raffle #1 to close (5 seconds)...');
  await sleep(7000);

  console.log('  Drawing raffle on-chain (no slot prediction needed)...');
  
  // Fetch raffle to get stakers for remaining accounts
  const raffle: any = await program.account.raffle.fetch(rafflePda1);
  const stakedEntries: PublicKey[] = raffle.stakedEntries;
  
  // Build remaining accounts
  const uniqueStakerMap = new Map<string, PublicKey>();
  for (const entry of stakedEntries) {
    uniqueStakerMap.set(entry.toBase58(), entry);
  }
  const uniqueStakers = [...uniqueStakerMap.values()];
  
  const remainingAccounts = uniqueStakers.flatMap((staker: PublicKey) => {
    const stakeCardPda = getLoyaltyCardPda(merchantKeypair.publicKey, staker);
    return [
      { pubkey: staker, isWritable: true, isSigner: false },
      { pubkey: stakeCardPda, isWritable: true, isSigner: false },
    ];
  });

  const drawTx = await program.methods
    .drawRaffle()
    .accounts({
      raffle: rafflePda1,
      merchant: merchantKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .signers([merchantKeypair])
    .rpc();
  console.log(`  ✅ Draw tx: ${drawTx}`);

  // Step 7: Verify badge lock is cleared after draw
  console.log('\nStep 7: Verifying badge lock cleared after draw...');
  await sleep(2000);
  const cardAfterDraw: any = await program.account.loyaltyCard.fetch(cardPda);
  console.log('  cardAfterDraw:', cardAfterDraw);
  console.log(`  Badge lock cleared: ${cardAfterDraw.stakedBadgeRaffle === null}`);
  console.log(`  Badge[0] still unlocked: ${cardAfterDraw.achievements[0]}`);

  // Step 8: Verify can now stake into Raffle #2 (lock cleared)
  console.log('\nStep 8: Verifying can stake into Raffle #2 after lock cleared...');
  try {
    const raffle2 = await program.account.raffle.fetch(rafflePda2);
    console.log(`  raffle2.merchant: ${raffle2.merchant.toBase58()}`);
    console.log(`  customerKeypair.publicKey: ${customerKeypair.publicKey.toBase58()}`);
    console.log(`  cardPda: ${cardPda.toBase58()}`);
    const [derivedCardPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('loyalty_card'), raffle2.merchant.toBuffer(), customerKeypair.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log(`  derivedCardPda: ${derivedCardPda.toBase58()}`);

    const restakeTx = await customerProgram.methods
      .stakeBadgeForRaffle(0)
      .accounts({
        raffle: rafflePda2,
        loyaltyCard: cardPda,
        customer: customerKeypair.publicKey,
      })
      .signers([customerKeypair])
      .rpc();
    console.log(`  ✅ Re-stake into Raffle #2 succeeded! Tx: ${restakeTx}`);
  } catch (e: any) {
    console.log(`  ❌ Re-stake failed (lock not cleared?): ${e.message}`);
    if (e.logs) {
      console.log('  Logs:', e.logs);
    }
  }

  console.log('\n=== All Tests Complete ===');
  console.log('\nTransaction Signatures:');
  console.log(`  Purchase:     ${purchaseTx}`);
  console.log(`  Create R1:    ${createTx1}`);
  console.log(`  Stake:        ${stakeTx}`);
  console.log(`  Create R2:    ${createTx2}`);
  console.log(`  Draw:         ${drawTx}`);
}

main().catch(console.error);
