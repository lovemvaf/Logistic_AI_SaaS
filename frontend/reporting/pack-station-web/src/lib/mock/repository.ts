import type { MockRepository } from './store';
import type {
  CorrectionLog,
  CorrectionStatus,
  IsoDate,
  MatchResult,
  PackProduct,
  PackOrder,
  PackSession,
  PackStation,
  ScanInput,
  ScanLog,
  SealInput,
  SessionStartInput,
  StationSummary,
} from './types';

/**
 * REST adapter — cùng bề mặt phương thức với `createMockRepository()`.
 *
 * Mọi lệnh gọi ánh xạ tới `/api/v1/*` của core-api (inventory + wms); trang
 * không bao giờ biết liệu thực thể đang hoạt động là mock hay real.
 */

export type RequestFn = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown) => Promise<any>;

const pageOf = (payload: any) => (Array.isArray(payload) ? payload : payload?.data ?? []);

function crud(request: RequestFn, path: string) {
  return {
    list: async (filterOrParams?: ((row: any) => boolean) | Record<string, unknown>) => {
      const params = typeof filterOrParams === 'function' ? undefined : filterOrParams;
      const rows = pageOf(await request('GET', path, params));
      return typeof filterOrParams === 'function' ? rows.filter(filterOrParams) : rows;
    },
    get: async (id: string) => request('GET', `${path}/${id}`),
    create: async (input: unknown) => request('POST', path, input),
    update: async (id: string, patch: unknown) => request('PATCH', `${path}/${id}`, patch),
    remove: async (id: string) => {
      await request('DELETE', `${path}/${id}`);
    },
  };
}

function mapSession(row: any) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    scanLogs: Array.isArray(row.scanLogs) ? row.scanLogs : [],
    totalPacked: Number(row.totalPacked || 0),
    totalMatched: Number(row.totalMatched || 0),
    totalMismatched: Number(row.totalMismatched || 0),
    totalCorrected: Number(row.totalCorrected || 0),
    elapsedSeconds: Number(row.elapsedSeconds || 0),
  };
}

export function createRestRepository(request: RequestFn): MockRepository {
  const inventory = '/inventory/ops';
  const wms = '/wms';
  const sessionCrud = crud(request, `${wms}/packing-sessions`);
  const repo = {
    orders: {
      ...crud(request, `${inventory}/pack-queue`),
      nextOrder: async () => {
        const res = await request('POST', `${inventory}/pack-log/next`);
        if (!res || res.order === null) return null;
        return res;
      },
      scan: async (input: ScanInput) => {
        const res = await request('POST', `${inventory}/pack-log/scan`, {
          barcode: input.scannedSku,
          scannedSku: input.scannedSku,
          packCode: input.packCode,
          confidence: input.confidence,
        });
        const normalizedResult: MatchResult =
          res?.matchStatus === 'MATCH' || res?.result === 'MATCHED' ? 'MATCH' : 'MISMATCH';
        return {
          result: normalizedResult,
          order: res?.order || {
            id: input.packCode,
            packCode: input.packCode,
            trackingCode: input.packCode,
            expectedSku: res?.product?.sku || input.scannedSku,
            scannedSku: input.scannedSku,
          },
          product: res?.product,
        };
      },
      seal: (input: SealInput) =>
        request('POST', `${inventory}/pack-log/${encodeURIComponent(input.packCode)}/seal`, input),
      byPackCode: (packCode: string) =>
        request('GET', `${inventory}/pack-log/${encodeURIComponent(packCode)}`),
      summary: async () => {
        const s = await request('GET', `${inventory}/pack-log/summary`);
        return {
          sessionsToday: Number(s?.sessionsToday ?? 0),
          packsToday: Number(s?.packsToday ?? s?.packedToday ?? 0),
          matchRate: Number(s?.matchRate ?? 100),
          correctionCount: Number(s?.correctionCount ?? 0),
          averageSecondsPerPack: Number(s?.averageSecondsPerPack ?? 0),
          activeStations: [],
        };
      },
    },
    products: {
      ...crud(request, `${inventory}/skus`),
      bySku: (sku: string) => request('GET', `${inventory}/skus/${encodeURIComponent(sku)}`),
      byBarcode: (barcode: string) => request('GET', `${inventory}/skus/barcode/${encodeURIComponent(barcode)}`),
    },
    sessions: {
      ...sessionCrud,
      list: async (filter?: any) => {
        const rows = (await sessionCrud.list(filter)).map(mapSession);
        return rows;
      },
      start: async (input: SessionStartInput) =>
        mapSession(await request('POST', `${wms}/packing-sessions`, input)),
      sealSession: async (id: string) =>
        mapSession(await request('POST', `${wms}/packing-sessions/${id}/seal`)),
      active: async () => {
        const s = await request('GET', `${wms}/packing-sessions/active`);
        return s ? mapSession(s) : null;
      },
      scans: (filter?: (log: any) => boolean) =>
        request('GET', `${wms}/packing-sessions/scans`).then((rows) => {
          const list = Array.isArray(rows) ? rows : rows?.data ?? [];
          return typeof filter === 'function' ? list.filter(filter) : list;
        }),
      dashboard: () => request('GET', `${wms}/packing-sessions/dashboard`),
    },
    corrections: {
      ...crud(request, `${inventory}/corrections`),
      updateStatus: (id: string, status: CorrectionStatus) =>
        request('PATCH', `${inventory}/corrections/${id}`, { status }),
    },
    stations: crud(request, `${wms}/stations`),
    staff: crud(request, `${wms}/staff`),
    aiFeature: {
      predictSku: (image?: string) => request('POST', `${inventory}/pack-log/predict`, { image }),
      detectAnomaly: async () => {
        const res = await request('GET', `${inventory}/pack-log/anomalies`);
        return Array.isArray(res) ? res : res?.data ?? [];
      },
    },
    controls: async (input) => ({
      latencyMs: [0, 0] as [number, number],
      failureRate: 0,
      ...(input.latency ? { latencyMs: input.latency } : {}),
      ...(input.failureRate !== undefined ? { failureRate: input.failureRate } : {}),
      ...(input.reset ? await request('POST', `${wms}/debug/reset`) : {}),
    }),
    reset: async () => {
      throw new Error('reset() chỉ khả dụng ở chế độ mock.');
    },
  };

  return repo as unknown as MockRepository;
}
