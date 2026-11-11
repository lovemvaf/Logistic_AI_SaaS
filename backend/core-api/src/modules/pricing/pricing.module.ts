import { Module } from '@nestjs/common';
import { CoreAuthModule } from '../../core/auth/auth.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { PricingController } from './controllers/pricing.controller';
import { DemDetCalculatorService } from './services/dem-det-calculator.service';
import { PricingService } from './services/pricing.service';

@Module({
  imports: [PrismaModule, CoreAuthModule],
  controllers: [PricingController],
  providers: [DemDetCalculatorService, PricingService],
  exports: [DemDetCalculatorService, PricingService],
})
export class PricingModule {}
