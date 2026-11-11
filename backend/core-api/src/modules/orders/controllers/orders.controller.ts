import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, InternalServerErrorException, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { OutboxService } from '../../../core/outbox/outbox.service';
import { generateTrackingCode } from '../../../core/utils/tracking-code';
import { ApiTags } from "@nestjs/swagger";

class OrderItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

class CreateOrderDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientOrderRef?: string;

  @IsString()
  recipientName!: string;

  @IsString()
  recipientPhone!: string;

  @IsString()
  recipientAddress!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingFee?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

class UpdateOrderDto {
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
  @IsNumber()
  @Min(0)
  codAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingFee?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

const CANCELLABLE_ORDER_STATUSES = new Set([
  'NEW',
  'PENDING',
  'UNASSIGNED',
  'PICKING',
  'PACKED',
  'DISPATCHED',
]);

@ApiTags("Orders")
@Controller("orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class OrdersController {
  private readonly logger = new Logger('OrdersController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  @Post()
  @RequirePermissions(Permissions.OrdersCreate)
  async createOrder(@Body() body: CreateOrderDto) {
    if (!body.items || body.items.length === 0) {
      throw new BadRequestException("Order must have at least one item");
    }

    // Mã tracking phải duy nhất toàn cục và không đoán được (khách chỉ có
    // mã để tra cứu) => 6 ký tự base32 thay vì 5 chữ số.
    const trackingCode = generateTrackingCode();

    try {
      const createdOrder = await this.prisma.getTenantDb().$transaction(async (tx: any) => {
        const order = await tx.order.create({
          data: {
            trackingCode,
            clientId: body.clientId,
            clientOrderRef: body.clientOrderRef,
            status: "NEW",
            recipientName: body.recipientName,
            recipientPhone: body.recipientPhone,
            recipientAddress: body.recipientAddress,
            codAmount: body.codAmount || 0,
            shippingFee: body.shippingFee || 0,
            items: {
              create: body.items
            }
          }
        });

        await tx.orderTrackingEvent.create({
          data: {
            orderId: order.id,
            status: 'NEW',
            location: 'System',
            description: 'Order created via API',
          }
        });

        // Outbox: event được ghi trong cùng transaction với đơn hàng. Worker
        // gửi đi sau khi commit nên không bao giờ có event cho đơn hàng đã
        // rollback, và cũng không mất event khi commit thành công.
        await this.outbox.enqueue(
          {
            channel: 'KAFKA',
            topic: 'order.created',
            payload: {
              id: order.id,
              trackingCode: order.trackingCode,
              clientId: order.clientId,
              status: order.status,
              recipientName: order.recipientName,
              shippingFee: order.shippingFee,
              createdAt: order.createdAt,
            },
          },
          tx,
        );

        return order;
      });

      return createdOrder;
    } catch (error) {
      this.logger.error(`Failed to create order: ${error instanceof Error ? error.message : 'Unknown'}`);
      throw new InternalServerErrorException('Failed to create order');
    }
  }

  @Get()
  @RequirePermissions(Permissions.OrdersRead)
  async listOrders(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 20,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    try {
      const safePage = Math.max(1, Number(page || 1));
      const safeLimit = Math.min(100, Math.max(1, Number(limit || 20)));
      const skip = (safePage - 1) * safeLimit;
      const take = safeLimit;

      const where: any = {};
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { trackingCode: { contains: search, mode: "insensitive" } },
          { recipientName: { contains: search, mode: "insensitive" } },
          { recipientPhone: { contains: search } },
        ];
      }

      const [data, total] = await Promise.all([
        this.prisma.getTenantDb().order.findMany({
          where,
          skip,
          take,
          include: { items: true },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.getTenantDb().order.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page: safePage,
          limit: take,
          totalPages: Math.max(1, Math.ceil(total / take)),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch orders: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      throw new InternalServerErrorException("Failed to fetch orders");
    }
  }

  @Get("track/:code")
  @RequirePermissions(Permissions.OrdersRead)
  async trackByCode(@Param("code") code: string) {
    try {
      const order = await this.prisma.getTenantDb().order.findFirst({
        where: { trackingCode: code },
        include: { items: true, events: { orderBy: { timestamp: "desc" } } },
      });
      if (!order) throw new NotFoundException(`Order ${code} not found`);
      return order;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to fetch order tracking");
    }
  }

  @Post("assign-trip")
  @RequirePermissions(Permissions.OrdersCreate)
  async assignTrip(@Body() body: { orderIds: string[]; tripId: string }) {
    const orderIds = Array.isArray(body?.orderIds) ? body.orderIds.filter(Boolean) : [];
    if (orderIds.length === 0 || !body?.tripId) {
      throw new BadRequestException("orderIds and tripId are required");
    }

    try {
      const db = this.prisma.getTenantDb();
      const trip = await db.trip.findUnique({ where: { id: body.tripId } });
      if (!trip) throw new NotFoundException(`Trip ${body.tripId} not found`);

      return await db.$transaction(async (tx: any) => {
        const orders = await tx.order.findMany({ where: { id: { in: orderIds } } });
        if (orders.length === 0) throw new NotFoundException("No matching orders found");

        await tx.order.updateMany({
          where: { id: { in: orders.map((o: any) => o.id) } },
          data: {
            status: "DISPATCHED",
            ...(trip.driverId ? { driverId: trip.driverId } : {}),
          },
        });

        let seq = await tx.tripStop.count({ where: { tripId: trip.id } });
        for (const ord of orders) {
          seq += 1;
          await tx.tripStop.create({
            data: {
              tripId: trip.id,
              orderId: ord.id,
              stopType: "DELIVERY",
              sequence: seq,
              address: ord.recipientAddress,
              status: "PENDING",
            },
          });
          await tx.orderTrackingEvent.create({
            data: {
              orderId: ord.id,
              status: "DISPATCHED",
              location: "Dispatch",
              description: `Assigned to trip ${trip.tripCode}`,
            },
          });
        }

        return { ok: true, tripId: trip.id, assignedCount: orders.length };
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException("Failed to assign orders to trip");
    }
  }

  @Get(":id/live")
  @RequirePermissions(Permissions.OrdersRead)
  async getLiveTracking(@Param("id") id: string) {
    try {
      const db = this.prisma.getTenantDb();
      const order = await db.order.findFirst({
        where: { OR: [{ id }, { trackingCode: id }] },
        include: { events: { orderBy: { timestamp: "desc" }, take: 15 } },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      const delivery = await db.delivery.findFirst({
        where: { orderId: order.id },
        orderBy: { syncVersion: "desc" },
      });
      return {
        orderId: order.id,
        trackingCode: order.trackingCode,
        status: order.status,
        lat: delivery?.checkinLat ?? order.lat ?? null,
        lng: delivery?.checkinLng ?? order.lng ?? null,
        eta: order.estimatedDeliveryDate ?? null,
        actualDeliveryTime: order.actualDeliveryTime ?? null,
        events: order.events || [],
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to fetch live tracking");
    }
  }

  @Get(":id/sla")
  @RequirePermissions(Permissions.OrdersRead)
  async getSla(@Param("id") id: string) {
    try {
      const order = await this.prisma.getTenantDb().order.findFirst({
        where: { OR: [{ id }, { trackingCode: id }] },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      const deadline = order.estimatedDeliveryDate
        ? new Date(order.estimatedDeliveryDate)
        : new Date(new Date(order.createdAt).getTime() + 48 * 3600 * 1000);
      const completedAt = order.actualDeliveryTime ? new Date(order.actualDeliveryTime) : new Date();
      const remainingMinutes = Math.round((deadline.getTime() - completedAt.getTime()) / 60000);
      return {
        orderId: order.id,
        trackingCode: order.trackingCode,
        status: order.status,
        promisedAt: deadline.toISOString(),
        deliveredAt: order.actualDeliveryTime ?? null,
        onTrack: remainingMinutes >= 0,
        remainingMinutes,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to evaluate order SLA");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.OrdersRead)
  async getOrder(@Param("id") id: string) {
    try {
      const order = await this.prisma.getTenantDb().order.findUnique({
        where: { id },
        include: { items: true, events: { orderBy: { timestamp: "desc" } } },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      return order;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to fetch order");
    }
  }

  @Patch(":id")
  @RequirePermissions(Permissions.OrdersCreate)
  async updateOrder(
    @Param("id") id: string,
    @Body() body: UpdateOrderDto,
  ) {
    try {
      const order = await this.prisma.getTenantDb().order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (['CANCELLED', 'DELIVERED', 'RETURNED'].includes(order.status)) {
        throw new BadRequestException(`Cannot update order in terminal status ${order.status}`);
      }

      const data: Record<string, any> = {};
      if (body.recipientName !== undefined) data.recipientName = body.recipientName;
      if (body.recipientPhone !== undefined) data.recipientPhone = body.recipientPhone;
      if (body.recipientAddress !== undefined) data.recipientAddress = body.recipientAddress;
      if (body.notes !== undefined) data.notes = body.notes;
      if (body.codAmount !== undefined) {
        if (!Number.isFinite(Number(body.codAmount)) || Number(body.codAmount) < 0) {
          throw new BadRequestException("codAmount must be non-negative");
        }
        data.codAmount = Number(body.codAmount);
      }
      if (body.shippingFee !== undefined) {
        if (!Number.isFinite(Number(body.shippingFee)) || Number(body.shippingFee) < 0) {
          throw new BadRequestException("shippingFee must be non-negative");
        }
        data.shippingFee = Number(body.shippingFee);
      }

      const updated = await this.prisma.getTenantDb().order.update({
        where: { id },
        data,
      });
      await this.outbox.enqueue({
        channel: 'KAFKA',
        topic: 'order.updated',
        payload: updated,
      });
      return updated;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException("Failed to update order");
    }
  }

  @Post(":id/cancel")
  @RequirePermissions(Permissions.OrdersCreate)
  async cancelOrder(@Param("id") id: string) {
    try {
      const order = await this.prisma.getTenantDb().order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (!CANCELLABLE_ORDER_STATUSES.has(order.status)) {
        throw new BadRequestException(`Cannot cancel order in status ${order.status}`);
      }
      const cancelled = await this.prisma.getTenantDb().$transaction(async (tx: any) => {
        const updated = await tx.order.update({
          where: { id },
          data: { status: 'CANCELLED' },
        });
        await tx.orderTrackingEvent.create({
          data: {
            orderId: id,
            status: 'CANCELLED',
            location: 'System',
            description: 'Order cancelled',
          },
        });
        await this.outbox.enqueue(
          {
            channel: 'KAFKA',
            topic: 'order.cancelled',
            payload: updated,
          },
          tx,
        );
        return updated;
      });
      return cancelled;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException("Failed to cancel order");
    }
  }

  @Post(":id/status")
  @RequirePermissions(Permissions.OrdersCreate)
  async advanceStatus(
    @Param("id") id: string,
    @Body() body: { status: string; label?: string; location?: string },
  ) {
    if (!body?.status) {
      throw new BadRequestException("status is required");
    }
    try {
      const db = this.prisma.getTenantDb();
      const existing = await db.order.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Order ${id} not found`);

      return await db.$transaction(async (tx: any) => {
        const updated = await tx.order.update({
          where: { id },
          data: {
            status: body.status,
            ...(body.status === "DELIVERED" ? { actualDeliveryTime: new Date() } : {}),
          },
        });
        await tx.orderTrackingEvent.create({
          data: {
            orderId: id,
            status: body.status,
            location: body.location || "Operations",
            description: body.label || `Order moved to ${body.status}`,
          },
        });
        await this.outbox.enqueue(
          { channel: "KAFKA", topic: "order.status_updated", payload: updated },
          tx,
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException("Failed to advance order status");
    }
  }

  @Post(":id/partial")
  @RequirePermissions(Permissions.OrdersCreate)
  async partialShipment(@Param("id") id: string, @Body() body: { note?: string }) {
    try {
      const db = this.prisma.getTenantDb();
      const existing = await db.order.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Order ${id} not found`);

      return await db.$transaction(async (tx: any) => {
        const updated = await tx.order.update({
          where: { id },
          data: {
            status: "PARTIAL_DELIVERED",
            notes: body?.note || existing.notes,
          },
        });
        await tx.orderTrackingEvent.create({
          data: {
            orderId: id,
            status: "PARTIAL_DELIVERED",
            location: "Operations",
            description: body?.note || "Partial shipment recorded",
          },
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to record partial shipment");
    }
  }

  @Patch(":id/reschedule")
  @RequirePermissions(Permissions.OrdersCreate)
  async rescheduleOrder(
    @Param("id") id: string,
    @Body() body: { promisedAt: string; reason?: string },
  ) {
    const promised = body?.promisedAt ? new Date(body.promisedAt) : null;
    if (!promised || Number.isNaN(promised.getTime())) {
      throw new BadRequestException("Valid promisedAt ISO date is required");
    }
    try {
      const db = this.prisma.getTenantDb();
      const existing = await db.order.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Order ${id} not found`);

      return await db.$transaction(async (tx: any) => {
        const updated = await tx.order.update({
          where: { id },
          data: { estimatedDeliveryDate: promised },
        });
        await tx.orderTrackingEvent.create({
          data: {
            orderId: id,
            status: existing.status,
            location: "Operations",
            description: body.reason
              ? `Rescheduled to ${promised.toISOString()}: ${body.reason}`
              : `Rescheduled to ${promised.toISOString()}`,
          },
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException("Failed to reschedule order");
    }
  }

  @Get(":id/tracking")
  @RequirePermissions(Permissions.OrdersRead)
  async getTracking(@Param("id") id: string) {
    try {
      const order = await this.prisma.getTenantDb().order.findUnique({
        where: { id },
        select: { id: true }
      });

      if (!order) {
        throw new NotFoundException(`Order with ID ${id} not found.`);
      }

      return this.prisma.getTenantDb().orderTrackingEvent.findMany({ 
        where: { orderId: id }, 
        orderBy: { timestamp: 'desc' } 
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to fetch tracking");
    }
  }
}
