import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { ExcludeRoles, PermissionsGuard, RequireRoles, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { GeographyService } from '../services/geography.service';

class UpdateOfficialMetadataDto {
  @IsOptional()
  @IsString()
  officialCode?: string;

  @IsString()
  sourceDoc!: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsObject()
  geometryGeoJson?: Record<string, unknown>;
}

@ApiTags('Geography Admin')
@Controller('geography/admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireRoles(Roles.SUPER_ADMIN)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class GeographyAdminController {
  constructor(private readonly geographyService: GeographyService) {}

  @Post('units/bootstrap-2026')
  async bootstrap2026() {
    return this.geographyService.bootstrap2026Master();
  }

  @Patch('units/:id/official')
  async updateOfficial(@Param('id') id: string, @Body() body: UpdateOfficialMetadataDto) {
    return this.geographyService.updateUnitOfficialMetadata(id, body);
  }
}
