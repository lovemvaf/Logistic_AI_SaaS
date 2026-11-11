import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { CoreAuthModule } from '../../core/auth/auth.module';

import { OrdersController } from './controllers/orders.controller';
import { BulkUploadController } from './controllers/bulk-upload.controller';
import { ReturnsController } from './controllers/returns.controller';
import { ClientsController } from './clients/clients.controller';
import { TrackingController } from './tracking/tracking.controller';
import { WebhooksController } from './webhooks/webhooks.controller';
import { AuthController } from './auth/auth.controller';
import {
  TenantClientsController,
  CustomersAliasController,
  OrderPartialsController,
} from './controllers/orders-portal-aliases.controller';

/**
 * Module Orders: đơn hàng, trả hàng, khách hàng, tracking, webhook.
 * Di chuyển từ `backend/order-service` (3B.3).
 */
@Module({
  imports: [
    PrismaModule,
    CoreAuthModule,
    HttpModule,
  ],
  controllers: [
    OrdersController,
    BulkUploadController,
    ReturnsController,
    ClientsController,
    TenantClientsController,
    CustomersAliasController,
    OrderPartialsController,
    TrackingController,
    WebhooksController,
    AuthController,
  ],
  providers: [],
})
export class OrdersModule {}
