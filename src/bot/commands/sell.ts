import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { MarketService } from '../../services/market/service.js';
import type { Outcome } from '@prisma/client';

export async function sellCommand(ctx: BotContext) {
  const user = getUser(ctx);
  const text = ctx.message?.text || '';

  // Parse: /sell <id> <yes|no> <shares>
  const match = text.match(/^\/sell\s+(\S+)\s+(yes|no)\s+(\d+(?:\.\d+)?)$/i);
  if (!match) {
    await ctx.reply('Usage: /sell <market_id> <yes|no> <shares>\n\nExample: /sell abc123 yes 5');
    return;
  }

  const [, marketId, outcomeStr, sharesStr] = match;
  const outcome = outcomeStr.toUpperCase() as Outcome;
  const shares = parseFloat(sharesStr);

  // Find market
  const market = await MarketService.findByShortId(marketId);
  if (!market || market.status !== 'ACTIVE') {
    await ctx.reply('Market not found or not active.');
    return;
  }

  try {
    const result = await MarketService.executeSell({
      userId: user.id,
      marketId: market.id,
      outcome,
      shares,
    });

    const message = `
✅ *Trade Executed!*

Sold ${result.shares.toFixed(2)} shares of ${outcome}
Received: ${result.amount.toFixed(2)} USDC (after ${result.fee.toFixed(2)} fee)
New price: ${(result.newPrice * 100).toFixed(1)}%

Your new balance: ${result.newBalance.toFixed(2)} USDC
`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    console.error('Sell error:', error);
    await ctx.reply(error.message || 'Trade failed. Please try again.');
  }
}
