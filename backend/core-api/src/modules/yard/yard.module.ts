import { Module } from '@nestjs/common';
import { CoreAuthModule } from '../../core/auth/auth.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { YardController } from './controllers/yard.controller';
import { YardService } from './services/yard.service';

@Module({
  imports: [PrismaModule, CoreAuthModule],
  controllers: [YardController],
  providers: [YardService],
  exports: [YardService],
})
export class YardModule {}
