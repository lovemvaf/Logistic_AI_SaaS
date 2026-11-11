import { Injectable, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const db = this.prisma.getTenantDb();

    const [totalSkus, inventoryRecords, warehouses, inStockGroups] = await Promise.all([
      db.product.count({ where: { deletedAt: null } }),
      db.inventory.count(),
      db.warehouse.count({ where: { deletedAt: null } }),
      db.inventory.findMany({
        where: { quantityOnHand: { gt: 0 } },
        select: { productId: true },
        distinct: ['productId'],
      }),
    ]);

    const inStockSkus = new Set(inStockGroups.map((row: any) => row.productId)).size;

    return {
      totalSkus,
      outOfStockSkus: Math.max(0, totalSkus - inStockSkus),
      inventoryRecords,
      warehouses,
    };
  }

  async getLedger(params: { warehouseId?: string, productId?: string, page?: number, limit?: number }) {
    const safePage = Math.max(1, Number(params.page || 1));
    const take = Math.min(100, Math.max(1, Number(params.limit || 20)));
    const skip = (safePage - 1) * take;

    const where: any = {};
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.productId) {
      where.inventory = { productId: params.productId };
    }

    const [data, total] = await Promise.all([
      this.prisma.getTenantDb().stockMovement.findMany({
        where,
        skip,
        take,
        include: { 
          inventory: { include: { product: true, bin: true } },
          warehouse: true 
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.getTenantDb().stockMovement.count({ where }),
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

  async adjustStock(inventoryId: string, qtyChange: number, reason: string, actorId: string) {
    if (!Number.isInteger(qtyChange) || qtyChange === 0) {
      throw new BadRequestException("Quantity change must be a non-zero integer");
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const inv = await tx.inventory.findUnique({ where: { id: inventoryId } });
      if (!inv) throw new ConflictException("Inventory not found");

      if (inv.quantityOnHand + qtyChange < inv.quantityAllocated) {
        throw new ConflictException("Insufficient available stock (cannot drop below reserved allocation)");
      }

      const result = await tx.$executeRaw`
        UPDATE inventory
        SET quantity_on_hand = quantity_on_hand + ${qtyChange},
            version = version + 1
        WHERE id = ${inventoryId}
          AND version = ${inv.version}
          AND (quantity_on_hand + ${qtyChange}) >= quantity_allocated
      `;

      if (result === 0) {
        throw new ConflictException("Inventory was modified by another transaction. Please reload.");
      }

      await tx.stockMovement.create({
        data: {
          inventoryId,
          warehouseId: inv.warehouseId,
          transactionType: "ADJUSTMENT",
          quantityChange: qtyChange,
          balanceAfter: inv.quantityOnHand + qtyChange,
          reasonCode: reason,
          actorId,
        }
      });

      await tx.adjustment.create({
        data: {
          inventoryId,
          warehouseId: inv.warehouseId,
          quantityChange: qtyChange,
          reasonCode: reason,
          createdBy: actorId,
        }
      });

      return { ok: true, newBalance: inv.quantityOnHand + qtyChange };
    });
  }

  async receiveStock(data: { warehouseId: string, binId: string, productId: string, batchNumber?: string, lpn?: string, quantity: number, reason: string }, actorId: string) {
    if (!Number.isInteger(data.quantity) || data.quantity <= 0) {
      throw new BadRequestException("Receive quantity must be a positive integer");
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      let inv = await tx.inventory.findFirst({
        where: {
          warehouseId: data.warehouseId,
          binId: data.binId,
          productId: data.productId,
          batchNumber: data.batchNumber || null,
          lpn: data.lpn || null,
        }
      });

      if (!inv) {
        inv = await tx.inventory.create({
          data: {
            warehouseId: data.warehouseId,
            binId: data.binId,
            productId: data.productId,
            batchNumber: data.batchNumber || null,
            lpn: data.lpn || null,
            quantityOnHand: data.quantity,
            version: 1,
          }
        });
      } else {
        const result = await tx.$executeRaw`
          UPDATE inventory
          SET quantity_on_hand = quantity_on_hand + ${data.quantity},
              version = version + 1
          WHERE id = ${inv.id}
            AND version = ${inv.version}
        `;
        if (result === 0) {
          throw new ConflictException("Inventory was modified by another transaction. Please reload.");
        }
        inv.quantityOnHand += data.quantity;
      }

      await tx.stockMovement.create({
        data: {
          inventoryId: inv.id,
          warehouseId: data.warehouseId,
          transactionType: "RECEIPT",
          quantityChange: data.quantity,
          balanceAfter: inv.quantityOnHand,
          reasonCode: data.reason,
          actorId,
        }
      });

      return { ok: true, inventoryId: inv.id, newBalance: inv.quantityOnHand };
    });
  }

  async transferStock(data: { sourceInventoryId: string, targetBinId: string, quantity: number, reason: string }, actorId: string) {
    if (!Number.isInteger(data.quantity) || data.quantity <= 0) {
      throw new BadRequestException("Transfer quantity must be a positive integer");
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const sourceInv = await tx.inventory.findUnique({ where: { id: data.sourceInventoryId } });
      if (!sourceInv) throw new BadRequestException("Source inventory not found");
      if (sourceInv.binId === data.targetBinId) {
        throw new BadRequestException("Source and destination bin must be different");
      }

      const targetBin = await tx.bin.findUnique({ where: { id: data.targetBinId } });
      if (!targetBin || targetBin.warehouseId !== sourceInv.warehouseId) {
        throw new BadRequestException("Target bin not found in source warehouse");
      }

      const available = sourceInv.quantityOnHand - sourceInv.quantityAllocated;
      if (available < data.quantity) {
        throw new ConflictException(`Insufficient unallocated stock in source bin (available: ${available})`);
      }

      const sourceResult = await tx.$executeRaw`
        UPDATE inventory
        SET quantity_on_hand = quantity_on_hand - ${data.quantity},
            version = version + 1
        WHERE id = ${sourceInv.id}
          AND version = ${sourceInv.version}
          AND (quantity_on_hand - quantity_allocated) >= ${data.quantity}
      `;
      if (sourceResult === 0) {
        throw new ConflictException("Source inventory was modified by another transaction. Please reload.");
      }

      let targetInv = await tx.inventory.findFirst({
        where: {
          warehouseId: sourceInv.warehouseId,
          binId: data.targetBinId,
          productId: sourceInv.productId,
          batchNumber: sourceInv.batchNumber || null,
          lpn: sourceInv.lpn || null,
        }
      });

      if (!targetInv) {
        targetInv = await tx.inventory.create({
          data: {
            warehouseId: sourceInv.warehouseId,
            binId: data.targetBinId,
            productId: sourceInv.productId,
            batchNumber: sourceInv.batchNumber || null,
            lpn: sourceInv.lpn || null,
            quantityOnHand: data.quantity,
            version: 1,
          }
        });
      } else {
        const targetResult = await tx.$executeRaw`
          UPDATE inventory
          SET quantity_on_hand = quantity_on_hand + ${data.quantity},
              version = version + 1
          WHERE id = ${targetInv.id}
            AND version = ${targetInv.version}
        `;
        if (targetResult === 0) {
          throw new ConflictException("Target inventory was modified by another transaction. Please reload.");
        }
        targetInv.quantityOnHand += data.quantity;
      }

      await tx.stockMovement.createMany({
        data: [
          {
            inventoryId: sourceInv.id,
            warehouseId: sourceInv.warehouseId,
            transactionType: "TRANSFER_OUT",
            quantityChange: -data.quantity,
            balanceAfter: sourceInv.quantityOnHand - data.quantity,
            reasonCode: data.reason,
            actorId,
          },
          {
            inventoryId: targetInv.id,
            warehouseId: targetInv.warehouseId,
            transactionType: "TRANSFER_IN",
            quantityChange: data.quantity,
            balanceAfter: targetInv.quantityOnHand,
            reasonCode: data.reason,
            actorId,
          }
        ]
      });

      return { ok: true, sourceBalance: sourceInv.quantityOnHand - data.quantity, targetBalance: targetInv.quantityOnHand };
    });
  }

  async getAdjustments(params: { page?: number; limit?: number }) {
    const safePage = Math.max(1, Number(params.page || 1));
    const take = Math.min(100, Math.max(1, Number(params.limit || 20)));
    const skip = (safePage - 1) * take;

    const [data, total] = await Promise.all([
      this.prisma.getTenantDb().adjustment.findMany({
        skip,
        take,
        include: { inventory: { include: { product: true } }, creator: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.getTenantDb().adjustment.count(),
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

  // --- Cycle Count Methods ---

  async createCycleCount(data: { warehouseId: string, scheduledAt?: Date, actorId: string }) {
    return this.prisma.getTenantDb().cycleCount.create({
      data: {
        warehouseId: data.warehouseId,
        scheduledAt: data.scheduledAt,
        createdBy: data.actorId,
        status: "PENDING"
      }
    });
  }

  async getCycleCounts(warehouseId: string, params: { page?: number; limit?: number }) {
    const safePage = Math.max(1, Number(params.page || 1));
    const take = Math.min(100, Math.max(1, Number(params.limit || 20)));
    const skip = (safePage - 1) * take;

    const where = warehouseId ? { warehouseId } : {};
    const [data, total] = await Promise.all([
      this.prisma.getTenantDb().cycleCount.findMany({
        where,
        skip,
        take,
        include: { creator: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.getTenantDb().cycleCount.count({ where }),
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

  async updateCycleCountStatus(id: string, status: string) {
    return this.prisma.getTenantDb().cycleCount.update({
      where: { id },
      data: { status }
    });
  }

  // --- Warehouse Operations Methods ---

  async startShift(warehouseId: string, staffId: string) {
    if (!warehouseId) {
      const wh = await this.prisma.getTenantDb().warehouse.findFirst();
      if (!wh) throw new Error("No warehouse available");
      warehouseId = wh.id;
    }
    return this.prisma.getTenantDb().staffShift.create({
      data: {
        warehouseId,
        staffId,
        shiftStart: new Date(),
        status: "OPEN"
      }
    });
  }

  async endShift(shiftId: string) {
    return this.prisma.getTenantDb().staffShift.update({
      where: { id: shiftId },
      data: {
        shiftEnd: new Date(),
        status: "CLOSED"
      }
    });
  }

  async checkoutEquipment(warehouseId: string, equipmentCode: string, staffId: string) {
    if (!warehouseId) {
      const wh = await this.prisma.getTenantDb().warehouse.findFirst();
      if (!wh) throw new Error("No warehouse available");
      warehouseId = wh.id;
    }
    return this.prisma.getTenantDb().equipmentCheckout.create({
      data: {
        warehouseId,
        equipmentCode,
        staffId,
        checkedOutAt: new Date(),
        status: "OUT"
      }
    });
  }

  async returnEquipment(checkoutId: string) {
    return this.prisma.getTenantDb().equipmentCheckout.update({
      where: { id: checkoutId },
      data: {
        returnedAt: new Date(),
        status: "RETURNED"
      }
    });
  }

  async getEquipmentLogs() {
    return this.prisma.getTenantDb().equipmentCheckout.findMany({
      orderBy: { checkedOutAt: 'desc' },
      take: 50
    });
  }

  async createPackLog(data: {
    barcode?: string;
    warehouseId?: string;
    orderId?: string;
    weightGrams?: number;
    dimensionCm?: string;
    deviceId?: string;
  }) {
    const db = this.prisma.getTenantDb();

    // The pack station scans an order/tracking barcode, so resolve it to an
    // order when the caller did not pass an explicit orderId.
    let orderId = data.orderId;
    if (!orderId && data.barcode) {
      const order = await db.order.findFirst({
        where: {
          OR: [
            { trackingCode: data.barcode },
            { clientOrderRef: data.barcode },
          ],
        },
        select: { id: true },
      });
      orderId = order?.id;
    }

    let warehouseId = data.warehouseId;
    if (!warehouseId) {
      const warehouse = await db.warehouse.findFirst({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      warehouseId = warehouse?.id;
    }

    if (!warehouseId) {
      throw new BadRequestException(
        "No active warehouse available for pack logging",
      );
    }

    return db.packStationLog.create({
      data: {
        warehouseId,
        orderId,
        weightGrams: data.weightGrams,
        dimensionCm: data.dimensionCm,
        deviceId: data.deviceId,
      },
      include: {
        order: { select: { trackingCode: true, status: true } },
        warehouse: { select: { name: true, code: true } },
      },
    });
  }

  async getPackLogs(limit = 100) {
    return this.prisma.getTenantDb().packStationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 100, 200),
      include: {
        order: { select: { trackingCode: true, status: true } },
        warehouse: { select: { name: true, code: true } },
      },
    });
  }

  async reserveStock(inventoryId: string, quantity: number) {
    if (quantity <= 0) throw new ConflictException("Reservation quantity must be > 0");

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const inv = await tx.inventory.findUnique({ where: { id: inventoryId } });
      if (!inv) throw new ConflictException("Inventory not found");

      const available = inv.quantityOnHand - inv.quantityAllocated;
      if (available < quantity) {
        throw new ConflictException(`Insufficient available stock. Available: ${available}, Requested: ${quantity}`);
      }

      const result = await tx.$executeRaw`
        UPDATE inventory
        SET quantity_allocated = quantity_allocated + ${quantity},
            version = version + 1
        WHERE id = ${inventoryId}
          AND version = ${inv.version}
          AND (quantity_on_hand - quantity_allocated) >= ${quantity}
      `;

      if (result === 0) {
        throw new ConflictException("Inventory was modified by another transaction. Please reload.");
      }

      return { ok: true, reserved: quantity, newAvailable: available - quantity };
    });
  }

  async releaseReservation(inventoryId: string, quantity: number) {
    if (quantity <= 0) throw new ConflictException("Release quantity must be > 0");

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const inv = await tx.inventory.findUnique({ where: { id: inventoryId } });
      if (!inv) throw new ConflictException("Inventory not found");

      if (inv.quantityAllocated < quantity) {
        throw new ConflictException("Cannot release more than reserved");
      }

      const result = await tx.$executeRaw`
        UPDATE inventory
        SET quantity_allocated = quantity_allocated - ${quantity},
            version = version + 1
        WHERE id = ${inventoryId}
          AND version = ${inv.version}
          AND quantity_allocated >= ${quantity}
      `;

      if (result === 0) {
        throw new ConflictException("Inventory was modified by another transaction. Please reload.");
      }

      return { ok: true, released: quantity, newAvailable: inv.quantityOnHand - (inv.quantityAllocated - quantity) };
    });
  }

  async getLowStockAlerts(warehouseId: string, threshold: number = 10) {
    const lowStockItems = await this.prisma.getTenantDb().inventory.findMany({
      where: {
        warehouseId,
        quantityOnHand: { lte: threshold },
        status: 'AVAILABLE',
      },
      include: { product: true, bin: true },
      orderBy: { quantityOnHand: 'asc' },
    });

    return {
      alerts: lowStockItems.map((item: any) => ({
        inventoryId: item.id,
        productSku: item.product.sku,
        productName: item.product.name,
        binBarcode: item.bin.barcode,
        quantityOnHand: item.quantityOnHand,
        quantityAllocated: item.quantityAllocated,
        available: item.quantityOnHand - item.quantityAllocated,
        threshold,
      })),
      count: lowStockItems.length,
    };
  }

  async getStockSummary(warehouseId: string) {
    const summary = await this.prisma.getTenantDb().inventory.groupBy({
      by: ['productId'],
      where: { warehouseId },
      _sum: {
        quantityOnHand: true,
        quantityAllocated: true,
      },
      _count: true,
    });

    const products = await this.prisma.getTenantDb().product.findMany({
      where: { id: { in: summary.map((s: any) => s.productId) } },
    });

    const productMap = new Map(products.map((p: any) => [p.id, p as any]));

    return summary.map((s: any) => {
      const product = productMap.get(s.productId) as any;
      return {
        productId: s.productId,
        productSku: product?.sku,
        productName: product?.name,
        totalOnHand: s._sum.quantityOnHand || 0,
        totalAllocated: s._sum.quantityAllocated || 0,
        totalAvailable: (s._sum.quantityOnHand || 0) - (s._sum.quantityAllocated || 0),
        binCount: s._count,
      };
    });
  }
}
