import type { NextFunction } from 'grammy';
import type { BotContext } from '../index.js';

// Commands allowed only in private chat
const PRIVATE_ONLY = [
  'start', 'balance', 'deposit', 'withdraw',
  'portfolio', 'resolve', 'settings', 'history'
];

// Commands allowed only in group chat
const GROUP_ONLY = [
  'create', 'markets', 'buy', 'sell', 'dispute', 'vote'
];

export type ChatContext = 'PRIVATE' | 'GROUP';

/**
 * Routes commands based on chat context (private vs group)
 * Blocks commands used in wrong context
 */
export async function contextRouter(ctx: BotContext, next: NextFunction) {
  const chatType = ctx.chat?.type;
  const isPrivate = chatType === 'private';
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  // Extract command from message
  const text = ctx.message?.text || '';
  const command = text.split(' ')[0]?.replace('/', '').replace(/@.*/, '');

  if (!command) return next();

  // Validate context
  if (PRIVATE_ONLY.includes(command) && !isPrivate) {
    await ctx.reply('⚠️ This command only works in private chat. DM me!');
    return;
  }

  if (GROUP_ONLY.includes(command) && !isGroup) {
    await ctx.reply('⚠️ This command only works in groups.');
    return;
  }

  // Attach context to ctx for handlers
  (ctx as any).chatContext = isPrivate ? 'PRIVATE' : 'GROUP';
  (ctx as any).groupChatId = isGroup ? ctx.chat?.id : null;

  return next();
}
