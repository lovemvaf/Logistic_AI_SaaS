import { Controller, Get, Post, Body, Param, UseGuards, Request, Query, NotFoundException, UnauthorizedException, BadRequestException } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types"
import { InventoryService } from "../services/inventory.service"
import { PrismaService } from "../../../core/prisma/prisma.service"

@ApiTags("Inventory")
@Controller("inventory")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService
  ) {}

  private requireActorId(req: any): string {
    const actorId = req.user?.sub;
    if (!actorId) {
      throw new UnauthorizedException("Authenticated user required");
    }
    return actorId;
  }

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async listInventory(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 20,
    @Query("warehouseId") warehouseId?: string,
    @Query("search") search?: string,
  ) {
    const safePage = Math.max(1, Number(page || 1));
    const take = Math.min(100, Math.max(1, Number(limit || 20)));
    const skip = (safePage - 1) * take;
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (search) {
      where.OR = [
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { product: { name: { contains: search, mode: "insensitive" } } },
        { bin: { barcode: { contains: search, mode: "insensitive" } } },
      ];
    }

    const db = this.prisma.getTenantDb();
    const [data, total] = await Promise.all([
      db.inventory.findMany({
        where,
        skip,
        take,
        include: { product: true, warehouse: true, bin: { include: { rack: { include: { zone: true } } } } },
        orderBy: { updatedAt: "desc" },
      }),
      db.inventory.count({ where }),
    ]);

    return {
      data: data.map((row: any) => ({
        ...row,
        available: Math.max(0, Number(row.quantityOnHand || 0) - Number(row.quantityAllocated || 0)),
      })),
      meta: { total, page: safePage, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  @Get("summary")
  @RequirePermissions(Permissions.InventoryRead)
  async getSummary() {
    return this.inventoryService.getSummary()
  }

  @Get("ledger")
  @RequirePermissions(Permissions.InventoryRead)
  async getLedger(@Query("page") page: number, @Query("limit") limit: number) {
    return this.inventoryService.getLedger({ page: Number(page || 1), limit: Number(limit || 20) })
  }

  @Post("adjust")
  @RequirePermissions(Permissions.InventoryAdjust)
  async adjustStock(@Body() body: { inventoryId?: string, sku?: string, qtyChange: number, reason: string }, @Request() req: any) {
    const actorId = this.requireActorId(req);
    const qtyChange = Number(body.qtyChange);
    if (!Number.isInteger(qtyChange) || qtyChange === 0) {
      throw new BadRequestException("qtyChange must be a non-zero integer");
    }

    let inventoryId = body.inventoryId;
    if (!inventoryId && body.sku) {
      const product = await this.prisma.getTenantDb().product.findFirst({
        where: { sku: body.sku, tenantId: this.prisma.currentTenant.tenantId },
      });
      if (!product) throw new NotFoundException(`Product SKU ${body.sku} not found`);
      const inventory = await this.prisma.getTenantDb().inventory.findFirst({ where: { productId: product.id } });
      if (!inventory) throw new NotFoundException(`No inventory record found for SKU ${body.sku}`);
      inventoryId = inventory.id;
    }
    if (!inventoryId) {
      throw new BadRequestException("inventoryId or sku is required");
    }
    return this.inventoryService.adjustStock(inventoryId, qtyChange, body.reason, actorId)
  }

  @Post("receive")
  @RequirePermissions(Permissions.InventoryAdjust)
  async receiveStock(@Body() body: { sku?: string, binBarcode?: string, warehouseId?: string, binId?: string, productId?: string, quantity: number, reason?: string }, @Request() req: any) {
    const actorId = this.requireActorId(req);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException("quantity must be a positive integer");
    }
    let { warehouseId, binId, productId } = body;
    
    if (body.sku) {
      const product = await this.prisma.getTenantDb().product.findFirst({
        where: { sku: body.sku, tenantId: this.prisma.currentTenant.tenantId },
      });
      if (!product) throw new NotFoundException(`Product SKU ${body.sku} not found`);
      productId = product.id;
    }
    
    if (body.binBarcode) {
      const bin = await this.prisma.getTenantDb().bin.findFirst({
        where: { barcode: body.binBarcode, tenantId: this.prisma.currentTenant.tenantId },
      });
      if (!bin) throw new NotFoundException(`Bin barcode ${body.binBarcode} not found`);
      binId = bin.id;
      warehouseId = bin.warehouseId;
    }

    if (!warehouseId || !binId || !productId) {
      throw new NotFoundException("Missing required IDs or could not resolve them from SKU/Barcode");
    }

    return this.inventoryService.receiveStock({
      warehouseId, binId, productId, quantity, reason: body.reason || "RECEIVE"
    }, actorId);
  }

  @Post("transfer")
  @RequirePermissions(Permissions.InventoryAdjust)
  async transferStock(@Body() body: { barcode?: string, sourceBin?: string, destBin?: string, sourceInventoryId?: string, targetBinId?: string, quantity: number, reason?: string }, @Request() req: any) {
    const actorId = this.requireActorId(req);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException("quantity must be a positive integer");
    }
    let { sourceInventoryId, targetBinId } = body;

    if (body.barcode && body.sourceBin) {
      // Find inventory by product barcode or SKU in source bin
      const product = await this.prisma.getTenantDb().product.findFirst({
        where: { OR: [{ barcode: body.barcode }, { sku: body.barcode }] }
      });
      if (!product) throw new NotFoundException(`Product ${body.barcode} not found`);

      const srcBin = await this.prisma.getTenantDb().bin.findFirst({
        where: { barcode: body.sourceBin, tenantId: this.prisma.currentTenant.tenantId },
      });
      if (!srcBin) throw new NotFoundException(`Source bin ${body.sourceBin} not found`);

      const inv = await this.prisma.getTenantDb().inventory.findFirst({
        where: { productId: product.id, binId: srcBin.id }
      });
      if (!inv) throw new NotFoundException(`Inventory for ${body.barcode} in ${body.sourceBin} not found`);
      
      sourceInventoryId = inv.id;
    }

    if (body.destBin) {
      const dstBin = await this.prisma.getTenantDb().bin.findFirst({
        where: { barcode: body.destBin, tenantId: this.prisma.currentTenant.tenantId },
      });
      if (!dstBin) throw new NotFoundException(`Destination bin ${body.destBin} not found`);
      targetBinId = dstBin.id;
    }

    if (!sourceInventoryId || !targetBinId) {
      throw new NotFoundException("Missing required IDs or could not resolve them from barcodes");
    }

    return this.inventoryService.transferStock({
      sourceInventoryId, targetBinId, quantity, reason: body.reason || "TRANSFER"
    }, actorId);
  }

  @Post("putaway-suggestion")
  @RequirePermissions(Permissions.InventoryRead)
  async suggestPutaway(@Body() body: { sku: string; quantity: number; warehouseId?: string }) {
    if (!body?.sku) {
      throw new BadRequestException("sku is required");
    }
    const quantity = Math.max(1, Number(body.quantity || 1));
    const db = this.prisma.getTenantDb();
    const product = await db.product.findFirst({ where: { sku: body.sku, deletedAt: null } });
    if (!product) {
      throw new NotFoundException(`Product SKU ${body.sku} not found`);
    }

    const bins = await db.bin.findMany({
      where: body.warehouseId ? { warehouseId: body.warehouseId } : {},
      include: {
        warehouse: true,
        rack: { include: { zone: true } },
        inventory: { include: { product: true } },
      },
      take: 30,
    });

    const requiredWeight = Number(product.weightKg || 0) * quantity;
    const requiredVolume = Number(product.volumeCbm || 0) * quantity;

    const candidates = bins
      .map((bin: any) => {
        const currentUnits = (bin.inventory || []).reduce((s: number, inv: any) => s + Number(inv.quantityOnHand || 0), 0);
        const usedWeight = (bin.inventory || []).reduce(
          (s: number, inv: any) => s + Number(inv.quantityOnHand || 0) * Number(inv.product?.weightKg || 0),
          0,
        );
        const freeWeight = Math.max(0, Number(bin.maxWeightKg || 1000) - usedWeight);
        const sameSkuBoost = (bin.inventory || []).some((inv: any) => inv.productId === product.id) ? 20 : 0;
        const fits = freeWeight >= requiredWeight && Number(bin.maxVolumeCbm || 1.5) >= requiredVolume;
        const score = Math.max(0, 100 - Math.min(60, currentUnits) + sameSkuBoost - (fits ? 0 : 80));
        return {
          binId: bin.id,
          barcode: bin.barcode,
          warehouseId: bin.warehouseId,
          warehouseName: bin.warehouse?.name || null,
          zoneCode: bin.rack?.zone?.code || null,
          freeWeightKg: Math.round(freeWeight * 100) / 100,
          fits,
          score,
        };
      })
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5);

    return {
      sku: product.sku,
      quantity,
      recommendedBin: candidates[0] || null,
      candidates,
    };
  }

  @Get(":id")
  @RequirePermissions(Permissions.InventoryRead)
  async getInventoryDetail(@Param("id") id: string) {
    const inv = await this.prisma.getTenantDb().inventory.findUnique({
      where: { id },
      include: { product: true, warehouse: true, bin: { include: { rack: { include: { zone: true } } } } },
    });
    if (!inv) throw new NotFoundException(`Inventory ${id} not found`);
    return inv;
  }
}
