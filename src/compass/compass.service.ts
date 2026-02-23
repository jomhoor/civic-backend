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

const AXIS_LABELS: Record<Axis, string> = {
  economy: 'Economy',
  governance: 'Governance',
  civil_liberties: 'Civil Liberties',
  society: 'Society',
  diplomacy: 'Diplomacy',
  environment: 'Environment',
  justice: 'Justice',
  technology: 'Technology',
};

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
   * Generate a human-readable changelog comparing two dimension sets.
   */
  private generateChangeLog(
    oldDims: Record<string, number>,
    newDims: Record<string, number>,
  ): string {
    const changes: string[] = [];

    for (const axis of AXES) {
      const oldVal = oldDims[axis] ?? 0;
      const newVal = newDims[axis] ?? 0;
      const delta = newVal - oldVal;

      if (Math.abs(delta) < 0.01) continue;

      const direction = delta > 0 ? '↑' : '↓';
      const label = AXIS_LABELS[axis];
      changes.push(`${label} ${direction} ${Math.abs(delta).toFixed(2)}`);
    }

    return changes.length > 0 ? changes.join(', ') : 'No significant changes';
  }

  /**
   * Save a snapshot of the current compass state.
   * Auto-generates a changelog from the previous snapshot.
   */
  async saveSnapshot(userId: string, snapshotName?: string) {
    const { dimensions, confidence } = await this.calculateCompass(userId);

    // Get the most recent previous snapshot for changelog
    const previous = await this.prisma.compassEntry.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const changeLog = previous
      ? this.generateChangeLog(previous.dimensions as Record<string, number>, dimensions)
      : 'Initial compass snapshot';

    return this.prisma.compassEntry.create({
      data: {
        userId,
        dimensions,
        confidence,
        snapshotName: snapshotName ?? `Snapshot ${new Date().toISOString().split('T')[0]}`,
        changeLog,
      },
    });
  }

  /**
   * Get all snapshots for a user, ordered by creation date descending.
   */
  async getHistory(userId: string) {
    return this.prisma.compassEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single snapshot by ID.
   */
  async getSnapshot(snapshotId: string) {
    return this.prisma.compassEntry.findUnique({
      where: { id: snapshotId },
    });
  }

  /**
   * Compare two snapshots — returns per-axis deltas and a summary.
   */
  async diffSnapshots(id1: string, id2: string) {
    const [snap1, snap2] = await Promise.all([
      this.prisma.compassEntry.findUnique({ where: { id: id1 } }),
      this.prisma.compassEntry.findUnique({ where: { id: id2 } }),
    ]);

    if (!snap1 || !snap2) {
      return null;
    }

    const dims1 = snap1.dimensions as Record<string, number>;
    const dims2 = snap2.dimensions as Record<string, number>;

    const deltas: Record<string, { from: number; to: number; delta: number }> = {};
    let totalShift = 0;

    for (const axis of AXES) {
      const from = dims1[axis] ?? 0;
      const to = dims2[axis] ?? 0;
      const delta = to - from;
      deltas[axis] = { from, to, delta };
      totalShift += Math.abs(delta);
    }

    // Find the axis with the biggest change
    const biggestShift = AXES.reduce(
      (max, axis) =>
        Math.abs(deltas[axis].delta) > Math.abs(deltas[max].delta) ? axis : max,
      AXES[0],
    );

    return {
      from: {
        id: snap1.id,
        snapshotName: snap1.snapshotName,
        createdAt: snap1.createdAt,
        dimensions: dims1,
      },
      to: {
        id: snap2.id,
        snapshotName: snap2.snapshotName,
        createdAt: snap2.createdAt,
        dimensions: dims2,
      },
      deltas,
      summary: {
        totalShift: parseFloat(totalShift.toFixed(3)),
        biggestShift: {
          axis: biggestShift,
          label: AXIS_LABELS[biggestShift],
          delta: deltas[biggestShift].delta,
        },
        changeLog: this.generateChangeLog(dims1, dims2),
      },
    };
  }

  /**
   * Update a user's frequency preference for notifications.
   */
  async setFrequencyPreference(userId: string, frequency: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { frequencyPreference: frequency },
    });
  }

  /**
   * Get a user's frequency preference.
   */
  async getFrequencyPreference(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { frequencyPreference: true, lastNotifiedAt: true },
    });
    return user;
  }
}
