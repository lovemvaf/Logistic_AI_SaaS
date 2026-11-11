import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { CoreAuthModule } from '../../core/auth/auth.module';
import { InventoryService } from './services/inventory.service';
import { WavesService } from './waves/waves.service';

import { InventoryController } from './controllers/inventory.controller';
import { AdjustmentsController } from './controllers/adjustments.controller';
import { CycleCountsController } from './controllers/cycle-counts.controller';
import { WarehouseOpsController } from './controllers/warehouse-ops.controller';
import { ProductsController } from './controllers/products.controller';
import { MobileController } from './controllers/mobile.controller';
import { BinsController } from './controllers/bins.controller';
import { WarehousesController } from './warehouses/warehouses.controller';
import { BranchesController } from './warehouses/branches.controller';
import { LocationsController } from './locations/locations.controller';
import { WavesController } from './waves/waves.controller';
import { TasksController } from './tasks/tasks.controller';
import {
  WarehousesBinsController,
  EquipmentController,
  PackingSessionsController,
  StationsController,
  StaffController,
} from './controllers/wms-portal-aliases.controller';

/**
 * Module WMS: kho, sản phẩm, bin, wave, task, kiểm kê.
 * Di chuyển từ `backend/inventory-service` (3B.2).
 *
 * Endpoint `/health` do module IAM phục vụ (mỗi ứng dụng chỉ có một
 * health controller, nếu không Nest sẽ báo trùng route).
 */
@Module({
  imports: [PrismaModule, CoreAuthModule],
  controllers: [
    InventoryController,
    AdjustmentsController,
    CycleCountsController,
    WarehouseOpsController,
    ProductsController,
    MobileController,
    BinsController,
    WarehousesBinsController,
    WarehousesController,
    BranchesController,
    LocationsController,
    WavesController,
    TasksController,
    EquipmentController,
    PackingSessionsController,
    StationsController,
    StaffController,
  ],
  providers: [InventoryService, WavesService],
  exports: [InventoryService, WavesService],
})
export class WmsModule {}
