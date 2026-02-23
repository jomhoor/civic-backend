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

type Axis = (typeof AXES)[number];

@Injectable()
export class CompassService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate the current compass vector from all user responses.
   * For each axis: weighted average of (answerValue * questionWeight).
   */
  async calculateCompass(userId: string) {
    const responses = await this.prisma.userResponse.findMany({
      where: { userId },
      include: { question: true },
    });

    const axisScores: Record<string, { total: number; weightSum: number; count: number }> = {};

    for (const axis of AXES) {
      axisScores[axis] = { total: 0, weightSum: 0, count: 0 };
    }

    for (const response of responses) {
      const weights = response.question.weights as Record<string, number>;
      for (const [axis, weight] of Object.entries(weights)) {
        if (axisScores[axis]) {
          axisScores[axis].total += response.answerValue * weight;
          axisScores[axis].weightSum += Math.abs(weight);
          axisScores[axis].count += 1;
        }
      }
    }

    const dimensions: Record<string, number> = {};
    const confidence: Record<string, number> = {};

    for (const axis of AXES) {
      const s = axisScores[axis];
      dimensions[axis] = s.weightSum > 0
        ? Math.max(-1, Math.min(1, s.total / s.weightSum))
        : 0;
      confidence[axis] = s.count;
    }

    return { dimensions, confidence };
  }

  /**
   * Get the current compass or calculate it.
   */
  async getCurrentCompass(userId: string) {
    return this.calculateCompass(userId);
  }

  /**
   * Save a snapshot of the current compass state.
   */
  async saveSnapshot(userId: string, snapshotName?: string) {
    const { dimensions, confidence } = await this.calculateCompass(userId);

    return this.prisma.compassEntry.create({
      data: {
        userId,
        dimensions,
        confidence,
        snapshotName: snapshotName ?? `Snapshot ${new Date().toISOString().split('T')[0]}`,
      },
    });
  }

  /**
   * Get all snapshots for a user.
   */
  async getHistory(userId: string) {
    return this.prisma.compassEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
