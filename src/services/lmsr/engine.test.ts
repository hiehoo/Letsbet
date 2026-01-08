import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LMSRMarket } from '../../types/index.js';

// Mock config before importing engine
vi.mock('../../config/index.js', () => ({
  config: {
    TRADING_FEE_PERCENT: 2,
    MIN_BET_USDC: 1,
    MAX_BET_PERCENT: 10,
  },
}));

// Import after mocking
const { LMSREngine } = await import('./engine.js');

describe('LMSREngine', () => {
  let market: LMSRMarket;

  beforeEach(() => {
    // Fresh market with b=100, no shares
    market = { b: 100, sharesYes: 0, sharesNo: 0 };
  });

  describe('prices', () => {
    it('returns 50/50 for fresh market', () => {
      const prices = LMSREngine.prices(market);
      expect(prices.yes).toBeCloseTo(0.5, 5);
      expect(prices.no).toBeCloseTo(0.5, 5);
    });

    it('prices sum to 1', () => {
      market.sharesYes = 50;
      market.sharesNo = 30;
      const prices = LMSREngine.prices(market);
      expect(prices.yes + prices.no).toBeCloseTo(1, 10);
    });

    it('more shares = higher price', () => {
      market.sharesYes = 100;
      const prices = LMSREngine.prices(market);
      expect(prices.yes).toBeGreaterThan(0.5);
      expect(prices.no).toBeLessThan(0.5);
    });
  });

  describe('costToBuy', () => {
    it('costs more to buy when price is higher', () => {
      const cost1 = LMSREngine.costToBuy(market, 'YES', 10).toNumber();

      market.sharesYes = 100;
      const cost2 = LMSREngine.costToBuy(market, 'YES', 10).toNumber();

      expect(cost2).toBeGreaterThan(cost1);
    });

    it('buying increases price', () => {
      const priceBefore = LMSREngine.prices(market).yes;
      market.sharesYes += 50;
      const priceAfter = LMSREngine.prices(market).yes;

      expect(priceAfter).toBeGreaterThan(priceBefore);
    });
  });

  describe('sharesToBuy', () => {
    it('calculates correct shares for amount', () => {
      const amount = 10;
      const shares = LMSREngine.sharesToBuy(market, 'YES', amount);
      const cost = LMSREngine.costToBuy(market, 'YES', shares).toNumber();

      expect(cost).toBeCloseTo(amount, 2);
    });
  });

  describe('amountToSell', () => {
    it('selling recovers less than buying cost (due to slippage)', () => {
      const buyShares = 50;
      const buyCost = LMSREngine.costToBuy(market, 'YES', buyShares).toNumber();

      market.sharesYes += buyShares;
      const sellAmount = LMSREngine.amountToSell(market, 'YES', buyShares).toNumber();

      // Round trip has slippage
      expect(sellAmount).toBeCloseTo(buyCost, 1);
    });
  });

  describe('executeBuy', () => {
    it('deducts fee from trade', () => {
      const amount = 100;
      const result = LMSREngine.executeBuy(market, 'YES', amount);

      expect(result.fee).toBe(2); // 2% of 100
      expect(result.totalCost).toBe(100);
      expect(result.cost).toBeCloseTo(98, 0); // 100 - 2% fee goes to market
    });
  });

  describe('validateBet', () => {
    it('rejects bets below minimum', () => {
      const result = LMSREngine.validateBet(market, 0.5);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Minimum');
    });

    it('rejects bets above maximum', () => {
      const result = LMSREngine.validateBet(market, 1000);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Maximum');
    });

    it('accepts valid bets', () => {
      const result = LMSREngine.validateBet(market, 5);
      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles very small b parameter', () => {
      market.b = 1;
      const prices = LMSREngine.prices(market);
      expect(prices.yes).toBeCloseTo(0.5, 5);
    });

    it('handles large share imbalance', () => {
      market.sharesYes = 1000;
      market.sharesNo = 0;
      const prices = LMSREngine.prices(market);
      expect(prices.yes).toBeGreaterThan(0.99);
      expect(prices.yes + prices.no).toBeCloseTo(1, 10);
    });
  });

  describe('maxLoss', () => {
    it('calculates max loss correctly', () => {
      const maxLoss = LMSREngine.maxLoss(100);
      expect(maxLoss).toBeCloseTo(69.31, 1); // 100 * ln(2)
    });
  });

  describe('executeSell', () => {
    it('deducts fee from sell proceeds', () => {
      // First buy some shares
      market.sharesYes = 50;

      const result = LMSREngine.executeSell(market, 'YES', 10);

      expect(result.shares).toBe(10);
      expect(result.fee).toBeGreaterThan(0);
      expect(result.cost).toBeLessThan(result.totalCost);
    });
  });
});
