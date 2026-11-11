import { Body, Controller, Get, Param, Post, UseGuards, NotFoundException, BadRequestException, Request } from "@nestjs/common"
import { Permissions, PermissionsGuard, RequirePermissions } from "shared-types"
import { InvoicePayDto } from "../dtos/invoice-pay.dto"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { OutboxService } from "../../../core/outbox/outbox.service"
import { ApiTags } from "@nestjs/swagger"

@ApiTags('Client Invoices')
@Controller("client/invoices")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientInvoicesController {
  constructor(private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private async getClientId(req: any): Promise<string> {
    const email = req.user?.email;
    if (!email) throw new NotFoundException("User email not found in token");
    
    const clientUser = await this.prisma.getTenantDb().clientUser.findFirst({
      where: { email },
    });

    if (!clientUser) {
      throw new NotFoundException("Client account not found for this user");
    }

    return clientUser.clientId;
  }

  @Get()
  @RequirePermissions(Permissions.BillingRead)
  async list(@Request() req: any) {
    const clientId = await this.getClientId(req);
    const invoices = await this.prisma.getTenantDb().invoice.findMany({
      where: { clientId },
      include: { items: true, payments: true },
      orderBy: { issuedAt: 'desc' },
      take: 50,
    });

    return invoices.map((inv: any) => {
      const paidAmount = (inv.payments || [])
        .filter((p: any) => p.status === 'COMPLETED')
        .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      return {
        ...inv,
        totalAmount: Number(inv.totalAmount),
        paidAmount,
      };
    });
  }

  @Post(":id/pay")
  @RequirePermissions(Permissions.BillingRead)
  async pay(@Param("id") id: string, @Body() body: InvoicePayDto | undefined, @Request() req: any) {
    return this.recordPaymentInternal(id, body, req);
  }

  @Post(":id/payments")
  @RequirePermissions(Permissions.BillingRead)
  async recordPayment(
    @Param("id") id: string,
    @Body() body: (InvoicePayDto & { amount?: number }) | undefined,
    @Request() req: any,
  ) {
    return this.recordPaymentInternal(id, body, req);
  }

  private async recordPaymentInternal(
    id: string,
    body: (InvoicePayDto & { amount?: number }) | undefined,
    req: any,
  ) {
    const clientId = await this.getClientId(req);

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, clientId },
        include: { payments: true },
      });

      if (!invoice) {
        throw new NotFoundException("Invoice not found");
      }

      if (invoice.status === 'PAID' || invoice.status === 'VOID') {
        throw new BadRequestException("Invoice is already paid");
      }

      const alreadyPaidCents = (invoice.payments || [])
        .filter((p: any) => p.status === 'COMPLETED')
        .reduce((sum: number, p: any) => sum + Math.round(Number(p.amount || 0) * 100), 0);
      const totalCents = Math.round(Number(invoice.totalAmount) * 100);
      const remainingCents = Math.max(0, totalCents - alreadyPaidCents);
      if (remainingCents <= 0) {
        throw new BadRequestException("Invoice is already settled");
      }

      const requestedAmount = body?.amount !== undefined ? Number(body.amount) : remainingCents / 100;
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw new BadRequestException("Payment amount must be greater than zero");
      }

      const payCents = Math.round(requestedAmount * 100);
      if (payCents > remainingCents) {
        throw new BadRequestException("Payment amount exceeds remaining balance");
      }

      const payment = await tx.paymentTransaction.create({
        data: {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          amount: payCents / 100,
          method: body?.method || 'CARD',
          status: 'COMPLETED',
          transactionId: `TXN-${Date.now()}`,
        },
      });

      const paidAfterCents = alreadyPaidCents + payCents;
      const fullyPaid = paidAfterCents >= totalCents;
      const nextStatus = fullyPaid ? 'PAID' : 'PARTIAL';

      await tx.invoice.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(fullyPaid ? { paidAt: new Date() } : {}),
        },
      });

      // Outbox: ghi sự kiện thanh toán trong cùng transaction.
      await this.outbox.enqueue(
        {
          channel: 'KAFKA',
          topic: 'payment.recorded',
          payload: {
            paymentId: payment.id,
            invoiceId: id,
            tenantId: invoice.tenantId,
            amount: payCents / 100,
            paidAmount: paidAfterCents / 100,
            method: body?.method || 'CARD',
            status: 'COMPLETED',
            invoiceStatus: nextStatus,
          },
        },
        tx,
      );

      return {
        ok: true,
        payment,
        paidAmount: paidAfterCents / 100,
        status: nextStatus,
      };
    });
  }
}

