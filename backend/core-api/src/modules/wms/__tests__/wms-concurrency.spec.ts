import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { InventoryService } from '../services/inventory.service';

describe('WMS Optimistic Locking & Atomic Stock Operations (InventoryService)', () => {
  function createMockPrisma(tx: Record<string, any>) {
    const db = {
      $transaction: jest.fn(async (cb: (txClient: any) => Promise<any>) => cb(tx)),
    };
    return {
      getTenantDb: jest.fn(() => db),
      _db: db,
    };
  }

  describe('adjustStock', () => {
    it('rejects zero or fractional qtyChange with BadRequestException before opening tx', async () => {
      const mockPrisma = createMockPrisma({});
      const svc = new InventoryService(mockPrisma as any);

      await expect(svc.adjustStock('inv-1', 0, 'AUDIT', 'actor-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(svc.adjustStock('inv-1', 1.5, 'AUDIT', 'actor-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma._db.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when stock would drop below quantityAllocated', async () => {
      const mockTx = {
        inventory: {
          findUnique: jest.fn(async () => ({
            id: 'inv-1',
            warehouseId: 'wh-1',
            quantityOnHand: 10,
            quantityAllocated: 8,
            version: 3,
          })),
        },
        $executeRaw: jest.fn(),
        stockMovement: { create: jest.fn() },
        adjustment: { create: jest.fn() },
      };

      const svc = new InventoryService(createMockPrisma(mockTx) as any);

      await expect(svc.adjustStock('inv-1', -3, 'DAMAGE', 'actor-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when concurrent update increments version (executeRaw = 0)', async () => {
      const mockTx = {
        inventory: {
          findUnique: jest.fn(async () => ({
            id: 'inv-1',
            warehouseId: 'wh-1',
            quantityOnHand: 50,
            quantityAllocated: 5,
            version: 4,
          })),
        },
        $executeRaw: jest.fn(async () => 0),
        stockMovement: { create: jest.fn() },
        adjustment: { create: jest.fn() },
      };

      const svc = new InventoryService(createMockPrisma(mockTx) as any);

      await expect(svc.adjustStock('inv-1', -5, 'COUNT', 'actor-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
      expect(mockTx.adjustment.create).not.toHaveBeenCalled();
    });

    it('updates balance and writes stockMovement + adjustment atomically when version matches', async () => {
      const mockTx = {
        inventory: {
          findUnique: jest.fn(async () => ({
            id: 'inv-1',
            warehouseId: 'wh-1',
            quantityOnHand: 20,
            quantityAllocated: 5,
            version: 2,
          })),
        },
        $executeRaw: jest.fn(async () => 1),
        stockMovement: { create: jest.fn(async (d: any) => d) },
        adjustment: { create: jest.fn(async (d: any) => d) },
      };

      const svc = new InventoryService(createMockPrisma(mockTx) as any);
      const res = await svc.adjustStock('inv-1', -10, 'CYCLE_COUNT', 'actor-9');

      expect(res).toEqual({ ok: true, newBalance: 10 });
      expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inventoryId: 'inv-1',
          transactionType: 'ADJUSTMENT',
          quantityChange: -10,
          balanceAfter: 10,
          reasonCode: 'CYCLE_COUNT',
          actorId: 'actor-9',
        }),
      });
      expect(mockTx.adjustment.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('transferStock', () => {
    it('rejects self-bin transfers and cross-warehouse target bins', async () => {
      const mockTx = {
        inventory: {
          findUnique: jest.fn(async () => ({
            id: 'inv-src',
            warehouseId: 'wh-1',
            binId: 'bin-a',
            productId: 'prod-1',
            quantityOnHand: 30,
            quantityAllocated: 0,
            version: 1,
          })),
        },
        bin: {
          findUnique: jest.fn(async () => ({ id: 'bin-foreign', warehouseId: 'wh-2' })),
        },
      };

      const svc = new InventoryService(createMockPrisma(mockTx) as any);

      await expect(
        svc.transferStock(
          { sourceInventoryId: 'inv-src', targetBinId: 'bin-a', quantity: 5, reason: 'RELOC' },
          'actor-1',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        svc.transferStock(
          { sourceInventoryId: 'inv-src', targetBinId: 'bin-foreign', quantity: 5, reason: 'RELOC' },
          'actor-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transfer when unallocated stock is insufficient or optimistic lock loses race', async () => {
      const mockTxShortage = {
        inventory: {
          findUnique: jest.fn(async () => ({
            id: 'inv-src',
            warehouseId: 'wh-1',
            binId: 'bin-a',
            productId: 'prod-1',
            quantityOnHand: 10,
            quantityAllocated: 7,
            version: 1,
          })),
        },
        bin: { findUnique: jest.fn(async () => ({ id: 'bin-b', warehouseId: 'wh-1' })) },
        $executeRaw: jest.fn(),
      };

      const svcShortage = new InventoryService(createMockPrisma(mockTxShortage) as any);
      await expect(
        svcShortage.transferStock(
          { sourceInventoryId: 'inv-src', targetBinId: 'bin-b', quantity: 4, reason: 'MOVE' },
          'actor-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockTxShortage.$executeRaw).not.toHaveBeenCalled();

      const mockTxRace = {
        inventory: {
          findUnique: jest.fn(async () => ({
            id: 'inv-src',
            warehouseId: 'wh-1',
            binId: 'bin-a',
            productId: 'prod-1',
            quantityOnHand: 10,
            quantityAllocated: 0,
            version: 1,
          })),
        },
        bin: { findUnique: jest.fn(async () => ({ id: 'bin-b', warehouseId: 'wh-1' })) },
        $executeRaw: jest.fn(async () => 0),
      };

      const svcRace = new InventoryService(createMockPrisma(mockTxRace) as any);
      await expect(
        svcRace.transferStock(
          { sourceInventoryId: 'inv-src', targetBinId: 'bin-b', quantity: 4, reason: 'MOVE' },
          'actor-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('debits source, credits existing target, and writes balanced TRANSFER_OUT + TRANSFER_IN movements', async () => {
      const mockTx = {
        inventory: {
          findUnique: jest.fn(async () => ({
            id: 'inv-src',
            warehouseId: 'wh-1',
            binId: 'bin-a',
            productId: 'prod-1',
            batchNumber: 'B1',
            lpn: null,
            quantityOnHand: 15,
            quantityAllocated: 5,
            version: 2,
          })),
          findFirst: jest.fn(async () => ({
            id: 'inv-dst',
            warehouseId: 'wh-1',
            binId: 'bin-b',
            productId: 'prod-1',
            quantityOnHand: 3,
            version: 1,
          })),
        },
        bin: { findUnique: jest.fn(async () => ({ id: 'bin-b', warehouseId: 'wh-1' })) },
        $executeRaw: jest.fn(async () => 1),
        stockMovement: { createMany: jest.fn(async (d: any) => d) },
      };

      const svc = new InventoryService(createMockPrisma(mockTx) as any);
      const res = await svc.transferStock(
        { sourceInventoryId: 'inv-src', targetBinId: 'bin-b', quantity: 10, reason: 'SLOTTING' },
        'actor-2',
      );

      expect(res).toEqual({ ok: true, sourceBalance: 5, targetBalance: 13 });
      expect(mockTx.stockMovement.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            inventoryId: 'inv-src',
            transactionType: 'TRANSFER_OUT',
            quantityChange: -10,
            balanceAfter: 5,
          }),
          expect.objectContaining({
            inventoryId: 'inv-dst',
            transactionType: 'TRANSFER_IN',
            quantityChange: 10,
            balanceAfter: 13,
          }),
        ],
      });
    });
  });

  describe('reserveStock concurrency guard', () => {
    it('throws ConflictException when optimistic lock loses allocation race', async () => {
      const mockTx = {
        inventory: {
          findUnique: jest.fn(async () => ({
            id: 'inv-1',
            quantityOnHand: 10,
            quantityAllocated: 5,
            version: 7,
          })),
        },
        $executeRaw: jest.fn(async () => 0),
      };

      const svc = new InventoryService(createMockPrisma(mockTx) as any);
      await expect(svc.reserveStock('inv-1', 3)).rejects.toThrow(ConflictException);
    });
  });
});
