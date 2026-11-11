import { Module } from '@nestjs/common';
import { CoreAuthModule } from '../../core/auth/auth.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { GeographyAdminController } from './controllers/geography-admin.controller';
import { GeographyController } from './controllers/geography.controller';
import { GeographyService } from './services/geography.service';

@Module({
  imports: [PrismaModule, CoreAuthModule],
  controllers: [GeographyController, GeographyAdminController],
  providers: [GeographyService],
  exports: [GeographyService],
})
export class GeographyModule {}
