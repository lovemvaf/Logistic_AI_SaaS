import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  ExcludeRoles,
  Permissions,
  PermissionsGuard,
  RequirePermissions,
  Roles,
} from '../../../core/types/shared-types';

@ApiTags('Tenant Portal Aliases')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class IamPortalAliasesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users')
  @RequirePermissions(Permissions.UsersRead)
  async listUsers() {
    return this.prisma.getTenantDb().tenantUser.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLogin: true,
        roles: { include: { role: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  @Get('users/:id')
  @RequirePermissions(Permissions.UsersRead)
  async getUser(@Param('id') id: string) {
    const user = await this.prisma.getTenantDb().tenantUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLogin: true,
        roles: { include: { role: { include: { permissions: true } } } },
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  @Post('users')
  @RequirePermissions(Permissions.UsersInvite)
  async createUser(
    @Request() req: any,
    @Body() body: { email: string; fullName: string; roleId?: string; password?: string },
  ) {
    return this.inviteUser(req, body);
  }

  @Post('users/invite')
  @RequirePermissions(Permissions.UsersInvite)
  async inviteUser(
    @Request() req: any,
    @Body() body: { email: string; fullName: string; roleId?: string; password?: string },
  ) {
    const tenantId = req.user?.tenant_id ?? req.tenantId;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxUsers: true },
    });
    if (!tenant) throw new ForbiddenException('Tenant context lost');

    const db = this.prisma.getTenantDb();
    const activeCount = await db.tenantUser.count({ where: { status: 'ACTIVE' } });
    if (activeCount >= tenant.maxUsers) {
      throw new ForbiddenException(`Subscription limit reached: Maximum ${tenant.maxUsers} users allowed.`);
    }

    let targetRoleId = body.roleId;
    if (targetRoleId) {
      const exists = await db.customRole.findUnique({ where: { id: targetRoleId } });
      if (!exists) targetRoleId = undefined;
    }
    if (!targetRoleId) {
      const defaultRole = await db.customRole.findFirst();
      if (!defaultRole) throw new ForbiddenException('No roles available to assign');
      targetRoleId = defaultRole.id;
    }

    const rawPassword = body.password || `Tmp#${Date.now().toString(36)}`;
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    return db.tenantUser.create({
      data: {
        email: body.email,
        fullName: body.fullName || body.email,
        passwordHash,
        roles: { create: { roleId: targetRoleId } },
      },
      include: { roles: { include: { role: true } } },
    });
  }

  @Patch('users/:id')
  @RequirePermissions(Permissions.UsersInvite)
  async updateUser(
    @Param('id') id: string,
    @Body() body: { fullName?: string; status?: string; password?: string },
  ) {
    try {
      const data: any = {};
      if (body.fullName !== undefined) data.fullName = body.fullName;
      if (body.status !== undefined) data.status = body.status;
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
      if (error?.code === 'P2025') throw new NotFoundException(`User ${id} not found`);
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  @Patch('users/:id/status')
  @RequirePermissions(Permissions.UsersInvite)
  async setUserStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.updateUser(id, { status: body.status });
  }

  @Delete('users/:id')
  @RequirePermissions(Permissions.UsersInvite)
  async deactivateUser(@Param('id') id: string) {
    return this.updateUser(id, { status: 'INACTIVE' });
  }

  @Get('roles')
  @RequirePermissions(Permissions.RolesManage)
  async listRoles() {
    return this.prisma.getTenantDb().customRole.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Get('roles/:id')
  @RequirePermissions(Permissions.RolesManage)
  async getRole(@Param('id') id: string) {
    const role = await this.prisma.getTenantDb().customRole.findUnique({
      where: { id },
      include: { permissions: true, _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }

  @Post('roles')
  @RequirePermissions(Permissions.RolesManage)
  async createRole(@Body() body: { name: string; permissions?: { resource: string; action: string }[] }) {
    return this.prisma.getTenantDb().customRole.create({
      data: {
        name: body.name,
        permissions: body.permissions ? { create: body.permissions } : undefined,
      },
      include: { permissions: true },
    });
  }

  @Patch('roles/:id')
  @RequirePermissions(Permissions.RolesManage)
  async updateRole(
    @Param('id') id: string,
    @Body() body: { name?: string; permissions?: { resource: string; action: string }[] },
  ) {
    const db = this.prisma.getTenantDb();
    const existing = await db.customRole.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Role ${id} not found`);

    if (Array.isArray(body.permissions)) {
      await db.rolePermission.deleteMany({ where: { roleId: id } });
      await db.rolePermission.createMany({
        data: body.permissions.map((p) => ({ roleId: id, resource: p.resource, action: p.action })),
      });
    }
    if (body.name) {
      await db.customRole.update({ where: { id }, data: { name: body.name } });
    }
    return db.customRole.findUnique({ where: { id }, include: { permissions: true } });
  }

  @Delete('roles/:id')
  @RequirePermissions(Permissions.RolesManage)
  async deleteRole(@Param('id') id: string) {
    const db = this.prisma.getTenantDb();
    const role = await db.customRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    if (role.isSystemDefault) {
      return { ok: false, message: 'Cannot delete system default role' };
    }
    await db.customRole.delete({ where: { id } });
    return { ok: true };
  }

  @Get('settings')
  @RequirePermissions(Permissions.SettingsManage)
  async getSettings(@Request() req: any) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, settingsJson: true },
    });
    let settings: Record<string, unknown> = {};
    if (tenant?.settingsJson) {
      try {
        settings = JSON.parse(tenant.settingsJson);
      } catch {
        settings = {};
      }
    }
    return { tenantName: tenant?.name || '', ...settings };
  }

  @Patch('settings')
  @RequirePermissions(Permissions.SettingsManage)
  async updateSettings(@Request() req: any, @Body() body: any) {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const { tenantName, ...settings } = body || {};
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settingsJson: JSON.stringify(settings),
        ...(tenantName ? { name: tenantName } : {}),
      },
    });
    return { ok: true };
  }

  @Get('dashboard/summary')
  @RequirePermissions(Permissions.TenantDashboardRead)
  async dashboardSummary() {
    const db = this.prisma.getTenantDb();
    const [totalOrders, deliveredOrders, inTransitOrders, activeVehicles, totalTrips, delayedTrips, lowStock] =
      await Promise.all([
        db.order.count(),
        db.order.count({ where: { status: 'DELIVERED' } }),
        db.order.count({ where: { status: { in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DISPATCHED'] } } }),
        db.vehicle.count({ where: { status: 'ACTIVE' } }),
        db.trip.count(),
        db.trip.count({ where: { status: { not: 'COMPLETED' } } }),
        db.inventory.count({ where: { quantityOnHand: { lte: 10 } } }),
      ]);

    const onTimeRate = totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0;
    return {
      totalOrders,
      deliveredOrders,
      inTransitOrders,
      activeVehicles,
      totalTrips,
      delayedTrips,
      lowStockCount: lowStock,
      onTimeRate,
    };
  }

  @Get('reports/summary')
  @RequirePermissions(Permissions.TenantDashboardRead)
  async reportSummary(@Query('range') range: string = '30d') {
    const days = Math.min(Math.max(1, parseInt(range, 10) || 30), 365);
    const since = new Date(Date.now() - days * 86400 * 1000);
    const db = this.prisma.getTenantDb();

    const [orders, delivered, returns] = await Promise.all([
      db.order.count({ where: { createdAt: { gte: since } } }),
      db.order.count({ where: { status: 'DELIVERED', createdAt: { gte: since } } }),
      db.returnRequest.count({ where: { createdAt: { gte: since } } }),
    ]);

    return {
      range,
      totalOrders: orders,
      deliveredOrders: delivered,
      returnRequests: returns,
      onTimeRate: orders > 0 ? Math.round((delivered / orders) * 100) : 0,
    };
  }

  @Get('reports/on-time')
  @RequirePermissions(Permissions.TenantDashboardRead)
  async reportOnTime(@Query('range') range: string = '30d') {
    const days = Math.min(Math.max(1, parseInt(range, 10) || 30), 365);
    const since = new Date(Date.now() - days * 86400 * 1000);
    const orders = await this.prisma.getTenantDb().order.findMany({
      where: { status: 'DELIVERED', createdAt: { gte: since } },
      select: { id: true, estimatedDeliveryDate: true, actualDeliveryTime: true, createdAt: true },
      take: 500,
    });
    const onTime = orders.filter(
      (o: any) =>
        o.actualDeliveryTime &&
        (!o.estimatedDeliveryDate || new Date(o.actualDeliveryTime) <= new Date(o.estimatedDeliveryDate)),
    ).length;
    return {
      range,
      delivered: orders.length,
      onTime,
      late: Math.max(0, orders.length - onTime),
      onTimeRate: orders.length > 0 ? Math.round((onTime / orders.length) * 100) : 0,
    };
  }

  @Get('reports/costs')
  @RequirePermissions(Permissions.TenantDashboardRead)
  async reportCosts(@Query('range') range: string = '30d') {
    const days = Math.min(Math.max(1, parseInt(range, 10) || 30), 365);
    const since = new Date(Date.now() - days * 86400 * 1000);
    const db = this.prisma.getTenantDb();
    const [expenses, shippingOrders] = await Promise.all([
      db.driverExpense.findMany({ where: { createdAt: { gte: since } }, select: { amount: true, fuelCost: true } }),
      db.order.findMany({ where: { createdAt: { gte: since } }, select: { shippingFee: true, codAmount: true } }),
    ]);
    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const totalFuelCost = expenses.reduce((sum: number, e: any) => sum + Number(e.fuelCost || 0), 0);
    const shippingRevenue = shippingOrders.reduce((sum: number, o: any) => sum + Number(o.shippingFee || 0), 0);
    return { range, totalExpenses, totalFuelCost, shippingRevenue };
  }

  @Get('reports/fleet')
  @RequirePermissions(Permissions.TenantDashboardRead)
  async reportFleet(@Query('range') range: string = '30d') {
    const days = Math.min(Math.max(1, parseInt(range, 10) || 30), 365);
    const since = new Date(Date.now() - days * 86400 * 1000);
    const db = this.prisma.getTenantDb();
    const [totalVehicles, activeVehicles, totalDrivers, activeDrivers, trips] = await Promise.all([
      db.vehicle.count(),
      db.vehicle.count({ where: { status: 'ACTIVE' } }),
      db.driver.count(),
      db.driver.count({ where: { status: { in: ['ACTIVE', 'ONLINE'] } } }),
      db.trip.findMany({ where: { createdAt: { gte: since } }, select: { actualDistanceKm: true, status: true } }),
    ]);
    const totalDistanceKm = trips.reduce((sum: number, t: any) => sum + Number(t.actualDistanceKm || 0), 0);
    return {
      range,
      vehicles: { total: totalVehicles, active: activeVehicles },
      drivers: { total: totalDrivers, active: activeDrivers },
      tripsCount: trips.length,
      totalDistanceKm,
    };
  }
}
