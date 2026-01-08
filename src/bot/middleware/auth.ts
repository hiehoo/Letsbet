import type { NextFunction } from 'grammy';
import type { BotContext } from '../index.js';
import { prisma } from '../../db/client.js';

/**
 * In PRIVATE: Auto-register user
 * In GROUP: Check if user registered, prompt to DM if not
 */
export async function authMiddleware(ctx: BotContext, next: NextFunction) {
  if (!ctx.from) return;

  const telegramId = BigInt(ctx.from.id);
  const isPrivate = ctx.chat?.type === 'private';

  let user = await prisma.user.findUnique({
    where: { telegramId },
  });

  // In private chat: auto-register
  if (!user && isPrivate) {
    user = await prisma.user.create({
      data: {
        telegramId,
        username: ctx.from.username,
      },
    });
    console.log(`New user registered: ${ctx.from.id}`);
  }

  // In group chat: require registration
  if (!user && !isPrivate) {
    const username = ctx.from.username ? `@${ctx.from.username}` : 'there';
    await ctx.reply(
      `👋 ${username}, DM me first to get started!`,
      { reply_to_message_id: ctx.message?.message_id }
    );
    return;
  }

  (ctx as any).user = user;
  await next();
}
