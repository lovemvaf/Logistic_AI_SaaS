import { Body, Controller, Get, Post, UseGuards, Query, NotFoundException, BadRequestException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";

@ApiTags("Locations")
@Controller("locations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class LocationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("zones")
  @RequirePermissions(Permissions.WarehousesManage)
  async listZones(@Query("warehouseId") warehouseId?: string) {
    return this.prisma.getTenantDb().zone.findMany({
      where: warehouseId ? { warehouseId } : {},
      include: { warehouse: true },
    });
  }

  @Post("zones")
  @RequirePermissions(Permissions.WarehousesManage)
  async createZone(@Body() body: any) {
    return this.prisma.getTenantDb().zone.create({ data: body });
  }

  @Get("racks")
  @RequirePermissions(Permissions.WarehousesManage)
  async listRacks(@Query("zoneId") zoneId?: string) {
    return this.prisma.getTenantDb().rack.findMany({
      where: zoneId ? { zoneId } : {},
      include: { zone: true },
    });
  }

  @Post("racks")
  @RequirePermissions(Permissions.WarehousesManage)
  async createRack(@Body() body: any) {
    if (!body.zoneId) {
      const zone = await this.prisma.getTenantDb().zone.findFirst();
      if (!zone) throw new NotFoundException("No zone available to assign rack");
      body.zoneId = zone.id;
    }
    return this.prisma.getTenantDb().rack.create({ data: body });
  }

  @Get("bins")
  @RequirePermissions(Permissions.WarehousesManage)
  async listBins(@Query("warehouseId") warehouseId?: string, @Query("rackId") rackId?: string) {
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (rackId) where.rackId = rackId;
    
    return this.prisma.getTenantDb().bin.findMany({ 
      where,
      include: { rack: true, warehouse: true } 
    });
  }

  @Post("bins")
  @RequirePermissions(Permissions.WarehousesManage)
  async createBin(@Body() body: any) {
    // Basic validation for grid coordinates if provided
    if (body.posX !== undefined && (body.posX < 0 || body.posX > 1000)) {
       throw new BadRequestException("Invalid posX coordinate");
    }

    if (!body.rackId) {
      const rack = await this.prisma.getTenantDb().rack.findFirst();
      if (!rack) throw new NotFoundException("No rack available to assign bin");
      body.rackId = rack.id;
      if (!body.warehouseId) {
         const zone = await this.prisma.getTenantDb().zone.findUnique({ where: { id: rack.zoneId }});
         body.warehouseId = zone?.warehouseId;
      }
    }

    if (!body.warehouseId) {
      const warehouse = await this.prisma.getTenantDb().warehouse.findFirst();
      body.warehouseId = warehouse?.id;
    }

    return this.prisma.getTenantDb().bin.create({ data: body });
  }
}
