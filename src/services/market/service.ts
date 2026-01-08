import { prisma } from '../../db/client.js';
import { LMSREngine } from '../lmsr/engine.js';
import { config } from '../../config/index.js';
import type { Market, Outcome } from '@prisma/client';
import { Decimal } from 'decimal.js';

export interface CreateMarketParams {
  creatorId: string;
  question: string;
  outcomeYes?: string;
  outcomeNo?: string;
  groupChatId?: number | bigint;
  groupTitle?: string;
}

export interface ExecuteBuyParams {
  userId: string;
  marketId: string;
  outcome: Outcome;
  amount: number;
}

export interface ExecuteSellParams {
  userId: string;
  marketId: string;
  outcome: Outcome;
  shares: number;
}

export interface BuyResult {
  shares: number;
  cost: number;
  fee: number;
  totalCost: number;
  newPrice: number;
  newBalance: number;
}

export interface SellResult {
  shares: number;
  amount: number;
  fee: number;
  newPrice: number;
  newBalance: number;
}

export class MarketService {
  /**
   * Create a new prediction market
   */
  static async create(params: CreateMarketParams): Promise<Market> {
    const market = await prisma.market.create({
      data: {
        creatorId: params.creatorId,
        question: params.question,
        outcomeYes: params.outcomeYes || 'Yes',
        outcomeNo: params.outcomeNo || 'No',
        bParam: config.DEFAULT_LMSR_B,
        groupChatId: params.groupChatId ? BigInt(params.groupChatId) : null,
        groupTitle: params.groupTitle,
      },
    });

    return market;
  }

  /**
   * Find market by full ID
   */
  static async findById(id: string): Promise<Market | null> {
    return prisma.market.findUnique({ where: { id } });
  }

  /**
   * Find market by short ID (first 8 chars)
   */
  static async findByShortId(shortId: string): Promise<Market | null> {
    const markets = await prisma.market.findMany({
      where: {
        id: { startsWith: shortId },
      },
      take: 1,
    });
    return markets[0] || null;
  }

  /**
   * List active markets for a group
   */
  static async listByGroup(groupChatId: bigint | number | null, limit = 10): Promise<Market[]> {
    return prisma.market.findMany({
      where: {
        groupChatId: groupChatId ? BigInt(groupChatId) : null,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Execute a buy trade
   */
  static async executeBuy(params: ExecuteBuyParams): Promise<BuyResult> {
    const { userId, marketId, outcome, amount } = params;

    return prisma.$transaction(async (tx) => {
      // Get user and market
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const market = await tx.market.findUniqueOrThrow({ where: { id: marketId } });

      if (market.status !== 'ACTIVE') {
        throw new Error('Market is not active');
      }

      // Check balance
      const balance = Number(user.balanceUsdc);
      if (balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Validate bet limits
      const lmsrMarket = {
        b: Number(market.bParam),
        sharesYes: Number(market.sharesYes),
        sharesNo: Number(market.sharesNo),
      };

      const validation = LMSREngine.validateBet(lmsrMarket, amount);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      // Calculate trade
      const trade = LMSREngine.executeBuy(lmsrMarket, outcome, amount);

      // Update user balance
      const newBalance = new Decimal(user.balanceUsdc).minus(amount);
      await tx.user.update({
        where: { id: userId },
        data: { balanceUsdc: newBalance },
      });

      // Update market shares
      const sharesYesUpdate = outcome === 'YES'
        ? new Decimal(market.sharesYes).plus(trade.shares)
        : market.sharesYes;
      const sharesNoUpdate = outcome === 'NO'
        ? new Decimal(market.sharesNo).plus(trade.shares)
        : market.sharesNo;

      await tx.market.update({
        where: { id: marketId },
        data: {
          sharesYes: sharesYesUpdate,
          sharesNo: sharesNoUpdate,
          totalVolume: new Decimal(market.totalVolume).plus(amount),
        },
      });

      // Upsert position
      const existingPosition = await tx.position.findUnique({
        where: {
          userId_marketId_outcome: { userId, marketId, outcome },
        },
      });

      if (existingPosition) {
        await tx.position.update({
          where: { id: existingPosition.id },
          data: {
            shares: new Decimal(existingPosition.shares).plus(trade.shares),
            costBasis: new Decimal(existingPosition.costBasis).plus(trade.totalCost),
          },
        });
      } else {
        await tx.position.create({
          data: {
            userId,
            marketId,
            outcome,
            shares: trade.shares,
            costBasis: trade.totalCost,
          },
        });
      }

      // Record transaction
      await tx.transaction.create({
        data: {
          userId,
          marketId,
          type: 'BUY',
          outcome,
          shares: trade.shares,
          amount: trade.totalCost,
          price: trade.newPrice,
        },
      });

      return {
        shares: trade.shares,
        cost: trade.cost,
        fee: trade.fee,
        totalCost: trade.totalCost,
        newPrice: trade.newPrice,
        newBalance: newBalance.toNumber(),
      };
    });
  }

  /**
   * Execute a sell trade
   */
  static async executeSell(params: ExecuteSellParams): Promise<SellResult> {
    const { userId, marketId, outcome, shares } = params;

    return prisma.$transaction(async (tx) => {
      // Get user, market, and position
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const market = await tx.market.findUniqueOrThrow({ where: { id: marketId } });
      const position = await tx.position.findUnique({
        where: {
          userId_marketId_outcome: { userId, marketId, outcome },
        },
      });

      if (market.status !== 'ACTIVE') {
        throw new Error('Market is not active');
      }

      if (!position || Number(position.shares) < shares) {
        throw new Error('Insufficient shares');
      }

      // Calculate trade
      const lmsrMarket = {
        b: Number(market.bParam),
        sharesYes: Number(market.sharesYes),
        sharesNo: Number(market.sharesNo),
      };

      const trade = LMSREngine.executeSell(lmsrMarket, outcome, shares);

      // Update user balance (add proceeds)
      const newBalance = new Decimal(user.balanceUsdc).plus(trade.cost);
      await tx.user.update({
        where: { id: userId },
        data: { balanceUsdc: newBalance },
      });

      // Update market shares
      const sharesYesUpdate = outcome === 'YES'
        ? new Decimal(market.sharesYes).minus(shares)
        : market.sharesYes;
      const sharesNoUpdate = outcome === 'NO'
        ? new Decimal(market.sharesNo).minus(shares)
        : market.sharesNo;

      await tx.market.update({
        where: { id: marketId },
        data: {
          sharesYes: sharesYesUpdate,
          sharesNo: sharesNoUpdate,
        },
      });

      // Update position
      const newShares = new Decimal(position.shares).minus(shares);
      if (newShares.isZero()) {
        await tx.position.delete({ where: { id: position.id } });
      } else {
        await tx.position.update({
          where: { id: position.id },
          data: { shares: newShares },
        });
      }

      // Record transaction
      await tx.transaction.create({
        data: {
          userId,
          marketId,
          type: 'SELL',
          outcome,
          shares,
          amount: trade.cost,
          price: trade.newPrice,
        },
      });

      return {
        shares,
        amount: trade.cost,
        fee: trade.fee,
        newPrice: trade.newPrice,
        newBalance: newBalance.toNumber(),
      };
    });
  }

  /**
   * Resolve a market (creator only)
   */
  static async resolve(params: { marketId: string; outcome: Outcome }): Promise<Market> {
    const { marketId, outcome } = params;

    const disputeDeadline = new Date();
    disputeDeadline.setHours(disputeDeadline.getHours() + config.DISPUTE_WINDOW_HOURS);

    return prisma.market.update({
      where: { id: marketId },
      data: {
        status: 'RESOLVED',
        resolvedOutcome: outcome,
        resolutionTime: new Date(),
        disputeDeadline,
      },
    });
  }

  /**
   * Finalize market and pay out winners
   */
  static async finalize(marketId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const market = await tx.market.findUniqueOrThrow({
        where: { id: marketId },
        include: { positions: { include: { user: true } } },
      });

      if (market.status !== 'RESOLVED' || !market.resolvedOutcome) {
        throw new Error('Market not resolved');
      }

      // Check dispute window passed
      if (market.disputeDeadline && new Date() < market.disputeDeadline) {
        throw new Error('Dispute window not yet passed');
      }

      // Pay out winners
      for (const position of market.positions) {
        if (position.outcome === market.resolvedOutcome) {
          // Winner gets 1 USDC per share
          const payout = Number(position.shares);

          await tx.user.update({
            where: { id: position.userId },
            data: {
              balanceUsdc: new Decimal(position.user.balanceUsdc).plus(payout),
            },
          });

          await tx.transaction.create({
            data: {
              userId: position.userId,
              marketId,
              type: 'PAYOUT',
              outcome: position.outcome,
              shares: position.shares,
              amount: payout,
            },
          });
        }
      }

      // Mark market as finalized
      await tx.market.update({
        where: { id: marketId },
        data: { status: 'FINALIZED' },
      });
    });
  }
}
