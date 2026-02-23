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

export interface AggregateCompass {
  dimensions: Record<string, number>;
  sampleSize: number;
}

export interface AxisDistribution {
  axis: string;
  buckets: { range: string; min: number; max: number; count: number }[];
  mean: number;
  median: number;
  stdDev: number;
}

export interface TrendPoint {
  period: string; // ISO month string like "2026-01"
  dimensions: Record<string, number>;
  sampleSize: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get the aggregate (average) compass across all users.
   * Only uses PUBLIC users' latest compass entries.
   * Optionally filter by country.
   */
  async getAggregateCompass(country?: string): Promise<AggregateCompass> {
    // Get users who are PUBLIC (opted in to sharing)
    const where: any = {
      sharingMode: { in: ['PUBLIC', 'SELECTIVE'] },
    };

    if (country) {
      where.demographics = { country };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });

    if (users.length === 0) {
      return {
        dimensions: Object.fromEntries(AXES.map((a) => [a, 0])),
        sampleSize: 0,
      };
    }

    const userIds = users.map((u) => u.id);

    // Get the latest compass entry per user using a subquery approach
    const latestEntries = await this.getLatestEntriesForUsers(userIds);

    if (latestEntries.length === 0) {
      return {
        dimensions: Object.fromEntries(AXES.map((a) => [a, 0])),
        sampleSize: 0,
      };
    }

    // Average all dimensions
    const sums: Record<string, number> = {};
    for (const axis of AXES) sums[axis] = 0;

    for (const entry of latestEntries) {
      const dims = entry.dimensions as Record<string, number>;
      for (const axis of AXES) {
        sums[axis] += dims[axis] ?? 0;
      }
    }

    const dimensions: Record<string, number> = {};
    for (const axis of AXES) {
      dimensions[axis] = parseFloat(
        (sums[axis] / latestEntries.length).toFixed(4),
      );
    }

    return { dimensions, sampleSize: latestEntries.length };
  }

  /**
   * Get per-axis distribution histograms.
   * Buckets: [-1, -0.6), [-0.6, -0.2), [-0.2, 0.2), [0.2, 0.6), [0.6, 1.0]
   */
  async getDistribution(country?: string): Promise<AxisDistribution[]> {
    const where: any = {
      sharingMode: { in: ['PUBLIC', 'SELECTIVE'] },
    };
    if (country) {
      where.demographics = { country };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });

    const userIds = users.map((u) => u.id);
    const entries = await this.getLatestEntriesForUsers(userIds);

    const bucketDefs = [
      { range: '-1.0 – -0.6', min: -1.0, max: -0.6 },
      { range: '-0.6 – -0.2', min: -0.6, max: -0.2 },
      { range: '-0.2 – 0.2', min: -0.2, max: 0.2 },
      { range: '0.2 – 0.6', min: 0.2, max: 0.6 },
      { range: '0.6 – 1.0', min: 0.6, max: 1.0 },
    ];

    return AXES.map((axis) => {
      const values = entries
        .map((e) => (e.dimensions as Record<string, number>)[axis] ?? 0)
        .sort((a, b) => a - b);

      const n = values.length;
      const mean = n > 0 ? values.reduce((s, v) => s + v, 0) / n : 0;
      const median = n > 0 ? values[Math.floor(n / 2)] : 0;
      const variance =
        n > 0 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / n : 0;
      const stdDev = Math.sqrt(variance);

      const buckets = bucketDefs.map((b) => ({
        ...b,
        count: values.filter((v) =>
          b.max === 1.0 ? v >= b.min && v <= b.max : v >= b.min && v < b.max,
        ).length,
      }));

      return {
        axis,
        buckets,
        mean: parseFloat(mean.toFixed(4)),
        median: parseFloat(median.toFixed(4)),
        stdDev: parseFloat(stdDev.toFixed(4)),
      };
    });
  }

  /**
   * Get trend data: monthly average compass dimensions.
   * Returns the last N months of aggregate data.
   */
  async getTrends(months = 12, country?: string): Promise<TrendPoint[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    // Get all compass entries from PUBLIC users within the time range
    const where: any = {
      createdAt: { gte: since },
      user: {
        sharingMode: { in: ['PUBLIC', 'SELECTIVE'] },
      },
    };

    if (country) {
      where.user.demographics = { country };
    }

    const entries = await this.prisma.compassEntry.findMany({
      where,
      select: {
        dimensions: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthMap = new Map<
      string,
      { sums: Record<string, number>; count: number }
    >();

    for (const entry of entries) {
      const date = new Date(entry.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, {
          sums: Object.fromEntries(AXES.map((a) => [a, 0])),
          count: 0,
        });
      }

      const bucket = monthMap.get(key)!;
      const dims = entry.dimensions as Record<string, number>;
      for (const axis of AXES) {
        bucket.sums[axis] += dims[axis] ?? 0;
      }
      bucket.count++;
    }

    // Convert to trend points
    const trends: TrendPoint[] = [];
    for (const [period, bucket] of monthMap) {
      const dimensions: Record<string, number> = {};
      for (const axis of AXES) {
        dimensions[axis] = parseFloat(
          (bucket.sums[axis] / bucket.count).toFixed(4),
        );
      }
      trends.push({ period, dimensions, sampleSize: bucket.count });
    }

    return trends;
  }

  /**
   * Get high-level stats for the platform.
   */
  async getOverview() {
    const [totalUsers, totalSnapshots, publicUsers, totalResponses] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.compassEntry.count(),
        this.prisma.user.count({
          where: { sharingMode: { in: ['PUBLIC', 'SELECTIVE'] } },
        }),
        this.prisma.userResponse.count(),
      ]);

    // Country breakdown
    const countries = await this.prisma.demographics.groupBy({
      by: ['country'],
      _count: { country: true },
      where: { country: { not: null } },
      orderBy: { _count: { country: 'desc' } },
      take: 20,
    });

    return {
      totalUsers,
      publicUsers,
      totalSnapshots,
      totalResponses,
      countries: countries.map((c) => ({
        country: c.country,
        count: c._count.country,
      })),
    };
  }

  /**
   * Helper: get the latest compass entry for each user in a list.
   */
  private async getLatestEntriesForUsers(userIds: string[]) {
    if (userIds.length === 0) return [];

    // Get all entries for these users, ordered by createdAt desc
    const allEntries = await this.prisma.compassEntry.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        dimensions: true,
        createdAt: true,
      },
    });

    // Keep only the first (latest) per user
    const seen = new Set<string>();
    const latest: typeof allEntries = [];
    for (const entry of allEntries) {
      if (!seen.has(entry.userId)) {
        seen.add(entry.userId);
        latest.push(entry);
      }
    }

    return latest;
  }
}
