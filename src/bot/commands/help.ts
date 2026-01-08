import type { BotContext } from '../index.js';

export async function helpCommand(ctx: BotContext) {
  const help = `
📚 *Letsbet Commands*

*Wallet:*
/balance - View your balances
/deposit - Get deposit address
/withdraw <amount> <address> - Withdraw USDC

*Markets:*
/create <question> - Create new market
/markets - List active markets
/market <id> - View market details

*Trading:*
/buy <id> <yes|no> <amount> - Buy shares
/sell <id> <yes|no> <shares> - Sell shares
/portfolio - View your positions

*Resolution:*
/resolve <id> <yes|no> - Resolve your market
/dispute <id> <yes|no> - Dispute a resolution
/vote <dispute\\_id> <for|against> - Vote on dispute
`;

  await ctx.reply(help, { parse_mode: 'Markdown' });
}
