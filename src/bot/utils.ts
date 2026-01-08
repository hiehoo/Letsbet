import type { User } from '@prisma/client';
import type { BotContext } from './index.js';

export function getUser(ctx: BotContext): User {
  const user = (ctx as any).user;
  if (!user) {
    throw new Error('User not found in context. Auth middleware missing?');
  }
  return user;
}

export function formatUSDC(amount: number | bigint | string): string {
  return Number(amount).toFixed(2);
}

export function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + '%';
}
