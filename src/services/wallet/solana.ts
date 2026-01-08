import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import { config } from '../../config/index.js';
import bs58 from 'bs58';

// Initialize connection
const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');

// Master wallet keypair from env
const masterKeypair = Keypair.fromSecretKey(
  bs58.decode(config.SOLANA_PRIVATE_KEY)
);

// USDC mint address
const USDC_MINT = new PublicKey(config.SOLANA_USDC_MINT);
const USDC_DECIMALS = 6;

export class SolanaService {
  /**
   * Get master wallet public key
   */
  static getMasterWallet(): string {
    return masterKeypair.publicKey.toBase58();
  }

  /**
   * Generate a unique deposit address for a user
   * Uses deterministic derivation from user ID
   */
  static async getDepositAddress(_userId: string): Promise<string> {
    // For MVP, use master wallet address
    // Users identified by memo in transaction
    // TODO: Implement proper PDA derivation for production
    return masterKeypair.publicKey.toBase58();
  }

  /**
   * Get SOL balance
   */
  static async getSolBalance(address: string): Promise<number> {
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Get USDC balance
   */
  static async getUsdcBalance(address: string): Promise<number> {
    try {
      const pubkey = new PublicKey(address);
      const ata = await getAssociatedTokenAddress(USDC_MINT, pubkey);
      const account = await getAccount(connection, ata);
      return Number(account.amount) / 10 ** USDC_DECIMALS;
    } catch {
      return 0;
    }
  }

  /**
   * Send SOL to address
   */
  static async sendSol(
    toAddress: string,
    amount: number
  ): Promise<string> {
    const toPubkey = new PublicKey(toAddress);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: masterKeypair.publicKey,
        toPubkey,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [masterKeypair]
    );

    return signature;
  }

  /**
   * Send USDC to address
   */
  static async sendUsdc(
    toAddress: string,
    amount: number
  ): Promise<string> {
    const toPubkey = new PublicKey(toAddress);
    const amountRaw = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS));

    // Get ATAs
    const fromAta = await getAssociatedTokenAddress(
      USDC_MINT,
      masterKeypair.publicKey
    );
    const toAta = await getAssociatedTokenAddress(USDC_MINT, toPubkey);

    const transaction = new Transaction();

    // Check if destination ATA exists, create if not
    try {
      await getAccount(connection, toAta);
    } catch {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          masterKeypair.publicKey,
          toAta,
          toPubkey,
          USDC_MINT
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        fromAta,
        toAta,
        masterKeypair.publicKey,
        amountRaw
      )
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [masterKeypair]
    );

    return signature;
  }

  /**
   * Validate Solana address
   */
  static isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get recent SOL transfers to master wallet
   * Used for deposit detection
   */
  static async getRecentSolDeposits(
    sinceSignature?: string
  ): Promise<Array<{
    signature: string;
    from: string;
    amount: number;
    timestamp: number;
  }>> {
    const signatures = await connection.getSignaturesForAddress(
      masterKeypair.publicKey,
      {
        until: sinceSignature,
        limit: 100,
      }
    );

    const deposits: Array<{
      signature: string;
      from: string;
      amount: number;
      timestamp: number;
    }> = [];

    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta || tx.meta.err) continue;

        // Find SOL transfer instruction to master wallet
        const instructions = tx.transaction.message.instructions;
        for (const ix of instructions) {
          if ('parsed' in ix && ix.parsed?.type === 'transfer') {
            const info = ix.parsed.info;
            // SOL transfer to master wallet
            if (
              info.destination === masterKeypair.publicKey.toBase58() &&
              info.source !== masterKeypair.publicKey.toBase58()
            ) {
              deposits.push({
                signature: sig.signature,
                from: info.source,
                amount: Number(info.lamports) / LAMPORTS_PER_SOL,
                timestamp: sig.blockTime || 0,
              });
            }
          }
        }
      } catch (e) {
        console.error('Error parsing SOL transaction:', sig.signature, e);
      }
    }

    return deposits;
  }

  /**
   * Get recent USDC transfers to master wallet
   * Used for deposit detection
   */
  static async getRecentUsdcDeposits(
    sinceSignature?: string
  ): Promise<Array<{
    signature: string;
    from: string;
    amount: number;
    timestamp: number;
  }>> {
    const masterAta = await getAssociatedTokenAddress(
      USDC_MINT,
      masterKeypair.publicKey
    );

    const signatures = await connection.getSignaturesForAddress(masterAta, {
      until: sinceSignature,
      limit: 100,
    });

    const deposits: Array<{
      signature: string;
      from: string;
      amount: number;
      timestamp: number;
    }> = [];

    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta || tx.meta.err) continue;

        // Find USDC transfer instruction to master wallet
        // SPL transfers can be 'transfer' or 'transferChecked'
        const instructions = tx.transaction.message.instructions;
        for (const ix of instructions) {
          if ('parsed' in ix) {
            const type = ix.parsed?.type;
            if (type === 'transfer' || type === 'transferChecked') {
              const info = ix.parsed.info;
              const dest = info.destination || info.account;
              if (dest === masterAta.toBase58()) {
                // For transferChecked, amount is in tokenAmount.amount
                const rawAmount = info.amount || info.tokenAmount?.amount;
                deposits.push({
                  signature: sig.signature,
                  from: info.source || info.authority,
                  amount: Number(rawAmount) / 10 ** USDC_DECIMALS,
                  timestamp: sig.blockTime || 0,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error('Error parsing USDC transaction:', sig.signature, e);
      }
    }

    return deposits;
  }
}
