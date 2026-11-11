import { Body, Controller, Get, Patch, Param, Post, Request, UseGuards, NotFoundException, BadRequestException } from "@nestjs/common"
import { IsOptional, IsString } from "class-validator"
import { generateClientTrackingCode } from '../../../core/utils/tracking-code';
import { Permissions, PermissionsGuard, RequirePermissions } from "shared-types"
import { ClientOrderCreateDto } from "../dtos/client-order-create.dto"
import { ClientBulkUploadDto } from "../dtos/client-bulk-upload.dto"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { ApiTags } from "@nestjs/swagger"

class ClientOrderUpdateDto {
  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  recipientAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Client Orders')
@Controller("client/orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientOrdersController {
  constructor(private readonly prisma: PrismaService) {}

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
  @RequirePermissions(Permissions.OrdersRead)
  async list(@Request() req: any) {
    const clientId = await this.getClientId(req);

    return this.prisma.getTenantDb().order.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Get(":id")
  @RequirePermissions(Permissions.OrdersRead)
  async detail(@Param("id") id: string, @Request() req: any) {
    const clientId = await this.getClientId(req);

    const order = await this.prisma.getTenantDb().order.findFirst({
      where: { id, clientId },
      include: { items: true, events: { orderBy: { timestamp: 'desc' } } },
    });

    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  @Patch(":id")
  @RequirePermissions(Permissions.OrdersCreate)
  async update(@Param("id") id: string, @Body() body: ClientOrderUpdateDto, @Request() req: any) {
    const clientId = await this.getClientId(req);

    const order = await this.prisma.getTenantDb().order.findFirst({
      where: { id, clientId },
    });

    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "NEW") throw new BadRequestException("Cannot update order after it has been processed");

    const data: Record<string, any> = {};
    if (body.recipientName !== undefined) data.recipientName = body.recipientName;
    if (body.recipientPhone !== undefined) data.recipientPhone = body.recipientPhone;
    if (body.recipientAddress !== undefined) data.recipientAddress = body.recipientAddress;
    if (body.notes !== undefined) data.notes = body.notes;

    return this.prisma.getTenantDb().order.update({
      where: { id },
      data,
    });
  }

  @Post(":id/cancel")
  @RequirePermissions(Permissions.OrdersCreate)
  async cancel(@Param("id") id: string, @Request() req: any) {
    const clientId = await this.getClientId(req);

    const order = await this.prisma.getTenantDb().order.findFirst({
      where: { id, clientId },
    });

    if (!order) throw new NotFoundException("Order not found");
    if (!['NEW', 'PENDING', 'UNASSIGNED'].includes(order.status)) {
      throw new BadRequestException(`Cannot cancel order in status ${order.status}`);
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const updated = await tx.order.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await tx.orderTrackingEvent.create({
        data: {
          orderId: id,
          status: "CANCELLED",
          location: "Customer Portal",
          description: "Order cancelled by client",
        },
      });
      return updated;
    });
  }

  @Post()
  @RequirePermissions(Permissions.OrdersCreate)
  async create(@Body() body: ClientOrderCreateDto, @Request() req: any) {
    const clientId = await this.getClientId(req);

    if (!body.recipientName || !body.recipientPhone || !body.recipientAddress) {
      throw new BadRequestException("Missing recipient information");
    }

    // Phase 2.1: Use Prisma $transaction to ensure Order and initial Tracking Event are created atomically
    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const newOrder = await tx.order.create({
        data: {
          trackingCode: generateClientTrackingCode(),
          clientId,
          clientOrderRef: body.clientOrderRef,
          status: "NEW",
          recipientName: body.recipientName,
          recipientPhone: body.recipientPhone,
          recipientAddress: body.recipientAddress,
          codAmount: body.codAmount || 0,
          shippingFee: body.shippingFee || 0,
        },
      });

      await tx.orderTrackingEvent.create({
        data: {
          orderId: newOrder.id,
          status: "NEW",
          location: "System",
          description: "Order created via Customer API",
        },
      });

      return newOrder;
    });
  }

  @Post("bulk-upload")
  @RequirePermissions(Permissions.OrdersCreate)
  async bulkUpload(@Body() body: ClientBulkUploadDto, @Request() req: any) {
    const clientId = await this.getClientId(req);
    
    if (!body.orders || !Array.isArray(body.orders) || body.orders.length === 0) {
      throw new BadRequestException("Orders array is empty or invalid");
    }

    // DĂ¹ng transaction Ä‘á»ƒ bulk create, Ä‘áº£m báº£o khĂ´ng lÆ°u 1 ná»­a dá»¯ liá»‡u náº¿u cĂ³ lá»—i
    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const createdOrders: any[] = [];
      let successCount = 0;

      for (const ord of body.orders) {
        if (!ord.recipientName || !ord.recipientPhone || !ord.recipientAddress) {
          throw new BadRequestException(`Order ref ${ord.clientOrderRef} is missing recipient information. Aborting bulk upload.`);
        }

        const newOrder = await tx.order.create({
          data: {
            trackingCode: generateClientTrackingCode(),
            clientId,
            clientOrderRef: ord.clientOrderRef,
            status: "NEW",
            recipientName: ord.recipientName,
            recipientPhone: ord.recipientPhone,
            recipientAddress: ord.recipientAddress,
            codAmount: ord.codAmount || 0,
            shippingFee: ord.shippingFee || 0,
          },
        });
        createdOrders.push(newOrder);
        successCount++;
      }

      return { ok: true, message: `Successfully created ${successCount} orders`, data: createdOrders };
    });
  }
}
