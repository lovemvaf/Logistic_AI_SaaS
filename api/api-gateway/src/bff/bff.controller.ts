import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtGatewayGuard } from '../guards/jwt.gateway.guard';
import { BffService } from './bff.service';
import { AdminDashboardDto, TenantDashboardDto } from './dto';

/**
 * BFF endpoints: gom nhiều endpoint của core-api thành một response chuẩn hoá.
 *
 * Các route này được gateway phục vụ trực tiếp (không proxy xuống core-api).
 */
@ApiTags('BFF')
// Gateway đặt global prefix 'api' => controller path là 'v1/buff'.
@Controller('v1/bff')
@UseGuards(JwtGatewayGuard)
export class BffController {
  constructor(private readonly bff: BffService) {}

  @Get('tenant-dashboard')
  async tenantDashboard(
    @Headers('authorization') authorization?: string,
  ): Promise<TenantDashboardDto> {
    return this.bff.tenantDashboard(authorization);
  }

  @Get('admin-dashboard')
  async adminDashboard(
    @Headers('authorization') authorization?: string,
  ): Promise<AdminDashboardDto> {
    return this.bff.adminDashboard(authorization);
  }
}
