import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { prisma } from '../../db/client.js';
import { LMSREngine } from '../../services/lmsr/engine.js';

export async function portfolioCommand(ctx: BotContext) {
  const user = getUser(ctx);

  const positions = await prisma.position.findMany({
    where: { userId: user.id },
    include: { market: true },
  });

  if (positions.length === 0) {
    await ctx.reply('No positions yet. Start trading with /markets');
    return;
  }

  let message = '📈 *Your Portfolio*\n\n';
  let totalValue = 0;

  for (const pos of positions) {
    const prices = LMSREngine.prices({
      b: Number(pos.market.bParam),
      sharesYes: Number(pos.market.sharesYes),
      sharesNo: Number(pos.market.sharesNo),
    });

    const currentPrice = pos.outcome === 'YES' ? prices.yes : prices.no;
    const value = Number(pos.shares) * currentPrice;
    totalValue += value;

    const shortId = pos.market.id.slice(0, 8);
    message += `*${shortId}* - ${pos.outcome}\n`;
    message += `Shares: ${Number(pos.shares).toFixed(2)} @ ${(currentPrice * 100).toFixed(1)}%\n`;
    message += `Value: ~${value.toFixed(2)} USDC\n\n`;
  }

  message += `*Total Est. Value:* ${totalValue.toFixed(2)} USDC`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
