import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BffController } from './bff.controller';
import { BffService } from './bff.service';

/**
 * BFF module của gateway: gom call + chuẩn hoá DTO cho portal.
 */
@Module({
  imports: [HttpModule],
  controllers: [BffController],
  providers: [BffService],
  exports: [BffService],
})
export class BffModule {}
