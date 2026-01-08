import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { WalletService } from '../../services/wallet/service.js';
import { SolanaService } from '../../services/wallet/solana.js';

export async function withdrawCommand(ctx: BotContext) {
  const user = getUser(ctx);
  const text = ctx.message?.text || '';

  // Parse: /withdraw <amount> <address>
  const match = text.match(/^\/withdraw\s+(\d+(?:\.\d+)?)\s+(\S+)$/);
  if (!match) {
    await ctx.reply('Usage: /withdraw <amount> <solana_address>\n\nExample: /withdraw 10 ABC123...');
    return;
  }

  const [, amountStr, address] = match;
  const amount = parseFloat(amountStr);

  // Validate address
  if (!SolanaService.isValidAddress(address)) {
    await ctx.reply('Invalid Solana address.');
    return;
  }

  // Minimum withdrawal
  if (amount < 1) {
    await ctx.reply('Minimum withdrawal is 1 USDC.');
    return;
  }

  // Check balance
  if (Number(user.balanceUsdc) < amount) {
    await ctx.reply(`Insufficient balance. You have ${Number(user.balanceUsdc).toFixed(2)} USDC.`);
    return;
  }

  try {
    await ctx.reply('Processing withdrawal...');

    const result = await WalletService.withdraw(user.id, 'USDC', amount, address);

    const message = `
✅ *Withdrawal Successful!*

Amount: ${amount.toFixed(2)} USDC
To: \`${address}\`

Transaction: [View on Solscan](https://solscan.io/tx/${result.txHash})
`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    console.error('Withdraw error:', error);
    await ctx.reply(`Withdrawal failed: ${error.message}`);
  }
}
