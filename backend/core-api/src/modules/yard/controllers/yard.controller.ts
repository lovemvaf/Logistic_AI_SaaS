import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { YardService } from '../services/yard.service';

class CreateYardDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  facilityId?: string;

  @IsOptional()
  @IsNumber()
  totalSlots?: number;

  @IsOptional()
  @IsNumber()
  reeferPlugs?: number;
}

class CreateYardSlotDto {
  @IsString()
  block!: string;

  @IsNumber()
  rowNo!: number;

  @IsNumber()
  bayNo!: number;

  @IsOptional()
  @IsNumber()
  tierNo?: number;

  @IsOptional()
  @IsBoolean()
  isReeferSlot?: boolean;
}

class RecordGateEventDto {
  @IsString()
  yardId!: string;

  @IsString()
  containerId!: string;

  @IsOptional()
  @IsString()
  yardSlotId?: string;

  @IsOptional()
  @IsString()
  tractorId?: string;

  @IsOptional()
  @IsString()
  chassisId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsIn(['GATE_IN', 'GATE_OUT'])
  eventType!: 'GATE_IN' | 'GATE_OUT';

  @IsOptional()
  @IsIn(['FULL', 'EMPTY'])
  loadState?: 'FULL' | 'EMPTY';

  @IsOptional()
  @IsString()
  sealNo?: string;

  @IsOptional()
  @IsNumber()
  grossWeightKg?: number;

  @IsOptional()
  @IsIn(['GOOD', 'MINOR_DENT', 'DAMAGED'])
  condition?: 'GOOD' | 'MINOR_DENT' | 'DAMAGED';

  @IsOptional()
  @IsString()
  damageNotes?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  inspectorName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Yard & EIR')
@Controller('yard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class YardController {
  constructor(private readonly yardService: YardService) {}

  @Get('yards')
  @RequirePermissions(Permissions.YardRead)
  async listYards() {
    return this.yardService.listYards();
  }

  @Post('yards')
  @RequirePermissions(Permissions.YardManage)
  async createYard(@Body() body: CreateYardDto) {
    return this.yardService.createYard(body);
  }

  @Get('gate-events')
  @RequirePermissions(Permissions.YardRead)
  async listGateEvents(@Query('yardId') yardId?: string, @Query('containerId') containerId?: string) {
    return this.yardService.listGateEvents({ yardId, containerId });
  }

  @Post('gate-events')
  @RequirePermissions(Permissions.YardManage)
  async recordGateEvent(@Body() body: RecordGateEventDto, @Request() req: any) {
    return this.yardService.recordGateEvent({ ...body, operatorId: req.user?.sub });
  }

  @Get('eirs')
  @RequirePermissions(Permissions.YardRead)
  async listEirs(@Query('yardId') yardId?: string, @Query('containerId') containerId?: string) {
    return this.yardService.listEirs({ yardId, containerId });
  }

  @Get('yards/:id/slots')
  @RequirePermissions(Permissions.YardRead)
  async getSlots(@Param('id') yardId: string) {
    return this.yardService.getYardSlots(yardId);
  }

  @Post('yards/:id/slots')
  @RequirePermissions(Permissions.YardManage)
  async createSlot(@Param('id') yardId: string, @Body() body: CreateYardSlotDto) {
    return this.yardService.createYardSlot(yardId, body);
  }
}
