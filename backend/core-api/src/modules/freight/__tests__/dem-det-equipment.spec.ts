import { ConflictException } from '@nestjs/common';
import { DemDetCalculatorService } from '../../pricing/services/dem-det-calculator.service';
import { FreightService } from '../services/freight.service';

describe('Enterprise DEM/DET & Equipment Overlap Guards', () => {
  describe('DemDetCalculatorService', () => {
    const calc = new DemDetCalculatorService();

    it('strictly separates DEMURRAGE vs DETENTION and applies freeDays + weekend/holiday exclusions + tiers', () => {
      // Discharge Thu 2026-04-30 (holiday!), gate-out Thu 2026-05-07 (7 calendar days)
      // Excluded holidays: 04-30, 05-01 (2 days) + weekend Sat 05-02, Sun 05-03 (2 days) = 4 days excluded
      // Evaluated days = 3 <= freeDays(4) => 0 billable!
      const demZero = calc.calculateCharge({
        rule: {
          chargeType: 'DEMURRAGE',
          freeDays: 4,
          excludeWeekends: true,
          excludeHolidays: true,
          currency: 'VND',
          dailyRateTier1: 900_000,
          tier1Days: 5,
          dailyRateTier2: 1_800_000,
        },
        startAt: new Date('2026-04-30T00:00:00Z'),
        endAt: new Date('2026-05-07T00:00:00Z'),
      });

      expect(demZero.chargeType).toBe('DEMURRAGE');
      expect(demZero.excludedNonWorkingDays).toBe(4);
      expect(demZero.billableDays).toBe(0);
      expect(demZero.totalAmount).toBe(0);
      expect(demZero.status).toBe('WITHIN_FREE_TIME');

      // Equipment DETENTION without weekend/holiday exclusion: 12 calendar days, freeDays=4
      // => 8 billable days: tier1=5 days @ 450,000 + tier2=3 days @ 900,000 = 2,250,000 + 2,700,000 = 4,950,000
      const detBilled = calc.calculateCharge({
        rule: {
          chargeType: 'DETENTION',
          freeDays: 4,
          excludeWeekends: false,
          excludeHolidays: false,
          currency: 'VND',
          dailyRateTier1: 450_000,
          tier1Days: 5,
          dailyRateTier2: 900_000,
        },
        startAt: new Date('2026-05-07T00:00:00Z'),
        endAt: new Date('2026-05-19T00:00:00Z'),
      });

      expect(detBilled.chargeType).toBe('DETENTION');
      expect(detBilled.calendarDays).toBe(12);
      expect(detBilled.freeDaysApplied).toBe(4);
      expect(detBilled.billableDays).toBe(8);
      expect(detBilled.tier1DaysBilled).toBe(5);
      expect(detBilled.tier2DaysBilled).toBe(3);
      expect(detBilled.totalAmount).toBe(4_950_000);
      expect(detBilled.status).toBe('ACCRUING');
    });
  });

  describe('FreightService.assignEquipment concurrency & overlap guard', () => {
    it('prevents overlapping double-booking of a tractor/container with 409 ConflictException', async () => {
      const storedAssignments: any[] = [];

      const mockTx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
        equipmentAssignment: {
          findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
            const key = Object.keys(where).find((k) =>
              ['tractorId', 'chassisId', 'containerId', 'driverId'].includes(k),
            );
            if (!key) return null;
            return (
              storedAssignments.find(
                (a) =>
                  a[key] === where[key] &&
                  ['RESERVED', 'ACTIVE'].includes(a.status) &&
                  a.startAt < where.startAt.lt &&
                  a.endAt > where.endAt.gt,
              ) || null
            );
          }),
          create: jest.fn().mockImplementation(async ({ data }: any) => {
            const row = { id: `asgn-${storedAssignments.length + 1}`, ...data };
            storedAssignments.push(row);
            return row;
          }),
        },
      };

      const mockPrisma: any = {
        getTenantDb: () => ({
          $transaction: async (cb: any) => cb(mockTx),
        }),
      };
      const mockOutbox: any = { enqueue: jest.fn().mockResolvedValue(undefined) };

      const service = new FreightService(mockPrisma, mockOutbox);

      const first = await service.assignEquipment({
        tractorId: 'trc-01',
        containerId: 'cnt-40hc-01',
        startAt: '2026-11-12T08:00:00Z',
        endAt: '2026-11-12T16:00:00Z',
      });
      expect(first.id).toBe('asgn-1');
      expect(mockOutbox.enqueue).toHaveBeenCalledTimes(1);

      // Overlapping window on same container must throw 409 ConflictException
      await expect(
        service.assignEquipment({
          tractorId: 'trc-02',
          containerId: 'cnt-40hc-01',
          startAt: '2026-11-12T12:00:00Z',
          endAt: '2026-11-12T20:00:00Z',
        }),
      ).rejects.toThrow(ConflictException);

      // Non-overlapping later window succeeds
      const nonOverlapping = await service.assignEquipment({
        tractorId: 'trc-02',
        containerId: 'cnt-40hc-01',
        startAt: '2026-11-12T17:00:00Z',
        endAt: '2026-11-12T22:00:00Z',
      });
      expect(nonOverlapping.id).toBe('asgn-2');
    });
  });
});
