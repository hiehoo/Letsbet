import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import { AddressDerivation } from './address-derivation.js';
import { prisma } from '../../db/client.js';
import { config } from '../../config/index.js';
import bs58 from 'bs58';

const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');
const USDC_MINT = new PublicKey(config.SOLANA_USDC_MINT);
const USDC_DECIMALS = 6;

// Master wallet receives swept funds
const masterKeypair = Keypair.fromSecretKey(bs58.decode(config.SOLANA_PRIVATE_KEY));

// Minimum SOL to keep in derived wallets for rent
const MIN_SOL_RESERVE = 0.01;

/**
 * Sweep funds from all user deposit addresses to master wallet
 * This consolidates funds for easier management
 */
export async function sweepAllUserFunds(): Promise<{
  solSwept: number;
  usdcSwept: number;
  errors: string[];
}> {
  const results = { solSwept: 0, usdcSwept: 0, errors: [] as string[] };

  try {
    // Get all users with deposit addresses
    const users = await prisma.user.findMany({
      where: { depositAddress: { not: null } },
      select: { id: true, depositAddress: true, username: true },
    });

    console.log(`[SWEEP] Checking ${users.length} user addresses...`);

    for (const user of users) {
      if (!user.depositAddress) continue;

      try {
        const swept = await sweepUserFunds(user.id, user.depositAddress);
        results.solSwept += swept.sol;
        results.usdcSwept += swept.usdc;
      } catch (e: any) {
        results.errors.push(`${user.username || user.id}: ${e.message}`);
      }
    }

    console.log(`[SWEEP] Complete: ${results.solSwept} SOL, ${results.usdcSwept} USDC`);
  } catch (error) {
    console.error('[SWEEP] Error:', error);
  }

  return results;
}

/**
 * Sweep funds from a single user's derived address to master wallet
 */
async function sweepUserFunds(
  userId: string,
  depositAddress: string
): Promise<{ sol: number; usdc: number }> {
  const userKeypair = AddressDerivation.deriveKeypair(userId);
  const userPubkey = userKeypair.publicKey;
  const swept = { sol: 0, usdc: 0 };

  // Sweep SOL
  const solBalance = await connection.getBalance(userPubkey);
  const solAmount = solBalance / LAMPORTS_PER_SOL;

  if (solAmount > MIN_SOL_RESERVE) {
    const sweepAmount = solAmount - MIN_SOL_RESERVE;
    const lamports = Math.floor(sweepAmount * LAMPORTS_PER_SOL);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: masterKeypair.publicKey,
        lamports,
      })
    );

    await sendAndConfirmTransaction(connection, tx, [userKeypair]);
    swept.sol = sweepAmount;
    console.log(`[SWEEP] Transferred ${sweepAmount} SOL from ${depositAddress}`);
  }

  // Sweep USDC
  try {
    const userAta = await getAssociatedTokenAddress(USDC_MINT, userPubkey);
    const account = await getAccount(connection, userAta);
    const usdcAmount = Number(account.amount) / 10 ** USDC_DECIMALS;

    if (usdcAmount > 0) {
      const masterAta = await getAssociatedTokenAddress(
        USDC_MINT,
        masterKeypair.publicKey
      );

      const tx = new Transaction();

      // Ensure master ATA exists
      try {
        await getAccount(connection, masterAta);
      } catch {
        tx.add(
          createAssociatedTokenAccountInstruction(
            userKeypair.publicKey,
            masterAta,
            masterKeypair.publicKey,
            USDC_MINT
          )
        );
      }

      tx.add(
        createTransferInstruction(
          userAta,
          masterAta,
          userPubkey,
          account.amount
        )
      );

      await sendAndConfirmTransaction(connection, tx, [userKeypair]);
      swept.usdc = usdcAmount;
      console.log(`[SWEEP] Transferred ${usdcAmount} USDC from ${depositAddress}`);
    }
  } catch {
    // No USDC ATA or empty - skip
  }

  return swept;
}

/**
 * Start periodic sweep (e.g., every hour)
 */
export function startSweepScheduler(intervalMs: number = 3600000) {
  setInterval(sweepAllUserFunds, intervalMs);
  console.log(`Sweep scheduler started (every ${intervalMs / 1000 / 60} min)`);
}
