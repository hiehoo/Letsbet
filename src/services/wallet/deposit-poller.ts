import { SolanaService } from './solana.js';
import { WalletService } from './service.js';
import { prisma } from '../../db/client.js';

let lastSolSignature: string | undefined;
let lastUsdcSignature: string | undefined;

// Track processed signatures to avoid duplicates
const processedSignatures = new Set<string>();

/**
 * Poll for new SOL and USDC deposits and credit user balances
 * For MVP: Credits first registered user (single-user mode)
 */
export async function pollDeposits() {
  console.log('Polling for deposits...');

  try {
    // Poll SOL deposits
    const solDeposits = await SolanaService.getRecentSolDeposits(lastSolSignature);
    if (solDeposits.length > 0) {
      lastSolSignature = solDeposits[0].signature;
    }

    for (const deposit of solDeposits) {
      if (processedSignatures.has(deposit.signature)) continue;
      processedSignatures.add(deposit.signature);

      console.log(`[DEPOSIT] Found ${deposit.amount} SOL from ${deposit.from}`);

      // For MVP: Find user to credit
      const user = await findUserForDeposit(deposit.from);

      if (user) {
        await WalletService.creditBalance(
          user.id,
          'SOL',
          deposit.amount,
          deposit.signature
        );
        console.log(`[DEPOSIT] Credited ${deposit.amount} SOL to ${user.username || user.id}`);
      } else {
        console.log(`[DEPOSIT] No user found for SOL deposit from ${deposit.from}`);
      }
    }

    // Poll USDC deposits
    const usdcDeposits = await SolanaService.getRecentUsdcDeposits(lastUsdcSignature);
    if (usdcDeposits.length > 0) {
      lastUsdcSignature = usdcDeposits[0].signature;
    }

    for (const deposit of usdcDeposits) {
      if (processedSignatures.has(deposit.signature)) continue;
      processedSignatures.add(deposit.signature);

      console.log(`[DEPOSIT] Found ${deposit.amount} USDC from ${deposit.from}`);

      const user = await findUserForDeposit(deposit.from);

      if (user) {
        await WalletService.creditBalance(
          user.id,
          'USDC',
          deposit.amount,
          deposit.signature
        );
        console.log(`[DEPOSIT] Credited ${deposit.amount} USDC to ${user.username || user.id}`);
      } else {
        console.log(`[DEPOSIT] No user found for USDC deposit from ${deposit.from}`);
      }
    }
  } catch (error) {
    console.error('Deposit polling error:', error);
  }
}

/**
 * Find user to credit for a deposit
 * MVP strategy: First registered user OR most recent user who called /deposit
 */
async function findUserForDeposit(senderAddress: string) {
  // Strategy 1: Check if sender address matches any user's stored source wallet
  // (if they've deposited before and we stored their source address)

  // Strategy 2: For MVP with single/few users, credit the first user
  // This is a simplification - production would need memo parsing or unique addresses
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    take: 1,
  });

  return users[0] || null;
}

/**
 * Start deposit polling interval
 */
export function startDepositPoller(intervalMs: number = 30000) {
  setInterval(pollDeposits, intervalMs);
  console.log(`Deposit poller started (every ${intervalMs / 1000}s)`);
}
