import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  NotFoundException,
  NotImplementedException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types"
import { InventoryService } from "../services/inventory.service"
import { PrismaService } from "../../../core/prisma/prisma.service"

@ApiTags("Warehouse Ops")
@Controller("inventory/ops")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class WarehouseOpsController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService
  ) {}

  @Post("shift/start")
  @RequirePermissions(Permissions.TasksUpdate)
  async startShift(@Body() body: { warehouseId: string }, @Request() req: any) {
    const staffId = req.user?.sub;
    if (!staffId) {
      throw new UnauthorizedException("Authenticated user required");
    }
    return this.inventoryService.startShift(body.warehouseId, staffId)
  }

  @Patch("shift/:id/end")
  @RequirePermissions(Permissions.TasksUpdate)
  async endShift(@Param("id") id: string) {
    return this.inventoryService.endShift(id)
  }

  @Post("equipment/checkout")
  @RequirePermissions(Permissions.TasksUpdate)
  async checkoutEquipment(@Body() body: { warehouseId: string, equipmentCode: string }, @Request() req: any) {
    const staffId = req.user?.sub;
    if (!staffId) {
      throw new UnauthorizedException("Authenticated user required");
    }
    return this.inventoryService.checkoutEquipment(body.warehouseId, body.equipmentCode, staffId)
  }

  @Patch("equipment/:id/return")
  @RequirePermissions(Permissions.TasksUpdate)
  async returnEquipment(@Param("id") id: string) {
    return this.inventoryService.returnEquipment(id)
  }

  @Get("equipment/logs")
  @RequirePermissions(Permissions.InventoryRead)
  async getEquipmentLogs() {
    return this.inventoryService.getEquipmentLogs()
  }

  @Post("pack-log")
  @RequirePermissions(Permissions.PackStationScan)
  async createPackLog(@Body() body: {
    barcode?: string;
    warehouseId?: string;
    orderId?: string;
    weightGrams?: number;
    dimensionCm?: string;
    deviceId?: string;
  }) {
    return this.inventoryService.createPackLog(body)
  }

  @Get("pack-log")
  @RequirePermissions(Permissions.InventoryRead)
  async getPackLogs() {
    return this.inventoryService.getPackLogs()
  }

  @Post("pack-log/next")
  @RequirePermissions(Permissions.PackStationScan)
  async nextPackOrder() {
    const db = this.prisma.getTenantDb();
    const order = await db.order.findFirst({
      where: { status: { in: ["PACKING", "PICKED", "PICKING", "NEW", "PENDING"] } },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (!order) {
      return { order: null, message: "No orders waiting in pack queue" };
    }
    return {
      packCode: order.trackingCode,
      orderId: order.id,
      trackingCode: order.trackingCode,
      recipientName: order.recipientName,
      status: order.status,
      items: (order.items || []).map((item: any) => ({
        productId: item.productId,
        sku: item.product?.sku,
        name: item.product?.name,
        barcode: item.product?.barcode,
        quantity: item.quantity,
        expectedWeightGrams: Math.round(Number(item.product?.weightKg || 0) * 1000 * item.quantity),
      })),
    };
  }

  @Post("pack-log/scan")
  @RequirePermissions(Permissions.PackStationScan)
  async scanPackItem(
    @Body() body: { barcode: string; packCode?: string; orderId?: string; warehouseId?: string; deviceId?: string },
    @Request() req: any,
  ) {
    if (!body?.barcode) {
      throw new BadRequestException("barcode is required");
    }
    const db = this.prisma.getTenantDb();
    const product = await db.product.findFirst({
      where: { OR: [{ barcode: body.barcode }, { sku: body.barcode }], deletedAt: null },
    });
    let warehouseId = body.warehouseId;
    if (!warehouseId) {
      const wh = await db.warehouse.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
      warehouseId = wh?.id;
    }
    if (!warehouseId) {
      throw new BadRequestException("No active warehouse available");
    }

    const result = product ? "MATCHED" : "UNKNOWN_BARCODE";
    const log = await db.scanLog.create({
      data: {
        warehouseId,
        barcode: body.barcode,
        result,
        deviceId: body.deviceId || "PACK-STATION-WEB",
        actorId: req.user?.sub || null,
      },
    });
    return { ok: Boolean(product), result, scanLog: log, product };
  }

  @Get("pack-log/summary")
  @RequirePermissions(Permissions.InventoryRead)
  async getPackSummary() {
    const db = this.prisma.getTenantDb();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [packedToday, scansToday, waitingOrders] = await Promise.all([
      db.packStationLog.count({ where: { createdAt: { gte: startOfDay } } }),
      db.scanLog.count({ where: { createdAt: { gte: startOfDay } } }),
      db.order.count({ where: { status: { in: ["PACKING", "PICKED", "PICKING", "NEW"] } } }),
    ]);
    return { packedToday, scansToday, waitingOrders };
  }

  @Get("pack-log/anomalies")
  @RequirePermissions(Permissions.InventoryRead)
  async getPackAnomalies() {
    const logs = await this.prisma.getTenantDb().packStationLog.findMany({
      include: { order: { include: { items: { include: { product: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const anomalies = logs
      .filter((log: any) => log.order && Number(log.weightGrams || 0) > 0)
      .map((log: any) => {
        const expectedGrams = (log.order.items || []).reduce(
          (s: number, it: any) => s + Number(it.product?.weightKg || 0) * 1000 * Number(it.quantity || 1),
          0,
        );
        const actualGrams = Number(log.weightGrams || 0);
        const deltaPct = expectedGrams > 0 ? Math.abs(actualGrams - expectedGrams) / expectedGrams : 0;
        return { log, expectedGrams, actualGrams, deltaPct };
      })
      .filter((row: any) => row.expectedGrams > 0 && row.deltaPct > 0.15)
      .map((row: any) => ({
        id: row.log.id,
        trackingCode: row.log.order?.trackingCode,
        expectedGrams: Math.round(row.expectedGrams),
        actualGrams: row.actualGrams,
        variancePct: Math.round(row.deltaPct * 100),
        createdAt: row.log.createdAt,
      }));
    return { data: anomalies, total: anomalies.length };
  }

  @Post("pack-log/predict")
  @RequirePermissions(Permissions.PackStationScan)
  async predictPackSku() {
    throw new NotImplementedException(
      "Server-side SKU vision model is not deployed; use client-side MobileNet pre-screen plus mandatory barcode confirmation.",
    );
  }

  @Post("pack-log/:packCode/seal")
  @RequirePermissions(Permissions.PackStationScan)
  async sealPackage(
    @Param("packCode") packCode: string,
    @Body() body: { weightGrams?: number; dimensionCm?: string; deviceId?: string; scannedSku?: string },
  ) {
    const db = this.prisma.getTenantDb();
    const order = await db.order.findFirst({
      where: { OR: [{ trackingCode: packCode }, { id: packCode }] },
    });
    if (!order) {
      throw new NotFoundException(`Order/pack ${packCode} not found`);
    }
    const warehouse = await db.warehouse.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
    if (!warehouse) {
      throw new BadRequestException("No active warehouse available");
    }

    return db.$transaction(async (tx: any) => {
      const log = await tx.packStationLog.create({
        data: {
          warehouseId: warehouse.id,
          orderId: order.id,
          weightGrams: body?.weightGrams !== undefined ? Number(body.weightGrams) : null,
          dimensionCm: body?.dimensionCm || null,
          deviceId: body?.deviceId || "PACK-STATION-WEB",
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "PACKED" },
      });
      await tx.orderTrackingEvent.create({
        data: {
          orderId: order.id,
          status: "PACKED",
          location: "Pack Station",
          description: body?.scannedSku
            ? `Sealed at pack station (SKU: ${body.scannedSku})`
            : "Sealed at pack station",
        },
      });
      return { ok: true, packCode, orderId: order.id, log };
    });
  }

  @Get("pack-log/:packCode")
  @RequirePermissions(Permissions.InventoryRead)
  async getPackByCode(@Param("packCode") packCode: string) {
    try {
      const db = this.prisma.getTenantDb();
      const order = await db.order.findFirst({
        where: { OR: [{ trackingCode: packCode }, { id: packCode }] },
        include: { items: { include: { product: true } }, PackStationLog: true },
      });
      if (!order) throw new NotFoundException(`Pack code ${packCode} not found`);
      return order;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException("Invalid packCode lookup");
    }
  }

  @Get("skus")
  @RequirePermissions(Permissions.InventoryRead)
  async listSkus(@Query("search") search?: string) {
    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { sku: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
      ];
    }
    return this.prisma.getTenantDb().product.findMany({ where, orderBy: { sku: "asc" }, take: 200 });
  }

  @Get("skus/barcode/:barcode")
  @RequirePermissions(Permissions.InventoryRead)
  async getSkuByBarcode(@Param("barcode") barcode: string) {
    const product = await this.prisma.getTenantDb().product.findFirst({
      where: { barcode, deletedAt: null },
    });
    if (!product) throw new NotFoundException(`Product barcode ${barcode} not found`);
    return product;
  }

  @Get("skus/:sku")
  @RequirePermissions(Permissions.InventoryRead)
  async getSku(@Param("sku") sku: string) {
    const product = await this.prisma.getTenantDb().product.findFirst({
      where: { OR: [{ sku }, { id: sku }], deletedAt: null },
    });
    if (!product) throw new NotFoundException(`Product SKU ${sku} not found`);
    return product;
  }

  @Get("corrections")
  @RequirePermissions(Permissions.InventoryRead)
  async listCorrections() {
    return this.prisma.getTenantDb().scanLog.findMany({
      where: { result: { not: "MATCHED" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  @Post("corrections")
  @RequirePermissions(Permissions.PackStationScan)
  async createCorrection(
    @Body() body: { barcode: string; warehouseId?: string; deviceId?: string; result?: string },
    @Request() req: any,
  ) {
    const db = this.prisma.getTenantDb();
    let warehouseId = body?.warehouseId;
    if (!warehouseId) {
      const wh = await db.warehouse.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
      warehouseId = wh?.id;
    }
    if (!warehouseId || !body?.barcode) {
      throw new BadRequestException("barcode and active warehouse are required");
    }
    return db.scanLog.create({
      data: {
        warehouseId,
        barcode: String(body.barcode),
        result: String(body.result || "PENDING_REVIEW"),
        deviceId: body.deviceId || "PACK-STATION-WEB",
        actorId: req.user?.sub || null,
      },
    });
  }

  @Patch("corrections/:id")
  @RequirePermissions(Permissions.InventoryAdjust)
  async updateCorrection(@Param("id") id: string, @Body() body: { status?: string; result?: string }) {
    const db = this.prisma.getTenantDb();
    const existing = await db.scanLog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Correction ${id} not found`);
    return db.scanLog.update({
      where: { id },
      data: { result: String(body?.status || body?.result || "RESOLVED") },
    });
  }
}
