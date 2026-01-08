import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { WalletService } from './service.js';
import { AddressDerivation } from './address-derivation.js';
import { prisma } from '../../db/client.js';
import { config } from '../../config/index.js';

const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');
const USDC_MINT = new PublicKey(config.SOLANA_USDC_MINT);
const USDC_DECIMALS = 6;

// Track processed signatures globally to avoid duplicates
const processedSignatures = new Set<string>();

// Track last signature per user address for pagination
const lastSignatures = new Map<string, string>();

/**
 * Poll for deposits to all user-specific addresses
 * Each user has a unique derived address for deposits
 */
export async function pollDeposits() {
  console.log('Polling for deposits...');

  try {
    // Get all users with deposit addresses
    const users = await prisma.user.findMany({
      where: { depositAddress: { not: null } },
      select: { id: true, depositAddress: true, username: true },
    });

    if (users.length === 0) {
      console.log('[DEPOSIT] No users with deposit addresses yet');
      return;
    }

    // Check deposits for each user's address
    for (const user of users) {
      if (!user.depositAddress) continue;

      await checkUserDeposits(
        user.id,
        user.depositAddress,
        user.username || user.id
      );
    }
  } catch (error) {
    console.error('Deposit polling error:', error);
  }
}

/**
 * Check for SOL and USDC deposits to a specific user's address
 */
async function checkUserDeposits(
  userId: string,
  depositAddress: string,
  username: string
) {
  const pubkey = new PublicKey(depositAddress);
  const lastSig = lastSignatures.get(depositAddress);

  try {
    // Get recent signatures for this address
    const signatures = await connection.getSignaturesForAddress(pubkey, {
      until: lastSig,
      limit: 20,
    });

    if (signatures.length === 0) return;

    // Update last signature for pagination
    lastSignatures.set(depositAddress, signatures[0].signature);

    for (const sig of signatures) {
      if (processedSignatures.has(sig.signature)) continue;

      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta || tx.meta.err) continue;

        // Check for SOL transfer
        const solDeposit = await detectSolDeposit(tx, depositAddress);
        if (solDeposit) {
          processedSignatures.add(sig.signature);
          console.log(`[DEPOSIT] Found ${solDeposit.amount} SOL for ${username}`);
          await WalletService.creditBalance(userId, 'SOL', solDeposit.amount, sig.signature);
          console.log(`[DEPOSIT] Credited ${solDeposit.amount} SOL to ${username}`);
        }

        // Check for USDC transfer
        const usdcDeposit = await detectUsdcDeposit(tx, depositAddress);
        if (usdcDeposit) {
          processedSignatures.add(sig.signature);
          console.log(`[DEPOSIT] Found ${usdcDeposit.amount} USDC for ${username}`);
          await WalletService.creditBalance(userId, 'USDC', usdcDeposit.amount, sig.signature);
          console.log(`[DEPOSIT] Credited ${usdcDeposit.amount} USDC to ${username}`);
        }
      } catch (e) {
        console.error(`Error processing tx ${sig.signature}:`, e);
      }
    }
  } catch (e) {
    console.error(`Error checking deposits for ${depositAddress}:`, e);
  }
}

/**
 * Detect SOL transfer to destination address
 */
function detectSolDeposit(
  tx: any,
  destinationAddress: string
): { amount: number; from: string } | null {
  const instructions = tx.transaction.message.instructions;

  for (const ix of instructions) {
    if ('parsed' in ix && ix.parsed?.type === 'transfer') {
      const info = ix.parsed.info;
      // Check if this is a SOL transfer to our address
      if (info.destination === destinationAddress && info.source !== destinationAddress) {
        return {
          amount: Number(info.lamports) / LAMPORTS_PER_SOL,
          from: info.source,
        };
      }
    }
  }
  return null;
}

/**
 * Detect USDC transfer to destination address's ATA
 */
async function detectUsdcDeposit(
  tx: any,
  destinationAddress: string
): Promise<{ amount: number; from: string } | null> {
  const destPubkey = new PublicKey(destinationAddress);
  const destAta = await getAssociatedTokenAddress(USDC_MINT, destPubkey);
  const destAtaStr = destAta.toBase58();

  const instructions = tx.transaction.message.instructions;

  for (const ix of instructions) {
    if ('parsed' in ix) {
      const type = ix.parsed?.type;
      if (type === 'transfer' || type === 'transferChecked') {
        const info = ix.parsed.info;
        const dest = info.destination || info.account;

        if (dest === destAtaStr) {
          const rawAmount = info.amount || info.tokenAmount?.amount;
          return {
            amount: Number(rawAmount) / 10 ** USDC_DECIMALS,
            from: info.source || info.authority,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Start deposit polling interval
 */
export function startDepositPoller(intervalMs: number = 30000) {
  // Run immediately on start
  pollDeposits();
  setInterval(pollDeposits, intervalMs);
  console.log(`Deposit poller started (every ${intervalMs / 1000}s)`);
}
