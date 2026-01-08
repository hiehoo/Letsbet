import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { MarketService } from '../../services/market/service.js';
import { LMSREngine } from '../../services/lmsr/engine.js';
import type { Outcome } from '@prisma/client';

export async function buyCommand(ctx: BotContext) {
  const user = getUser(ctx);
  const text = ctx.message?.text || '';

  // Parse: /buy <id> <yes|no> <amount>
  const match = text.match(/^\/buy\s+(\S+)\s+(yes|no)\s+(\d+(?:\.\d+)?)$/i);
  if (!match) {
    await ctx.reply('Usage: /buy <market_id> <yes|no> <amount>\n\nExample: /buy abc123 yes 10');
    return;
  }

  const [, marketId, outcomeStr, amountStr] = match;
  const outcome = outcomeStr.toUpperCase() as Outcome;
  const amount = parseFloat(amountStr);

  // Find market
  const market = await MarketService.findByShortId(marketId);
  if (!market || market.status !== 'ACTIVE') {
    await ctx.reply('Market not found or not active.');
    return;
  }

  // Check balance
  if (Number(user.balanceUsdc) < amount) {
    await ctx.reply(`Insufficient balance. You have ${Number(user.balanceUsdc).toFixed(2)} USDC.`);
    return;
  }

  // Validate bet
  const lmsrMarket = {
    b: Number(market.bParam),
    sharesYes: Number(market.sharesYes),
    sharesNo: Number(market.sharesNo),
  };

  const validation = LMSREngine.validateBet(lmsrMarket, amount);
  if (!validation.valid) {
    await ctx.reply(validation.reason!);
    return;
  }

  try {
    const result = await MarketService.executeBuy({
      userId: user.id,
      marketId: market.id,
      outcome,
      amount,
    });

    const message = `
✅ *Trade Executed!*

Bought ${result.shares.toFixed(2)} shares of ${outcome}
Cost: ${result.totalCost.toFixed(2)} USDC (incl. ${result.fee.toFixed(2)} fee)
New price: ${(result.newPrice * 100).toFixed(1)}%

Your new balance: ${result.newBalance.toFixed(2)} USDC
`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Buy error:', error);
    await ctx.reply('Trade failed. Please try again.');
  }
}
