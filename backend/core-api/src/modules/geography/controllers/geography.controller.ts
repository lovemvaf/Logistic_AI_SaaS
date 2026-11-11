import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { GeographyService } from '../services/geography.service';

class CreateQueueObservationDto {
  @IsNumber()
  waitMinutes!: number;

  @IsOptional()
  @IsNumber()
  queueLength?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Geography')
@Controller('geography')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class GeographyController {
  constructor(private readonly geographyService: GeographyService) {}

  @Get('overview')
  @RequirePermissions(Permissions.GeographyRead)
  async overview() {
    return this.geographyService.getOverview();
  }

  @Get('units')
  @RequirePermissions(Permissions.GeographyRead)
  async listUnits(
    @Query('unitType') unitType?: string,
    @Query('corridor') corridor?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.geographyService.listUnits({
      unitType,
      corridor,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('units/resolve')
  @RequirePermissions(Permissions.GeographyRead)
  async resolveUnit(@Query('q') q: string) {
    return this.geographyService.resolveUnit(q);
  }

  @Get('units/:id')
  @RequirePermissions(Permissions.GeographyRead)
  async getUnit(@Param('id') id: string) {
    return this.geographyService.getUnitDetail(id);
  }

  @Get('facilities')
  @RequirePermissions(Permissions.GeographyRead)
  async listFacilities(
    @Query('facilityType') facilityType?: string,
    @Query('corridor') corridor?: string,
    @Query('outsideCity') outsideCity?: string,
    @Query('search') search?: string,
  ) {
    return this.geographyService.listFacilities({ facilityType, corridor, outsideCity, search });
  }

  @Get('facilities/:id')
  @RequirePermissions(Permissions.GeographyRead)
  async getFacility(@Param('id') id: string) {
    return this.geographyService.getFacilityDetail(id);
  }

  @Post('facilities/:id/queue-observations')
  @RequirePermissions(Permissions.FreightManage)
  async logQueueObservation(@Param('id') facilityId: string, @Body() body: CreateQueueObservationDto) {
    return this.geographyService.addQueueObservation(facilityId, body);
  }

  @Get('corridors')
  @RequirePermissions(Permissions.GeographyRead)
  async listCorridors() {
    return this.geographyService.listCorridors();
  }

  @Get('restrictions')
  @RequirePermissions(Permissions.GeographyRead)
  async listRestrictions() {
    return this.geographyService.listRestrictions();
  }
}
