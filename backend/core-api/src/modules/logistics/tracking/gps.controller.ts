import { Controller, Get, Post, Body, UseGuards, Request, Query, BadRequestException, Logger } from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { ExcludeRoles, PermissionsGuard, RequirePermissions, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('GPS')
@Controller("gps")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class GpsController {
  private readonly logger = new Logger('GpsController');

  constructor(private readonly prisma: PrismaService) {}

  private validateSchemaName(schemaName: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName);
  }

  private validateCoordinate(value: any, fieldName: "lat" | "lng"): number {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new BadRequestException(`Invalid ${fieldName}: must be a finite number`);
    }
    if (fieldName === "lat" && (num < -90 || num > 90)) {
      throw new BadRequestException("Invalid lat: must be between -90 and 90");
    }
    if (fieldName === "lng" && (num < -180 || num > 180)) {
      throw new BadRequestException("Invalid lng: must be between -180 and 180");
    }
    return num;
  }

  @Get("active-fleet")
  @RequirePermissions(Permissions.TripsRead)
  async getActiveFleet(@Query("status") status: string) {
    const drivers = await this.prisma.getTenantDb().driver.findMany({
      where: status ? { status } : { status: { not: "OFFLINE" } },
      include: {
        user: { select: { id: true, fullName: true } },
        GpsTrackingLog: {
          orderBy: { timestamp: "desc" },
          take: 1,
        }
      }
    });

    return drivers.map((d: any) => ({
      driverId: d.id,
      name: d.user.fullName,
      status: d.status,
      lat: d.GpsTrackingLog[0]?.lat ? Number(d.GpsTrackingLog[0].lat) : null,
      lng: d.GpsTrackingLog[0]?.lng ? Number(d.GpsTrackingLog[0].lng) : null,
      lastUpdate: d.GpsTrackingLog[0]?.timestamp || d.locationUpdatedAt,
      label: `${d.user.fullName} (${d.status})`
    }));
  }

  @Post("batch")
  @RequirePermissions(Permissions.MobileGpsBatch)
  async uploadBatchGps(@Body() body: { logs: any[] }, @Request() req: any) {
    const userId = req.user?.sub;

    if (!body.logs || !Array.isArray(body.logs) || body.logs.length === 0) {
      throw new BadRequestException("logs array is required and cannot be empty");
    }

    const db = this.prisma.getTenantDb();
    const driver = await db.driver.findUnique({ where: { userId } });
    if (!driver) throw new BadRequestException("Driver not found for user");

    const driverId = driver.id;
    const normalizedLogs = body.logs.map((log) => {
      const lat = this.validateCoordinate(log?.lat, "lat");
      const lng = this.validateCoordinate(log?.lng, "lng");
      const speed = log?.speed !== undefined && log?.speed !== null ? Number(log.speed) : undefined;
      if (speed !== undefined && (!Number.isFinite(speed) || speed < 0 || speed > 250)) {
        throw new BadRequestException("Invalid speed: must be between 0 and 250");
      }
      const rawTs = log?.timestamp;
      const ts = rawTs !== undefined && rawTs !== null
        ? new Date(typeof rawTs === "number" || /^\d+$/.test(String(rawTs)) ? Number(rawTs) : rawTs)
        : new Date();
      if (Number.isNaN(ts.getTime())) {
        throw new BadRequestException("Invalid GPS timestamp");
      }

      return {
        driverId,
        lat,
        lng,
        speed,
        heading: log?.heading !== undefined && log?.heading !== null ? Number(log.heading) : undefined,
        timestamp: ts,
        isOfflineCached: Boolean(log?.isOfflineCached),
      };
    });

    await db.gpsTrackingLog.createMany({
      data: normalizedLogs,
    });

    const schemaName = req.schemaName || this.prisma.currentSchema;
    if (!this.validateSchemaName(schemaName)) {
      throw new BadRequestException("Invalid schema name");
    }

    const latestLog = normalizedLogs.reduce((latest, item) =>
      item.timestamp.getTime() >= latest.timestamp.getTime() ? item : latest
    );

    if (!PrismaService.isSqlite) {
      await this.prisma.tenantExec(
        `UPDATE "${schemaName}"."drivers"
         SET last_known_location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
             location_updated_at = $4
         WHERE id = $3
           AND (location_updated_at IS NULL OR location_updated_at <= $4)`,
        latestLog.lng,
        latestLog.lat,
        driverId,
        latestLog.timestamp
      );

      // Evaluate every coordinate in the batch so offline-cached paths cannot skip geofence alerts
      const alertedFences = new Set<string>();
      for (const point of normalizedLogs) {
        const geofenceAlerts: any[] = await this.prisma.tenantQuery(
          `SELECT name, zone_type
           FROM "${schemaName}"."geofences"
           WHERE is_active = true
             AND ST_Contains(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
          point.lng,
          point.lat
        );
        for (const fence of geofenceAlerts) {
          alertedFences.add(`${fence.zone_type}:${fence.name}`);
        }
      }

      if (alertedFences.size > 0) {
        this.logger.warn(`Geofence Alert: Driver ${driverId} entered: ${Array.from(alertedFences).join(', ')}`);
      }
    }

    return { ok: true, processedCount: normalizedLogs.length };
  }
}
