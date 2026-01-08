import { prisma } from '../../db/client.js';
import { SolanaService } from './solana.js';
import { Decimal } from 'decimal.js';

export class WalletService {
  /**
   * Get or create user's deposit address
   */
  static async getDepositAddress(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    if (user.depositAddress) {
      return user.depositAddress;
    }

    const address = await SolanaService.getDepositAddress(userId);

    await prisma.user.update({
      where: { id: userId },
      data: { depositAddress: address },
    });

    return address;
  }

  /**
   * Credit user balance (after deposit detected)
   */
  static async creditBalance(
    userId: string,
    currency: 'SOL' | 'USDC',
    amount: number,
    txHash: string
  ): Promise<void> {
    // Check if already processed
    const existing = await prisma.transaction.findFirst({
      where: { txHash },
    });

    if (existing) {
      console.log(`Transaction ${txHash} already processed`);
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const newBalance = currency === 'SOL'
      ? new Decimal(user.balanceSol.toString()).plus(amount)
      : new Decimal(user.balanceUsdc.toString()).plus(amount);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: currency === 'SOL'
          ? { balanceSol: newBalance }
          : { balanceUsdc: newBalance },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: 'DEPOSIT',
          amount,
          txHash,
        },
      }),
    ]);

    console.log(`Credited ${amount} ${currency} to user ${userId}`);
  }

  /**
   * Process withdrawal request
   */
  static async withdraw(
    userId: string,
    currency: 'SOL' | 'USDC',
    amount: number,
    toAddress: string
  ): Promise<{ txHash: string }> {
    // Validate address
    if (!SolanaService.isValidAddress(toAddress)) {
      throw new Error('Invalid Solana address');
    }

    // Check balance
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const balance = currency === 'SOL'
      ? Number(user.balanceSol)
      : Number(user.balanceUsdc);

    if (balance < amount) {
      throw new Error(`Insufficient ${currency} balance`);
    }

    // Deduct balance first (optimistic)
    const newBalance = currency === 'SOL'
      ? new Decimal(user.balanceSol.toString()).minus(amount)
      : new Decimal(user.balanceUsdc.toString()).minus(amount);

    await prisma.user.update({
      where: { id: userId },
      data: currency === 'SOL'
        ? { balanceSol: newBalance }
        : { balanceUsdc: newBalance },
    });

    try {
      // Send on-chain
      const txHash = currency === 'SOL'
        ? await SolanaService.sendSol(toAddress, amount)
        : await SolanaService.sendUsdc(toAddress, amount);

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId,
          type: 'WITHDRAW',
          amount: new Decimal(-amount),
          txHash,
        },
      });

      return { txHash };
    } catch (error) {
      // Revert balance on failure
      const revertBalance = currency === 'SOL'
        ? new Decimal(user.balanceSol.toString()).plus(amount)
        : new Decimal(user.balanceUsdc.toString()).plus(amount);

      await prisma.user.update({
        where: { id: userId },
        data: currency === 'SOL'
          ? { balanceSol: revertBalance }
          : { balanceUsdc: revertBalance },
      });

      throw error;
    }
  }
}
