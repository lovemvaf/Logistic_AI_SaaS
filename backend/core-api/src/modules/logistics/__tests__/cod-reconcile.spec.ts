import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LogisticsService } from '../services/logistics.service';

describe('COD Reconciliation & Delivery Sync Regression (LogisticsService)', () => {
  function makeService(mockTx: Record<string, any>) {
    const db = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };
    const mockPrisma = {
      getTenantDb: jest.fn(() => db),
      currentTenant: { tenantId: 'tenant-1', schemaName: 'tenant_1' },
    };
    return new LogisticsService(
      mockPrisma as any,
      {} as any,
      { add: jest.fn() } as any,
      {} as any,
    );
  }

  describe('reconcileBankStatement (R06, R07)', () => {
    it('prioritizes REM-token match, scopes 24h clearing window symmetrically, and counts reconciled === matched', async () => {
      const createdBase = new Date('2026-11-10T10:00:00Z');
      const candidates = [
        {
          id: 'rem-precreated',
          qrCodeToken: 'REM-1001',
          amountRemitted: 500000,
          status: 'PENDING',
          createdAt: createdBase.toISOString(),
        },
        {
          id: 'rem-by-amount',
          qrCodeToken: 'REM-1002',
          amountRemitted: 750000,
          status: 'APPROVED',
          createdAt: new Date('2026-11-10T12:00:00Z').toISOString(),
        },
      ];

      const mockTx = {
        codRemittance: {
          findMany: jest.fn(async () => candidates),
          updateMany: jest.fn(async () => ({ count: 1 })),
        },
      };

      const svc = makeService(mockTx);

      // Bank credit occurred 3h BEFORE driver submitted remittance in app (symmetric +/-24h window).
      const preClearingIso = new Date('2026-11-10T07:00:00Z').toISOString();

      const result = await svc.reconcileBankStatement([
        { reference: 'CK REM-1001 TAI XE A', amount: 500000, transactionDate: preClearingIso },
        { reference: 'CHUYEN KHOAN THU HO', amount: 750001, transactionDate: preClearingIso }, // +/- 1 tolerance
        { reference: 'ZERO AMT', amount: 0 },
        { reference: 'UNKNOWN REF', amount: 999999 },
      ]);

      expect(result.matched).toBe(2);
      expect(result.reconciled).toBe(result.matched);
      expect(result.unmatched).toBe(2);
      expect(result.ambiguous).toBe(0);
      expect(result.results.map((r: any) => r.status)).toEqual([
        'matched',
        'matched',
        'unmatched',
        'unmatched',
      ]);
      expect(result.results[2].reason).toBe('INVALID_AMOUNT');
      expect(result.results[3].reason).toBe('NO_MATCH');
    });

    it('flags ambiguous when multiple candidates share the same amount without unique token', async () => {
      const candidates = [
        { id: 'rem-a', qrCodeToken: 'REM-2001', amountRemitted: 300000, status: 'PENDING', createdAt: '2026-11-10T08:00:00Z' },
        { id: 'rem-b', qrCodeToken: 'REM-2002', amountRemitted: 300000, status: 'PENDING', createdAt: '2026-11-10T09:00:00Z' },
      ];

      const mockTx = {
        codRemittance: {
          findMany: jest.fn(async () => candidates),
          updateMany: jest.fn(async () => ({ count: 1 })),
        },
      };

      const svc = makeService(mockTx);
      const res = await svc.reconcileBankStatement([
        { reference: 'NO TOKEN', amount: 300000, transactionDate: '2026-11-10T10:00:00Z' },
      ]);

      expect(res.reconciled).toBe(0);
      expect(res.matched).toBe(0);
      expect(res.ambiguous).toBe(1);
      expect(res.results[0]).toEqual(
        expect.objectContaining({
          status: 'ambiguous',
          matched: false,
          reason: 'MULTIPLE_CANDIDATES',
          candidateIds: ['rem-a', 'rem-b'],
        }),
      );
      expect(mockTx.codRemittance.updateMany).not.toHaveBeenCalled();
    });

    it('prevents double-claiming the same candidate inside a single batch and handles ALREADY_RECONCILED', async () => {
      const candidates = [
        { id: 'rem-single', qrCodeToken: 'REM-3001', amountRemitted: 250000, status: 'APPROVED', createdAt: '2026-11-10T08:00:00Z' },
        { id: 'rem-raced', qrCodeToken: 'REM-3002', amountRemitted: 400000, status: 'APPROVED', createdAt: '2026-11-10T08:00:00Z' },
      ];

      const mockTx = {
        codRemittance: {
          findMany: jest.fn(async () => candidates),
          updateMany: jest.fn(async ({ where }: any) => ({
            count: where.id === 'rem-single' ? 1 : 0,
          })),
        },
      };

      const svc = makeService(mockTx);
      const res = await svc.reconcileBankStatement([
        { reference: 'REM-3001', amount: 250000 },
        { reference: 'REM-3001', amount: 250000 }, // duplicate line in statement
        { reference: 'REM-3002', amount: 400000 }, // concurrent update won race -> count 0
      ]);

      expect(res.reconciled).toBe(1);
      expect(res.matched).toBe(1);
      expect(res.unmatched).toBe(2);
      expect(res.results[1].reason).toBe('NO_MATCH');
      expect(res.results[2].reason).toBe('ALREADY_RECONCILED');
    });
  });

  describe('completeDelivery ownership & syncVersion guard (R08)', () => {
    it('rejects negative codCollected with BadRequestException', async () => {
      const svc = makeService({});
      await expect(
        svc.completeDelivery('del-1', { codCollected: -50, syncVersion: 1 }, 'driver-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cross-driver completion attempt with ForbiddenException', async () => {
      const mockTx = {
        delivery: {
          findUnique: jest.fn(async () => ({
            id: 'del-1',
            driverId: 'driver-owner',
            trip: { driverId: 'driver-owner' },
            status: 'IN_TRANSIT',
            syncVersion: 2,
          })),
        },
      };
      const svc = makeService(mockTx);

      await expect(
        svc.completeDelivery('del-1', { codCollected: 100, syncVersion: 2 }, 'driver-intruder'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when offline syncVersion is older than server version', async () => {
      const mockTx = {
        delivery: {
          findUnique: jest.fn(async () => ({
            id: 'del-1',
            driverId: 'driver-owner',
            trip: { driverId: 'driver-owner' },
            status: 'IN_TRANSIT',
            syncVersion: 5,
          })),
        },
      };
      const svc = makeService(mockTx);

      await expect(
        svc.completeDelivery('del-1', { codCollected: 100, syncVersion: 4 }, 'driver-owner'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
