import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const AXES = [
  'economy',
  'governance',
  'civil_liberties',
  'society',
  'diplomacy',
  'environment',
  'justice',
  'technology',
] as const;

export type MatchMode = 'mirror' | 'challenger' | 'complement';

export interface MatchResult {
  userId: string;
  walletAddress: string;
  displayName: string | null;
  dimensions: Record<string, number>;
  score: number;       // 0..1 — higher = better match for this mode
  mode: MatchMode;
  connectionStatus?: string | null; // PENDING | ACCEPTED | DECLINED | null
  connectionId?: string | null;
  connectionDirection?: 'sent' | 'received' | null;
}

@Injectable()
export class MatchmakingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find matches for a user using the specified mode.
   * Only considers users with sharingMode PUBLIC or SELECTIVE.
   */
  async findMatches(
    userId: string,
    mode: MatchMode = 'mirror',
    limit = 10,
    threshold?: number,
  ): Promise<MatchResult[]> {
    // 1. Get the requesting user's compass
    const userCompass = await this.getLatestCompass(userId);
    if (!userCompass) return [];

    // 2. Get the user's threshold preference
    const requestingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { matchThreshold: true },
    });
    const minThreshold = threshold ?? requestingUser?.matchThreshold ?? 0;

    // 3. Get all discoverable users (PUBLIC or SELECTIVE) except the requester
    const discoverableUsers = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        sharingMode: { in: ['PUBLIC', 'SELECTIVE'] },
      },
      select: {
        id: true,
        walletAddress: true,
        displayName: true,
      },
    });

    if (discoverableUsers.length === 0) return [];

    // 4. Get existing connection requests for this user
    const existingConnections = await this.prisma.connectionRequest.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        status: true,
      },
    });

    const connectionMap = new Map<string, { id: string; status: string; direction: 'sent' | 'received' }>();
    for (const conn of existingConnections) {
      const otherId = conn.senderId === userId ? conn.receiverId : conn.senderId;
      const direction = conn.senderId === userId ? 'sent' : 'received';
      connectionMap.set(otherId, { id: conn.id, status: conn.status, direction });
    }

    // 5. Get their latest compass entries
    const candidates: MatchResult[] = [];

    for (const candidate of discoverableUsers) {
      const compass = await this.getLatestCompass(candidate.id);
      if (!compass) continue;

      const score = this.calculateScore(userCompass, compass, mode);

      if (score >= minThreshold) {
        const conn = connectionMap.get(candidate.id);
        candidates.push({
          userId: candidate.id,
          walletAddress: conn?.status === 'ACCEPTED'
            ? candidate.walletAddress
            : this.maskAddress(candidate.walletAddress),
          displayName: candidate.displayName,
          dimensions: compass,
          score: parseFloat(score.toFixed(3)),
          mode,
          connectionStatus: conn?.status ?? null,
          connectionId: conn?.id ?? null,
          connectionDirection: conn?.direction ?? null,
        });
      }
    }

    // 6. Sort by score descending, take top N
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, limit);
  }

  /**
   * Get a user's latest compass dimensions from the most recent entry,
   * or calculate live from responses.
   */
  private async getLatestCompass(userId: string): Promise<Record<string, number> | null> {
    // Try latest snapshot first
    const latest = await this.prisma.compassEntry.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (latest) {
      return latest.dimensions as Record<string, number>;
    }

    // Fall back to live calculation from responses
    const responses = await this.prisma.userResponse.findMany({
      where: { userId },
      include: { question: true },
    });

    if (responses.length === 0) return null;

    const axisScores: Record<string, { total: number; weightSum: number }> = {};
    for (const axis of AXES) {
      axisScores[axis] = { total: 0, weightSum: 0 };
    }

    for (const response of responses) {
      const weights = response.question.weights as Record<string, number>;
      for (const [axis, weight] of Object.entries(weights)) {
        if (axisScores[axis]) {
          axisScores[axis].total += response.answerValue * weight;
          axisScores[axis].weightSum += Math.abs(weight);
        }
      }
    }

    const dimensions: Record<string, number> = {};
    for (const axis of AXES) {
      const s = axisScores[axis];
      dimensions[axis] = s.weightSum > 0
        ? Math.max(-1, Math.min(1, s.total / s.weightSum))
        : 0;
    }

    return dimensions;
  }

  /**
   * Calculate a match score for two compass vectors based on the mode.
   * Returns 0..1 where 1 = perfect match for that mode.
   */
  private calculateScore(
    userDims: Record<string, number>,
    candidateDims: Record<string, number>,
    mode: MatchMode,
  ): number {
    switch (mode) {
      case 'mirror':
        return this.mirrorScore(userDims, candidateDims);
      case 'challenger':
        return this.challengerScore(userDims, candidateDims);
      case 'complement':
        return this.complementScore(userDims, candidateDims);
    }
  }

  /**
   * Mirror: Minimize Euclidean distance.
   * Score = 1 - (distance / max_possible_distance)
   * Max distance in 8D with range [-1,1] = sqrt(8 * 4) = sqrt(32) ≈ 5.66
   */
  private mirrorScore(
    a: Record<string, number>,
    b: Record<string, number>,
  ): number {
    let sumSq = 0;
    for (const axis of AXES) {
      const diff = (a[axis] ?? 0) - (b[axis] ?? 0);
      sumSq += diff * diff;
    }
    const distance = Math.sqrt(sumSq);
    const maxDistance = Math.sqrt(AXES.length * 4); // each axis can differ by 2
    return Math.max(0, 1 - distance / maxDistance);
  }

  /**
   * Challenger: Inverse vector matching.
   * Perfect challenger has dimensions ≈ -1 × user's dimensions.
   * Score = 1 - (distance_to_inverse / max_distance)
   */
  private challengerScore(
    a: Record<string, number>,
    b: Record<string, number>,
  ): number {
    let sumSq = 0;
    for (const axis of AXES) {
      const target = -(a[axis] ?? 0); // inverse
      const diff = target - (b[axis] ?? 0);
      sumSq += diff * diff;
    }
    const distance = Math.sqrt(sumSq);
    const maxDistance = Math.sqrt(AXES.length * 4);
    return Math.max(0, 1 - distance / maxDistance);
  }

  /**
   * Complement: Balanced portfolio approach.
   * High score when:
   *   - Core axes (governance, justice) are similar (alignment)
   *   - Operational axes are different (diversity)
   * Score = 0.6 * coreAlignment + 0.4 * operationalDiversity
   */
  private complementScore(
    a: Record<string, number>,
    b: Record<string, number>,
  ): number {
    const coreAxes = ['governance', 'justice'] as const;
    const operationalAxes = ['economy', 'civil_liberties', 'society', 'diplomacy', 'environment', 'technology'] as const;

    // Core alignment: how similar are the core axes (using mirror logic)
    let coreSumSq = 0;
    for (const axis of coreAxes) {
      const diff = (a[axis] ?? 0) - (b[axis] ?? 0);
      coreSumSq += diff * diff;
    }
    const coreDistance = Math.sqrt(coreSumSq);
    const maxCoreDistance = Math.sqrt(coreAxes.length * 4);
    const coreAlignment = 1 - coreDistance / maxCoreDistance;

    // Operational diversity: how different are operational axes
    let opSumSq = 0;
    for (const axis of operationalAxes) {
      const diff = (a[axis] ?? 0) - (b[axis] ?? 0);
      opSumSq += diff * diff;
    }
    const opDistance = Math.sqrt(opSumSq);
    const maxOpDistance = Math.sqrt(operationalAxes.length * 4);
    const operationalDiversity = opDistance / maxOpDistance;

    return 0.6 * coreAlignment + 0.4 * operationalDiversity;
  }

  /**
   * Mask wallet address for privacy: 0x1234...abcd
   */
  private maskAddress(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Update a user's sharing mode.
   */
  async setSharingMode(userId: string, mode: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { sharingMode: mode },
    });
  }

  /**
   * Update a user's display name.
   */
  async setDisplayName(userId: string, displayName: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { displayName },
    });
  }

  /**
   * Update a user's match threshold.
   */
  async setMatchThreshold(userId: string, threshold: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { matchThreshold: Math.max(0, Math.min(1, threshold)) },
    });
  }

  /**
   * Get a user's privacy/sharing settings.
   */
  async getSettings(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        sharingMode: true,
        displayName: true,
        matchThreshold: true,
      },
    });
  }

  // ──────────────────────────────────────────────────
  // Connection Requests
  // ──────────────────────────────────────────────────

  /**
   * Send a connection request to another user.
   */
  async sendConnectionRequest(
    senderId: string,
    receiverId: string,
    matchMode: string,
    matchScore: number,
    message?: string,
  ) {
    // Prevent connecting to yourself
    if (senderId === receiverId) {
      throw new Error('Cannot connect to yourself');
    }

    // Check if a request already exists (in either direction)
    const existing = await this.prisma.connectionRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new Error('Already connected');
      }
      if (existing.status === 'PENDING') {
        // If the other person already sent us a request, auto-accept it
        if (existing.senderId === receiverId) {
          return this.respondToConnection(existing.id, senderId, 'ACCEPTED');
        }
        throw new Error('Connection request already pending');
      }
      if (existing.status === 'DECLINED' || existing.status === 'CANCELLED') {
        // Allow re-requesting after a decline/cancel by updating the existing record
        return this.prisma.connectionRequest.update({
          where: { id: existing.id },
          data: {
            senderId,
            receiverId,
            matchMode,
            matchScore,
            message,
            status: 'PENDING',
            respondedAt: null,
          },
          include: {
            receiver: { select: { id: true, displayName: true, walletAddress: true } },
          },
        });
      }
    }

    return this.prisma.connectionRequest.create({
      data: {
        senderId,
        receiverId,
        matchMode,
        matchScore,
        message,
        status: 'PENDING',
      },
      include: {
        receiver: { select: { id: true, displayName: true, walletAddress: true } },
      },
    });
  }

  /**
   * Respond to a connection request (accept or decline).
   * Only the receiver can respond.
   */
  async respondToConnection(
    connectionId: string,
    userId: string,
    action: 'ACCEPTED' | 'DECLINED',
  ) {
    const connection = await this.prisma.connectionRequest.findUnique({
      where: { id: connectionId },
      include: {
        sender: { select: { id: true, displayName: true, walletAddress: true } },
        receiver: { select: { id: true, displayName: true, walletAddress: true } },
      },
    });

    if (!connection) {
      throw new Error('Connection request not found');
    }

    if (connection.receiverId !== userId) {
      throw new Error('Only the receiver can respond to a connection request');
    }

    if (connection.status !== 'PENDING') {
      throw new Error(`Cannot respond to a ${connection.status} request`);
    }

    const updated = await this.prisma.connectionRequest.update({
      where: { id: connectionId },
      data: {
        status: action,
        respondedAt: new Date(),
      },
      include: {
        sender: { select: { id: true, displayName: true, walletAddress: true } },
        receiver: { select: { id: true, displayName: true, walletAddress: true } },
      },
    });

    return updated;
  }

  /**
   * Cancel a sent connection request.
   * Only the sender can cancel.
   */
  async cancelConnection(connectionId: string, userId: string) {
    const connection = await this.prisma.connectionRequest.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error('Connection request not found');
    }

    if (connection.senderId !== userId) {
      throw new Error('Only the sender can cancel a connection request');
    }

    if (connection.status !== 'PENDING') {
      throw new Error(`Cannot cancel a ${connection.status} request`);
    }

    return this.prisma.connectionRequest.update({
      where: { id: connectionId },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
  }

  /**
   * Get all incoming connection requests for a user.
   */
  async getIncomingRequests(userId: string) {
    return this.prisma.connectionRequest.findMany({
      where: {
        receiverId: userId,
        status: 'PENDING',
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            walletAddress: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all active connections (accepted) for a user.
   * Returns full wallet addresses since both parties agreed.
   */
  async getConnections(userId: string) {
    const connections = await this.prisma.connectionRequest.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            walletAddress: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            walletAddress: true,
          },
        },
      },
      orderBy: { respondedAt: 'desc' },
    });

    // Format: return the "other" user's info with full wallet for Blockscan chat
    return connections.map((c) => {
      const other = c.senderId === userId ? c.receiver : c.sender;
      return {
        connectionId: c.id,
        userId: other.id,
        displayName: other.displayName,
        walletAddress: other.walletAddress, // full address — both agreed
        matchMode: c.matchMode,
        matchScore: c.matchScore,
        connectedAt: c.respondedAt,
        blockscanChatUrl: `https://chat.blockscan.com/eth/${other.walletAddress}`,
      };
    });
  }
}
