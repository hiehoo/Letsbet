import type { BotContext } from '../index.js';
import { MarketService } from '../../services/market/service.js';
import { LMSREngine } from '../../services/lmsr/engine.js';

/**
 * /markets in GROUP: Lists markets for THIS group only
 */
export async function marketsCommand(ctx: BotContext) {
  const groupChatId = (ctx as any).groupChatId;

  // Filter by group
  const markets = await MarketService.listByGroup(groupChatId, 10);

  if (markets.length === 0) {
    await ctx.reply('No active markets in this group. Create one with /create');
    return;
  }

  let message = '📊 *Active Markets in this Group*\n\n';

  for (const market of markets) {
    const prices = LMSREngine.prices({
      b: Number(market.bParam),
      sharesYes: Number(market.sharesYes),
      sharesNo: Number(market.sharesNo),
    });

    const shortId = market.id.slice(0, 8);
    message += `*${shortId}*: ${market.question}\n`;
    message += `${market.outcomeYes}: ${(prices.yes * 100).toFixed(1)}% | ${market.outcomeNo}: ${(prices.no * 100).toFixed(1)}%\n\n`;
  }

  message += 'Tap a market ID or use /market <id> for details';

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
