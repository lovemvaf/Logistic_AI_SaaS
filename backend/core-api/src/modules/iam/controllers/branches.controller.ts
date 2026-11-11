import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "../../../core/types/shared-types";
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Branches')
@Controller("tenant/branches")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class BranchesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.SettingsManage)
  async list() {
    return this.prisma.getTenantDb().branch.findMany({
      orderBy: { name: 'asc' },
    });
  }

  @Get(":id")
  @RequirePermissions(Permissions.SettingsManage)
  async detail(@Param("id") id: string) {
    const branch = await this.prisma.getTenantDb().branch.findUnique({
      where: { id },
      include: { manager: { select: { id: true, fullName: true, email: true } } }
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
    return branch;
  }

  @Post()
  @RequirePermissions(Permissions.SettingsManage)
  async create(@Body() body: { type: string, code: string, name: string, address: string, lat?: number, lng?: number, capacityCbm?: number, managerId?: string }) {
    try {
      return await this.prisma.getTenantDb().branch.create({
        data: {
          type: body.type,
          code: body.code,
          name: body.name,
          address: body.address,
          lat: body.lat,
          lng: body.lng,
          capacityCbm: body.capacityCbm,
          managerId: body.managerId,
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Branch code must be unique');
      }
      throw error;
    }
  }

  @Patch(":id")
  @RequirePermissions(Permissions.SettingsManage)
  async update(@Param("id") id: string, @Body() body: { type?: string, code?: string, name?: string, address?: string, lat?: number, lng?: number, capacityCbm?: number, managerId?: string, status?: string }) {
    try {
      return await this.prisma.getTenantDb().branch.update({
        where: { id },
        data: body
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Branch with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        throw new ConflictException('Branch code must be unique');
      }
      throw error;
    }
  }

  @Delete(":id")
  @RequirePermissions(Permissions.SettingsManage)
  async remove(@Param("id") id: string) {
    try {
      return await this.prisma.getTenantDb().branch.update({
        where: { id },
        data: { status: 'INACTIVE' }
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Branch with ID ${id} not found`);
      }
      throw error;
    }
  }
}
