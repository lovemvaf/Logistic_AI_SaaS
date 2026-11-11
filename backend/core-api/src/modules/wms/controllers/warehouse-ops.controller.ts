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

  private mapOrderForPack(order: any) {
    const items = order.items || [];
    const firstItem = items[0];
    const expectedSku = firstItem?.product?.sku || order.clientOrderRef || order.trackingCode;
    const expectedQuantity =
      items.reduce((sum: number, item: any) => sum + Number(item.quantity || 1), 0) || 1;
    const estimatedWeight =
      Math.round(
        items.reduce(
          (sum: number, item: any) =>
            sum + Number(item.product?.weightKg || 0.5) * Number(item.quantity || 1),
          0,
        ) * 100,
      ) / 100 || 1;
    const boxType = estimatedWeight > 8 ? "LARGE" : estimatedWeight > 2 ? "MEDIUM" : "SMALL";
    const normalizedStatus =
      order.status === "NEW" || order.status === "PENDING" || order.status === "PICKED"
        ? "PENDING"
        : order.status === "PICKING" || order.status === "PACKING"
          ? "IN_QUEUE"
          : order.status;
    const scheduledSource = order.estimatedDeliveryDate || order.createdAt || new Date();
    const scheduledAt =
      scheduledSource instanceof Date
        ? scheduledSource.toISOString()
        : String(scheduledSource);

    return {
      id: order.id,
      orderId: order.id,
      packCode: order.trackingCode,
      trackingCode: order.trackingCode,
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      recipientAddress: order.recipientAddress,
      expectedSku,
      expectedQuantity,
      estimatedWeight,
      boxType,
      status: normalizedStatus,
      rawStatus: order.status,
      priority: "NORMAL" as const,
      scheduledAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      sealedAt: order.status === "PACKED" ? order.updatedAt : null,
      items: items.map((item: any) => ({
        productId: item.productId,
        sku: item.product?.sku,
        name: item.product?.name,
        barcode: item.product?.barcode,
        quantity: item.quantity,
        expectedWeightGrams: Math.round(Number(item.product?.weightKg || 0) * 1000 * item.quantity),
      })),
    };
  }

  @Get("pack-queue")
  @RequirePermissions(Permissions.InventoryRead)
  async getPackQueue() {
    const orders = await this.prisma.getTenantDb().order.findMany({
      where: { status: { in: ["PACKING", "PICKED", "PICKING", "NEW", "PENDING"] } },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return orders.map((order: any) => this.mapOrderForPack(order));
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
    return this.mapOrderForPack(order);
  }

  @Post("pack-log/scan")
  @RequirePermissions(Permissions.PackStationScan)
  async scanPackItem(
    @Body()
    body: {
      barcode?: string;
      scannedSku?: string;
      packCode?: string;
      orderId?: string;
      warehouseId?: string;
      deviceId?: string;
      confidence?: number;
    },
    @Request() req: any,
  ) {
    const code = String(body?.barcode || body?.scannedSku || "").trim();
    if (!code) {
      throw new BadRequestException("barcode or scannedSku is required");
    }
    const db = this.prisma.getTenantDb();
    const [product, order] = await Promise.all([
      db.product.findFirst({
        where: { OR: [{ barcode: code }, { sku: code }], deletedAt: null },
      }),
      body?.packCode || body?.orderId
        ? db.order.findFirst({
            where: {
              OR: [
                ...(body?.packCode ? [{ trackingCode: body.packCode }] : []),
                ...(body?.orderId ? [{ id: body.orderId }] : []),
              ],
            },
            include: { items: { include: { product: true } } },
          })
        : Promise.resolve(null),
    ]);

    let warehouseId = body.warehouseId;
    if (!warehouseId) {
      const wh = await db.warehouse.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
      warehouseId = wh?.id;
    }
    if (!warehouseId) {
      throw new BadRequestException("No active warehouse available");
    }

    let result = product ? "MATCHED" : "UNKNOWN_BARCODE";
    let matchedOrder = false;
    let mappedOrder: any = null;
    if (order) {
      mappedOrder = this.mapOrderForPack(order);
      const codeNorm = code.toLowerCase();
      const itemMatch = (order.items || []).some(
        (it: any) =>
          String(it.product?.sku || "").trim().toLowerCase() === codeNorm ||
          String(it.product?.barcode || "").trim().toLowerCase() === codeNorm,
      );
      const fallbackMatch =
        String(mappedOrder.expectedSku || "").trim().toLowerCase() === codeNorm ||
        (product && (order.items || []).some((it: any) => it.productId === product.id));
      matchedOrder = Boolean(itemMatch || fallbackMatch);
      result = matchedOrder ? "MATCHED" : "MISMATCH";
      mappedOrder.scannedSku = code;
      mappedOrder.scanResult = matchedOrder ? "MATCH" : "MISMATCH";
      mappedOrder.scannedAt = new Date().toISOString();
    } else if (body?.packCode) {
      matchedOrder = Boolean(product);
      result = matchedOrder ? "MATCHED" : "MISMATCH";
    }

    const logDevice = body?.packCode
      ? `PACK|${body.packCode}|${mappedOrder?.expectedSku || ""}`
      : body.deviceId || "PACK-STATION-WEB";

    const log = await db.scanLog.create({
      data: {
        warehouseId,
        barcode: code,
        result,
        deviceId: logDevice,
        actorId: req.user?.sub || null,
      },
    });
    return {
      ok: Boolean(order ? matchedOrder : product),
      result,
      matchStatus: result === "MATCHED" ? "MATCH" : "MISMATCH",
      scanLog: log,
      product,
      ...(mappedOrder ? { order: mappedOrder } : {}),
    };
  }

  @Get("pack-log/summary")
  @RequirePermissions(Permissions.InventoryRead)
  async getPackSummary() {
    const db = this.prisma.getTenantDb();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [packedToday, scansToday, matchedScansToday, waitingOrders, todayShifts, correctionCount] =
      await Promise.all([
        db.packStationLog.count({ where: { createdAt: { gte: startOfDay } } }),
        db.scanLog.count({ where: { createdAt: { gte: startOfDay } } }),
        db.scanLog.count({ where: { createdAt: { gte: startOfDay }, result: "MATCHED" } }),
        db.order.count({ where: { status: { in: ["PACKING", "PICKED", "PICKING", "NEW", "PENDING"] } } }),
        db.staffShift.findMany({ where: { shiftStart: { gte: startOfDay } }, select: { shiftStart: true, shiftEnd: true } }),
        db.scanLog.count({ where: { result: { not: "MATCHED" } } }),
      ]);
    const sessionsToday = todayShifts.length;
    const nowMs = Date.now();
    const totalShiftMs = todayShifts.reduce((sum: number, s: any) => {
      const start = new Date(s.shiftStart).getTime();
      const end = s.shiftEnd ? new Date(s.shiftEnd).getTime() : nowMs;
      return sum + Math.max(0, end - start);
    }, 0);
    const averageSecondsPerPack =
      packedToday > 0 && todayShifts.length > 0
        ? Math.max(1, Math.round(totalShiftMs / 1000 / packedToday))
        : null;
    const matchRate = scansToday > 0 ? Math.round((matchedScansToday / scansToday) * 100) : 100;
    return {
      packedToday,
      scansToday,
      waitingOrders,
      sessionsToday,
      packsToday: packedToday,
      matchRate,
      correctionCount,
      averageSecondsPerPack,
    };
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
      .map((row: any) => {
        const firstSku = row.log.order?.items?.[0]?.product?.sku || row.log.order?.trackingCode || "";
        const expectedKg = Math.round((row.expectedGrams / 1000) * 100) / 100;
        const detectedKg = Math.round((row.actualGrams / 1000) * 100) / 100;
        const variancePct = Math.round(row.deltaPct * 100);
        return {
          id: row.log.id,
          packCode: row.log.order?.trackingCode,
          trackingCode: row.log.order?.trackingCode,
          kind: "VOLUMETRIC",
          severity: row.deltaPct > 0.3 ? "high" : "medium",
          expectedSku: firstSku,
          expectedWeight: expectedKg,
          detectedWeight: detectedKg,
          expectedGrams: Math.round(row.expectedGrams),
          actualGrams: row.actualGrams,
          variancePct,
          message: `Sai lệch trọng lượng kiện ${row.log.order?.trackingCode}: dự kiến ${expectedKg}kg, cân thực tế ${detectedKg}kg (${variancePct}%).`,
          recommendation: "Kiểm tra lại số lượng sản phẩm và đóng gói bổ sung trước khi bàn giao.",
          createdAt: row.log.createdAt,
        };
      });
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
      return {
        ...this.mapOrderForPack(order),
        PackStationLog: order.PackStationLog,
      };
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
    const logs = await this.prisma.getTenantDb().scanLog.findMany({
      where: { result: { not: "MATCHED" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return logs.map((log: any) => {
      const parts = String(log.deviceId || "").startsWith("PACK-OVERRIDE|")
        ? String(log.deviceId).split("|")
        : [];
      const packCode = parts[1] || log.barcode;
      const orderSku = parts[2] || log.barcode;
      const reason = parts[3] || `Scan status: ${log.result}`;
      const normalizedStatus =
        log.result === "APPROVED" || log.result === "REJECTED" ? log.result : "PENDING";
      return {
        ...log,
        packCode,
        trackingCode: packCode,
        orderSku,
        scannedSku: log.barcode,
        reason,
        status: normalizedStatus,
      };
    });
  }

  @Post("corrections")
  @RequirePermissions(Permissions.PackStationScan)
  async createCorrection(
    @Body()
    body: {
      barcode?: string;
      scannedSku?: string;
      packCode?: string;
      trackingCode?: string;
      orderSku?: string;
      reason?: string;
      status?: string;
      warehouseId?: string;
      deviceId?: string;
      result?: string;
    },
    @Request() req: any,
  ) {
    const db = this.prisma.getTenantDb();
    let warehouseId = body?.warehouseId;
    if (!warehouseId) {
      const wh = await db.warehouse.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
      warehouseId = wh?.id;
    }
    const barcode = String(
      body?.barcode || body?.scannedSku || body?.orderSku || body?.packCode || "",
    ).trim();
    if (!warehouseId || !barcode) {
      throw new BadRequestException("barcode (or scannedSku) and active warehouse are required");
    }
    const encodedDevice = body?.packCode
      ? `PACK-OVERRIDE|${body.packCode}|${body.orderSku || barcode}|${String(body.reason || "").slice(0, 120)}`
      : body.deviceId || "PACK-STATION-WEB";
    const statusValue = String(body?.status || body?.result || "PENDING");
    const created = await db.scanLog.create({
      data: {
        warehouseId,
        barcode,
        result: statusValue,
        deviceId: encodedDevice,
        actorId: req.user?.sub || null,
      },
    });
    return {
      ...created,
      packCode: body?.packCode || barcode,
      trackingCode: body?.trackingCode || body?.packCode || barcode,
      orderSku: body?.orderSku || barcode,
      scannedSku: barcode,
      reason: body?.reason || "",
      status: statusValue === "APPROVED" || statusValue === "REJECTED" ? statusValue : "PENDING",
    };
  }

  @Patch("corrections/:id")
  @RequirePermissions(Permissions.InventoryAdjust)
  async updateCorrection(@Param("id") id: string, @Body() body: { status?: string; result?: string }) {
    const db = this.prisma.getTenantDb();
    const existing = await db.scanLog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Correction ${id} not found`);
    return db.scanLog.update({
      where: { id },
      data: { result: String(body?.status || body?.result || "APPROVED") },
    });
  }
}
