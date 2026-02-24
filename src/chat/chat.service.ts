import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /**
   * Store or update the user's chat public key (X25519, base64-encoded).
   */
  async setPublicKey(userId: string, publicKey: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { chatPublicKey: publicKey },
    });
    return { ok: true };
  }

  /**
   * Get a user's chat public key.
   * Only allowed if mutual poke exists between the two users.
   */
  async getPublicKey(requesterId: string, targetUserId: string) {
    // Verify mutual poke
    await this.assertMutualPoke(requesterId, targetUserId);

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { chatPublicKey: true },
    });

    return { publicKey: user?.chatPublicKey ?? null };
  }

  /**
   * Store an encrypted message. Only allowed if mutual poke exists.
   */
  async sendMessage(
    senderId: string,
    receiverId: string,
    ciphertext: string,
    nonce: string,
  ) {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot message yourself');
    }

    // Verify mutual poke
    await this.assertMutualPoke(senderId, receiverId);

    const message = await this.prisma.encryptedMessage.create({
      data: { senderId, receiverId, ciphertext, nonce },
    });

    return { id: message.id, createdAt: message.createdAt };
  }

  /**
   * Get conversation between two users (paginated).
   * Only allowed if mutual poke exists.
   */
  async getConversation(
    userId: string,
    otherUserId: string,
    cursor?: string,
    limit = 50,
  ) {
    await this.assertMutualPoke(userId, otherUserId);

    const messages = await this.prisma.encryptedMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        senderId: true,
        ciphertext: true,
        nonce: true,
        createdAt: true,
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: items.reverse(), // chronological order
      nextCursor: hasMore ? items[0]?.id : null,
    };
  }

  /**
   * Get chat thread list — users with whom this user has exchanged messages.
   * Returns metadata only (no message content — server can't read it anyway).
   */
  async getThreads(userId: string) {
    // Get all distinct conversation partners
    const sent = await this.prisma.encryptedMessage.findMany({
      where: { senderId: userId },
      select: { receiverId: true },
      distinct: ['receiverId'],
    });

    const received = await this.prisma.encryptedMessage.findMany({
      where: { receiverId: userId },
      select: { senderId: true },
      distinct: ['senderId'],
    });

    const partnerIds = new Set([
      ...sent.map((m) => m.receiverId),
      ...received.map((m) => m.senderId),
    ]);

    const threads = await Promise.all(
      Array.from(partnerIds).map(async (partnerId) => {
        const [lastMessage, unseenCount, partner] = await Promise.all([
          this.prisma.encryptedMessage.findFirst({
            where: {
              OR: [
                { senderId: userId, receiverId: partnerId },
                { senderId: partnerId, receiverId: userId },
              ],
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, senderId: true },
          }),
          this.prisma.encryptedMessage.count({
            where: {
              senderId: partnerId,
              receiverId: userId,
              seen: false,
            },
          }),
          this.prisma.user.findUnique({
            where: { id: partnerId },
            select: {
              id: true,
              displayName: true,
              chatPublicKey: true,
            },
          }),
        ]);

        return {
          userId: partnerId,
          displayName: partner?.displayName ?? null,
          chatPublicKey: partner?.chatPublicKey ?? null,
          lastMessageAt: lastMessage?.createdAt ?? null,
          unseenCount,
        };
      }),
    );

    // Sort by most recent message
    threads.sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return (
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime()
      );
    });

    return threads;
  }

  /**
   * Total unseen message count across all conversations.
   */
  async getUnseenCount(userId: string) {
    const count = await this.prisma.encryptedMessage.count({
      where: { receiverId: userId, seen: false },
    });
    return { count };
  }

  /**
   * Mark all messages from a specific user as seen.
   */
  async markSeen(userId: string, otherUserId: string) {
    await this.prisma.encryptedMessage.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: userId,
        seen: false,
      },
      data: { seen: true },
    });
    return { ok: true };
  }

  // ─── Private helpers ────────────────────────────────────────

  /**
   * Assert that a mutual poke exists between two users.
   * Throws ForbiddenException if not.
   */
  private async assertMutualPoke(userA: string, userB: string) {
    const [ab, ba] = await Promise.all([
      this.prisma.poke.findUnique({
        where: { senderId_receiverId: { senderId: userA, receiverId: userB } },
      }),
      this.prisma.poke.findUnique({
        where: { senderId_receiverId: { senderId: userB, receiverId: userA } },
      }),
    ]);

    if (!ab || !ba) {
      throw new ForbiddenException(
        'Mutual poke required to exchange messages',
      );
    }
  }
}
