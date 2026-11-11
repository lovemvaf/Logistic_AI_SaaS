import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  Query,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

/**
 * Mobile-specific read-only endpoints used by the driver app.
 * Returns trips assigned to the authenticated driver and the stops for a given trip.
 */
@ApiTags('Mobile Trips')
@Controller("mobile/trips")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class MobileTripsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List trips belonging to the current driver.
   * Uses the JWT `sub` claim (user id) to locate the driver record.
   */
  @Get()
  @RequirePermissions(Permissions.TripsRead)
  async listDriverTrips(
    @Request() req: any,
    @Query('sinceVersion') sinceVersion?: string,
    @Query('limit') limit?: string,
  ) {
    const db = this.prisma.getTenantDb();
    const driver = await db.driver.findUnique({
      where: { userId: req.user?.sub },
    });
    if (!driver) return [];
    const whereClause: any = { driverId: driver.id };
    if (sinceVersion !== undefined && sinceVersion !== null && sinceVersion !== '') {
      const versionNum = Number(sinceVersion);
      if (Number.isFinite(versionNum)) {
        whereClause.syncVersion = { gt: versionNum };
      }
    }
    const take = limit !== undefined ? Math.min(Math.max(1, Number(limit) || 20), 100) : undefined;
    return db.trip.findMany({
      where: whereClause,
      ...(take ? { take } : {}),
      orderBy: { createdAt: 'desc' },
      include: { stops: { orderBy: { sequence: 'asc' } }, driver: true, vehicle: true },
    });
  }

  /**
   * Retrieve stops for a specific trip belonging to the authenticated driver.
   */
  @Get(":id/stops")
  @RequirePermissions(Permissions.TripsRead)
  async getTripStops(@Param("id") id: string, @Request() req: any) {
    const db = this.prisma.getTenantDb();
    const driver = await db.driver.findUnique({
      where: { userId: req.user?.sub },
    });
    if (!driver) {
      throw new ForbiddenException("Driver profile not found");
    }

    const trip = await db.trip.findFirst({
      where: { id, driverId: driver.id },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${id} not found for this driver`);
    }

    return db.tripStop.findMany({
      where: { tripId: id, trip: { driverId: driver.id } },
      orderBy: { sequence: "asc" },
    });
  }
}
