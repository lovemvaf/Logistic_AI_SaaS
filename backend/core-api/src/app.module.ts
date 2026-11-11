import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_INTERCEPTOR, APP_GUARD, Reflector } from '@nestjs/core';
import { PermissionsGuard } from 'shared-types';

import { PrismaModule } from './core/prisma/prisma.module';
import { KafkaModule } from './core/kafka/kafka.module';
import { OutboxModule } from './core/outbox/outbox.module';
import { CoreAuthModule } from './core/auth/auth.module';
import { LoggerMiddleware } from './core/tenant/logger.middleware';
import { TenantMiddleware } from './core/tenant/tenant.middleware';
import {
  AuditLogInterceptor,
  TenantSchemaInterceptor,
} from './core/tenant/audit-log.interceptor';

import { IamModule } from './modules/iam/iam.module';
import { WmsModule } from './modules/wms/wms.module';
import { OrdersModule } from './modules/orders/orders.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { CustomerModule } from './modules/customer/customer.module';
import { NotificationModule } from './modules/notification/notification.module';

/**
 * core-api: modular monolith của SmartLogi.
 *
 * Mỗi service cũ trở thành một module trong `src/modules`. Các route giữ
 * nguyên đường dẫn `/api/v1/*` để gateway và portal không phải đổi.
 */
@Module({
  imports: [
    // isGlobal: các module (Customer/WMS/...) dùng CacheInterceptor nhưng không
    // import CacheModule riêng.
    CacheModule.register({ ttl: 300000, isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: 5,
      },
    ]),
    PrismaModule,
    CoreAuthModule,
    KafkaModule,
    OutboxModule,
    IamModule,
    WmsModule,
    OrdersModule,
    LogisticsModule,
    CustomerModule,
    NotificationModule,
  ],
  providers: [
    Reflector,
    PermissionsGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantSchemaInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware, TenantMiddleware).forRoutes('*');
  }
}
