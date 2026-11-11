import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Drivers')
@Controller("drivers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class DriversController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @RequirePermissions(Permissions.DriversManage)
  async createDriver(@Body() body: any) {
    let { userId, licenseClass, licenseExpiry } = body;
    if (!userId) {
      const anyUser = await this.prisma.getTenantDb().tenantUser.findFirst({
        where: {
          Driver: null,
          status: 'ACTIVE'
        }
      });
      if (!anyUser) throw new NotFoundException('userId is required and no available user found.');
      userId = anyUser.id;
    }
    if (!licenseClass) licenseClass = body.licenseNumber ? "B2" : "C";
    if (!licenseExpiry) {
      licenseExpiry = new Date();
      licenseExpiry.setFullYear(licenseExpiry.getFullYear() + 5);
    }
    const expiryDate = new Date(licenseExpiry);
    if (Number.isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
      throw new BadRequestException("License expiry date is invalid or in the past");
    }

    return this.prisma.getTenantDb().driver.create({
      data: {
        userId,
        licenseClass,
        licenseExpiry: expiryDate,
        status: "OFFLINE",
      }
    });
  }

  @Get()
  @RequirePermissions(Permissions.TripsRead)
  async listDrivers() {
    const db = this.prisma.getTenantDb();
    const drivers = await db.driver.findMany({
      include: {
        user: true,
        trips: {
          where: { status: { in: ['IN_PROGRESS', 'IN_TRANSIT', 'DISPATCHED'] } },
          include: { vehicle: true }
        }
      }
    });

    const driverIds = drivers.map((d: any) => d.id);
    const locations: any[] = driverIds.length && !PrismaService.isSqlite
      ? await db.$queryRaw(
          Prisma.sql`SELECT id::text AS id, ST_AsGeoJSON("last_known_location")::json AS "location" FROM "drivers" WHERE id::text IN (${Prisma.join(driverIds)})`,
        )
      : [];
    const locationByDriver = new Map(locations.map((row: any) => [row.id, row.location]));

    return drivers.map((d: any) => {
      const activeTrip = d.trips && d.trips.length > 0 ? d.trips[0] : null;
      return {
        id: d.id,
        name: d.user?.fullName || 'Unknown Driver',
        phone: d.user?.phone || d.user?.email || 'N/A',
        licenseNumber: d.licenseClass + '-' + d.id.substring(0, 6).toUpperCase(),
        status: d.status,
        vehicleAssigned: activeTrip?.vehicle?.plateNumber || undefined,
        currentLocation: locationByDriver.get(d.id) ?? undefined
      };
    });
  }

  @Get(":id")
  @RequirePermissions(Permissions.TripsRead)
  async getDriver(@Param("id") id: string) {
    try {
      const driver = await this.prisma.getTenantDb().driver.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, fullName: true, phone: true, status: true } },
          trips: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });
      if (!driver) throw new NotFoundException(`Driver ${id} not found`);
      return driver;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to fetch driver");
    }
  }

  @Patch(":id")
  @RequirePermissions(Permissions.DriversManage)
  async updateDriver(
    @Param("id") id: string,
    @Body() body: { licenseClass?: string; licenseExpiry?: string; status?: string },
  ) {
    try {
      const db = this.prisma.getTenantDb();
      const driver = await db.driver.findUnique({ where: { id } });
      if (!driver) throw new NotFoundException(`Driver ${id} not found`);

      const data: Record<string, unknown> = {};
      if (body?.licenseClass !== undefined) data.licenseClass = String(body.licenseClass);
      if (body?.status !== undefined) data.status = String(body.status);
      if (body?.licenseExpiry !== undefined) {
        const expiryDate = new Date(body.licenseExpiry);
        if (Number.isNaN(expiryDate.getTime())) {
          throw new BadRequestException("Invalid licenseExpiry date");
        }
        data.licenseExpiry = expiryDate;
      }

      return await db.driver.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to update driver");
    }
  }
}
