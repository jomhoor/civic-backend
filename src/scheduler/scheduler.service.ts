import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Scheduler service that checks which users are due for a reminder
 * based on their frequencyPreference (DAILY, WEEKLY, MONTHLY).
 *
 * In Phase 2 this logs pending reminders. In a future phase,
 * it will push notifications via Firebase / Expo.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private prisma: PrismaService) {}

  /** Runs every hour to check for users needing a nudge. */
  @Cron(CronExpression.EVERY_HOUR)
  async handleReminders() {
    const now = new Date();

    const users = await this.prisma.user.findMany({
      where: {
        frequencyPreference: { in: ['DAILY', 'WEEKLY', 'MONTHLY'] },
      },
      select: {
        id: true,
        walletAddress: true,
        frequencyPreference: true,
        lastNotifiedAt: true,
      },
    });

    let dueCount = 0;

    for (const user of users) {
      if (this.isDue(user.frequencyPreference, user.lastNotifiedAt, now)) {
        dueCount++;
        this.logger.log(
          `📬 Reminder due for user ${user.id} (${user.frequencyPreference})`,
        );

        // Mark as notified so we don't spam
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastNotifiedAt: now },
        });

        // TODO: Phase 3 — send push notification via Firebase / Expo
      }
    }

    if (dueCount > 0) {
      this.logger.log(`Processed ${dueCount} reminder(s)`);
    }
  }

  /**
   * Determine if a user is due for a reminder.
   */
  private isDue(
    frequency: string,
    lastNotified: Date | null,
    now: Date,
  ): boolean {
    if (!lastNotified) return true; // Never notified → due

    const diffMs = now.getTime() - lastNotified.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    switch (frequency) {
      case 'DAILY':
        return diffHours >= 24;
      case 'WEEKLY':
        return diffHours >= 168; // 7 * 24
      case 'MONTHLY':
        return diffHours >= 720; // ~30 * 24
      default:
        return false;
    }
  }
}
