import type { BotContext } from '../index.js';
import { MarketService } from '../../services/market/service.js';
import { LMSREngine } from '../../services/lmsr/engine.js';

export async function marketCommand(ctx: BotContext) {
  const text = ctx.message?.text || '';
  const match = text.match(/^\/market\s+(\S+)$/);

  if (!match) {
    await ctx.reply('Usage: /market <id>');
    return;
  }

  const marketId = match[1];
  const market = await MarketService.findByShortId(marketId);

  if (!market) {
    await ctx.reply('Market not found.');
    return;
  }

  const prices = LMSREngine.prices({
    b: Number(market.bParam),
    sharesYes: Number(market.sharesYes),
    sharesNo: Number(market.sharesNo),
  });

  const statusEmoji: Record<string, string> = {
    ACTIVE: '🟢',
    RESOLVED: '✅',
    DISPUTED: '⚠️',
    FINALIZED: '🏁',
  };

  const message = `
📊 *Market Details*

${statusEmoji[market.status]} Status: ${market.status}

*Question:*
${market.question}

*Prices:*
• ${market.outcomeYes}: ${(prices.yes * 100).toFixed(1)}%
• ${market.outcomeNo}: ${(prices.no * 100).toFixed(1)}%

*Volume:* ${Number(market.totalVolume).toFixed(2)} USDC

*Commands:*
/buy ${market.id.slice(0, 8)} yes 10 - Buy 10 USDC of YES
/buy ${market.id.slice(0, 8)} no 10 - Buy 10 USDC of NO
`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
