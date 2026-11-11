import { Body, Controller, Get, Param, Patch, Post, UseGuards, NotFoundException, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsString, IsOptional, IsNumber } from "class-validator";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";

class CreateWarehouseDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsString()
  address!: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  managerId?: string;
}

@ApiTags("Warehouses")
@Controller("warehouses")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class WarehousesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list() {
    try {
      return await this.prisma.getTenantDb().warehouse.findMany({ 
        include: { manager: true },
        orderBy: { name: 'asc' }
      });
    } catch (error) {
      throw new InternalServerErrorException("Failed to fetch warehouses");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param("id") id: string) {
    try {
      const warehouse = await this.prisma.getTenantDb().warehouse.findUnique({
        where: { id },
        include: { 
          manager: true,
          zones: {
            include: {
              racks: {
                include: { bins: true }
              }
            }
          }
        }
      });
      if (!warehouse) {
        throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      return warehouse;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to fetch warehouse");
    }
  }

  @Post()
  @RequirePermissions(Permissions.WarehousesManage)
  async create(@Body() body: CreateWarehouseDto) {
    try {
      return await this.prisma.getTenantDb().warehouse.create({
        data: {
          name: body.name,
          code: body.code,
          address: body.address,
          // Model `warehouses` không có cột tọa độ (lat/lng) - trước đây gửi
          // 2 field này làm Prisma báo lỗi validation và endpoint luôn fail.
          managerId: body.managerId,
          status: "ACTIVE",
        }
      });
    } catch (error) {
      throw new BadRequestException("Failed to create warehouse");
    }
  }

  @Patch(":id")
  @RequirePermissions(Permissions.WarehousesManage)
  async update(@Param("id") id: string, @Body() body: Partial<CreateWarehouseDto>) {
    try {
      const warehouse = await this.prisma.getTenantDb().warehouse.findUnique({ where: { id } });
      if (!warehouse) {
        throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      return await this.prisma.getTenantDb().warehouse.update({
        where: { id },
        data: body,
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException("Failed to update warehouse");
    }
  }

  @Patch(":id/soft-delete")
  @RequirePermissions(Permissions.WarehousesManage)
  async softDelete(@Param("id") id: string) {
    try {
      const warehouse = await this.prisma.getTenantDb().warehouse.findUnique({ where: { id } });
      if (!warehouse) {
        throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      return await this.prisma.getTenantDb().warehouse.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException("Failed to delete warehouse");
    }
  }
}
