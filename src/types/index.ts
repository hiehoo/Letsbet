import type { Outcome, MarketStatus, TransactionType } from '@prisma/client';

export type { Outcome, MarketStatus, TransactionType };

export interface LMSRMarket {
  b: number;
  sharesYes: number;
  sharesNo: number;
}

export interface TradeResult {
  shares: number;
  cost: number;
  fee: number;
  totalCost: number;
  newPrice: number;
}

export interface MarketPrices {
  yes: number;
  no: number;
}
