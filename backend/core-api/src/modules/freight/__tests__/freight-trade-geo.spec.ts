import { ConflictException, GoneException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DONG_NAI_2026_UNITS } from 'shared-types';
import { TradeService } from '../../trade/services/trade.service';
import { GeographyService } from '../../geography/services/geography.service';
import { PublicTrackingController } from '../../customer/controllers/public-tracking.controller';

describe('Enterprise Trade/XNK Compliance, Geography 95 & Public Tracking Grant', () => {
  describe('TradeService discrepancy & NEEDS_CUSTOMS_REVIEW gate', () => {
    it('flags CI vs PL weight/package discrepancy and blocks declaration submission until human HS approval', async () => {
      const docs = [
        {
          id: 'doc-ci',
          bookingId: 'bk-1',
          docType: 'COMMERCIAL_INVOICE',
          docNumber: 'CI-001',
          status: 'EXTRACTED',
          extractedJson: { grossWeightKg: 18000, packageCount: 50, currency: 'USD' },
        },
        {
          id: 'doc-pl',
          bookingId: 'bk-1',
          docType: 'PACKING_LIST',
          docNumber: 'PL-001',
          status: 'EXTRACTED',
          extractedJson: { grossWeightKg: 18500, packageCount: 48, currency: 'USD' },
        },
      ];

      let suggestionStatus = 'NEEDS_CUSTOMS_REVIEW';
      let declStatus = 'NEEDS_CUSTOMS_REVIEW';
      let hsRequired = true;

      const txMock: any = {
        tradeDocument: {
          findMany: jest.fn().mockImplementation(async ({ where }: any) => {
            if (where?.status?.in) return docs.filter((d) => where.status.in.includes(d.status));
            return docs;
          }),
          update: jest.fn().mockImplementation(async ({ where, data }: any) => {
            const d = docs.find((x) => x.id === where.id)!;
            Object.assign(d, data);
            return d;
          }),
        },
        customsDeclaration: {
          findUnique: jest.fn().mockImplementation(async () => ({
            id: 'dec-1',
            declarationNo: 'DEC-001',
            bookingId: 'bk-1',
            channel: 'GREEN',
            hsReviewRequired: hsRequired,
            status: declStatus,
            hsSuggestions: [{ id: 'hs-1', status: suggestionStatus, suggestedHsCode: '8534.00.90' }],
          })),
          update: jest.fn().mockImplementation(async ({ data }: any) => {
            if (data.status) declStatus = data.status;
            if (data.hsReviewRequired !== undefined) hsRequired = data.hsReviewRequired;
            return { id: 'dec-1', declarationNo: 'DEC-001', status: declStatus };
          }),
        },
        hSCodeSuggestion: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'hs-1',
            declarationId: 'dec-1',
            suggestedHsCode: '8534.00.90',
            status: 'NEEDS_CUSTOMS_REVIEW',
          }),
          update: jest.fn().mockImplementation(async ({ data }: any) => {
            suggestionStatus = data.status;
            return { id: 'hs-1', ...data };
          }),
          count: jest.fn().mockImplementation(async () => (suggestionStatus === 'APPROVED' ? 0 : 1)),
        },
        customsStatusEvent: { create: jest.fn().mockResolvedValue({}) },
      };

      const prismaMock: any = {
        getTenantDb: () => ({
          ...txMock,
          $transaction: async (cb: any) => cb(txMock),
        }),
      };
      const outboxMock: any = { enqueue: jest.fn().mockResolvedValue(undefined) };
      const service = new TradeService(prismaMock, outboxMock);

      // Step 1: Detect CI vs PL discrepancy
      const rec = await service.reconcileBookingDocuments('bk-1');
      expect(rec.status).toBe('MISMATCH_FOUND');
      expect(rec.discrepancyCount).toBe(2);

      // Step 2: Declaration submission is blocked by NEEDS_CUSTOMS_REVIEW
      await expect(service.submitDeclaration('dec-1', 'user-1')).rejects.toThrow(ConflictException);

      // Step 3: Approve HS suggestion, but docs still MISMATCH_FOUND -> STILL blocked!
      await service.reviewHsSuggestion('hs-1', { decision: 'APPROVED', approvedHsCode: '8534.00.90' }, 'officer-1');
      await expect(service.submitDeclaration('dec-1', 'user-1')).rejects.toThrow(ConflictException);

      // Step 4: Fix PL document and re-reconcile -> now VERIFIED -> submit succeeds!
      docs[1].extractedJson.grossWeightKg = 18000;
      docs[1].extractedJson.packageCount = 50;
      const fixedRec = await service.reconcileBookingDocuments('bk-1');
      expect(fixedRec.status).toBe('VERIFIED');

      const submitted = await service.submitDeclaration('dec-1', 'officer-1');
      expect(submitted.status).toBe('CLEARED');
      expect(outboxMock.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dong Nai 2026 Master Catalog (95 units)', () => {
    it('contains exact 33 wards and 62 communes with pending official codes & no fake polygons', () => {
      expect(DONG_NAI_2026_UNITS).toHaveLength(95);
      expect(DONG_NAI_2026_UNITS.filter((u) => u.unitType === 'WARD')).toHaveLength(33);
      expect(DONG_NAI_2026_UNITS.filter((u) => u.unitType === 'COMMUNE')).toHaveLength(62);
      expect(DONG_NAI_2026_UNITS.every((u) => u.officialCodeStatus === 'PENDING_OFFICIAL_CODE')).toBe(true);
      expect(DONG_NAI_2026_UNITS.every((u) => u.boundaryStatus === 'NO_OFFICIAL_POLYGON')).toBe(true);
    });

    it('resolves pre-2025 administrative alias without inventing codes', async () => {
      const mockUnit = {
        id: 'u-bh',
        canonicalName: 'Biên Hòa',
        normalizedName: 'BIEN HOA',
        unitType: 'WARD',
        officialCodeStatus: 'PENDING_OFFICIAL_CODE',
        boundaryStatus: 'NO_OFFICIAL_POLYGON',
      };
      const prismaMock: any = {
        runAsPlatform: async (cb: any) =>
          cb({
            administrativeUnit: { findMany: jest.fn().mockResolvedValueOnce([mockUnit]) },
          }),
      };
      const geo = new GeographyService(prismaMock);
      const res = await geo.resolveUnit('TP. Biên Hòa');
      expect(res.matched).toBe(true);
      expect(res.unit?.canonicalName).toBe('Biên Hòa');
      expect(res.unit?.officialCodeStatus).toBe('PENDING_OFFICIAL_CODE');
    });
  });

  describe('PublicTrackingController scoped token grant', () => {
    it('enforces token expiry/revocation and allowedPrecision levels without leaking financial fields', async () => {
      const rawToken = 'slg_trk_test_token_123';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const makeGrantDb = (overrides: Record<string, any> = {}) => ({
        publicTrackingGrant: {
          findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
            if (where.tokenHash !== tokenHash) return null;
            return {
              id: 'gr-1',
              trackingCode: 'TRK-001',
              orderId: 'ord-1',
              allowedPrecision: 'CITY_WARD',
              expiresAt: new Date(Date.now() + 3600_000),
              revokedAt: null,
              ...overrides,
            };
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ord-1',
            trackingCode: 'TRK-001',
            status: 'IN_TRANSIT',
            lat: 10.946512,
            lng: 106.842891,
            shippingFee: 999000,
            events: [],
          }),
        },
        delivery: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      const cityController = new PublicTrackingController({
        runAsPlatform: async (cb: any) => cb(makeGrantDb({ allowedPrecision: 'CITY_WARD' })),
      } as any);

      const cityView = await cityController.trackByGrant(rawToken);
      expect(cityView.precision).toBe('CITY_WARD');
      expect(cityView.lat).toBe(10.95);
      expect(cityView.lng).toBe(106.84);
      expect((cityView as any).shippingFee).toBeUndefined();

      const statusOnlyCtrl = new PublicTrackingController({
        runAsPlatform: async (cb: any) => cb(makeGrantDb({ allowedPrecision: 'STATUS_ONLY' })),
      } as any);
      const statusView = await statusOnlyCtrl.trackByGrant(rawToken);
      expect(statusView.lat).toBeNull();
      expect(statusView.lng).toBeNull();

      const revokedCtrl = new PublicTrackingController({
        runAsPlatform: async (cb: any) => cb(makeGrantDb({ revokedAt: new Date() })),
      } as any);
      await expect(revokedCtrl.trackByGrant(rawToken)).rejects.toThrow(GoneException);
    });
  });
});
