import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  Request,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { IdempotencyInterceptor } from "../../../core/http/idempotency.interceptor";
import { LogisticsService } from "../services/logistics.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Driver App')
@Controller("driver-app")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
@UseInterceptors(IdempotencyInterceptor)
export class DriverAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsService: LogisticsService
  ) {}

  private async getDriverOrThrow(userId?: string) {
    if (!userId) {
      throw new ForbiddenException("Missing user context");
    }
    const driver = await this.prisma.getTenantDb().driver.findUnique({
      where: { userId },
    });
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }
    return driver;
  }

  @Get("profile")
  @RequirePermissions(Permissions.TripsRead)
  async getProfile(@Request() req: any) {
    const driver = await this.prisma.getTenantDb().driver.findUnique({
      where: { userId: req.user?.sub },
      include: { user: { select: { id: true, email: true, fullName: true, phone: true } } },
    });
    if (!driver) throw new NotFoundException("Driver not found");
    return {
      id: driver.id,
      userId: driver.userId,
      fullName: driver.user.fullName,
      email: driver.user.email,
      phone: driver.user.phone,
      licenseClass: driver.licenseClass,
      licenseExpiry: driver.licenseExpiry,
      status: driver.status,
    };
  }

  @Post("deliveries/:id/check-in")
  @RequirePermissions(Permissions.MobileUploads)
  async checkIn(
    @Param("id") id: string,
    @Body() body: { lat: number; lng: number },
    @Request() req: any,
  ) {
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException("Valid lat (-90..90) and lng (-180..180) are required");
    }

    const db = this.prisma.getTenantDb();
    const driver = await this.getDriverOrThrow(req.user?.sub);
    const delivery = await db.delivery.findUnique({
      where: { id },
      include: { trip: true },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${id} not found`);
    }
    if (delivery.driverId !== driver.id && delivery.trip?.driverId !== driver.id) {
      throw new ForbiddenException("Delivery does not belong to this driver");
    }
    if (["DELIVERED", "COMPLETED", "CANCELLED"].includes(delivery.status)) {
      throw new BadRequestException(`Cannot check in delivery in status ${delivery.status}`);
    }

    return db.delivery.update({
      where: { id },
      data: {
        checkinLat: lat,
        checkinLng: lng,
        status: "ARRIVED",
      },
    });
  }

  @Post("deliveries/:id/complete")
  @RequirePermissions(Permissions.MobileUploads)
  async completeDelivery(
    @Param("id") id: string,
    @Body() body: { codCollected: number; podUrl?: string; syncVersion: number },
    @Request() req: any,
  ) {
    const driver = await this.getDriverOrThrow(req.user?.sub);
    return this.logisticsService.completeDelivery(id, body, driver.id);
  }

  @Post("expenses")
  @RequirePermissions(Permissions.MobileUploads)
  async reportExpense(@Body() body: any, @Request() req: any) {
    const driver = await this.getDriverOrThrow(req.user?.sub);
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Expense amount must be a positive number");
    }
    if (!body?.category || typeof body.category !== "string") {
      throw new BadRequestException("Expense category is required");
    }

    const db = this.prisma.getTenantDb();
    if (body?.tripId) {
      const trip = await db.trip.findUnique({ where: { id: String(body.tripId) } });
      if (!trip) throw new NotFoundException(`Trip ${body.tripId} not found`);
      if (trip.driverId !== driver.id) {
        throw new ForbiddenException("Trip does not belong to this driver");
      }
    }

    return db.driverExpense.create({
      data: {
        driverId: driver.id,
        tripId: body.tripId ? String(body.tripId) : null,
        amount,
        category: String(body.category).trim().slice(0, 50),
        note: body.note ? String(body.note).slice(0, 500) : null,
      },
    });
  }

  @Post("sos")
  @RequirePermissions(Permissions.MobileSos)
  async triggerSos(@Body() body: any, @Request() req: any) {
    const driver = await this.getDriverOrThrow(req.user?.sub);
    const db = this.prisma.getTenantDb();

    if (body?.tripId) {
      const trip = await db.trip.findUnique({ where: { id: String(body.tripId) } });
      if (!trip) throw new NotFoundException(`Trip ${body.tripId} not found`);
      if (trip.driverId !== driver.id) {
        throw new ForbiddenException("Trip does not belong to this driver");
      }
    }

    const lat = body?.lat !== undefined ? Number(body.lat) : null;
    const lng = body?.lng !== undefined ? Number(body.lng) : null;
    const baseMsg = String(body?.message || "Driver Emergency - SOS Triggered").trim().slice(0, 255);
    const coordSuffix =
      lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)
        ? ` [${lat.toFixed(5)}, ${lng.toFixed(5)}]`
        : "";

    return db.sosAlert.create({
      data: {
        driverId: driver.id,
        tripId: body?.tripId ? String(body.tripId) : null,
        message: `${baseMsg}${coordSuffix}`.slice(0, 300),
      },
    });
  }

  @Post("remittance")
  @RequirePermissions(Permissions.MobileUploads)
  async createRemittance(@Body() body: any, @Request() req: any) {
    const driver = await this.getDriverOrThrow(req.user?.sub);
    const totalCod = Number(body?.totalCod);
    const expenses = Number(body?.expenses ?? 0);
    const amount = Number(body?.amount);

    if (!Number.isFinite(totalCod) || totalCod < 0) {
      throw new BadRequestException("totalCod must be a finite non-negative number");
    }
    if (!Number.isFinite(expenses) || expenses < 0) {
      throw new BadRequestException("expenses must be a finite non-negative number");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("amount must be a finite positive number");
    }

    return this.logisticsService.createRemittance({
      driverId: driver.id,
      totalCod,
      expenses,
      amount,
    });
  }
}
