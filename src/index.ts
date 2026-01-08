import { config } from './config/index.js';
import { createBot } from './bot/index.js';
import { prisma } from './db/client.js';
import { startDepositPoller } from './services/wallet/deposit-poller.js';
import { startDisputeScheduler } from './services/dispute/scheduler.js';

async function main() {
  console.log(`Starting Letsbet in ${config.NODE_ENV} mode...`);

  // Test database connection
  await prisma.$connect();
  console.log('Database connected');

  // Start background jobs
  startDepositPoller(30000); // Every 30 seconds
  startDisputeScheduler(60000); // Every 60 seconds

  // Start bot
  const bot = createBot();

  // Set bot commands (shows in Telegram UI)
  await bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show all commands' },
    { command: 'balance', description: 'View your balances' },
    { command: 'deposit', description: 'Get deposit address' },
    { command: 'withdraw', description: 'Withdraw funds' },
    { command: 'create', description: 'Create a new market' },
    { command: 'markets', description: 'List active markets' },
    { command: 'portfolio', description: 'View your positions' },
  ]);

  bot.start({
    onStart: () => console.log('Bot started!'),
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await bot.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
