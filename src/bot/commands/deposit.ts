import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { WalletService } from '../../services/wallet/service.js';
import { config } from '../../config/index.js';

export async function depositCommand(ctx: BotContext) {
  const user = getUser(ctx);

  const address = await WalletService.getDepositAddress(user.id);
  const network = config.NODE_ENV === 'production' ? 'Mainnet' : 'Devnet';

  const message = `
💳 *Deposit Instructions*

Send SOL or USDC to this address:

\`${address}\`

*Supported tokens:*
• SOL (native)
• USDC (SPL token)

*Network:* Solana ${network}

⚠️ Deposits are detected automatically within ~30 seconds.

Your current balance: ${Number(user.balanceUsdc).toFixed(2)} USDC
`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
