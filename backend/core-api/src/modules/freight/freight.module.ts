import { Module } from '@nestjs/common';
import { CoreAuthModule } from '../../core/auth/auth.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { FreightController } from './controllers/freight.controller';
import { FreightService } from './services/freight.service';

@Module({
  imports: [PrismaModule, CoreAuthModule],
  controllers: [FreightController],
  providers: [FreightService],
  exports: [FreightService],
})
export class FreightModule {}
