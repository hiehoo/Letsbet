import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  TELEGRAM_BOT_TOKEN: z.string().min(1),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  SOLANA_RPC_URL: z.string().url(),
  SOLANA_PRIVATE_KEY: z.string().min(1),
  SOLANA_USDC_MINT: z.string().min(1),

  TRADING_FEE_PERCENT: z.coerce.number().default(2),
  DEFAULT_LMSR_B: z.coerce.number().default(100),
  MIN_BET_USDC: z.coerce.number().default(1),
  MAX_BET_PERCENT: z.coerce.number().default(10),
  DISPUTE_STAKE_PERCENT: z.coerce.number().default(5),
  DISPUTE_WINDOW_HOURS: z.coerce.number().default(24),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
