import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { OutboxService } from '../../../core/outbox/outbox.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LogisticsService } from '../services/logistics.service';

@ApiTags('Finance Portal Aliases')
@Controller('finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT, Roles.DRIVER)
export class FinancePortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsService: LogisticsService,
    private readonly outbox: OutboxService,
  ) {}

  @Get('cod-remittances')
  @RequirePermissions(Permissions.TripsRead)
  async listRemittances(@Query() query: any) {
    return this.logisticsService.getRemittances(query);
  }

  @Get('cod-remittances/:id')
  @RequirePermissions(Permissions.TripsRead)
  async getRemittance(@Param('id') id: string) {
    const item = await this.prisma.getTenantDb().codRemittance.findUnique({
      where: { id },
      include: { driver: { include: { user: true } } },
    });
    if (!item) throw new NotFoundException(`COD remittance ${id} not found`);
    return item;
  }

  @Post('cod-remittances/:id/submit')
  @RequirePermissions(Permissions.TripsDispatch)
  async submitRemittance(@Param('id') id: string, @Body() body: { submittedAmount?: number }) {
    const db = this.prisma.getTenantDb();
    const existing = await db.codRemittance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`COD remittance ${id} not found`);
    return db.codRemittance.update({
      where: { id },
      data: {
        ...(body?.submittedAmount !== undefined ? { amountRemitted: Number(body.submittedAmount) } : {}),
        status: 'APPROVED',
      },
    });
  }

  @Post('cod-remittances/:id/reconcile')
  @RequirePermissions(Permissions.TripsDispatch)
  async reconcileRemittance(@Param('id') id: string) {
    return this.logisticsService.updateRemittanceStatus(id, 'RECONCILED');
  }

  @Get('bank-transactions')
  @RequirePermissions(Permissions.TripsRead)
  async listBankTransactions() {
    return this.prisma.getTenantDb().paymentTransaction.findMany({
      include: { invoice: { select: { invoiceNumber: true, clientId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('bank-transactions/:id')
  @RequirePermissions(Permissions.TripsRead)
  async getBankTransaction(@Param('id') id: string) {
    const txn = await this.prisma.getTenantDb().paymentTransaction.findUnique({
      where: { id },
      include: { invoice: true },
    });
    if (!txn) throw new NotFoundException(`Bank transaction ${id} not found`);
    return txn;
  }

  @Get('expenses')
  @RequirePermissions(Permissions.TripsRead)
  async listExpenses(@Query('driverId') driverId?: string) {
    return this.logisticsService.getDriverExpenses(driverId);
  }

  @Get('expenses/:id')
  @RequirePermissions(Permissions.TripsRead)
  async getExpense(@Param('id') id: string) {
    const exp = await this.prisma.getTenantDb().driverExpense.findUnique({
      where: { id },
      include: { driver: { include: { user: true } }, trip: true },
    });
    if (!exp) throw new NotFoundException(`Expense ${id} not found`);
    return exp;
  }

  @Post('expenses/:id/decision')
  @RequirePermissions(Permissions.TripsDispatch)
  async decideExpense(
    @Param('id') id: string,
    @Body() body: { decision: string; note?: string },
  ) {
    const normalized = String(body?.decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(normalized)) {
      throw new BadRequestException('decision must be APPROVED or REJECTED');
    }
    const db = this.prisma.getTenantDb();
    const existing = await db.driverExpense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Expense ${id} not found`);
    return db.driverExpense.update({
      where: { id },
      data: { status: normalized, ...(body?.note ? { note: String(body.note) } : {}) },
    });
  }

  @Get('invoices')
  @RequirePermissions(Permissions.BillingRead)
  async listInvoices() {
    const invoices = await this.prisma.getTenantDb().invoice.findMany({
      include: { client: true, payments: true, items: true },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
    return invoices.map((inv: any) => ({
      ...inv,
      totalAmount: Number(inv.totalAmount),
      paidAmount: (inv.payments || [])
        .filter((p: any) => p.status === 'COMPLETED')
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
    }));
  }

  @Get('invoices/:id')
  @RequirePermissions(Permissions.BillingRead)
  async getInvoice(@Param('id') id: string) {
    const inv = await this.prisma.getTenantDb().invoice.findUnique({
      where: { id },
      include: { client: true, payments: true, items: true },
    });
    if (!inv) throw new NotFoundException(`Invoice ${id} not found`);
    const paidAmount = (inv.payments || [])
      .filter((p: any) => p.status === 'COMPLETED')
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    return { ...inv, totalAmount: Number(inv.totalAmount), paidAmount };
  }

  @Post('invoices/:id/payments')
  @RequirePermissions(Permissions.BillingManage)
  async recordInvoicePayment(
    @Param('id') id: string,
    @Body() body: { amount: number; method?: string; transactionId?: string },
    @Request() req: any,
  ) {
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    const tenantId = req.tenantId ?? req.user?.tenant_id;

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const invoice = await tx.invoice.findUnique({ where: { id }, include: { payments: true } });
      if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
      if (invoice.status === 'PAID' || invoice.status === 'VOID') {
        throw new BadRequestException('Invoice is already settled');
      }

      const alreadyPaidCents = (invoice.payments || [])
        .filter((p: any) => p.status === 'COMPLETED')
        .reduce((s: number, p: any) => s + Math.round(Number(p.amount || 0) * 100), 0);
      const totalCents = Math.round(Number(invoice.totalAmount) * 100);
      const payCents = Math.round(amount * 100);
      if (alreadyPaidCents + payCents > totalCents) {
        throw new BadRequestException('Payment amount exceeds remaining invoice balance');
      }

      const payment = await tx.paymentTransaction.create({
        data: {
          tenantId: tenantId || invoice.tenantId,
          invoiceId: invoice.id,
          amount: payCents / 100,
          method: body?.method || 'BANK_TRANSFER',
          transactionId: body?.transactionId || `TXN-${Date.now()}`,
          status: 'COMPLETED',
        },
      });

      const nextStatus = alreadyPaidCents + payCents >= totalCents ? 'PAID' : 'PARTIAL';
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: nextStatus, ...(nextStatus === 'PAID' ? { paidAt: new Date() } : {}) },
      });

      await this.outbox.enqueue(
        {
          channel: 'KAFKA',
          topic: 'payment.recorded',
          payload: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount: payCents / 100,
            status: 'COMPLETED',
            invoiceStatus: nextStatus,
          },
        },
        tx,
      );

      return { ok: true, payment, paidAmount: (alreadyPaidCents + payCents) / 100, status: nextStatus };
    });
  }
}

async function buildTenantInsights(prisma: PrismaService) {
  const db = prisma.getTenantDb();
  const [lowStockCount, pendingRemittances, openSos, overdueOrders, decisions] = await Promise.all([
    db.inventory.count({ where: { quantityOnHand: { lte: 10 } } }),
    db.codRemittance.count({ where: { status: 'PENDING' } }),
    db.sosAlert.count({ where: { status: 'OPEN' } }),
    db.order.count({
      where: {
        status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED'] },
        estimatedDeliveryDate: { lt: new Date() },
      },
    }),
    db.aiFeedback.findMany({ where: { resourceType: 'AI_INSIGHT' }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);

  const statusMap = new Map<string, string>();
  for (const d of decisions) {
    if (!statusMap.has(d.resourceId)) {
      statusMap.set(d.resourceId, d.humanCorrected);
    }
  }

  return [
    {
      id: 'INS-SLA-OVERDUE',
      category: 'SLA',
      severity: overdueOrders > 0 ? 'HIGH' : 'LOW',
      title: `${overdueOrders} đơn hàng vượt hạn giao dự kiến`,
      metricValue: overdueOrders,
      recommendation: 'Ưu tiên gán chuyến và thông báo người nhận cho các đơn trễ SLA.',
      status: statusMap.get('INS-SLA-OVERDUE') || 'OPEN',
    },
    {
      id: 'INS-INV-LOWSTOCK',
      category: 'INVENTORY',
      severity: lowStockCount > 0 ? 'MEDIUM' : 'LOW',
      title: `${lowStockCount} vị trí tồn kho dưới ngưỡng 10 đơn vị`,
      metricValue: lowStockCount,
      recommendation: 'Kiểm tra kế hoạch bổ sung hàng và kiểm kê định kỳ.',
      status: statusMap.get('INS-INV-LOWSTOCK') || 'OPEN',
    },
    {
      id: 'INS-FIN-COD',
      category: 'FINANCE',
      severity: pendingRemittances > 0 ? 'MEDIUM' : 'LOW',
      title: `${pendingRemittances} phiếu đối soát COD đang chờ duyệt`,
      metricValue: pendingRemittances,
      recommendation: 'Đối chiếu sao kê ngân hàng cho các phiếu nộp COD đang chờ.',
      status: statusMap.get('INS-FIN-COD') || 'OPEN',
    },
    {
      id: 'INS-OPS-SOS',
      category: 'SAFETY',
      severity: openSos > 0 ? 'HIGH' : 'LOW',
      title: `${openSos} cảnh báo SOS tài xế chưa xử lý`,
      metricValue: openSos,
      recommendation: 'Liên hệ ngay tài xế và ghi nhận trạng thái xử lý trên hệ thống.',
      status: statusMap.get('INS-OPS-SOS') || 'OPEN',
    },
  ];
}

@ApiTags('Tenant AI Insights')
@Controller('tenant/ai-insights')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TenantAiInsightsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.TenantDashboardRead)
  async list() {
    return buildTenantInsights(this.prisma);
  }

  @Get(':id')
  @RequirePermissions(Permissions.TenantDashboardRead)
  async detail(@Param('id') id: string) {
    const items = await buildTenantInsights(this.prisma);
    const match = items.find((i) => i.id === id);
    if (!match) throw new NotFoundException(`Insight ${id} not found`);
    return match;
  }

  @Post(':id/decision')
  @RequirePermissions(Permissions.TripsDispatch)
  async decide(@Param('id') id: string, @Body() body: { status: string; note?: string }) {
    const status = String(body?.status || '').toUpperCase();
    if (!['ACKNOWLEDGED', 'ACTIONED', 'DISMISSED'].includes(status)) {
      throw new BadRequestException('Invalid insight decision: ACKNOWLEDGED, ACTIONED, or DISMISSED required');
    }
    const feedback = await this.prisma.getTenantDb().aiFeedback.create({
      data: {
        modelId: 'ops-heuristic-v1',
        resourceType: 'AI_INSIGHT',
        resourceId: id,
        aiPrediction: 'OPERATIONAL_ALERT',
        humanCorrected: status,
        confidence: 1.0,
      },
    });
    return { ok: true, id, status, feedbackId: feedback.id };
  }
}
