import { Bot, session, GrammyError, HttpError } from 'grammy';
import type { Context, SessionFlavor } from 'grammy';
import { config } from '../config/index.js';

// Middleware
import { contextRouter } from './middleware/context-router.js';
import { authMiddleware } from './middleware/auth.js';

// Commands
import { startCommand } from './commands/start.js';
import { helpCommand } from './commands/help.js';
import { balanceCommand } from './commands/balance.js';
import { createCommand } from './commands/create.js';
import { marketsCommand } from './commands/markets.js';
import { marketCommand } from './commands/market.js';
import { buyCommand } from './commands/buy.js';
import { sellCommand } from './commands/sell.js';
import { portfolioCommand } from './commands/portfolio.js';
import { resolveCommand } from './commands/resolve.js';
import { depositCommand } from './commands/deposit.js';
import { withdrawCommand } from './commands/withdraw.js';
import { disputeCommand } from './commands/dispute.js';
import { voteCommand } from './commands/vote.js';

// Handlers (wizards, callbacks)
import { handleCreateWizard, handleCreateCallbacks } from './handlers/create-wizard.js';
import { handleInlineTradingCallbacks } from './handlers/inline-trading.js';

interface SessionData {
  step?: string;
  pendingData?: Record<string, unknown>;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export function createBot() {
  const bot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

  // Middleware (order matters!)
  // Use user ID for session key (not chat ID) so wizard state persists across group→DM
  bot.use(session({
    initial: (): SessionData => ({}),
    getSessionKey: (ctx) => ctx.from?.id.toString(),
  }));
  bot.use(contextRouter);  // Route by chat type FIRST
  bot.use(authMiddleware); // Then auth

  // Callback query handlers (inline buttons)
  bot.on('callback_query:data', async (ctx) => {
    if (await handleCreateCallbacks(ctx)) return;
    if (await handleInlineTradingCallbacks(ctx)) return;
    await ctx.answerCallbackQuery('Unknown action');
  });

  // Message handlers for wizards (DM flows)
  bot.on('message:text', async (ctx, next) => {
    if (await handleCreateWizard(ctx)) return;
    await next();
  });

  // Private-only commands
  bot.command('start', startCommand);
  bot.command('balance', balanceCommand);
  bot.command('deposit', depositCommand);
  bot.command('withdraw', withdrawCommand);
  bot.command('portfolio', portfolioCommand);
  bot.command('resolve', resolveCommand);

  // Group-only commands
  bot.command('create', createCommand);
  bot.command('markets', marketsCommand);
  bot.command('buy', buyCommand);
  bot.command('sell', sellCommand);
  bot.command('dispute', disputeCommand);
  bot.command('vote', voteCommand);

  // Both contexts
  bot.command('help', helpCommand);
  bot.command('market', marketCommand);

  // Error handler
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error('Error in request:', e.description);
    } else if (e instanceof HttpError) {
      console.error('Could not contact Telegram:', e);
    } else {
      console.error('Unknown error:', e);
    }
  });

  return bot;
}
