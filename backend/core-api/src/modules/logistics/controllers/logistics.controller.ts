import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common"
import { CreateGeofenceDto } from "../dtos/create-geofence.dto"
import { DispatchTripDto } from "../dtos/dispatch-trip.dto"
import { OptimizeRoutingDto } from "../dtos/optimize-routing.dto"
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from "shared-types"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { LogisticsService } from "../services/logistics.service"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { ApiTags } from "@nestjs/swagger"

@ApiTags('Logistics')
@Controller("logistics")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class LogisticsController {
  constructor(
    private readonly logisticsService: LogisticsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Admin shipment view. Trips are the transport unit in this system, so
   * expose a flattened shipment shape instead of duplicating a shipment model.
   */
  @Get("shipments")
  @RequirePermissions(Permissions.TripsRead)
  async shipments(
    @Query("status") status?: string,
    @Query("limit") limit: number = 20,
  ) {
    const where: any = {};
    if (status === "ACTIVE") {
      where.status = { in: ["DISPATCHED", "IN_TRANSIT", "STARTED"] };
    } else if (status) {
      where.status = status;
    }

    const trips = await this.prisma.getTenantDb().trip.findMany({
      where,
      take: Math.min(Number(limit) || 20, 100),
      include: {
        driver: { include: { user: true } },
        vehicle: true,
        stops: { orderBy: { sequence: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: trips.map((trip: any) => {
        const stops = trip.stops || [];
        const origin = stops.find((stop: any) => stop.stopType === "PICKUP") || stops[0];
        const destination =
          [...stops].reverse().find((stop: any) => stop.stopType === "DELIVERY") ||
          stops[stops.length - 1];
        const progress =
          trip.status === "COMPLETED"
            ? 100
            : ["IN_TRANSIT", "STARTED", "IN_PROGRESS", "DISPATCHED"].includes(
                  trip.status,
                )
              ? 60
              : 20;
        return {
          id: trip.id,
          trackingNumber: trip.tripCode,
          driver:
            trip.driver?.user?.fullName ||
            trip.driver?.fullName ||
            "Unassigned",
          vehicle: trip.vehicle?.plateNumber || "—",
          origin: origin?.address || "—",
          destination: destination?.address || "—",
          status: trip.status,
          progress,
          eta: trip.returnTime || trip.departureTime || null,
        };
      }),
    };
  }

  @Get("trips")
  @RequirePermissions(Permissions.TripsRead)
  async list(@Query("page") page: number, @Query("limit") limit: number) {
    return this.logisticsService.listTrips({ page: Number(page || 1), limit: Number(limit || 20) });
  }

  @Post("trips")
  @RequirePermissions(Permissions.TripsDispatch)
  async createTrip(@Body() body: { totalWeightKg?: number; totalVolumeCbm?: number; driverId?: string; vehicleId?: string; metadata?: string }) {
    return this.prisma.getTenantDb().trip.create({
      data: {
        tripCode: `TRIP-${Date.now()}`,
        status: "DRAFT",
        driverId: body?.driverId || null,
        vehicleId: body?.vehicleId || null,
        totalWeightKg: Number(body?.totalWeightKg || 0),
        totalVolumeCbm: Number(body?.totalVolumeCbm || 0),
        metadata: body?.metadata || null,
      },
    });
  }

  @Post("trips/assign")
  @RequirePermissions(Permissions.TripsDispatch)
  async assignTripBody(@Body() body: { tripId: string; driverId?: string; vehicleId?: string }) {
    if (!body?.tripId) throw new BadRequestException("tripId is required");
    return this.logisticsService.dispatchTrip(body.tripId, body.driverId, body.vehicleId, "DISPATCHED");
  }

  @Post("trips/pod")
  @RequirePermissions(Permissions.MobileUploads)
  async submitPod(@Body() body: { deliveryId?: string; orderId?: string; tripId?: string; codCollected?: number; podUrl?: string; podSignatureUrl?: string }) {
    const db = this.prisma.getTenantDb();
    let delivery: any = null;
    if (body?.deliveryId) {
      delivery = await db.delivery.findUnique({ where: { id: body.deliveryId } });
    } else if (body?.orderId || body?.tripId) {
      delivery = await db.delivery.findFirst({
        where: {
          ...(body.orderId ? { orderId: body.orderId } : {}),
          ...(body.tripId ? { tripId: body.tripId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
    }
    if (!delivery) throw new NotFoundException("Matching delivery record not found for POD");

    return db.delivery.update({
      where: { id: delivery.id },
      data: {
        status: "DELIVERED",
        ...(body.codCollected !== undefined ? { codAmountCollected: Number(body.codCollected) } : {}),
        ...(body.podUrl ? { podImageUrl: String(body.podUrl) } : {}),
        ...(body.podSignatureUrl ? { podSignatureUrl: String(body.podSignatureUrl) } : {}),
        syncVersion: Number(delivery.syncVersion || 1) + 1,
      },
    });
  }

  @Get("trips/:id/pod")
  @RequirePermissions(Permissions.TripsRead)
  async getTripPods(@Param("id") id: string) {
    const deliveries = await this.prisma.getTenantDb().delivery.findMany({
      where: { tripId: id },
      orderBy: { stopSequence: "asc" },
    });
    return deliveries.map((d: any) => ({
      deliveryId: d.id,
      orderId: d.orderId,
      status: d.status,
      podImageUrl: d.podImageUrl,
      podSignatureUrl: d.podSignatureUrl,
      codAmountExpected: d.codAmountExpected,
      codAmountCollected: d.codAmountCollected,
      checkinLat: d.checkinLat,
      checkinLng: d.checkinLng,
    }));
  }

  @Post("trips/:id/optimize")
  @RequirePermissions(Permissions.TripsDispatch)
  async optimizeTrip(@Param("id") id: string) {
    const db = this.prisma.getTenantDb();
    const trip = await db.trip.findUnique({
      where: { id },
      include: { stops: true, deliveries: true },
    });
    if (!trip) throw new NotFoundException(`Trip ${id} not found`);

    const orderIds = Array.from(
      new Set([
        ...(trip.stops || []).map((s: any) => s.orderId).filter(Boolean),
        ...(trip.deliveries || []).map((d: any) => d.orderId).filter(Boolean),
      ]),
    );
    if (orderIds.length === 0) {
      throw new BadRequestException(`Trip ${id} has no orders to optimize`);
    }
    return this.logisticsService.optimizeRouting({ orderIds });
  }

  @Get("trips/:id")
  @RequirePermissions(Permissions.TripsRead)
  async getTrip(@Param("id") id: string) {
    const trip = await this.prisma.getTenantDb().trip.findUnique({
      where: { id },
      include: {
        driver: { include: { user: true } },
        vehicle: true,
        stops: { orderBy: { sequence: "asc" } },
        deliveries: true,
      },
    });
    if (!trip) throw new NotFoundException(`Trip ${id} not found`);
    return trip;
  }

  @Patch("trips/:id")
  @RequirePermissions(Permissions.TripsDispatch)
  async patchTrip(@Param("id") id: string, @Body() body: any) {
    const db = this.prisma.getTenantDb();
    const trip = await db.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException(`Trip ${id} not found`);
    if (body?.status && body.status !== trip.status) {
      await this.logisticsService.updateTripStatus(id, String(body.status));
    }
    return db.trip.update({
      where: { id },
      data: {
        ...(body?.totalWeightKg !== undefined ? { totalWeightKg: Number(body.totalWeightKg) } : {}),
        ...(body?.totalVolumeCbm !== undefined ? { totalVolumeCbm: Number(body.totalVolumeCbm) } : {}),
        ...(body?.metadata !== undefined ? { metadata: String(body.metadata) } : {}),
      },
    });
  }

  @Delete("trips/:id")
  @RequirePermissions(Permissions.TripsDispatch)
  async deleteTrip(@Param("id") id: string) {
    return this.logisticsService.updateTripStatus(id, "CANCELLED");
  }

  @Post("trips/:id/dispatch")
  @RequirePermissions(Permissions.TripsDispatch)
  async dispatch(@Param("id") id: string, @Body() body: DispatchTripDto) {
    return this.logisticsService.dispatchTrip(id, body.driverId, body.vehicleId);
  }

  @Get("dispatch/unassigned-orders")
  @RequirePermissions(Permissions.TripsRead)
  async unassignedOrders() {
    return this.logisticsService.getUnassignedOrders();
  }

  @Post("routing/optimize-async")
  @RequirePermissions(Permissions.TripsDispatch)
  async optimize(@Body() body: OptimizeRoutingDto) {
    return this.logisticsService.optimizeRouting(body);
  }

  @Get("routing/jobs/:jobId")
  @RequirePermissions(Permissions.TripsRead)
  async routingJob(@Param("jobId") jobId: string) {
    return this.logisticsService.getRoutingJob(jobId);
  }

  @Post("routing/jobs/:jobId/apply")
  @RequirePermissions(Permissions.TripsDispatch)
  async applyRouting(@Param("jobId") jobId: string) {
    return this.logisticsService.applyRoutingJob(jobId);
  }

  @Post("trips/:id/start")
  @RequirePermissions(Permissions.TripsDispatch)
  async startTrip(@Param("id") id: string) {
    return this.logisticsService.startTrip(id);
  }

  @Post("trips/:id/complete")
  @RequirePermissions(Permissions.TripsDispatch)
  async completeTrip(@Param("id") id: string) {
    return this.logisticsService.completeTrip(id);
  }

  @Patch("trips/:id/status")
  @RequirePermissions(Permissions.TripsDispatch)
  async updateTripStatus(@Param("id") id: string, @Body() body: { status: string }) {
    return this.logisticsService.updateTripStatus(id, body.status);
  }

  @Get("reports/trips")
  @RequirePermissions(Permissions.TripsRead)
  async tripReport(@Query("range") range: string = "7d") {
    return this.logisticsService.getTripReport(range);
  }

  @Get("reports/fleet")
  @RequirePermissions(Permissions.TripsRead)
  async fleetReport(@Query("range") range: string = "7d") {
    return this.logisticsService.getFleetReport(range);
  }

  // --- Drivers under /logistics/drivers ---

  @Get("drivers")
  @RequirePermissions(Permissions.TripsRead)
  async listDrivers() {
    const drivers = await this.prisma.getTenantDb().driver.findMany({
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true } },
        trips: {
          where: { status: { in: ["IN_PROGRESS", "IN_TRANSIT", "DISPATCHED"] } },
          include: { vehicle: true },
        },
      },
    });
    return drivers.map((d: any) => ({
      id: d.id,
      userId: d.userId,
      name: d.user?.fullName || "Unknown Driver",
      phone: d.user?.phone || d.user?.email || "N/A",
      licenseClass: d.licenseClass,
      licenseExpiry: d.licenseExpiry,
      status: d.status,
      vehicleAssigned: d.trips?.[0]?.vehicle?.plateNumber || undefined,
    }));
  }

  @Post("drivers")
  @RequirePermissions(Permissions.DriversManage)
  async createDriver(@Body() body: { userId?: string; licenseClass?: string; licenseExpiry?: string }) {
    const db = this.prisma.getTenantDb();
    let userId = body?.userId;
    if (!userId) {
      const candidate = await db.tenantUser.findFirst({ where: { Driver: null, status: "ACTIVE" } });
      if (!candidate) throw new NotFoundException("userId is required and no available user found");
      userId = candidate.id;
    }
    const expiry = body?.licenseExpiry ? new Date(body.licenseExpiry) : new Date(Date.now() + 5 * 365 * 86400 * 1000);
    if (Number.isNaN(expiry.getTime())) throw new BadRequestException("Invalid licenseExpiry date");
    return db.driver.create({
      data: { userId, licenseClass: body?.licenseClass || "C", licenseExpiry: expiry, status: "OFFLINE" },
    });
  }

  @Get("drivers/ranking")
  @RequirePermissions(Permissions.TripsRead)
  async driverRanking() {
    const drivers = await this.prisma.getTenantDb().driver.findMany({
      include: {
        user: { select: { fullName: true } },
        trips: { select: { status: true } },
        SosAlert: { select: { id: true } },
      },
    });
    const rows = drivers
      .map((d: any) => {
        const totalTrips = (d.trips || []).length;
        const completed = (d.trips || []).filter((t: any) => t.status === "COMPLETED").length;
        const completionRate = totalTrips > 0 ? Math.round((completed / totalTrips) * 1000) / 10 : 0;
        return {
          driverId: d.id,
          driverName: d.user?.fullName || "Unknown Driver",
          totalTrips,
          completedTrips: completed,
          onTimeRate: completionRate,
          incidents: (d.SosAlert || []).length,
        };
      })
      .sort((a: any, b: any) => b.onTimeRate - a.onTimeRate || b.totalTrips - a.totalTrips);
    return rows.map((r: any, idx: number) => ({ ...r, rank: idx + 1 }));
  }

  @Get("drivers/:id/trip-log")
  @RequirePermissions(Permissions.TripsRead)
  async driverTripLog(@Param("id") id: string) {
    const db = this.prisma.getTenantDb();
    const driver = await db.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException(`Driver ${id} not found`);
    return db.trip.findMany({
      where: { driverId: id },
      include: { vehicle: true, stops: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  @Get("drivers/:id")
  @RequirePermissions(Permissions.TripsRead)
  async getDriver(@Param("id") id: string) {
    const driver = await this.prisma.getTenantDb().driver.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true } }, trips: { take: 10, orderBy: { createdAt: "desc" } } },
    });
    if (!driver) throw new NotFoundException(`Driver ${id} not found`);
    return driver;
  }

  @Patch("drivers/:id")
  @RequirePermissions(Permissions.DriversManage)
  async patchDriver(@Param("id") id: string, @Body() body: { licenseClass?: string; status?: string; licenseExpiry?: string }) {
    const db = this.prisma.getTenantDb();
    const existing = await db.driver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Driver ${id} not found`);
    return db.driver.update({
      where: { id },
      data: {
        ...(body?.licenseClass ? { licenseClass: String(body.licenseClass) } : {}),
        ...(body?.status ? { status: String(body.status) } : {}),
        ...(body?.licenseExpiry ? { licenseExpiry: new Date(body.licenseExpiry) } : {}),
      },
    });
  }

  @Delete("drivers/:id")
  @RequirePermissions(Permissions.DriversManage)
  async deleteDriver(@Param("id") id: string) {
    const db = this.prisma.getTenantDb();
    const existing = await db.driver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Driver ${id} not found`);
    return db.driver.update({ where: { id }, data: { status: "INACTIVE", deletedAt: new Date() } });
  }

  // --- Vehicles under /logistics/vehicles ---

  @Get("vehicles")
  @RequirePermissions(Permissions.VehiclesRead)
  async listVehicles(@Query("page") page: number = 1, @Query("limit") limit: number = 50) {
    const safePage = Math.max(1, Number(page || 1));
    const take = Math.min(100, Math.max(1, Number(limit || 50)));
    const skip = (safePage - 1) * take;
    const db = this.prisma.getTenantDb();
    const [data, total] = await Promise.all([
      db.vehicle.findMany({ skip, take, orderBy: { createdAt: "desc" } }),
      db.vehicle.count(),
    ]);
    return { data, meta: { total, page: safePage, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) } };
  }

  @Post("vehicles")
  @RequirePermissions(Permissions.VehiclesManage)
  async createVehicle(@Body() body: { plateNumber: string; type: string; capacityKg?: number; capacityCbm?: number }) {
    if (!body?.plateNumber || !body?.type) throw new BadRequestException("plateNumber and type are required");
    return this.prisma.getTenantDb().vehicle.create({
      data: {
        plateNumber: body.plateNumber,
        type: body.type,
        capacityKg: Number(body.capacityKg ?? 0),
        capacityCbm: Number(body.capacityCbm ?? 0),
        status: "ACTIVE",
      },
    });
  }

  @Post("vehicles/fuel")
  @RequirePermissions(Permissions.VehiclesManage)
  async logVehicleFuel(@Body() body: { driverId?: string; tripId?: string; fuelCost: number; note?: string }) {
    const cost = Number(body?.fuelCost);
    if (!Number.isFinite(cost) || cost <= 0) throw new BadRequestException("fuelCost must be > 0");
    const db = this.prisma.getTenantDb();
    let driverId = body?.driverId;
    if (!driverId) {
      const driver = await db.driver.findFirst({ select: { id: true } });
      driverId = driver?.id;
    }
    if (!driverId) throw new BadRequestException("driverId is required");
    return db.driverExpense.create({
      data: {
        driverId,
        tripId: body?.tripId || null,
        amount: cost,
        fuelCost: cost,
        category: "FUEL",
        note: body?.note || "Vehicle fuel log",
      },
    });
  }

  @Post("vehicles/maintenance")
  @RequirePermissions(Permissions.VehiclesManage)
  async logVehicleMaintenance(@Body() body: { vehicleId?: string; driverId?: string; cost?: number; note?: string; status?: string }) {
    const db = this.prisma.getTenantDb();
    if (body?.vehicleId && body?.status) {
      await db.vehicle.update({ where: { id: body.vehicleId }, data: { status: body.status } });
    }
    const cost = Number(body?.cost ?? 0);
    if (cost > 0) {
      let driverId = body?.driverId;
      if (!driverId) {
        const d = await db.driver.findFirst({ select: { id: true } });
        driverId = d?.id;
      }
      if (driverId) {
        return db.driverExpense.create({
          data: {
            driverId,
            amount: cost,
            category: "MAINTENANCE",
            note: body?.note || `Maintenance for vehicle ${body?.vehicleId || "fleet"}`,
          },
        });
      }
    }
    return { ok: true, vehicleId: body?.vehicleId || null, status: body?.status || "LOGGED" };
  }

  @Get("vehicles/:id")
  @RequirePermissions(Permissions.VehiclesRead)
  async getVehicle(@Param("id") id: string) {
    const v = await this.prisma.getTenantDb().vehicle.findUnique({ where: { id }, include: { trips: { take: 10 } } });
    if (!v) throw new NotFoundException(`Vehicle ${id} not found`);
    return v;
  }

  @Patch("vehicles/:id")
  @RequirePermissions(Permissions.VehiclesManage)
  async patchVehicle(@Param("id") id: string, @Body() body: any) {
    const existing = await this.prisma.getTenantDb().vehicle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Vehicle ${id} not found`);
    return this.prisma.getTenantDb().vehicle.update({
      where: { id },
      data: {
        ...(body?.plateNumber !== undefined ? { plateNumber: String(body.plateNumber) } : {}),
        ...(body?.type !== undefined ? { type: String(body.type) } : {}),
        ...(body?.status !== undefined ? { status: String(body.status) } : {}),
        ...(body?.capacityKg !== undefined ? { capacityKg: Number(body.capacityKg) } : {}),
        ...(body?.capacityCbm !== undefined ? { capacityCbm: Number(body.capacityCbm) } : {}),
      },
    });
  }

  @Delete("vehicles/:id")
  @RequirePermissions(Permissions.VehiclesManage)
  async deleteVehicle(@Param("id") id: string) {
    const existing = await this.prisma.getTenantDb().vehicle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Vehicle ${id} not found`);
    return this.prisma.getTenantDb().vehicle.update({ where: { id }, data: { status: "INACTIVE" } });
  }

  // --- Geofences under /logistics/geofences ---

  @Get("geofences")
  @RequirePermissions(Permissions.TripsRead)
  async listGeofences(@Request() req: any) {
    if (PrismaService.isSqlite) {
      return this.prisma.geofence.findMany();
    }
    const schemaName = req.schemaName || this.prisma.currentSchema;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      throw new BadRequestException("Invalid schema name");
    }
    return this.prisma.tenantQuery(
      `SELECT id, name, ST_AsGeoJSON(polygon)::json as polygon, zone_type as "zoneType", is_active as "isActive" FROM "${schemaName}"."geofences"`,
    );
  }

  @Post("geofences")
  @RequirePermissions(Permissions.TripsDispatch)
  async createGeofence(@Body() body: { name: string; polygonWkt: string; zoneType: string }, @Request() req: any) {
    if (!body?.name || !body?.polygonWkt || !body?.zoneType) {
      throw new BadRequestException("name, polygonWkt, and zoneType are required");
    }
    if (PrismaService.isSqlite) {
      await (this.prisma.geofence as any).create({
        data: { name: body.name, polygon: body.polygonWkt, zoneType: body.zoneType, isActive: true },
      });
      return { ok: true };
    }
    const schemaName = req.schemaName || this.prisma.currentSchema;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) throw new BadRequestException("Invalid schema name");
    await this.prisma.getTenantDb().$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."geofences" (id, name, polygon, zone_type, is_active) VALUES (gen_random_uuid(), $1, ST_GeomFromText($2, 4326), $3, true)`,
      body.name,
      body.polygonWkt,
      body.zoneType,
    );
    return { ok: true };
  }

  @Patch("geofences/:id")
  @RequirePermissions(Permissions.TripsDispatch)
  async updateGeofence(@Param("id") id: string, @Body() body: { name?: string; zoneType?: string; isActive?: boolean }, @Request() req: any) {
    if (PrismaService.isSqlite) {
      return this.prisma.geofence.update({
        where: { id },
        data: {
          ...(body?.name !== undefined ? { name: body.name } : {}),
          ...(body?.zoneType !== undefined ? { zoneType: body.zoneType } : {}),
          ...(body?.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
    }
    const schemaName = req.schemaName || this.prisma.currentSchema;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) throw new BadRequestException("Invalid schema name");
    const rows: any[] = await this.prisma.tenantQuery(
      `UPDATE "${schemaName}"."geofences" SET name = COALESCE($1, name), zone_type = COALESCE($2, zone_type), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING id`,
      body?.name ?? null,
      body?.zoneType ?? null,
      body?.isActive ?? null,
      id,
    );
    if (!rows.length) throw new NotFoundException(`Geofence ${id} not found`);
    return { ok: true };
  }

  @Delete("geofences/:id")
  @RequirePermissions(Permissions.TripsDispatch)
  async deleteGeofence(@Param("id") id: string, @Request() req: any) {
    if (PrismaService.isSqlite) {
      await this.prisma.geofence.delete({ where: { id } });
      return { ok: true };
    }
    const schemaName = req.schemaName || this.prisma.currentSchema;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) throw new BadRequestException("Invalid schema name");
    const rows: any[] = await this.prisma.tenantQuery(
      `DELETE FROM "${schemaName}"."geofences" WHERE id = $1 RETURNING id`,
      id,
    );
    if (!rows.length) throw new NotFoundException(`Geofence ${id} not found`);
    return { ok: true };
  }

  // --- SOS Alerts under /logistics/sos ---

  @Get("sos")
  @RequirePermissions(Permissions.TripsRead)
  async listSos(@Query("status") status?: string) {
    return this.logisticsService.getSosAlerts(status);
  }

  @Post("sos")
  @RequirePermissions(Permissions.TripsDispatch)
  async createSos(@Body() body: { driverId: string; tripId?: string; message?: string }) {
    if (!body?.driverId) throw new BadRequestException("driverId is required");
    return this.prisma.getTenantDb().sosAlert.create({
      data: {
        driverId: body.driverId,
        tripId: body?.tripId || null,
        message: body?.message || "SOS Alert",
        status: "OPEN",
      },
    });
  }

  @Get("sos/:id")
  @RequirePermissions(Permissions.TripsRead)
  async getSos(@Param("id") id: string) {
    const alert = await this.prisma.getTenantDb().sosAlert.findUnique({
      where: { id },
      include: { driver: { include: { user: true } }, trip: true },
    });
    if (!alert) throw new NotFoundException(`SOS alert ${id} not found`);
    return alert;
  }

  @Post("sos/:id/acknowledge")
  @RequirePermissions(Permissions.TripsDispatch)
  async acknowledgeSos(@Param("id") id: string) {
    return this.logisticsService.resolveSos(id, "ACKNOWLEDGED");
  }

  @Post("sos/:id/resolve")
  @RequirePermissions(Permissions.TripsDispatch)
  async resolveSos(@Param("id") id: string) {
    return this.logisticsService.resolveSos(id, "RESOLVED");
  }
}
