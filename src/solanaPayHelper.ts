import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';

// Constants
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');

// Devnet USDC Mint address
export const DEVNET_USDC_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTMSSRG57drr1VptTvkY8UM756SS6');

/**
 * Calculates the Associated Token Account (ATA) address for a given owner and mint.
 */
export const getAssociatedTokenAddress = (mint: PublicKey, owner: PublicKey): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
};

/**
 * Instruction to create an Associated Token Account.
 */
export const createAssociatedTokenAccountInstruction = (
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction => {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0),
  });
};

/**
 * Helper to build the standard InitializeMint instruction.
 */
export const createInitializeMintInstruction = (
  mint: PublicKey,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null = null
): TransactionInstruction => {
  const data = Buffer.alloc(1 + 1 + 32 + 1 + (freezeAuthority ? 32 : 0));
  data.writeUInt8(0, 0); // InitializeMint index is 0
  data.writeUInt8(decimals, 1);
  mintAuthority.toBuffer().copy(data, 2);
  if (freezeAuthority) {
    data.writeUInt8(1, 34);
    freezeAuthority.toBuffer().copy(data, 35);
  } else {
    data.writeUInt8(0, 34);
  }

  return new TransactionInstruction({
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false }
    ],
    programId: TOKEN_PROGRAM_ID,
    data
  });
};

/**
 * Helper to build the standard MintTo instruction.
 */
export const createMintToInstruction = (
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: number | bigint
): TransactionInstruction => {
  const data = Buffer.alloc(9);
  data.writeUInt8(7, 0); // MintTo index is 7
  data.writeBigUInt64LE(BigInt(amount), 1);

  return new TransactionInstruction({
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false }
    ],
    programId: TOKEN_PROGRAM_ID,
    data
  });
};

/**
 * Helper to build standard SPL Token Transfer instruction.
 */
export const createTokenTransferInstruction = (
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: number | bigint,
  reference?: PublicKey
): TransactionInstruction => {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); // Transfer index is 3
  data.writeBigUInt64LE(BigInt(amount), 1);

  const keys = [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: false }
  ];

  if (reference) {
    keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  }

  return new TransactionInstruction({
    keys,
    programId: TOKEN_PROGRAM_ID,
    data
  });
};

/**
 * Queries SOL balance.
 */
export const getSolBalance = async (connection: Connection, address: PublicKey): Promise<number> => {
  try {
    const lamports = await connection.getBalance(address, 'confirmed');
    return lamports / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    return 0;
  }
};

/**
 * Queries SPL Token balance.
 */
export const getTokenBalance = async (
  connection: Connection,
  ownerAddress: PublicKey,
  tokenMint: PublicKey
): Promise<number> => {
  try {
    const ata = getAssociatedTokenAddress(tokenMint, ownerAddress);
    const response = await connection.getTokenAccountBalance(ata, 'confirmed');
    return response.value.uiAmount || 0;
  } catch (error) {
    // If account doesn't exist, balance is 0
    return 0;
  }
};

/**
 * Formats a Solana Pay URI string.
 */
export const buildSolanaPayUri = (params: {
  recipient: string;
  amount: number;
  reference: string;
  splToken?: string;
  label?: string;
  message?: string;
  memo?: string;
}): string => {
  const { recipient, amount, reference, splToken, label, message, memo } = params;
  const parts: string[] = [];
  parts.push(`amount=${amount}`);
  parts.push(`reference=${reference}`);
  
  if (splToken) {
    parts.push(`spl-token=${encodeURIComponent(splToken)}`);
  }
  if (label) {
    parts.push(`label=${encodeURIComponent(label)}`);
  }
  if (message) {
    parts.push(`message=${encodeURIComponent(message)}`);
  }
  if (memo) {
    parts.push(`memo=${encodeURIComponent(memo)}`);
  }

  return `solana:${recipient}?${parts.join('&')}`;
};

/**
 * Scans the chain for a transaction signature containing the reference public key.
 */
export const findReferenceTransaction = async (
  connection: Connection,
  reference: PublicKey
): Promise<{ signature: string; slot: number } | null> => {
  try {
    const signatures = await connection.getSignaturesForAddress(reference, { limit: 1 }, 'confirmed');
    if (signatures.length > 0) {
      return {
        signature: signatures[0].signature,
        slot: signatures[0].slot
      };
    }
  } catch (e) {
    console.error('Error searching for reference transaction:', e);
  }
  return null;
};

/**
 * Sets up a custom token mint (sUSDC) on Devnet and mints tokens to an account.
 */
export const setupAndMintCustomToken = async (
  connection: Connection,
  payer: Keypair,
  mintKeypair: Keypair,
  recipient: PublicKey,
  amount: number,
  decimals: number = 6,
  logCallback: (msg: string, type?: 'info' | 'success' | 'error') => void
): Promise<PublicKey> => {
  logCallback(`Creating custom token mint: ${mintKeypair.publicKey.toBase58().substring(0, 8)}...`, 'info');

  const transaction = new Transaction();
  const rentExemptBalance = await connection.getMinimumBalanceForRentExemption(82);

  // 1. Create the mint account
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      lamports: rentExemptBalance,
      space: 82,
      programId: TOKEN_PROGRAM_ID
    })
  );

  // 2. Initialize the mint
  transaction.add(
    createInitializeMintInstruction(mintKeypair.publicKey, decimals, payer.publicKey)
  );

  // 3. Create destination ATA for recipient if it doesn't exist
  const destinationAta = getAssociatedTokenAddress(mintKeypair.publicKey, recipient);
  let destExists = false;
  try {
    const info = await connection.getAccountInfo(destinationAta);
    destExists = info !== null;
  } catch (e) {
    destExists = false;
  }

  if (!destExists) {
    transaction.add(
      createAssociatedTokenAccountInstruction(payer.publicKey, destinationAta, recipient, mintKeypair.publicKey)
    );
  }

  // 4. Mint to recipient ATA
  const amountBig = BigInt(amount * Math.pow(10, decimals));
  transaction.add(
    createMintToInstruction(mintKeypair.publicKey, destinationAta, payer.publicKey, amountBig)
  );

  const sig = await sendAndConfirmTransaction(connection, transaction, [payer, mintKeypair], {
    commitment: 'confirmed'
  });

  logCallback(`Token mint setup & minted ${amount} tokens. Signature: ${sig.substring(0, 10)}...`, 'success');
  return mintKeypair.publicKey;
};

/**
 * Simulates a client-side Solana Pay transaction execution.
 */
export const simulatePayment = async (params: {
  connection: Connection;
  customerKeypair: Keypair;
  merchantPublicKey: PublicKey;
  amount: number;
  referencePublicKey: PublicKey;
  tokenMintPublicKey?: PublicKey;
  tokenDecimals?: number;
  memo?: string;
  logCallback: (msg: string, type?: 'info' | 'success' | 'error') => void;
}): Promise<string> => {
  const {
    connection,
    customerKeypair,
    merchantPublicKey,
    amount,
    referencePublicKey,
    tokenMintPublicKey,
    tokenDecimals = 6,
    memo,
    logCallback
  } = params;

  logCallback('Building simulation transaction...', 'info');
  const transaction = new Transaction();

  if (!tokenMintPublicKey) {
    // SOL payment
    logCallback(`Creating SOL transfer of ${amount} SOL...`, 'info');
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: customerKeypair.publicKey,
      toPubkey: merchantPublicKey,
      lamports: Math.round(amount * LAMPORTS_PER_SOL)
    });

    // Add reference key
    transferInstruction.keys.push({
      pubkey: referencePublicKey,
      isSigner: false,
      isWritable: false
    });

    transaction.add(transferInstruction);
  } else {
    // SPL Token payment (sUSDC / USDC)
    logCallback(`Creating SPL token transfer of ${amount} tokens...`, 'info');
    
    const sourceAta = getAssociatedTokenAddress(tokenMintPublicKey, customerKeypair.publicKey);
    const destinationAta = getAssociatedTokenAddress(tokenMintPublicKey, merchantPublicKey);

    // Ensure merchant ATA exists
    let destAtaExists = false;
    try {
      const accountInfo = await connection.getAccountInfo(destinationAta);
      destAtaExists = accountInfo !== null;
    } catch (e) {
      destAtaExists = false;
    }

    if (!destAtaExists) {
      logCallback('Merchant Token Account not found. Adding creation instruction...', 'info');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          customerKeypair.publicKey,
          destinationAta,
          merchantPublicKey,
          tokenMintPublicKey
        )
      );
    }

    const tokenAmount = BigInt(Math.round(amount * Math.pow(10, tokenDecimals)));
    const tokenTransferInstruction = createTokenTransferInstruction(
      sourceAta,
      destinationAta,
      customerKeypair.publicKey,
      tokenAmount,
      referencePublicKey
    );

    transaction.add(tokenTransferInstruction);
  }

  // Add Memo instruction if present
  if (memo) {
    transaction.add(
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(memo, 'utf-8')
      })
    );
  }

  logCallback('Fetching recent blockhash...', 'info');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = customerKeypair.publicKey;

  logCallback('Signing transaction with Customer Wallet...', 'info');
  transaction.sign(customerKeypair);

  logCallback('Sending transaction to Solana Devnet...', 'info');
  const rawTx = transaction.serialize();
  const signature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed'
  });

  logCallback(`Transaction broadcasted. Signature: ${signature.substring(0, 12)}...`, 'info');
  logCallback('Confirming transaction...', 'info');
  
  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight
  }, 'confirmed');

  logCallback('Transaction confirmed successfully on-chain!', 'success');
  return signature;
};
