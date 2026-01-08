import { prisma } from '../../db/client.js';
import { config } from '../../config/index.js';
import { Decimal } from 'decimal.js';
import type { Outcome, Vote } from '@prisma/client';

export interface CreateDisputeInput {
  marketId: string;
  initiatorId: string;
  proposedOutcome: Outcome;
  evidence?: string;
}

export interface VoteInput {
  disputeId: string;
  userId: string;
  vote: Vote;
}

export class DisputeService {
  /**
   * Create a new dispute
   */
  static async create(input: CreateDisputeInput) {
    const { marketId, initiatorId, proposedOutcome, evidence } = input;

    return prisma.$transaction(async (tx) => {
      // Validate market
      const market = await tx.market.findUnique({ where: { id: marketId } });
      if (!market) throw new Error('Market not found');
      if (market.status !== 'RESOLVED') {
        throw new Error('Market not in RESOLVED status');
      }
      if (market.resolvedOutcome === proposedOutcome) {
        throw new Error('Cannot dispute with same outcome');
      }
      if (market.disputeDeadline && new Date() > market.disputeDeadline) {
        throw new Error('Dispute window has closed');
      }

      // Check existing dispute
      const existing = await tx.dispute.findFirst({
        where: { marketId, status: 'ACTIVE' },
      });
      if (existing) throw new Error('Active dispute already exists');

      // Calculate required stake (5% of market volume)
      const stakeRequired = Number(market.totalVolume) *
        (config.DISPUTE_STAKE_PERCENT / 100);

      // Check user balance
      const user = await tx.user.findUnique({ where: { id: initiatorId } });
      if (!user || Number(user.balanceUsdc) < stakeRequired) {
        throw new Error(`Insufficient balance. Need ${stakeRequired.toFixed(2)} USDC to dispute`);
      }

      // Deduct stake
      const newBalance = new Decimal(user.balanceUsdc.toString()).minus(stakeRequired);
      await tx.user.update({
        where: { id: initiatorId },
        data: { balanceUsdc: newBalance },
      });

      // Record stake transaction
      await tx.transaction.create({
        data: {
          userId: initiatorId,
          marketId,
          type: 'DISPUTE_STAKE',
          amount: new Decimal(-stakeRequired),
        },
      });

      // Create dispute
      const dispute = await tx.dispute.create({
        data: {
          marketId,
          initiatorId,
          proposedOutcome,
          evidence,
          stakeAmount: stakeRequired,
          status: 'ACTIVE',
          votesFor: stakeRequired, // Initiator auto-votes FOR
          votesAgainst: 0,
        },
      });

      // Record initiator's vote
      await tx.disputeVote.create({
        data: {
          disputeId: dispute.id,
          userId: initiatorId,
          vote: 'FOR',
          stake: stakeRequired,
        },
      });

      // Update market status
      await tx.market.update({
        where: { id: marketId },
        data: { status: 'DISPUTED' },
      });

      return dispute;
    });
  }

  /**
   * Vote on a dispute
   */
  static async vote(input: VoteInput) {
    const { disputeId, userId, vote } = input;

    return prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({
        where: { id: disputeId },
        include: { market: true },
      });

      if (!dispute) throw new Error('Dispute not found');
      if (dispute.status !== 'ACTIVE') {
        throw new Error('Dispute is not active');
      }

      // Check if already voted
      const existingVote = await tx.disputeVote.findUnique({
        where: { disputeId_userId: { disputeId, userId } },
      });
      if (existingVote) throw new Error('Already voted on this dispute');

      // Get user's position value as voting weight
      const positions = await tx.position.findMany({
        where: { userId, marketId: dispute.marketId },
      });

      const stake = positions.reduce(
        (sum, p) => sum + Number(p.shares),
        0
      );

      if (stake <= 0) {
        throw new Error('Must have position in market to vote');
      }

      // Record vote
      await tx.disputeVote.create({
        data: {
          disputeId,
          userId,
          vote,
          stake,
        },
      });

      // Update vote counts
      const currentVotesFor = new Decimal(dispute.votesFor.toString());
      const currentVotesAgainst = new Decimal(dispute.votesAgainst.toString());

      await tx.dispute.update({
        where: { id: disputeId },
        data: vote === 'FOR'
          ? { votesFor: currentVotesFor.plus(stake) }
          : { votesAgainst: currentVotesAgainst.plus(stake) },
      });

      return { stake, vote };
    });
  }

  /**
   * Resolve dispute (called by scheduler after voting period)
   */
  static async resolve(disputeId: string) {
    return prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({
        where: { id: disputeId },
        include: { market: true, initiator: true },
      });

      if (!dispute) throw new Error('Dispute not found');
      if (dispute.status !== 'ACTIVE') {
        throw new Error('Dispute is not active');
      }

      const votesFor = Number(dispute.votesFor);
      const votesAgainst = Number(dispute.votesAgainst);
      const passed = votesFor > votesAgainst;

      if (passed) {
        // Dispute passed - change outcome
        await tx.market.update({
          where: { id: dispute.marketId },
          data: {
            resolvedOutcome: dispute.proposedOutcome,
            status: 'RESOLVED',
          },
        });

        // Refund stake to initiator
        const newBalance = new Decimal(dispute.initiator.balanceUsdc.toString())
          .plus(Number(dispute.stakeAmount));

        await tx.user.update({
          where: { id: dispute.initiatorId },
          data: { balanceUsdc: newBalance },
        });

        await tx.transaction.create({
          data: {
            userId: dispute.initiatorId,
            marketId: dispute.marketId,
            type: 'DISPUTE_REFUND',
            amount: Number(dispute.stakeAmount),
          },
        });
      } else {
        // Dispute rejected - lose stake, revert to original
        await tx.market.update({
          where: { id: dispute.marketId },
          data: { status: 'RESOLVED' },
        });

        // Stake is forfeit (goes to platform)
      }

      // Update dispute status
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: passed ? 'PASSED' : 'REJECTED',
          resolvedAt: new Date(),
        },
      });

      return { passed, votesFor, votesAgainst };
    });
  }

  /**
   * Get active dispute for market
   */
  static async getActiveForMarket(marketId: string) {
    return prisma.dispute.findFirst({
      where: { marketId, status: 'ACTIVE' },
      include: { initiator: true, votes: true },
    });
  }

  /**
   * Find dispute by short ID
   */
  static async findByShortId(shortId: string) {
    const disputes = await prisma.dispute.findMany({
      where: { id: { startsWith: shortId } },
      take: 1,
    });
    return disputes[0] || null;
  }
}
