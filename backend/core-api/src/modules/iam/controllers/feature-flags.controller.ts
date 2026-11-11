import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from '../../../core/types/shared-types';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Feature Flags')
@Controller('tenant/feature-flags')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class FeatureFlagsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.FeatureFlagsManage)
  async list(@Request() req: any) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const flags = await this.prisma.getTenantDb().featureFlag.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return flags;
  }

  @Get('check/:key')
  async checkFlag(@Request() req: any, @Param('key') key: string) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const userId = req.user?.sub;

    const flag = await this.prisma.getTenantDb().featureFlag.findFirst({
      where: { tenantId, key },
    });

    if (!flag) {
      return { enabled: false, key };
    }

    if (!flag.enabled) {
      return { enabled: false, key };
    }

    return { enabled: true, key, description: flag.description };
  }

  @Post()
  @RequirePermissions(Permissions.FeatureFlagsManage)
  async create(
    @Request() req: any,
    @Body() body: {
      key: string;
      description?: string;
      enabled?: boolean;
      rolloutPercentage?: number;
      allowedUserIds?: string[];
      allowedRoles?: string[];
    },
  ) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;

    if (!body.key || !/^[a-zA-Z0-9_-]+$/.test(body.key)) {
      throw new BadRequestException('Key must be alphanumeric with hyphens or underscores');
    }

    const existing = await this.prisma.getTenantDb().featureFlag.findFirst({
      where: { tenantId, key: body.key },
    });

    if (existing) {
      throw new BadRequestException(`Feature flag with key "${body.key}" already exists`);
    }

    const metadata = {
      rolloutPercentage: body.rolloutPercentage ?? 100,
      allowedUserIds: body.allowedUserIds ?? [],
      allowedRoles: body.allowedRoles ?? [],
    };

    const flag = await this.prisma.getTenantDb().featureFlag.create({
      data: {
        tenantId,
        key: body.key,
        description: body.description,
        enabled: body.enabled ?? false,
      },
    });

    return { ...flag, metadata };
  }

  @Patch(':id')
  @RequirePermissions(Permissions.FeatureFlagsManage)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: {
      enabled?: boolean;
      description?: string;
      rolloutPercentage?: number;
      allowedUserIds?: string[];
      allowedRoles?: string[];
    },
  ) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const existing = await this.prisma.getTenantDb().featureFlag.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Feature flag not found');
    }

    const updated = await this.prisma.getTenantDb().featureFlag.update({
      where: { id },
      data: {
        enabled: body.enabled,
        description: body.description,
      },
    });

    return updated;
  }

  @Delete(':id')
  @RequirePermissions(Permissions.FeatureFlagsManage)
  async delete(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const existing = await this.prisma.getTenantDb().featureFlag.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Feature flag not found');
    }
    await this.prisma.getTenantDb().featureFlag.delete({ where: { id } });
    return { ok: true };
  }

  @Post('bulk')
  @RequirePermissions(Permissions.FeatureFlagsManage)
  async bulkUpdate(
    @Request() req: any,
    @Body() body: { flags: { key: string; enabled: boolean }[] },
  ) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;

    const results = await Promise.all(
      body.flags.map(async (flagUpdate) => {
        const existing = await this.prisma.getTenantDb().featureFlag.findFirst({
          where: { tenantId, key: flagUpdate.key },
        });

        if (!existing) {
          return { key: flagUpdate.key, status: 'not_found' };
        }

        await this.prisma.getTenantDb().featureFlag.update({
          where: { id: existing.id },
          data: { enabled: flagUpdate.enabled },
        });

        return { key: flagUpdate.key, status: 'updated', enabled: flagUpdate.enabled };
      })
    );

    return { results };
  }
}
