import { Module } from '@nestjs/common';
import { CoreAuthModule } from '../../core/auth/auth.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { TradeController } from './controllers/trade.controller';
import { TradeService } from './services/trade.service';

@Module({
  imports: [PrismaModule, CoreAuthModule],
  controllers: [TradeController],
  providers: [TradeService],
  exports: [TradeService],
})
export class TradeModule {}
