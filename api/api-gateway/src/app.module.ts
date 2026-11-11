import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './controllers/health.controller';
import { RoutesController } from './controllers/routes.controller';
import { MetricsController } from './controllers/metrics.controller';
import { ProxyMiddleware } from './middleware/proxy.middleware';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { ApiKeyMiddleware } from './middleware/api-key.middleware';
import { CacheHeadersMiddleware } from './middleware/cache-headers.middleware';
import { JwtGatewayGuard } from './guards/jwt.gateway.guard';
import { HttpModule } from '@nestjs/axios';
import { GatewayHealthController } from './controllers/gateway-health.controller';
import { BffModule } from './bff/bff.module';

@Module({
  imports: [HttpModule, BffModule],
  controllers: [HealthController, RoutesController, GatewayHealthController, MetricsController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtGatewayGuard,
    },
  ],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CacheHeadersMiddleware)
      .forRoutes('*');

    consumer
      .apply(ApiKeyMiddleware)
      .forRoutes('*');

    consumer
      .apply(RateLimitMiddleware)
      .forRoutes('*');

    consumer
      .apply(ProxyMiddleware)
      .forRoutes('*');
  }
}
