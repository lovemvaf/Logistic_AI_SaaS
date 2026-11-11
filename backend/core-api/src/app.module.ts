import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { SmartThrottlerGuard } from './core/http/smart-throttler.guard';
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
import { GeographyModule } from './modules/geography/geography.module';
import { YardModule } from './modules/yard/yard.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { FreightModule } from './modules/freight/freight.module';
import { TradeModule } from './modules/trade/trade.module';

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
        name: 'default',
        ttl: 60000,
        limit: parseInt(process.env.THROTTLE_DEFAULT_LIMIT || '300', 10),
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: parseInt(process.env.THROTTLE_AUTH_LIMIT || '15', 10),
        skipIf: (context) => {
          const req = context.switchToHttp().getRequest();
          const url: string = req?.originalUrl || req?.url || '';
          return !url.includes('/auth/');
        },
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
    GeographyModule,
    YardModule,
    PricingModule,
    FreightModule,
    TradeModule,
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
      useClass: SmartThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware, TenantMiddleware).forRoutes('*');
  }
}
