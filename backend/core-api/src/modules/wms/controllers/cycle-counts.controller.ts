import { Controller, Get, Post, Patch, Body, UseGuards, Request, Query, Param, NotFoundException, UnauthorizedException } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types"
import { InventoryService } from "../services/inventory.service"
import { PrismaService } from "../../../core/prisma/prisma.service"

@ApiTags("Cycle Counts")
@Controller("inventory/cycle-counts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class CycleCountsController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService
  ) {}

  @Post()
  @RequirePermissions(Permissions.InventoryAdjust)
  async createCycleCount(@Body() body: { warehouseId: string, scheduledAt?: Date }, @Request() req: any) {
    const actorId = req.user?.sub;
    if (!actorId) {
      throw new UnauthorizedException("Authenticated user required");
    }
    
    let warehouseId = body.warehouseId;
    if (!warehouseId) {
      const wh = await this.prisma.getTenantDb().warehouse.findFirst();
      if (!wh) throw new NotFoundException("No warehouse available");
      warehouseId = wh.id;
    }

    return this.inventoryService.createCycleCount({ 
      warehouseId, 
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined, 
      actorId 
    });
  }

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list(@Query("warehouseId") warehouseId: string, @Query("page") page: number, @Query("limit") limit: number) {
    return this.inventoryService.getCycleCounts(warehouseId, { page: Number(page || 1), limit: Number(limit || 20) })
  }

  @Get(":id")
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param("id") id: string) {
    const cc = await this.prisma.getTenantDb().cycleCount.findUnique({
      where: { id },
      include: { warehouse: true, creator: true },
    });
    if (!cc) throw new NotFoundException(`Cycle count ${id} not found`);
    return cc;
  }

  @Post(":id/submit")
  @RequirePermissions(Permissions.InventoryAdjust)
  async submitCycleCount(
    @Param("id") id: string,
    @Body() body: { countedLines?: number; varianceUnits?: number },
  ) {
    const db = this.prisma.getTenantDb();
    const existing = await db.cycleCount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Cycle count ${id} not found`);
    const updated = await db.cycleCount.update({
      where: { id },
      data: { status: "SUBMITTED" },
    });
    return {
      ...updated,
      countedLines: Number(body?.countedLines ?? 0),
      varianceUnits: Number(body?.varianceUnits ?? 0),
    };
  }

  @Post(":id/approve")
  @RequirePermissions(Permissions.InventoryAdjust)
  async approveCycleCount(@Param("id") id: string) {
    const db = this.prisma.getTenantDb();
    const existing = await db.cycleCount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Cycle count ${id} not found`);
    return db.cycleCount.update({
      where: { id },
      data: { status: "APPROVED" },
    });
  }

  @Patch(":id/status")
  @RequirePermissions(Permissions.InventoryAdjust)
  async updateStatus(@Param("id") id: string, @Body() body: { status: string }) {
    return this.inventoryService.updateCycleCountStatus(id, body.status)
  }
}
