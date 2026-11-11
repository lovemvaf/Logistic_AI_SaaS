import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from '../../../core/types/shared-types';
import * as crypto from 'crypto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class ApiKeysController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.ApiKeysManage)
  async list(@Request() req: any) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const keys = await this.prisma.getTenantDb().tenantApiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(k => ({
      id: k.id,
      name: k.name,
      prefix: k.id.slice(0, 8),
      createdAt: k.createdAt,
      isActive: k.revokedAt === null,
    }));
  }

  @Post()
  @RequirePermissions(Permissions.ApiKeysManage)
  async create(
    @Request() req: any,
    @Body() body: { name?: string; scopes?: string[] },
  ) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    // Generate a 256-bit secret and store only its SHA-256 digest.
    // API keys are high-entropy, so a fast digest is both safe and indexable.
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await this.prisma.getTenantDb().tenantApiKey.create({
      data: {
        tenantId,
        keyHash,
        name: body.name,
        scopes: body.scopes ?? [],
      },
    });

    // Return the secret once; callers must store it securely.
    return { key: rawKey };
  }

  @Delete(':id')
  @RequirePermissions(Permissions.ApiKeysManage)
  async revoke(@Request() req: any, @Param('id') id: string) {
    return this.revokeKey(req, id);
  }

  @Post(':id/revoke')
  @RequirePermissions(Permissions.ApiKeysManage)
  async revokePost(@Request() req: any, @Param('id') id: string) {
    return this.revokeKey(req, id);
  }

  private async revokeKey(req: any, id: string) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const existing = await this.prisma.getTenantDb().tenantApiKey.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('API key not found');
    }
    await this.prisma.getTenantDb().tenantApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
