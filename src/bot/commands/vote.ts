import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { DisputeService } from '../../services/dispute/service.js';
import type { Vote } from '@prisma/client';

export async function voteCommand(ctx: BotContext) {
  const user = getUser(ctx);
  const text = ctx.message?.text || '';

  const match = text.match(/^\/vote\s+(\S+)\s+(for|against)$/i);
  if (!match) {
    await ctx.reply('Usage: /vote <dispute_id> <for|against>');
    return;
  }

  const [, disputeId, voteStr] = match;
  const vote: Vote = voteStr.toUpperCase() === 'FOR' ? 'FOR' : 'AGAINST';

  const dispute = await DisputeService.findByShortId(disputeId);
  if (!dispute) {
    await ctx.reply('Dispute not found.');
    return;
  }

  try {
    const result = await DisputeService.vote({
      disputeId: dispute.id,
      userId: user.id,
      vote,
    });

    const message = `
✅ *Vote Recorded!*

Your vote: ${vote === 'FOR' ? 'FOR (overturn)' : 'AGAINST (keep original)'}
Voting weight: ${result.stake.toFixed(2)} (based on your position)

Current tally will be revealed when voting ends.
`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    console.error('Vote error:', error);
    await ctx.reply(error.message || 'Failed to record vote.');
  }
}
