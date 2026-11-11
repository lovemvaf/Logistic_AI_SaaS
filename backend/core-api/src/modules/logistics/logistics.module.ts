import { Module, Logger } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { CoreAuthModule } from '../../core/auth/auth.module';

import { VehiclesController } from './fleet/vehicles.controller';
import { DriversController } from './fleet/drivers.controller';
import { TripsController } from './trips/trips.controller';
import { MobileTripsController } from './trips/mobile-trips.controller';
import { MobileWalletController } from './controllers/mobile-wallet.controller';
import { MobileGpsController } from './controllers/mobile-gps.controller';
import { GpsController } from './tracking/gps.controller';
import { GeofencesController } from './tracking/geofences.controller';
import { DriverAppController } from './driver-app/driver-app.controller';
import { FinanceController } from './controllers/finance.controller';
import { AiManagementController } from './controllers/ai-management.controller';
import { AiModelsController } from './controllers/ai-models.controller';
import { CodRemittancesController } from './controllers/cod-remittances.controller';
import { LogisticsController } from './controllers/logistics.controller';
import { ReturnsController } from './controllers/returns.controller';
import { UploadController } from './controllers/upload.controller';
import {
  FinancePortalController,
  TenantAiInsightsController,
} from './controllers/logistics-portal-aliases.controller';

import { LogisticsService } from './services/logistics.service';
import { GeocodingService } from './services/geocoding.service';
import { S3Service } from './services/s3.service';
import { RoutingProcessor } from './processors/routing.processor';

const isRedisEnabled = process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost';

const importsArr: any[] = [PrismaModule, CoreAuthModule, HttpModule];

const providersArr: any[] = [LogisticsService, GeocodingService, S3Service];

if (isRedisEnabled) {
  importsArr.push(
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    BullModule.registerQueue({
      name: 'routing',
    }),
  );
  providersArr.push(RoutingProcessor);
} else {
  // Provide a mock queue when Redis is unavailable to prevent DI errors
  providersArr.push({
    provide: getQueueToken('routing'),
    useValue: {
      add: async (name: string, data: any) => {
        new Logger('MockQueue').warn(`Skipped adding job ${name} because Redis is disabled.`);
        return { id: 'mock-job-id', status: 'COMPLETED' };
      },
    },
  });
}

/**
 * Module Logistics: chuyến xe, tài xế, phương tiện, GPS, geofence, tài chính COD.
 * Di chuyển từ `backend/logistics-service` (3B.4).
 *
 * Controller `branches` của service cũ bị bỏ: trùng route với module WMS và
 * gateway vốn không route `/api/v1/branches` (portal dùng `/api/v1/tenant/branches`).
 */
@Module({
  imports: importsArr,
  controllers: [
    VehiclesController,
    DriversController,
    TripsController,
    MobileTripsController,
    MobileWalletController,
    MobileGpsController,
    GpsController,
    GeofencesController,
    DriverAppController,
    FinanceController,
    FinancePortalController,
    TenantAiInsightsController,
    AiManagementController,
    AiModelsController,
    CodRemittancesController,
    LogisticsController,
    ReturnsController,
    UploadController,
  ],
  providers: providersArr,
  exports: [LogisticsService, GeocodingService, S3Service],
})
export class LogisticsModule {}
