import type { BotContext } from '../index.js';
import { getUser } from '../utils.js';
import { MarketService } from '../../services/market/service.js';
import { InlineKeyboard } from 'grammy';

/**
 * Handles multi-step market creation in DM
 */
export async function handleCreateWizard(ctx: BotContext): Promise<boolean> {
  if (ctx.chat?.type !== 'private') return false;
  if (!ctx.session.step?.startsWith('create_')) return false;

  const text = ctx.message?.text || '';
  const step = ctx.session.step;
  const data = ctx.session.pendingData || {};

  switch (step) {
    case 'create_question':
      if (text.length < 10) {
        await ctx.reply('Question too short. Please enter at least 10 characters.');
        return true;
      }
      data.question = text;
      ctx.session.pendingData = data;
      ctx.session.step = 'create_outcomes';

      const keyboard = new InlineKeyboard()
        .text('Yes / No (default)', 'create_default_outcomes')
        .row()
        .text('Custom outcomes', 'create_custom_outcomes');

      await ctx.reply(
        `*Question:* ${text}\n\nChoose outcome labels:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return true;

    case 'create_outcomes_custom':
      // User typed custom outcomes like "Win / Lose"
      const parts = text.split('/').map(s => s.trim());
      if (parts.length !== 2) {
        await ctx.reply('Please enter two outcomes separated by /\n\nExample: Win / Lose');
        return true;
      }
      data.outcomeYes = parts[0];
      data.outcomeNo = parts[1];
      ctx.session.pendingData = data;
      await confirmCreate(ctx);
      return true;

    default:
      return false;
  }
}

/**
 * Callback handler for create wizard buttons
 */
export async function handleCreateCallbacks(ctx: BotContext): Promise<boolean> {
  const callback = ctx.callbackQuery?.data;
  if (!callback?.startsWith('create_')) return false;

  const data = ctx.session.pendingData || {};

  if (callback === 'create_default_outcomes') {
    data.outcomeYes = 'Yes';
    data.outcomeNo = 'No';
    ctx.session.pendingData = data;
    await ctx.answerCallbackQuery();
    await confirmCreate(ctx);
    return true;
  }

  if (callback === 'create_custom_outcomes') {
    ctx.session.step = 'create_outcomes_custom';
    await ctx.answerCallbackQuery();
    await ctx.reply('Enter your two outcomes separated by /\n\nExample: Win / Lose');
    return true;
  }

  if (callback === 'create_confirm') {
    await ctx.answerCallbackQuery();
    await executeCreate(ctx);
    return true;
  }

  if (callback === 'create_cancel') {
    ctx.session.step = undefined;
    ctx.session.pendingData = undefined;
    await ctx.answerCallbackQuery('Cancelled');
    await ctx.reply('Market creation cancelled.');
    return true;
  }

  return false;
}

async function confirmCreate(ctx: BotContext) {
  const data = ctx.session.pendingData!;

  const keyboard = new InlineKeyboard()
    .text('✅ Create Market', 'create_confirm')
    .text('❌ Cancel', 'create_cancel');

  await ctx.reply(
    `*Confirm Market Creation*\n\n` +
    `*Question:* ${data.question}\n` +
    `*Outcomes:* ${data.outcomeYes} / ${data.outcomeNo}\n` +
    `*Group:* ${data.groupTitle}`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

async function executeCreate(ctx: BotContext) {
  const user = getUser(ctx);
  const data = ctx.session.pendingData!;

  try {
    const market = await MarketService.create({
      creatorId: user.id,
      question: data.question as string,
      outcomeYes: data.outcomeYes as string,
      outcomeNo: data.outcomeNo as string,
      groupChatId: data.groupChatId as number,
      groupTitle: data.groupTitle as string,
    });

    // Clear session
    ctx.session.step = undefined;
    ctx.session.pendingData = undefined;

    // Confirm in DM
    await ctx.reply(`✅ Market created! Posting to ${data.groupTitle}...`);

    // Post to group with inline buttons
    const keyboard = new InlineKeyboard()
      .text(`Buy ${market.outcomeYes}`, `buy_${market.id}_YES`)
      .text(`Buy ${market.outcomeNo}`, `buy_${market.id}_NO`)
      .row()
      .text('📈 Details', `details_${market.id}`);

    await ctx.api.sendMessage(
      data.groupChatId as number,
      `🎲 *New Prediction Market!*\n\n` +
      `*${market.question}*\n\n` +
      `✅ ${market.outcomeYes}: 50%\n` +
      `❌ ${market.outcomeNo}: 50%\n\n` +
      `Created by @${ctx.from?.username || 'anonymous'}`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Create market error:', error);
    await ctx.reply('Failed to create market. Please try again.');
  }
}
