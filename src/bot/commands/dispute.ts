import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { MarketService } from '../../services/market/service.js';
import { DisputeService } from '../../services/dispute/service.js';
import type { Outcome } from '@prisma/client';
import { config } from '../../config/index.js';

export async function disputeCommand(ctx: BotContext) {
  const user = getUser(ctx);
  const text = ctx.message?.text || '';

  const match = text.match(/^\/dispute\s+(\S+)\s+(yes|no)(?:\s+(.+))?$/i);
  if (!match) {
    await ctx.reply('Usage: /dispute <market_id> <yes|no> [evidence]\n\nExample: /dispute abc123 no The event was cancelled');
    return;
  }

  const [, marketId, outcomeStr, evidence] = match;
  const proposedOutcome = outcomeStr.toUpperCase() as Outcome;

  const market = await MarketService.findByShortId(marketId);
  if (!market) {
    await ctx.reply('Market not found.');
    return;
  }

  const stakeRequired = Number(market.totalVolume) * (config.DISPUTE_STAKE_PERCENT / 100);

  try {
    const dispute = await DisputeService.create({
      marketId: market.id,
      initiatorId: user.id,
      proposedOutcome,
      evidence,
    });

    const message = `
⚠️ *Dispute Filed!*

Market: ${market.question}
Current resolution: ${market.resolvedOutcome}
Your proposed outcome: ${proposedOutcome}

Stake locked: ${stakeRequired.toFixed(2)} USDC

Others can vote using:
/vote ${dispute.id.slice(0, 8)} for
/vote ${dispute.id.slice(0, 8)} against

Voting ends in 24 hours.
`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    console.error('Dispute error:', error);
    await ctx.reply(error.message || 'Failed to file dispute.');
  }
}
