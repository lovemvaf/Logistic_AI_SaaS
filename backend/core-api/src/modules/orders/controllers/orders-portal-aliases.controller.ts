import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
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
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PrismaService } from '../../../core/prisma/prisma.service';

@ApiTags('Tenant Clients')
@Controller('tenant/clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TenantClientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.ClientsManage)
  async list() {
    try {
      return await this.prisma.getTenantDb().client.findMany({ include: { users: true } });
    } catch {
      throw new InternalServerErrorException('Failed to fetch clients');
    }
  }

  @Get(':id')
  @RequirePermissions(Permissions.ClientsManage)
  async get(@Param('id') id: string) {
    const client = await this.prisma.getTenantDb().client.findUnique({
      where: { id },
      include: { users: true },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return client;
  }

  @Post()
  @RequirePermissions(Permissions.ClientsManage)
  async create(@Body() body: { name: string }) {
    if (!body?.name) throw new BadRequestException('name is required');
    return this.prisma.getTenantDb().client.create({ data: { name: String(body.name) } });
  }

  @Patch(':id')
  @RequirePermissions(Permissions.ClientsManage)
  async update(@Param('id') id: string, @Body() body: { name?: string; status?: string }) {
    try {
      const existing = await this.prisma.getTenantDb().client.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Client ${id} not found`);
      return await this.prisma.getTenantDb().client.update({
        where: { id },
        data: {
          ...(body?.name !== undefined ? { name: String(body.name) } : {}),
          ...(body?.status !== undefined ? { status: String(body.status) } : {}),
        },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to update client');
    }
  }

  @Patch(':id/credit')
  @RequirePermissions(Permissions.ClientsManage)
  async updateCredit(
    @Param('id') id: string,
    @Body() body: { amount: number },
    @Request() req: any,
  ) {
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Credit limit amount must be a finite non-negative number');
    }
    const client = await this.prisma.getTenantDb().client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException(`Client ${id} not found`);

    const tenantId = req.tenantId ?? req.user?.tenant_id ?? client.tenantId;
    const key = `client_credit_limit:${id}`;
    await this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { value: String(amount), description: `Credit limit for client ${client.name}` },
      create: { tenantId, key, value: String(amount), description: `Credit limit for client ${client.name}` },
    });

    return { ok: true, id: client.id, name: client.name, creditLimit: amount };
  }

  @Delete(':id')
  @RequirePermissions(Permissions.ClientsManage)
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.getTenantDb().client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Client ${id} not found`);
    return this.prisma.getTenantDb().client.update({
      where: { id },
      data: { status: 'INACTIVE', deletedAt: new Date() },
    });
  }
}

@ApiTags('Customers Alias')
@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class CustomersAliasController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.ClientsRead)
  async list(@Query('search') search?: string) {
    const where: any = search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {};
    return this.prisma.getTenantDb().client.findMany({
      where,
      include: { users: true },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  @Get(':id/stat')
  @RequirePermissions(Permissions.ClientsRead)
  async stat(@Param('id') id: string) {
    const db = this.prisma.getTenantDb();
    const client = await db.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException(`Customer ${id} not found`);

    const [orders, invoices] = await Promise.all([
      db.order.findMany({
        where: { clientId: id },
        select: { status: true, codAmount: true, shippingFee: true },
      }),
      db.invoice.findMany({
        where: { clientId: id },
        select: { totalAmount: true, status: true },
      }),
    ]);

    return {
      customerId: id,
      totalOrders: orders.length,
      deliveredOrders: orders.filter((o: any) => o.status === 'DELIVERED').length,
      cancelledOrders: orders.filter((o: any) => o.status === 'CANCELLED').length,
      totalCodAmount: orders.reduce((s: number, o: any) => s + Number(o.codAmount || 0), 0),
      totalBilledAmount: invoices.reduce((s: number, i: any) => s + Number(i.totalAmount || 0), 0),
    };
  }

  @Get(':id/reviews')
  @RequirePermissions(Permissions.ClientsRead)
  async reviews(@Param('id') id: string) {
    const db = this.prisma.getTenantDb();
    const client = await db.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException(`Customer ${id} not found`);

    const feedbacks = await db.aiFeedback.findMany({
      where: { resourceType: 'CUSTOMER_REVIEW', resourceId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return feedbacks;
  }

  @Get(':id')
  @RequirePermissions(Permissions.ClientsRead)
  async get(@Param('id') id: string) {
    const client = await this.prisma.getTenantDb().client.findUnique({
      where: { id },
      include: { users: true },
    });
    if (!client) throw new NotFoundException(`Customer ${id} not found`);
    return client;
  }
}

@ApiTags('Order Partials')
@Controller('order-partials')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class OrderPartialsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.OrdersRead)
  async list() {
    return this.prisma.getTenantDb().order.findMany({
      where: { status: { in: ['PARTIAL_DELIVERED', 'PARTIAL', 'RETURN_REQUESTED'] } },
      include: { items: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.OrdersRead)
  async detail(@Param('id') id: string) {
    const order = await this.prisma.getTenantDb().order.findUnique({
      where: { id },
      include: { items: true, events: { orderBy: { timestamp: 'desc' } } },
    });
    if (!order) throw new NotFoundException(`Order partial ${id} not found`);
    return order;
  }

  @Patch(':id')
  @RequirePermissions(Permissions.OrdersCreate)
  async update(@Param('id') id: string, @Body() body: { status?: string; note?: string }) {
    const db = this.prisma.getTenantDb();
    const order = await db.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order partial ${id} not found`);

    return db.$transaction(async (tx: any) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          ...(body?.status ? { status: body.status } : {}),
          ...(body?.note !== undefined ? { notes: body.note } : {}),
        },
      });
      await tx.orderTrackingEvent.create({
        data: {
          orderId: id,
          status: updated.status,
          location: 'Operations',
          description: body?.note || `Partial order updated to ${updated.status}`,
        },
      });
      return updated;
    });
  }
}
