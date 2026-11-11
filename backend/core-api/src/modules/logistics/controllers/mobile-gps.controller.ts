import { BadRequestException, Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * Batch GPS upload used by the driver app's background location task.
 *
 * The app buffers points while offline and flushes them when connectivity
 * returns, so this endpoint accepts an array and inserts it in one statement.
 */
@ApiTags('Mobile GPS')
@Controller('mobile/gps-batch')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class MobileGpsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @RequirePermissions(Permissions.MobileGpsBatch)
  async uploadBatch(@Body() body: { points?: Array<{ lat: number; lng: number; timestamp?: string }> }, @Request() req: any) {
    const points = body?.points;
    if (!Array.isArray(points) || points.length === 0) {
      throw new BadRequestException('points array is required and cannot be empty');
    }

    const db = this.prisma.getTenantDb();
    const driver = await db.driver.findUnique({ where: { userId: req.user.sub } });
    if (!driver) {
      throw new BadRequestException('Driver not found for the authenticated user');
    }

    const valid = points.filter((point) => {
      const lat = Number(point?.lat);
      const lng = Number(point?.lng);
      return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;
    });
    if (valid.length === 0) {
      throw new BadRequestException('No valid coordinates in points array');
    }

    await db.gpsTrackingLog.createMany({
      data: valid.map((point) => ({
        driverId: driver.id,
        lat: Number(point.lat),
        lng: Number(point.lng),
        timestamp: point.timestamp ? new Date(point.timestamp) : new Date(),
      })),
    });

    return { ok: true, accepted: valid.length };
  }
}
