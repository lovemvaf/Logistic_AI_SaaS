import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  Param,
  UseGuards,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { LogisticsService } from "../services/logistics.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Trips')
@Controller("trips")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TripsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsService: LogisticsService
  ) {}

  @Post()
  @RequirePermissions(Permissions.TripsDispatch)
  async createTrip(@Body() body: any) {
    try {
      return await this.prisma.getTenantDb().trip.create({
        data: {
          tripCode: `TRIP-${Date.now()}`,
          status: "DRAFT",
          totalWeightKg: Number(body?.totalWeightKg || 0),
          totalVolumeCbm: Number(body?.totalVolumeCbm || 0),
        }
      });
    } catch {
      throw new InternalServerErrorException("Failed to create trip");
    }
  }

  @Get()
  @RequirePermissions(Permissions.TripsRead)
  async listTrips(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 20,
    @Query("status") status?: string,
  ) {
    try {
      const safePage = Math.max(1, Number(page || 1));
      const take = Math.min(Math.max(1, Number(limit || 20)), 100);
      const skip = (safePage - 1) * take;
      const where: any = {};
      if (status) where.status = status;

      const [data, total] = await Promise.all([
        this.prisma.getTenantDb().trip.findMany({
          where,
          skip,
          take,
          include: { driver: { include: { user: true } }, vehicle: true, stops: true },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.getTenantDb().trip.count({ where }),
      ]);

      return {
        data,
        meta: { total, page: safePage, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) },
      };
    } catch {
      throw new InternalServerErrorException("Failed to fetch trips");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.TripsRead)
  async getTrip(@Param("id") id: string) {
    try {
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
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to fetch trip");
    }
  }

  @Patch(":id")
  @RequirePermissions(Permissions.TripsDispatch)
  async updateTrip(@Param("id") id: string, @Body() body: any) {
    try {
      const db = this.prisma.getTenantDb();
      const trip = await db.trip.findUnique({ where: { id } });
      if (!trip) throw new NotFoundException(`Trip ${id} not found`);

      if (body?.status !== undefined && body.status !== trip.status) {
        await this.logisticsService.updateTripStatus(id, String(body.status));
      }

      const data: Record<string, unknown> = {};
      if (body?.totalWeightKg !== undefined) data.totalWeightKg = Number(body.totalWeightKg);
      if (body?.totalVolumeCbm !== undefined) data.totalVolumeCbm = Number(body.totalVolumeCbm);
      if (body?.estimatedDistanceKm !== undefined) data.estimatedDistanceKm = Number(body.estimatedDistanceKm);
      if (body?.actualDistanceKm !== undefined) data.actualDistanceKm = Number(body.actualDistanceKm);
      if (body?.metadata !== undefined) data.metadata = String(body.metadata);

      if (Object.keys(data).length === 0) {
        return db.trip.findUnique({ where: { id } });
      }
      return await db.trip.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to update trip");
    }
  }

  @Post(":id/start")
  @RequirePermissions(Permissions.TripsDispatch)
  async startTrip(@Param("id") id: string) {
    try {
      const db = this.prisma.getTenantDb();
      const trip = await db.trip.findUnique({ where: { id } });
      if (!trip) throw new NotFoundException(`Trip ${id} not found`);
      if (!["DISPATCHED", "ASSIGNED"].includes(trip.status)) {
        throw new BadRequestException(`Cannot start trip in status ${trip.status}`);
      }
      return await db.trip.update({
        where: { id },
        data: { status: "IN_PROGRESS", departureTime: new Date() },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to start trip");
    }
  }

  @Post(":id/complete")
  @RequirePermissions(Permissions.TripsDispatch)
  async completeTrip(@Param("id") id: string) {
    try {
      const db = this.prisma.getTenantDb();
      const trip = await db.trip.findUnique({ where: { id } });
      if (!trip) throw new NotFoundException(`Trip ${id} not found`);
      if (!["IN_PROGRESS", "IN_TRANSIT"].includes(trip.status)) {
        throw new BadRequestException(`Cannot complete trip in status ${trip.status}`);
      }
      return await db.trip.update({
        where: { id },
        data: { status: "COMPLETED", returnTime: new Date() },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to complete trip");
    }
  }

  @Post(":id/cancel")
  @RequirePermissions(Permissions.TripsDispatch)
  async cancelTrip(@Param("id") id: string) {
    try {
      const db = this.prisma.getTenantDb();
      const trip = await db.trip.findUnique({ where: { id } });
      if (!trip) throw new NotFoundException(`Trip ${id} not found`);
      if (["COMPLETED", "CANCELLED"].includes(trip.status)) {
        throw new BadRequestException(`Cannot cancel trip in status ${trip.status}`);
      }
      return await db.trip.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to cancel trip");
    }
  }

  @Post(":id/stops")
  @RequirePermissions(Permissions.TripsDispatch)
  async addStop(@Param("id") id: string, @Body() body: any) {
    try {
      const db = this.prisma.getTenantDb();
      const trip = await db.trip.findUnique({ where: { id } });
      if (!trip) throw new NotFoundException(`Trip ${id} not found`);
      const sequence = Number(body?.sequence);
      if (!Number.isInteger(sequence) || sequence < 0 || !body?.stopType || !body?.address) {
        throw new BadRequestException("stopType, integer sequence >= 0, and address are required");
      }

      return await db.tripStop.create({
        data: {
          tripId: id,
          stopType: String(body.stopType),
          sequence,
          address: String(body.address),
          plannedEta: body.plannedEta ? new Date(body.plannedEta) : undefined
        }
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to add stop");
    }
  }

  @Post(":id/assign")
  @RequirePermissions(Permissions.TripsDispatch)
  async assignTrip(@Param("id") id: string, @Body() body: { driverId: string; vehicleId: string }) {
    try {
      return await this.logisticsService.dispatchTrip(id, body.driverId, body.vehicleId, "ASSIGNED");
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to assign trip");
    }
  }
}
