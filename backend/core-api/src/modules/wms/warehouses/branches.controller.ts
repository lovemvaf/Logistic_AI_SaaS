import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Query, NotFoundException, InternalServerErrorException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";

@ApiTags("Branches")
@Controller("branches")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class BranchesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.WarehousesManage)
  async list() {
    return this.prisma.getTenantDb().branch.findMany({
      orderBy: { name: 'asc' },
    });
  }

  @Get(":id")
  @RequirePermissions(Permissions.WarehousesManage)
  async detail(@Param("id") id: string) {
    return this.prisma.getTenantDb().branch.findUnique({
      where: { id },
      include: { manager: true },
    });
  }

  @Post()
  @RequirePermissions(Permissions.WarehousesManage)
  async create(@Body() body: {
    type: string,
    code: string,
    name: string,
    address: string,
    lat?: number,
    lng?: number,
    capacityCbm?: number,
    managerId?: string,
    status?: string
  }) {
    return this.prisma.getTenantDb().branch.create({
      data: {
        type: body.type,
        code: body.code,
        name: body.name,
        address: body.address,
        lat: body.lat,
        lng: body.lng,
        capacityCbm: body.capacityCbm,
        managerId: body.managerId,
        status: body.status || "ACTIVE",
      }
    });
  }

  @Patch(":id")
  @RequirePermissions(Permissions.WarehousesManage)
  async update(@Param("id") id: string, @Body() body: any) {
    try {
      return await this.prisma.getTenantDb().branch.update({
        where: { id },
        data: body,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Branch with ID ${id} not found`);
      }
      throw new InternalServerErrorException("Failed to update branch");
    }
  }

  @Delete(":id")
  @RequirePermissions(Permissions.WarehousesManage)
  async remove(@Param("id") id: string) {
    try {
      return await this.prisma.getTenantDb().branch.update({
        where: { id },
        data: { status: "DELETED" },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Branch with ID ${id} not found`);
      }
      throw new InternalServerErrorException("Failed to delete branch");
    }
  }
}
