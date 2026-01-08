import { Keypair } from '@solana/web3.js';
import { createHash } from 'crypto';
import { config } from '../../config/index.js';

/**
 * Derives deterministic Solana keypairs for users using HD-like derivation.
 *
 * Algorithm: SHA256(MASTER_SECRET + ":" + userId) -> 32-byte seed -> Keypair
 *
 * This ensures:
 * - Each user gets a unique, deterministic address
 * - Same user ID always produces same address
 * - Addresses can be regenerated from master secret
 */
export class AddressDerivation {
  private static masterSecret: string;

  /**
   * Initialize with master secret from env
   * Uses the master wallet private key as the derivation secret
   */
  static initialize() {
    this.masterSecret = config.SOLANA_PRIVATE_KEY;
    if (!this.masterSecret) {
      throw new Error('SOLANA_PRIVATE_KEY required for address derivation');
    }
  }

  /**
   * Derive a deterministic keypair for a user
   */
  static deriveKeypair(userId: string): Keypair {
    if (!this.masterSecret) {
      this.initialize();
    }

    // Create deterministic 32-byte seed from master + userId
    const seedData = `${this.masterSecret}:deposit:${userId}`;
    const seed = createHash('sha256').update(seedData).digest();

    return Keypair.fromSeed(seed);
  }

  /**
   * Get deposit address for a user (public key as base58)
   */
  static getDepositAddress(userId: string): string {
    return this.deriveKeypair(userId).publicKey.toBase58();
  }

  /**
   * Get all derived keypairs for a list of user IDs
   * Used for monitoring deposits across all users
   */
  static deriveMultipleKeypairs(userIds: string[]): Map<string, Keypair> {
    const result = new Map<string, Keypair>();
    for (const userId of userIds) {
      result.set(userId, this.deriveKeypair(userId));
    }
    return result;
  }
}
