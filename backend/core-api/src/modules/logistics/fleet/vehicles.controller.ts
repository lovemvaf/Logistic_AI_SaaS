import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Vehicles')
@Controller("vehicles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class VehiclesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.VehiclesRead)
  async list(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ) {
    const safePage = Math.max(1, Number(page || 1));
    const take = Math.min(Math.max(1, Number(limit || 20)), 100);
    const skip = (safePage - 1) * take;

    const where = search ? {
      OR: [
        { plateNumber: { contains: search, mode: 'insensitive' as const } },
        { type: { contains: search, mode: 'insensitive' as const } },
      ]
    } : {};

    const [data, total] = await Promise.all([
      this.prisma.getTenantDb().vehicle.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.getTenantDb().vehicle.count({ where }),
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
  }

  @Get("fleet")
  @RequirePermissions(Permissions.VehiclesRead)
  async fleetUtilization() {
    const [totalVehicles, activeVehicles] = await Promise.all([
      this.prisma.getTenantDb().vehicle.count(),
      this.prisma.getTenantDb().vehicle.count({ where: { status: "ACTIVE" } }),
    ]);
    const activeTrips = await this.prisma.getTenantDb().trip.count({ where: { status: "IN_TRANSIT" } });
    const utilization = totalVehicles > 0 ? activeTrips / totalVehicles : 0;
    return { data: { totalVehicles, activeVehicles, utilization } };
  }

  @Get(":id")
  @RequirePermissions(Permissions.VehiclesRead)
  async detail(@Param("id") id: string) {
    const vehicle = await this.prisma.getTenantDb().vehicle.findUnique({
      where: { id },
      include: { trips: { take: 10, orderBy: { tripCode: 'desc' } } },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle with ID ${id} not found`);
    return vehicle;
  }

  @Post()
  @RequirePermissions(Permissions.VehiclesManage)
  async create(@Body() body: { plateNumber: string; type: string; capacityKg?: number; capacityCbm?: number }) {
    const capKg = Number(body?.capacityKg ?? 0);
    const capCbm = Number(body?.capacityCbm ?? 0);
    if (!Number.isFinite(capKg) || capKg < 0 || !Number.isFinite(capCbm) || capCbm < 0) {
      throw new BadRequestException("Vehicle capacities must be non-negative numbers");
    }

    try {
      return await this.prisma.getTenantDb().vehicle.create({
        data: {
          plateNumber: body.plateNumber,
          type: body.type,
          capacityKg: capKg,
          capacityCbm: capCbm,
          status: "ACTIVE",
        },
      });
    } catch {
      throw new InternalServerErrorException("Failed to create vehicle");
    }
  }

  @Patch(":id")
  @RequirePermissions(Permissions.VehiclesManage)
  async update(@Param("id") id: string, @Body() body: any) {
    try {
      const data: Record<string, unknown> = {};
      if (body?.plateNumber !== undefined) data.plateNumber = String(body.plateNumber);
      if (body?.type !== undefined) data.type = String(body.type);
      if (body?.status !== undefined) data.status = String(body.status);
      if (body?.capacityKg !== undefined) {
        const capKg = Number(body.capacityKg);
        if (!Number.isFinite(capKg) || capKg < 0) {
          throw new BadRequestException("capacityKg must be a finite non-negative number");
        }
        data.capacityKg = capKg;
      }
      if (body?.capacityCbm !== undefined) {
        const capCbm = Number(body.capacityCbm);
        if (!Number.isFinite(capCbm) || capCbm < 0) {
          throw new BadRequestException("capacityCbm must be a finite non-negative number");
        }
        data.capacityCbm = capCbm;
      }

      return await this.prisma.getTenantDb().vehicle.update({
        where: { id },
        data,
      });
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      if (error.code === 'P2025') {
        throw new NotFoundException(`Vehicle with ID ${id} not found`);
      }
      throw new InternalServerErrorException("Failed to update vehicle");
    }
  }

  @Delete(":id")
  @RequirePermissions(Permissions.VehiclesManage)
  async remove(@Param("id") id: string) {
    try {
      return await this.prisma.getTenantDb().vehicle.update({
        where: { id },
        data: { status: "INACTIVE" },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Vehicle with ID ${id} not found`);
      }
      throw new InternalServerErrorException("Failed to delete vehicle");
    }
  }
}
