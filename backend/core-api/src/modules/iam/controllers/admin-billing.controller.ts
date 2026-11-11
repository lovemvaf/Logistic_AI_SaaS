import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, NotFoundException, BadRequestException } from "@nestjs/common";
import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, RequireRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from '@nestjs/swagger';

class PlanDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsNumber()
  @Min(0)
  priceMonthly: number;

  @IsNumber()
  @Min(1)
  maxUsers: number;

  @IsNumber()
  @Min(1)
  maxWarehouses: number;

  @IsNumber()
  @Min(1)
  maxVehicles: number;

  @IsOptional()
  @IsString()
  featuresJson?: string;

  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class InvoiceLineItemDto {
  @IsString()
  description: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

class CreateInvoiceDto {
  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  items: InvoiceLineItemDto[];
}

class CreatePaymentDto {
  @IsString()
  tenantId: string;

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

@ApiTags('Admin Billing')
@Controller("admin/billing")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireRoles(Roles.SUPER_ADMIN)
export class AdminBillingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.BillingRead)
  async listInvoicesPaginated(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 15,
  ) {
    try {
      const safePage = Math.max(1, Number(page || 1));
      const safeLimit = Math.min(100, Math.max(1, Number(limit || 15)));
      const skip = (safePage - 1) * safeLimit;
      const take = safeLimit;

      const [data, total, aggregateAll] = await this.prisma.runAsPlatform((db) =>
        Promise.all([
          db.invoice.findMany({
            skip,
            take,
            include: {
              items: true,
              tenant: {
                select: {
                  id: true,
                  name: true,
                  plan: { select: { name: true } },
                },
              },
              client: { select: { id: true, name: true } },
            },
            orderBy: { issuedAt: "desc" },
          }),
          db.invoice.count(),
          db.invoice.aggregate({
            _sum: { totalAmount: true },
          }),
        ]),
      );

      const totalAmount = Number(aggregateAll?._sum?.totalAmount ?? 0);

      return {
        data: data.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          tenant: inv.tenant?.name || "N/A",
          plan: inv.tenant?.plan?.name || "—",
          amount: `$${Number(inv.totalAmount).toFixed(2)}`,
          rawAmount: Number(inv.totalAmount),
          issuedAt: inv.issuedAt?.toISOString().split("T")[0] || "—",
          status: inv.status,
        })),
        meta: {
          total,
          page: safePage,
          limit: take,
          totalPages: Math.max(1, Math.ceil(total / take)),
          mrr: totalAmount,
        },
      };
    } catch (error) {
      throw new BadRequestException("Failed to fetch invoices");
    }
  }

  @Get("plans")
  @RequirePermissions(Permissions.BillingRead)
  async listPlans() {
    try {
      return await this.prisma.subscriptionPlan.findMany();
    } catch (error) {
      throw new BadRequestException("Failed to fetch plans");
    }
  }

  @Post("plans")
  @RequirePermissions(Permissions.PlansManage)
  async createPlan(@Body() body: PlanDto) {
    try {
      return await this.prisma.subscriptionPlan.create({ data: body });
    } catch (error) {
      throw new BadRequestException("Failed to create plan");
    }
  }

  @Put("plans/:id")
  @RequirePermissions(Permissions.PlansManage)
  async updatePlan(@Param("id") id: string, @Body() body: Partial<PlanDto>) {
    try {
      return await this.prisma.subscriptionPlan.update({ where: { id }, data: body });
    } catch (error) {
      throw new NotFoundException("Plan not found");
    }
  }

  @Delete("plans/:id")
  @RequirePermissions(Permissions.PlansManage)
  async deletePlan(@Param("id") id: string) {
    try {
      return await this.prisma.subscriptionPlan.delete({ where: { id } });
    } catch (error) {
      throw new NotFoundException("Plan not found");
    }
  }

  @Get("invoices")
  @RequirePermissions(Permissions.BillingRead)
  async listInvoices() {
    try {
      return await this.prisma.runAsPlatform<any>((db) =>
        db.invoice.findMany({ include: { items: true, tenant: true, client: true } }),
      );
    } catch (error) {
      throw new BadRequestException("Failed to fetch invoices");
    }
  }

  @Post("invoices")
  @RequirePermissions(Permissions.BillingManage)
  async createInvoice(@Body() body: CreateInvoiceDto) {
    if (!body.items || body.items.length === 0) {
      throw new BadRequestException("Invoice must have at least one item");
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: body.tenantId } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const lineItems = body.items.map(i => {
      const unitPrice = Number(i.unitPrice);
      const quantity = Number(i.quantity);
      if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(quantity) || quantity < 1) {
        throw new BadRequestException("Invalid line item quantity or unit price");
      }
      return {
        tenantId: body.tenantId,
        description: i.description,
        quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * quantity * 100) / 100,
      };
    });
    const totalAmount = Math.round(lineItems.reduce((sum, li) => sum + li.lineTotal, 0) * 100) / 100;

    return this.prisma.runAsPlatform<any>((db) =>
      db.invoice.create({
        data: {
          tenantId: body.tenantId,
          clientId: body.clientId,
          invoiceNumber: `INV-${Date.now()}`,
          totalAmount,
          status: "UNPAID",
          items: { create: lineItems },
        },
        include: { items: true },
      }),
    );
  }

  @Post("payments")
  @RequirePermissions(Permissions.BillingManage)
  async createPayment(@Body() body: CreatePaymentDto) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero");
    }

    return this.prisma.runAsPlatform<any>((db) =>
      db.$transaction(async (tx: any) => {
        const invoice = await tx.invoice.findUnique({
          where: { id: body.invoiceId },
          include: { payments: true },
        });
        if (!invoice || invoice.tenantId !== body.tenantId) {
          throw new NotFoundException("Invoice not found for tenant");
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
            tenantId: body.tenantId,
            invoiceId: body.invoiceId,
            amount,
            method: body.method,
            transactionId: body.transactionId,
            status: "COMPLETED",
          },
        });

        const nextStatus = alreadyPaidCents + paymentCents >= invoiceTotalCents ? "PAID" : "PARTIAL";
        await tx.invoice.update({
          where: { id: body.invoiceId },
          data: {
            status: nextStatus,
            ...(nextStatus === "PAID" ? { paidAt: new Date() } : {}),
          },
        });

        return payment;
      }),
    );
  }
}
