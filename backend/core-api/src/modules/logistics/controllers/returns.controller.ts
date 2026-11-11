import { Body, Controller, Get, Param, Post, Query, UseGuards, Logger, InternalServerErrorException, NotFoundException, BadRequestException, HttpException } from "@nestjs/common";
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from "shared-types";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { LogisticsService } from "../services/logistics.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Returns')
@Controller("logistics/returns")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class ReturnsController {
  private readonly logger = new Logger("ReturnsController");

  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsService: LogisticsService
  ) {}

  @Get()
  @RequirePermissions(Permissions.ReturnsRead)
  async listReturnRequests(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 20,
    @Query("status") status?: string
  ) {
    try {
      const safePage = Math.max(1, Number(page) || 1);
      const take = Math.min(Math.max(1, Number(limit) || 20), 100);
      const skip = (safePage - 1) * take;
      const where: any = {};
      if (status) where.status = status;

      const [data, total] = await Promise.all([
        this.prisma.getTenantDb().returnRequest.findMany({
          where,
          skip,
          take,
          include: {
            order: { select: { trackingCode: true, recipientName: true } },
            reason: true,
            items: true,
            pickupDriver: { include: { user: { select: { fullName: true } } } },
          },
          orderBy: { createdAt: "desc" }
        }),
        this.prisma.getTenantDb().returnRequest.count({ where })
      ]);

      return {
        data,
        meta: { total, page: safePage, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) }
      };
    } catch (error) {
      this.logger.error(`Failed to list return requests: ${error instanceof Error ? error.message : "Unknown"}`);
      throw new InternalServerErrorException("Failed to list return requests");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.ReturnsRead)
  async getReturnRequest(@Param("id") id: string) {
    try {
      const request = await this.prisma.getTenantDb().returnRequest.findUnique({
        where: { id },
        include: {
          order: true,
          reason: true,
          items: { include: { orderItem: { include: { product: true } } } },
          inspections: true,
          refunds: true,
          pickupTrip: true,
          pickupDriver: { include: { user: true } },
        }
      });
      if (!request) throw new NotFoundException(`Return request ${id} not found`);
      return request;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to fetch return request");
    }
  }

  @Post(":id/create-pickup-trip")
  @RequirePermissions(Permissions.ReturnsApprove)
  async createPickupTrip(
    @Param("id") id: string,
    @Body() body: { driverId: string; vehicleId?: string; scheduledAt?: string }
  ) {
    try {
      const db = this.prisma.getTenantDb();
      const request = await db.returnRequest.findUnique({
        where: { id },
        include: { order: true, items: true }
      });
      if (!request) throw new NotFoundException(`Return request ${id} not found`);
      if (request.status !== "APPROVED" && request.status !== "PICKUP_SCHEDULED") {
        throw new BadRequestException(`Cannot create pickup trip for return with status ${request.status}`);
      }
      if (!body.driverId) {
        throw new BadRequestException("driverId is required");
      }

      const driver = await db.driver.findUnique({ where: { id: body.driverId } });
      if (!driver) throw new NotFoundException(`Driver ${body.driverId} not found`);

      if (body.vehicleId) {
        const vehicle = await db.vehicle.findUnique({ where: { id: body.vehicleId } });
        if (!vehicle) throw new NotFoundException(`Vehicle ${body.vehicleId} not found`);
      }

      return await db.$transaction(async (tx: any) => {
        const trip = await tx.trip.create({
          data: {
            tripCode: `RMA-${request.returnCode}`,
            status: "NEW",
            driverId: body.driverId,
            vehicleId: body.vehicleId,
            metadata: JSON.stringify({ returnRequestId: id, type: "return_pickup" })
          }
        });

        await tx.returnRequest.update({
          where: { id },
          data: {
            pickupTripId: trip.id,
            pickupDriverId: body.driverId,
            pickupScheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
            status: "PICKUP_SCHEDULED"
          }
        });

        return trip;
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to create pickup trip: ${error instanceof Error ? error.message : "Unknown"}`);
      throw new InternalServerErrorException("Failed to create pickup trip");
    }
  }

  @Post(":id/confirm-pickup")
  @RequirePermissions(Permissions.ReturnsApprove)
  async confirmPickup(@Param("id") id: string) {
    try {
      const request = await this.prisma.getTenantDb().returnRequest.findUnique({
        where: { id },
        include: { pickupTrip: true, order: true }
      });
      if (!request) throw new NotFoundException(`Return request ${id} not found`);
      if (request.status !== "PICKUP_SCHEDULED" && request.status !== "APPROVED") {
        throw new BadRequestException(`Cannot confirm pickup for return with status ${request.status}`);
      }

      return await this.prisma.getTenantDb().$transaction(async (tx: any) => {
        const claimed = await tx.returnRequest.updateMany({
          where: { id, status: { in: ["PICKUP_SCHEDULED", "APPROVED"] } },
          data: { status: "PICKED_UP", pickedUpAt: new Date() }
        });
        if (claimed.count === 0) {
          throw new BadRequestException(`Return request ${id} pickup was already confirmed`);
        }

        if (request.pickupTripId) {
          await tx.trip.update({
            where: { id: request.pickupTripId },
            data: { status: "COMPLETED", returnTime: new Date() }
          });
        }

        await tx.orderTrackingEvent.create({
          data: {
            orderId: request.orderId,
            status: "RETURN_PICKED_UP",
            description: `Items picked up for return ${request.returnCode}`
          }
        });

        return tx.returnRequest.findUnique({ where: { id } });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to confirm pickup: ${error instanceof Error ? error.message : "Unknown"}`);
      throw new InternalServerErrorException("Failed to confirm pickup");
    }
  }

  @Post(":id/complete-return")
  @RequirePermissions(Permissions.ReturnsInspect)
  async completeReturn(
    @Param("id") id: string,
    @Body() body: { warehouseId: string; binId?: string }
  ) {
    try {
      const request = await this.prisma.getTenantDb().returnRequest.findUnique({
        where: { id },
        include: { order: { include: { items: true } }, items: true }
      });
      if (!request) throw new NotFoundException(`Return request ${id} not found`);
      if (request.status !== "INSPECTED" && request.status !== "PICKED_UP") {
        throw new BadRequestException(`Cannot complete return with status ${request.status}`);
      }

      return await this.prisma.getTenantDb().$transaction(async (tx: any) => {
        // Atomic transition guard prevents double-restocking on concurrent requests
        const claimed = await tx.returnRequest.updateMany({
          where: { id, status: { in: ["INSPECTED", "PICKED_UP"] } },
          data: { status: "CLOSED" }
        });
        if (claimed.count === 0) {
          throw new BadRequestException(`Return request ${id} was already completed`);
        }

        for (const returnItem of request.items) {
          const qtyToReturn = Number(returnItem.quantityApproved ?? 0);
          if (!Number.isInteger(qtyToReturn) || qtyToReturn <= 0) continue;

          const matchingOrderItem = await tx.orderItem.findFirst({
            where: returnItem.orderItemId
              ? { id: returnItem.orderItemId, orderId: request.orderId }
              : { orderId: request.orderId, productId: returnItem.productId }
          });
          if (!matchingOrderItem) continue;

          const remainingReturnable = Math.max(0, matchingOrderItem.quantity - matchingOrderItem.returnedQuantity);
          const safeIncrement = Math.min(qtyToReturn, remainingReturnable);
          if (safeIncrement > 0) {
            await tx.orderItem.update({
              where: { id: matchingOrderItem.id },
              data: { returnedQuantity: { increment: safeIncrement } }
            });
          }
        }

        await tx.orderTrackingEvent.create({
          data: {
            orderId: request.orderId,
            status: "RETURNED",
            description: `Return ${request.returnCode} completed at warehouse ${body.warehouseId}`
          }
        });

        return tx.returnRequest.findUnique({ where: { id } });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to complete return: ${error instanceof Error ? error.message : "Unknown"}`);
      throw new InternalServerErrorException("Failed to complete return");
    }
  }

  @Post(":id/inspect")
  @RequirePermissions(Permissions.ReturnsInspect)
  async inspectReturn(
    @Param("id") id: string,
    @Body() body: { condition?: string; damageNotes?: string; imagesJson?: string; approvedRefund?: number; warehouseId?: string; binId?: string },
  ) {
    const db = this.prisma.getTenantDb();
    const request = await db.returnRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Return request ${id} not found`);
    if (!["PICKED_UP", "IN_TRANSIT", "APPROVED", "PENDING"].includes(request.status)) {
      throw new BadRequestException(`Cannot inspect return in status ${request.status}`);
    }

    return db.$transaction(async (tx: any) => {
      await tx.returnInspection.create({
        data: {
          returnRequestId: id,
          condition: body?.condition || "GOOD",
          damageNotes: body?.damageNotes || null,
          imagesJson: body?.imagesJson || null,
          approvedRefund: body?.approvedRefund !== undefined ? Number(body.approvedRefund) : null,
          warehouseId: body?.warehouseId || null,
          binId: body?.binId || null,
        },
      });
      return tx.returnRequest.update({
        where: { id },
        data: { status: "INSPECTED" },
        include: { items: true, inspections: true },
      });
    });
  }

  @Post(":id/refund")
  @RequirePermissions(Permissions.ReturnsRefund)
  async refundReturn(
    @Param("id") id: string,
    @Body() body: { amount?: number; reason?: string; method?: string; invoiceId?: string },
  ) {
    const db = this.prisma.getTenantDb();
    const request = await db.returnRequest.findUnique({
      where: { id },
      include: { items: true, inspections: true, refunds: true },
    });
    if (!request) throw new NotFoundException(`Return request ${id} not found`);
    if (!["INSPECTED", "APPROVED", "CLOSED", "PICKED_UP"].includes(request.status)) {
      throw new BadRequestException(`Cannot refund return in status ${request.status}`);
    }

    const latestInspectionRefund = Number(request.inspections?.[request.inspections.length - 1]?.approvedRefund || 0);
    const itemsTotal = (request.items || []).reduce(
      (s: number, it: any) => s + Number(it.unitRefundAmount || 0) * Number(it.quantityApproved || it.quantityRequested || 1),
      0,
    );
    const amount = Number(body?.amount ?? (latestInspectionRefund || itemsTotal));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Refund amount must be a positive number");
    }

    return db.$transaction(async (tx: any) => {
      const refund = await tx.refund.create({
        data: {
          returnRequestId: id,
          invoiceId: body?.invoiceId || null,
          amount,
          method: body?.method || "ORIGINAL",
          status: "PROCESSED",
          notes: body?.reason || null,
          processedAt: new Date(),
        },
      });
      await tx.returnRequest.update({
        where: { id },
        data: { status: "REFUNDED" },
      });
      return refund;
    });
  }
}
