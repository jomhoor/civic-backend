import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PokeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Send a poke from one user to another.
   * Each user can only poke another user once (upsert on unique constraint).
   */
  async sendPoke(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot poke yourself');
    }

    // Upsert — if already poked, just return existing
    const poke = await this.prisma.poke.upsert({
      where: {
        senderId_receiverId: { senderId, receiverId },
      },
      update: {}, // already exists, no-op
      create: { senderId, receiverId },
    });

    // Check if mutual (both poked each other)
    const mutual = await this.prisma.poke.findUnique({
      where: {
        senderId_receiverId: { senderId: receiverId, receiverId: senderId },
      },
    });

    let walletAddress: string | undefined;
    if (mutual) {
      const targetUser = await this.prisma.user.findUnique({
        where: { id: receiverId },
        select: { walletAddress: true },
      });
      walletAddress = targetUser?.walletAddress;
    }

    return {
      poke,
      mutual: !!mutual,
      walletAddress,
    };
  }

  /**
   * Get all pokes received by a user, with sender info.
   */
  async getReceivedPokes(userId: string) {
    const pokes = await this.prisma.poke.findMany({
      where: { receiverId: userId },
      include: {
        sender: {
          select: { id: true, walletAddress: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // For each poke, check if the user has poked back (mutual)
    const sentPokes = await this.prisma.poke.findMany({
      where: { senderId: userId },
      select: { receiverId: true },
    });
    const pokedBackSet = new Set(sentPokes.map((p) => p.receiverId));

    return pokes.map((p) => {
      const isMutual = pokedBackSet.has(p.sender.id);
      return {
        id: p.id,
        senderId: p.sender.id,
        seen: p.seen,
        mutual: isMutual,
        createdAt: p.createdAt,
        sender: {
          displayName: p.sender.displayName,
          walletAddress: isMutual
            ? p.sender.walletAddress  // reveal full wallet for Blockscan chat
            : (p.sender.walletAddress.length > 12
              ? `${p.sender.walletAddress.slice(0, 6)}...${p.sender.walletAddress.slice(-4)}`
              : p.sender.walletAddress),
        },
      };
    });
  }

  /**
   * Get unseen poke count for badge display.
   */
  async getUnseenPokeCount(userId: string) {
    return this.prisma.poke.count({
      where: { receiverId: userId, seen: false },
    });
  }

  /**
   * Mark all received pokes as seen.
   */
  async markPokesSeen(userId: string) {
    await this.prisma.poke.updateMany({
      where: { receiverId: userId, seen: false },
      data: { seen: true },
    });
    return { ok: true };
  }

  /**
   * Check poke status between two users (for profile page button state).
   */
  async getPokeStatus(currentUserId: string, targetUserId: string) {
    const [sent, received, targetUser] = await Promise.all([
      this.prisma.poke.findUnique({
        where: { senderId_receiverId: { senderId: currentUserId, receiverId: targetUserId } },
      }),
      this.prisma.poke.findUnique({
        where: { senderId_receiverId: { senderId: targetUserId, receiverId: currentUserId } },
      }),
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { walletAddress: true },
      }),
    ]);

    const mutual = !!sent && !!received;
    return {
      hasPoked: !!sent,
      hasBeenPoked: !!received,
      mutual,
      walletAddress: mutual ? targetUser?.walletAddress : undefined,
    };
  }
}
