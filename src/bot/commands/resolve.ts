import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { MarketService } from '../../services/market/service.js';
import type { Outcome } from '@prisma/client';
import { config } from '../../config/index.js';

export async function resolveCommand(ctx: BotContext) {
  const user = getUser(ctx);
  const text = ctx.message?.text || '';

  const match = text.match(/^\/resolve\s+(\S+)\s+(yes|no)$/i);
  if (!match) {
    await ctx.reply('Usage: /resolve <market_id> <yes|no>');
    return;
  }

  const [, marketId, outcomeStr] = match;
  const outcome = outcomeStr.toUpperCase() as Outcome;

  const market = await MarketService.findByShortId(marketId);
  if (!market) {
    await ctx.reply('Market not found.');
    return;
  }

  if (market.creatorId !== user.id) {
    await ctx.reply('Only the market creator can resolve.');
    return;
  }

  if (market.status !== 'ACTIVE') {
    await ctx.reply('Market is not active.');
    return;
  }

  try {
    await MarketService.resolve({
      marketId: market.id,
      outcome,
    });

    const disputeHours = config.DISPUTE_WINDOW_HOURS;
    const message = `
✅ *Market Resolved!*

Outcome: ${outcome}

Payouts will be processed after the ${disputeHours}h dispute window.

Participants can dispute with:
/dispute ${marketId} <yes|no>
`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Resolve error:', error);
    await ctx.reply('Failed to resolve market.');
  }
}
