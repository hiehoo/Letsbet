import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { MarketService } from '../../services/market/service.js';
import { LMSREngine } from '../../services/lmsr/engine.js';
import { InlineKeyboard } from 'grammy';
import type { Outcome } from '@prisma/client';

/**
 * Handles inline button clicks for trading in groups
 * Flow: User clicks button in group → Bot DMs amount prompt → Execute trade → Post result to group
 */
export async function handleInlineTradingCallbacks(ctx: BotContext): Promise<boolean> {
  const callback = ctx.callbackQuery?.data;
  if (!callback) return false;

  // Handle buy button: buy_{marketId}_{YES|NO}
  if (callback.startsWith('buy_')) {
    const [, marketId, outcome] = callback.split('_');
    await handleBuyButton(ctx, marketId, outcome as Outcome);
    return true;
  }

  // Handle amount selection: amount_{marketId}_{YES|NO}_{amount}
  if (callback.startsWith('amount_')) {
    const [, marketId, outcome, amount] = callback.split('_');
    await executeBuyFromCallback(ctx, marketId, outcome as Outcome, parseFloat(amount));
    return true;
  }

  // Handle details button
  if (callback.startsWith('details_')) {
    const marketId = callback.replace('details_', '');
    await showMarketDetails(ctx, marketId);
    return true;
  }

  return false;
}

/**
 * When user clicks [Buy YES] in group, DM them with amount options
 */
async function handleBuyButton(ctx: BotContext, marketId: string, outcome: Outcome) {
  const user = getUser(ctx);
  const market = await MarketService.findById(marketId);

  if (!market || market.status !== 'ACTIVE') {
    await ctx.answerCallbackQuery('Market not active');
    return;
  }

  // Store context for DM flow
  ctx.session.pendingData = {
    marketId,
    outcome,
    groupChatId: ctx.callbackQuery?.message?.chat.id,
  };

  await ctx.answerCallbackQuery();

  // DM user with amount options
  const keyboard = new InlineKeyboard()
    .text('5 USDC', `amount_${marketId}_${outcome}_5`)
    .text('10 USDC', `amount_${marketId}_${outcome}_10`)
    .row()
    .text('25 USDC', `amount_${marketId}_${outcome}_25`)
    .text('50 USDC', `amount_${marketId}_${outcome}_50`);

  try {
    await ctx.api.sendMessage(
      ctx.from!.id,
      `*Buy ${outcome} shares*\n\n` +
      `Market: ${market.question}\n\n` +
      `Select amount:`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch {
    // User hasn't started DM
    await ctx.api.sendMessage(
      ctx.callbackQuery!.message!.chat.id,
      `@${ctx.from?.username || 'User'}, DM me first to trade!`,
    );
  }
}

/**
 * Execute buy after user selects amount
 */
async function executeBuyFromCallback(
  ctx: BotContext,
  marketId: string,
  outcome: Outcome,
  amount: number
) {
  const user = getUser(ctx);

  // Check balance
  if (Number(user.balanceUsdc) < amount) {
    await ctx.answerCallbackQuery();
    await ctx.reply(`Insufficient balance. You have ${Number(user.balanceUsdc).toFixed(2)} USDC.\n\nUse /deposit to add funds.`);
    return;
  }

  try {
    const result = await MarketService.executeBuy({
      userId: user.id,
      marketId,
      outcome,
      amount,
    });

    await ctx.answerCallbackQuery('Trade executed!');

    // Confirm in DM
    await ctx.reply(
      `✅ *Trade Executed!*\n\n` +
      `Bought ${result.shares.toFixed(2)} shares of ${outcome}\n` +
      `Cost: ${result.totalCost.toFixed(2)} USDC\n` +
      `New balance: ${result.newBalance.toFixed(2)} USDC`,
      { parse_mode: 'Markdown' }
    );

    // Post public confirmation in group
    const pendingData = ctx.session.pendingData;
    if (pendingData?.groupChatId) {
      const market = await MarketService.findById(marketId);
      const prices = LMSREngine.prices({
        b: Number(market!.bParam),
        sharesYes: Number(market!.sharesYes),
        sharesNo: Number(market!.sharesNo),
      });

      await ctx.api.sendMessage(
        pendingData.groupChatId as number,
        `📈 @${ctx.from?.username || 'User'} bought ${outcome} | ` +
        `${market!.outcomeYes}: ${(prices.yes * 100).toFixed(0)}% · ` +
        `${market!.outcomeNo}: ${(prices.no * 100).toFixed(0)}%`
      );
    }
  } catch (error: any) {
    await ctx.answerCallbackQuery();
    await ctx.reply(`Trade failed: ${error.message}`);
  }
}

async function showMarketDetails(ctx: BotContext, marketId: string) {
  const market = await MarketService.findById(marketId);
  if (!market) {
    await ctx.answerCallbackQuery('Market not found');
    return;
  }

  const prices = LMSREngine.prices({
    b: Number(market.bParam),
    sharesYes: Number(market.sharesYes),
    sharesNo: Number(market.sharesNo),
  });

  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .text(`Buy ${market.outcomeYes}`, `buy_${market.id}_YES`)
    .text(`Buy ${market.outcomeNo}`, `buy_${market.id}_NO`);

  await ctx.reply(
    `📊 *Market Details*\n\n` +
    `*${market.question}*\n\n` +
    `${market.outcomeYes}: ${(prices.yes * 100).toFixed(1)}%\n` +
    `${market.outcomeNo}: ${(prices.no * 100).toFixed(1)}%\n\n` +
    `Volume: ${Number(market.totalVolume).toFixed(2)} USDC\n` +
    `Status: ${market.status}`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}
