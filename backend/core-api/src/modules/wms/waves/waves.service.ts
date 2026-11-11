import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { WmsAllocationEngine, AllocationStrategy, InventoryItem } from 'wms-engine';

@Injectable()
export class WavesService {
  constructor(private readonly prisma: PrismaService) {}

  async generateWave(
    warehouseId: string,
    orderIds: string[],
    strategy: AllocationStrategy = AllocationStrategy.FIFO,
    actorId?: string,
  ) {
    const db = this.prisma.getTenantDb();
    let warehouse = warehouseId
      ? await db.warehouse.findUnique({ where: { id: warehouseId } })
      : null;
    if (!warehouse) {
      warehouse = await db.warehouse.findFirst();
      if (!warehouse) throw new BadRequestException("No warehouses available.");
      warehouseId = warehouse.id;
    }

    if (!orderIds || orderIds.length === 0) {
      const orders = await db.order.findMany({
        where: { status: { in: ['NEW', 'PENDING', 'UNASSIGNED'] } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      orderIds = orders.map((o: any) => o.id);
    }
    if (orderIds.length === 0) {
      throw new BadRequestException("No pending orders available to generate wave.");
    }

    let resolvedCreatorId = actorId;
    if (!resolvedCreatorId) {
      const firstUser = await db.tenantUser.findFirst({ select: { id: true } });
      if (!firstUser) {
        throw new BadRequestException("Authenticated user required to create wave.");
      }
      resolvedCreatorId = firstUser.id;
    }

    return db.$transaction(async (tx: any) => {
      const wave = await tx.wavePicking.create({
        data: {
          warehouseId,
          waveNumber: `WAVE-${Date.now()}`,
          status: 'ALLOCATING',
          totalOrders: orderIds.length,
          createdBy: resolvedCreatorId,
        },
      });

      const orderItems = await tx.orderItem.findMany({
        where: { orderId: { in: orderIds } },
        include: { product: true },
      });

      const productDemands = orderItems.reduce((acc: Record<string, number>, item: any) => {
        acc[item.productId] = (acc[item.productId] || 0) + item.quantity;
        return acc;
      }, {});

      for (const [productId, requiredQty] of Object.entries(productDemands)) {
        const stocks = await tx.inventory.findMany({
          where: { warehouseId, productId, quantityOnHand: { gt: 0 } },
          orderBy: { createdAt: 'asc' }
        });

        const engineStocks: InventoryItem[] = stocks.map((s: any) => ({
          id: s.id,
          binId: s.binId,
          productId: s.productId,
          quantityAvailable: s.quantityOnHand - s.quantityAllocated,
          createdAt: s.createdAt, // Dùng ngày thực tế để FIFO/LIFO hoạt động đúng
          expiryDate: s.expiryDate,
        }));

        try {
          const allocations = WmsAllocationEngine.allocate(
            engineStocks,
            requiredQty,
            strategy,
            { excludeExpired: strategy === AllocationStrategy.FEFO, now: new Date() },
          );

          for (const alloc of allocations) {
            // 1. Tạo Task lấy hàng
            await tx.task.create({
              data: {
                warehouseId,
                waveId: wave.id,
                taskType: 'PICK',
                status: 'PENDING',
                productId,
                sourceBinId: alloc.binId,
                quantityRequested: alloc.allocatedQuantity,
              },
            });

            // 2. Cập nhật số lượng đã cấp phát dùng Optimistic Locking (id is TEXT, no ::uuid)
            const inv = stocks.find((s: any) => s.id === alloc.inventoryId);
            const updateResult = await tx.$executeRawUnsafe(
              `UPDATE inventory
              SET quantity_allocated = quantity_allocated + $1,
                  version = version + 1
              WHERE id = $2
                AND version = $3
                AND (quantity_on_hand - quantity_allocated) >= $1`,
              alloc.allocatedQuantity, alloc.inventoryId, inv.version
            );

            if (updateResult === 0) {
              throw new Error(`Inventory ${alloc.inventoryId} was modified. Retry required.`);
            }
          }
        } catch (error: any) {
          throw new BadRequestException(`Cấp phát thất bại cho SP ${productId}: ${error?.message || 'Unknown error'}`);
        }
      }

      return tx.wavePicking.update({
        where: { id: wave.id },
        data: { status: 'READY' },
        include: { tasks: true },
      });
    });
  }

  async listWaves() {
    return this.prisma.getTenantDb().wavePicking.findMany({
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
