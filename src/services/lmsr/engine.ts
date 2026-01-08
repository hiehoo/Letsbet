import { Decimal } from 'decimal.js';
import type { LMSRMarket, TradeResult, MarketPrices } from '../../types/index.js';
import { config } from '../../config/index.js';

// Configure Decimal.js for high precision
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export class LMSREngine {
  /**
   * Calculate cost function C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
   */
  static costFunction(market: LMSRMarket): Decimal {
    const b = new Decimal(market.b);
    const sharesYes = new Decimal(market.sharesYes);
    const sharesNo = new Decimal(market.sharesNo);

    const expYes = sharesYes.div(b).exp();
    const expNo = sharesNo.div(b).exp();

    return b.mul(expYes.plus(expNo).ln());
  }

  /**
   * Calculate current prices (probabilities) for both outcomes
   */
  static prices(market: LMSRMarket): MarketPrices {
    const b = new Decimal(market.b);
    const sharesYes = new Decimal(market.sharesYes);
    const sharesNo = new Decimal(market.sharesNo);

    const expYes = sharesYes.div(b).exp();
    const expNo = sharesNo.div(b).exp();
    const sum = expYes.plus(expNo);

    return {
      yes: expYes.div(sum).toNumber(),
      no: expNo.div(sum).toNumber(),
    };
  }

  /**
   * Calculate cost to buy shares of an outcome
   */
  static costToBuy(
    market: LMSRMarket,
    outcome: 'YES' | 'NO',
    shares: number
  ): Decimal {
    const before = this.costFunction(market);

    const afterMarket: LMSRMarket = {
      ...market,
      sharesYes: market.sharesYes + (outcome === 'YES' ? shares : 0),
      sharesNo: market.sharesNo + (outcome === 'NO' ? shares : 0),
    };

    const after = this.costFunction(afterMarket);
    return after.minus(before);
  }

  /**
   * Calculate shares received for a given amount (inverse of costToBuy)
   * Uses binary search to find shares that cost approximately `amount`
   */
  static sharesToBuy(
    market: LMSRMarket,
    outcome: 'YES' | 'NO',
    amount: number,
    tolerance: number = 0.0001
  ): number {
    let low = 0;
    let high = amount * 10; // Upper bound estimate
    let mid = 0;

    for (let i = 0; i < 100; i++) {
      mid = (low + high) / 2;
      const cost = this.costToBuy(market, outcome, mid).toNumber();

      if (Math.abs(cost - amount) < tolerance) {
        return mid;
      }

      if (cost < amount) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return mid;
  }

  /**
   * Calculate amount received for selling shares
   */
  static amountToSell(
    market: LMSRMarket,
    outcome: 'YES' | 'NO',
    shares: number
  ): Decimal {
    // Selling is negative buying
    return this.costToBuy(market, outcome, -shares).neg();
  }

  /**
   * Execute a buy trade with fee calculation
   */
  static executeBuy(
    market: LMSRMarket,
    outcome: 'YES' | 'NO',
    amount: number
  ): TradeResult {
    const feePercent = config.TRADING_FEE_PERCENT / 100;
    const amountAfterFee = amount * (1 - feePercent);
    const fee = amount * feePercent;

    const shares = this.sharesToBuy(market, outcome, amountAfterFee);
    const cost = this.costToBuy(market, outcome, shares).toNumber();

    // Calculate new market state for price
    const newMarket: LMSRMarket = {
      ...market,
      sharesYes: market.sharesYes + (outcome === 'YES' ? shares : 0),
      sharesNo: market.sharesNo + (outcome === 'NO' ? shares : 0),
    };

    const newPrices = this.prices(newMarket);

    return {
      shares,
      cost,
      fee,
      totalCost: amount,
      newPrice: outcome === 'YES' ? newPrices.yes : newPrices.no,
    };
  }

  /**
   * Execute a sell trade with fee calculation
   */
  static executeSell(
    market: LMSRMarket,
    outcome: 'YES' | 'NO',
    shares: number
  ): TradeResult {
    const grossAmount = this.amountToSell(market, outcome, shares).toNumber();
    const feePercent = config.TRADING_FEE_PERCENT / 100;
    const fee = grossAmount * feePercent;
    const netAmount = grossAmount - fee;

    // Calculate new market state for price
    const newMarket: LMSRMarket = {
      ...market,
      sharesYes: market.sharesYes - (outcome === 'YES' ? shares : 0),
      sharesNo: market.sharesNo - (outcome === 'NO' ? shares : 0),
    };

    const newPrices = this.prices(newMarket);

    return {
      shares,
      cost: netAmount,
      fee,
      totalCost: grossAmount,
      newPrice: outcome === 'YES' ? newPrices.yes : newPrices.no,
    };
  }

  /**
   * Calculate platform's maximum potential loss for a market
   * For binary market: b * ln(2)
   */
  static maxLoss(b: number): number {
    return b * Math.log(2);
  }

  /**
   * Validate bet against limits
   */
  static validateBet(
    market: LMSRMarket,
    amount: number
  ): { valid: boolean; reason?: string } {
    if (amount < config.MIN_BET_USDC) {
      return { valid: false, reason: `Minimum bet is ${config.MIN_BET_USDC} USDC` };
    }

    const maxBet = market.b * (config.MAX_BET_PERCENT / 100);
    if (amount > maxBet) {
      return { valid: false, reason: `Maximum bet is ${maxBet.toFixed(2)} USDC` };
    }

    return { valid: true };
  }
}
