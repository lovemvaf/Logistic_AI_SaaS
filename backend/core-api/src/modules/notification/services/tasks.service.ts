import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventPrismaService } from '../prisma/event-prisma.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly eventPrisma: EventPrismaService,
  ) {}

/**
    * đŸ§¹ Clean up old notifications every night at midnight.
    */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldNotifications() {
    this.logger.log('đŸ§¹ Starting cleanup of old notifications...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const result = await this.eventPrisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: thirtyDaysAgo,
          },
        },
      });
      this.logger.log(` Cleaned up ${result.count} notifications older than 30 days.`);
    } catch (error: any) {
      this.logger.error(`âŒ Cleanup failed: ${error.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async generateDailySummaries() {
    this.logger.log('Generating daily delivery summaries for tenants...');
    
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const deliveries = await this.eventPrisma.delivery.findMany({
        where: {
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
        include: {
          trip: true,
        },
      });

      const summary = {
        totalDeliveries: deliveries.length,
        completed: deliveries.filter((d: any) => d.status === 'DELIVERED').length,
        failed: deliveries.filter((d: any) => d.status === 'FAILED').length,
        totalCodCollected: deliveries.reduce((sum: number, d: any) => sum + Number(d.codAmountCollected || 0), 0),
      };

      this.logger.log(`Daily summary: ${summary.totalDeliveries} deliveries, ${summary.completed} completed, ${summary.totalCodCollected} COD collected`);
    } catch (error: any) {
      this.logger.error(`Daily summary generation failed: ${error.message}`);
    }
  }
}
