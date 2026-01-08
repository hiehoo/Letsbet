import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';

export async function balanceCommand(ctx: BotContext) {
  const user = getUser(ctx);

  const message = `
💰 *Your Balances*

SOL: ${Number(user.balanceSol).toFixed(4)}
USDC: ${Number(user.balanceUsdc).toFixed(2)}
`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
