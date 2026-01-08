import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';

/**
 * /create in GROUP: Triggers DM wizard, stores groupChatId for posting back
 */
export async function createCommand(ctx: BotContext) {
  const user = getUser(ctx);
  const groupChatId = (ctx as any).groupChatId;
  const groupTitle = ctx.chat?.type !== 'private'
    ? (ctx.chat as any)?.title || 'Group'
    : null;

  if (!groupChatId) {
    await ctx.reply('⚠️ Use /create in a group to create a market there.');
    return;
  }

  // Store pending creation in session (will be picked up in DM)
  ctx.session.step = 'create_question';
  ctx.session.pendingData = { groupChatId, groupTitle };

  // Reply in group
  await ctx.reply("I'll help you create a market. Check your DMs! 📩");

  // DM user to start wizard
  try {
    await ctx.api.sendMessage(
      ctx.from!.id,
      `🎲 *Create a Market for ${groupTitle}*\n\nWhat's your prediction question?\n\n_Example: Will ETH hit $5000 by June 2026?_`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    await ctx.reply(
      `@${ctx.from?.username || 'User'}, I can't DM you. Please start a chat with me first!`
    );
  }
}
