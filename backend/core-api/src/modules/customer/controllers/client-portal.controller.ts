import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  Permissions,
  PermissionsGuard,
  RequirePermissions,
  RequireRoles,
  Roles,
} from '../../../core/types/shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PrismaService } from '../../../core/prisma/prisma.service';

@ApiTags('Client Portal')
@Controller('client')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireRoles(Roles.CUSTOMER_CLIENT)
export class ClientPortalController {
  constructor(private readonly prisma: PrismaService) {}

  private async getClientUser(req: any) {
    const email = req.user?.email;
    if (!email) throw new NotFoundException('User email not found in token');

    const clientUser = await this.prisma.getTenantDb().clientUser.findFirst({
      where: { email },
      include: { client: true },
    });
    if (!clientUser) {
      throw new NotFoundException('Client account not found for this user');
    }
    return clientUser;
  }

  @Get('dashboard')
  @RequirePermissions(Permissions.OrdersRead)
  async dashboard(@Request() req: any) {
    const clientUser = await this.getClientUser(req);
    const clientId = clientUser.clientId;
    const db = this.prisma.getTenantDb();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [orders, invoices, returns] = await Promise.all([
      db.order.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.invoice.findMany({
        where: { clientId },
        include: { payments: true },
        take: 50,
      }),
      db.returnRequest.findMany({
        where: { clientId },
        take: 50,
      }),
    ]);

    const delivered = orders.filter((o: any) => o.status === 'DELIVERED');
    const onTime = delivered.filter(
      (o: any) =>
        o.actualDeliveryTime &&
        (!o.estimatedDeliveryDate || new Date(o.actualDeliveryTime) <= new Date(o.estimatedDeliveryDate)),
    );
    const onTimeRate = delivered.length > 0 ? Math.round((onTime.length / delivered.length) * 100) : 0;

    const outstandingAmount = invoices
      .filter((inv: any) => inv.status !== 'PAID' && inv.status !== 'VOID')
      .reduce((sum: number, inv: any) => {
        const paid = (inv.payments || [])
          .filter((p: any) => p.status === 'COMPLETED')
          .reduce((pSum: number, p: any) => pSum + Number(p.amount || 0), 0);
        return sum + Math.max(0, Number(inv.totalAmount || 0) - paid);
      }, 0);

    return {
      ordersToday: orders.filter((o: any) => new Date(o.createdAt) >= startOfDay).length,
      inTransit: orders.filter((o: any) =>
        ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PENDING_PICKUP', 'DISPATCHED'].includes(o.status),
      ).length,
      deliveredToday: delivered.filter((o: any) => new Date(o.updatedAt) >= startOfDay).length,
      onTimeRate,
      outstandingAmount,
      openReturns: returns.filter((r: any) => !['REFUNDED', 'REJECTED', 'CLOSED'].includes(r.status)).length,
      recentOrders: orders.slice(0, 6),
    };
  }

  @Get('stock')
  @RequirePermissions(Permissions.InventoryRead)
  async stock(@Request() req: any) {
    const clientUser = await this.getClientUser(req);
    const clientOrders = await this.prisma.getTenantDb().order.findMany({
      where: { clientId: clientUser.clientId },
      select: { items: { select: { productId: true } } },
    });
    const productIds = [
      ...new Set(clientOrders.flatMap((order: any) => order.items.map((item: any) => item.productId))),
    ];
    if (productIds.length === 0) return [];

    const inventories = await this.prisma.getTenantDb().inventory.findMany({
      where: { productId: { in: productIds } },
      include: {
        product: true,
        warehouse: true,
        bin: { include: { rack: { include: { zone: true } } } },
      },
      take: 100,
    });

    return inventories.map((inv: any) => ({
      id: inv.id,
      productName: inv.product?.name || '',
      name: inv.product?.name || '',
      sku: inv.product?.sku || '',
      quantity: inv.quantityOnHand ?? 0,
      allocated: inv.quantityAllocated ?? 0,
      reserved: inv.quantityAllocated ?? 0,
      available: (inv.quantityOnHand ?? 0) - (inv.quantityAllocated ?? 0),
      reorderPoint: 10,
      warehouse: inv.warehouse?.name || '',
      warehouseName: inv.warehouse?.name || '',
      warehouseCode: inv.warehouse?.code || inv.warehouse?.id || 'WH',
      expiryDate: inv.expiryDate ?? null,
      priceVnd: 0,
      location: inv.bin ? `${inv.bin.rack?.zone?.code}-${inv.bin.barcode}` : null,
      status: inv.status,
    }));
  }

  @Get('profile')
  @RequirePermissions(Permissions.OrdersRead)
  async getProfile(@Request() req: any) {
    const clientUser = await this.getClientUser(req);
    return {
      id: clientUser.id,
      clientId: clientUser.clientId,
      companyName: clientUser.client?.name || '',
      email: clientUser.email,
      fullName: clientUser.fullName,
      phone: clientUser.phone,
      status: clientUser.status,
    };
  }

  @Patch('profile')
  @RequirePermissions(Permissions.OrdersRead)
  async updateProfile(
    @Request() req: any,
    @Body() body: { fullName?: string; phone?: string; companyName?: string },
  ) {
    const clientUser = await this.getClientUser(req);
    const db = this.prisma.getTenantDb();

    const updatedUser = await db.clientUser.update({
      where: { id: clientUser.id },
      data: {
        ...(body.fullName !== undefined ? { fullName: String(body.fullName) } : {}),
        ...(body.phone !== undefined ? { phone: String(body.phone) } : {}),
      },
    });

    if (body.companyName && clientUser.clientId) {
      await db.client.update({
        where: { id: clientUser.clientId },
        data: { name: String(body.companyName) },
      });
    }

    return {
      id: updatedUser.id,
      clientId: updatedUser.clientId,
      companyName: body.companyName || clientUser.client?.name || '',
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      phone: updatedUser.phone,
      status: updatedUser.status,
    };
  }
}
