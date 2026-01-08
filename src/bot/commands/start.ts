import type { BotContext } from '../index.js';

export async function startCommand(ctx: BotContext) {
  const welcome = `
🎲 *Welcome to Letsbet!*

Create and trade on prediction markets with your community.

*Quick Start:*
/deposit - Get your deposit address
/create - Create a new market
/markets - Browse active markets
/help - See all commands

*Your Balance:*
Use /balance to check your funds.
`;

  await ctx.reply(welcome, { parse_mode: 'Markdown' });
}
