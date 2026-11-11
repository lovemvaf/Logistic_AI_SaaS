import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { CoreAuthModule } from '../../core/auth/auth.module';

import { PublicTrackingController, TrackingController } from './controllers/public-tracking.controller';
import { ClientOrdersController } from './controllers/client-orders.controller';
import { ClientInventoryController } from './controllers/client-inventory.controller';
import { ClientWebhooksController } from './controllers/client-webhooks.controller';
import { ClientInvoicesController } from './controllers/client-invoices.controller';
import { ClientReturnsController } from './controllers/client-returns.controller';
import { ClientPortalController } from './controllers/client-portal.controller';

/**
 * Module Customer: portal khách hàng + tra cứu công khai.
 * Di chuyển từ `backend/customer-api` (3B.5).
 *
 * Endpoint `/health` do module IAM phục vụ (mỗi ứng dụng chỉ có một
 * health controller, nếu không Nest sẽ báo trùng route).
 */
@Module({
  imports: [PrismaModule, CoreAuthModule],
  controllers: [
    PublicTrackingController,
    TrackingController,
    ClientOrdersController,
    ClientInventoryController,
    ClientWebhooksController,
    ClientInvoicesController,
    ClientReturnsController,
    ClientPortalController,
  ],
})
export class CustomerModule {}
