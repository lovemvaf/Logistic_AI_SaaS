import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, ForbiddenException, Request, NotFoundException, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "../../../core/types/shared-types";
import * as bcrypt from 'bcrypt';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Tenant Users')
@Controller("tenant/users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TenantUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.UsersRead)
  async list() {
    return this.prisma.getTenantDb().tenantUser.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLogin: true,
        roles: {
          include: { role: true }
        }
      },
      orderBy: { fullName: 'asc' },
    });
  }

  @Get(":id")
  @RequirePermissions(Permissions.UsersRead)
  async detail(@Param("id") id: string) {
    return this.prisma.getTenantDb().tenantUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLogin: true,
        roles: {
          include: {
            role: {
              include: { permissions: true }
            }
          }
        }
      },
    });
  }

  @Post()
  @RequirePermissions(Permissions.UsersInvite)
  async create(@Request() req: any, @Body() body: { email: string, fullName: string, roleId: string, password: string }) {
    // 1. Kiểm tra giới hạn subscription
    const tenantId = req.user?.tenant_id ?? req.tenantId;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxUsers: true }
    });

    if (!tenant) throw new ForbiddenException('Tenant context lost');

    const currentUserCount = await this.prisma.getTenantDb().tenantUser.count({
      where: { status: 'ACTIVE' }
    });

    if (currentUserCount >= tenant.maxUsers) {
      throw new ForbiddenException(`Subscription limit reached: Maximum ${tenant.maxUsers} users allowed.`);
    }

    let targetRoleId = body.roleId;
    if (!targetRoleId) {
      const defaultRole = await this.prisma.getTenantDb().customRole.findFirst();
      if (!defaultRole) throw new ForbiddenException('No roles available to assign');
      targetRoleId = defaultRole.id;
    } else {
      const roleExists = await this.prisma.getTenantDb().customRole.findUnique({ where: { id: targetRoleId }});
      if (!roleExists) {
        const defaultRole = await this.prisma.getTenantDb().customRole.findFirst();
        if (!defaultRole) throw new ForbiddenException('No roles available to assign');
        targetRoleId = defaultRole.id;
      }
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    return this.prisma.getTenantDb().tenantUser.create({
      data: {
        email: body.email,
        fullName: body.fullName,
        passwordHash,
        roles: {
          create: {
            roleId: targetRoleId
          }
        }
      },
      include: {
        roles: { include: { role: true } }
      }
    });
  }

  @Patch(":id")
  @RequirePermissions(Permissions.UsersInvite)
  async update(@Param("id") id: string, @Body() body: { fullName?: string, status?: string, password?: string }) {
    try {
      const data: any = {};
      if (body.fullName) data.fullName = body.fullName;
      if (body.status) data.status = body.status;
      if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);

      return await this.prisma.getTenantDb().tenantUser.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          roles: { include: { role: true } },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      throw new InternalServerErrorException("Failed to update user");
    }
  }

  @Delete(":id")
  @RequirePermissions(Permissions.UsersInvite)
  async deactivate(@Param("id") id: string) {
    try {
      // Soft-delete: set status to INACTIVE
      return await this.prisma.getTenantDb().tenantUser.update({
        where: { id },
        data: { status: "INACTIVE" },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      throw new InternalServerErrorException("Failed to deactivate user");
    }
  }

  @Patch(":id/roles")
  @RequirePermissions(Permissions.RolesManage)
  async updateRoles(@Param("id") id: string, @Body() body: { roleIds: string[] }) {
    // Remove all existing roles, then add new ones
    await this.prisma.getTenantDb().userRole.deleteMany({
      where: { userId: id },
    });

    if (body.roleIds.length > 0) {
      await this.prisma.getTenantDb().userRole.createMany({
        data: body.roleIds.map(roleId => ({
          userId: id,
          roleId,
        })),
      });
    }

    return this.prisma.getTenantDb().tenantUser.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
      },
    });
  }
}
