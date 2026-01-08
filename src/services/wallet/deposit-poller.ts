import { SolanaService } from './solana.js';
import { WalletService } from './service.js';
import { prisma } from '../../db/client.js';

let lastSignature: string | undefined;

/**
 * Poll for new USDC deposits and credit user balances
 * For MVP: All deposits to master wallet need manual user identification
 */
export async function pollDeposits() {
  console.log('Polling for deposits...');

  try {
    const deposits = await SolanaService.getRecentUsdcDeposits(lastSignature);

    if (deposits.length > 0) {
      lastSignature = deposits[0].signature;
    }

    for (const deposit of deposits) {
      console.log(`Found deposit: ${deposit.amount} USDC from ${deposit.from}`);

      // For MVP with shared deposit address:
      // Match deposit to user by their linked source wallet
      // OR require users to include their user ID in memo

      // Simplified: Find user with this deposit address
      const user = await prisma.user.findFirst({
        where: { depositAddress: deposit.from },
      });

      if (user) {
        await WalletService.creditBalance(
          user.id,
          'USDC',
          deposit.amount,
          deposit.signature
        );
      } else {
        console.log(`Unknown sender: ${deposit.from}`);
        // TODO: Queue for manual review or refund
      }
    }
  } catch (error) {
    console.error('Deposit polling error:', error);
  }
}

/**
 * Start deposit polling interval
 */
export function startDepositPoller(intervalMs: number = 30000) {
  setInterval(pollDeposits, intervalMs);
  console.log(`Deposit poller started (every ${intervalMs / 1000}s)`);
}
