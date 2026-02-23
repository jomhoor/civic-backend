import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getWallet(userId: string) {
    return this.prisma.wallet.findUnique({
      where: { userId },
    });
  }

  async getTransactions(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) return [];

    return this.prisma.tokenTransfer.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Award $CIVIC tokens to a user (Phase 1: off-chain tracking only).
   */
  async awardTokens(userId: string, amount: number, reason: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new Error('Wallet not found for user');
    }

    const [transfer] = await this.prisma.$transaction([
      this.prisma.tokenTransfer.create({
        data: {
          walletId: wallet.id,
          amount,
          reason,
          status: 'confirmed', // Phase 1: instant off-chain confirmation
        },
      }),
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { tokenBalance: { increment: amount } },
      }),
    ]);

    return transfer;
  }
}
