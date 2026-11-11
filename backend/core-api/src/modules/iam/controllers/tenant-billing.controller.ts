import { Controller, Get, Post, Body, UseGuards, Request, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { IsString, IsNumber, IsOptional, Min } from "class-validator";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { OutboxService } from "../../../core/outbox/outbox.service";
import { StripeService } from "../payments/stripe.service";
import { ApiTags } from '@nestjs/swagger';

class TenantPayInvoiceDto {
  @IsString()
  invoiceId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  method: string;

  @IsOptional()
  @IsString()
  transactionId?: string;
}

class TenantPaymentIntentDto {
  @IsString()
  invoiceId: string;
}

@ApiTags('Tenant Billing')
@Controller("tenant/billing")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT, Roles.DRIVER, Roles.WAREHOUSE_STAFF, Roles.TENANT_USER)
export class TenantBillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly outbox: OutboxService,
  ) {}

  private resolveTenantId(req: any): string {
    const tenantId = req.tenantId ?? req.user?.tenant_id;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }
    return tenantId;
  }

  @Get("plan")
  @RequirePermissions(Permissions.BillingRead)
  async getPlan(@Request() req: any) {
    const tenantId = this.resolveTenantId(req);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planId: true },
    });
    if (!tenant?.planId) {
      return { plan: null };
    }
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: tenant.planId },
      select: {
        id: true,
        name: true,
        code: true,
        priceMonthly: true,
        maxUsers: true,
        maxWarehouses: true,
        maxVehicles: true,
        featuresJson: true,
        isActive: true,
      },
    });
    return { plan: plan ?? null };
  }

  @Get("invoices")
  @RequirePermissions(Permissions.BillingRead)
  async getInvoices(@Request() req: any) {
    const tenantId = this.resolveTenantId(req);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planId: true },
    });
    let planName: string | null = null;
    if (tenant?.planId) {
      const planRec = await this.prisma.subscriptionPlan.findUnique({
        where: { id: tenant.planId },
        select: { name: true },
      });
      planName = planRec?.name ?? null;
    }

    const invoices = await this.prisma.getTenantDb().invoice.findMany({
      where: { tenantId },
      orderBy: { issuedAt: "desc" },
    });

    return invoices.map(inv => ({
      id: inv.id,
      planName: planName,
      amount: Number(inv.totalAmount),
      dueDate: inv.dueAt,
      status: inv.status,
    }));
  }

  @Post("payments")
  @RequirePermissions(Permissions.BillingManage)
  async payInvoice(@Request() req: any, @Body() body: TenantPayInvoiceDto) {
    const tenantId = this.resolveTenantId(req);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero");
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: body.invoiceId, tenantId },
        include: { payments: true },
      });
      if (!invoice) {
        throw new NotFoundException("Invoice not found");
      }
      if (invoice.status === "PAID") {
        throw new BadRequestException("Invoice is already paid");
      }

      if (body.transactionId) {
        const duplicate = invoice.payments.find((p: any) => p.transactionId === body.transactionId);
        if (duplicate) {
          return duplicate;
        }
      }

      const alreadyPaidCents = invoice.payments
        .filter((p: any) => p.status !== "FAILED" && p.status !== "REVERSED")
        .reduce((sum: number, p: any) => sum + Math.round(Number(p.amount) * 100), 0);
      const paymentCents = Math.round(amount * 100);
      const invoiceTotalCents = Math.round(Number(invoice.totalAmount) * 100);

      if (alreadyPaidCents + paymentCents > invoiceTotalCents) {
        throw new BadRequestException("Payment amount exceeds remaining invoice balance");
      }

      const payment = await tx.paymentTransaction.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          amount,
          method: body.method,
          transactionId: body.transactionId,
          status: "COMPLETED",
        },
      });

      const nextStatus = alreadyPaidCents + paymentCents >= invoiceTotalCents ? "PAID" : "PARTIAL";
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: nextStatus,
          ...(nextStatus === "PAID" ? { paidAt: new Date() } : {}),
        },
      });

      await this.outbox.enqueue(
        {
          channel: 'KAFKA',
          topic: 'payment.recorded',
          payload: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            tenantId,
            amount,
            method: body.method,
            status: 'COMPLETED',
            invoiceStatus: nextStatus,
          },
        },
        tx,
      );

      return payment;
    });
  }

  @Post("payment-intent")
  @RequirePermissions(Permissions.BillingManage)
  async createPaymentIntent(@Request() req: any, @Body() body: TenantPaymentIntentDto) {
    const tenantId = this.resolveTenantId(req);
    const invoice = await this.prisma.getTenantDb().invoice.findFirst({
      where: { id: body.invoiceId, tenantId },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    const amountCents = Math.round(Number(invoice.totalAmount) * 100);
    const clientSecret = await this.stripeService.createPaymentIntent(amountCents, 'usd', {
      invoiceId: invoice.id,
      tenantId,
    });
    return { clientSecret };
  }
}
