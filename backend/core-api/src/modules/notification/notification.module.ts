import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { CoreAuthModule } from '../../core/auth/auth.module';

import { NotificationsController } from './controllers/notifications.controller';
import { EventController } from './controllers/event.controller';
import { NotificationService } from './services/notification.service';
import { TasksService } from './services/tasks.service';
import { EventPrismaService } from './prisma/event-prisma.service';
import { ProviderFactory } from './providers/provider.factory';
import { NotificationGateway } from './gateways/notification.gateway';

/**
 * Module Notification: email/SMS/push + websocket + consumer Kafka.
 * Di chuyển từ `backend/notification-service` (3B.6).
 *
 * Consumer Kafka dùng cùng group id (`notification-group`) với service cũ:
 * trong lúc chuyển đổi, partition được chia giữa hai tiến trình (không mất
 * message), nên chỉ bật nhóm `notification` sau khi dừng notification-service.
 */
@Module({
  imports: [
    PrismaModule,
    CoreAuthModule,
    ScheduleModule.forRoot(),
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
  ],
  controllers: [NotificationsController, EventController],
  providers: [
    NotificationService,
    TasksService,
    EventPrismaService,
    ProviderFactory,
    NotificationGateway,
  ],
  exports: [NotificationService, EventPrismaService],
})
export class NotificationModule {}
