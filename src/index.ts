import { config } from './config/index.js';
import { createBot } from './bot/index.js';
import { prisma } from './db/client.js';
import { startDepositPoller } from './services/wallet/deposit-poller.js';
import { startDisputeScheduler } from './services/dispute/scheduler.js';
import { startSweepScheduler } from './services/wallet/sweep.js';
import { AddressDerivation } from './services/wallet/address-derivation.js';

/**
 * Migrate existing users to have unique deposit addresses
 */
async function migrateUserDepositAddresses() {
  const usersWithoutAddress = await prisma.user.findMany({
    where: { depositAddress: null },
  });

  if (usersWithoutAddress.length === 0) return;

  console.log(`Migrating ${usersWithoutAddress.length} users to unique deposit addresses...`);

  for (const user of usersWithoutAddress) {
    const depositAddress = AddressDerivation.getDepositAddress(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { depositAddress },
    });
    console.log(`  Assigned ${depositAddress} to user ${user.username || user.id}`);
  }

  console.log('Migration complete');
}

async function main() {
  console.log(`Starting Letsbet in ${config.NODE_ENV} mode...`);

  // Test database connection
  await prisma.$connect();
  console.log('Database connected');

  // Migrate existing users to unique deposit addresses
  await migrateUserDepositAddresses();

  // Start background jobs
  startDepositPoller(30000); // Every 30 seconds
  startDisputeScheduler(60000); // Every 60 seconds
  startSweepScheduler(3600000); // Every hour (sweep funds to master)

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
