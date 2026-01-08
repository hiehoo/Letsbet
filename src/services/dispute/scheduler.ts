import { prisma } from '../../db/client.js';
import { MarketService } from '../market/service.js';
import { DisputeService } from './service.js';

/**
 * Process markets that have passed their dispute deadline
 */
export async function processExpiredDisputes() {
  const now = new Date();

  // Find markets past dispute deadline that haven't been finalized
  const expiredMarkets = await prisma.market.findMany({
    where: {
      status: 'RESOLVED',
      disputeDeadline: { lt: now },
    },
  });

  for (const market of expiredMarkets) {
    console.log(`Finalizing market ${market.id}`);
    try {
      await MarketService.finalize(market.id);
      console.log(`Market ${market.id} finalized`);
    } catch (error) {
      console.error(`Failed to finalize market ${market.id}:`, error);
    }
  }

  // Find active disputes that should be resolved
  // (For MVP: disputes resolve 24h after creation)
  const disputeDeadline = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const expiredDisputes = await prisma.dispute.findMany({
    where: {
      status: 'ACTIVE',
      createdAt: { lt: disputeDeadline },
    },
  });

  for (const dispute of expiredDisputes) {
    console.log(`Resolving dispute ${dispute.id}`);
    try {
      const result = await DisputeService.resolve(dispute.id);
      console.log(`Dispute ${dispute.id} resolved: ${result.passed ? 'PASSED' : 'REJECTED'}`);
    } catch (error) {
      console.error(`Failed to resolve dispute ${dispute.id}:`, error);
    }
  }
}

/**
 * Start scheduler
 */
export function startDisputeScheduler(intervalMs: number = 60000) {
  setInterval(processExpiredDisputes, intervalMs);
  console.log(`Dispute scheduler started (every ${intervalMs / 1000}s)`);
}
