import type { MockRepository } from './store';
import type {
  CorrectionLog,
  CorrectionStatus,
  IsoDate,
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

export function createRestRepository(request: RequestFn): MockRepository {
  const inventory = '/inventory/ops';
  const wms = '/wms';
  const repo = {
    orders: {
      ...crud(request, `${inventory}/pack-log`),
      nextOrder: () => request('POST', `${inventory}/pack-log/next`),
      scan: (input: ScanInput) => request('POST', `${inventory}/pack-log/scan`, input),
      seal: (input: SealInput) => request('POST', `${inventory}/pack-log/${input.packCode}/seal`, input),
      byPackCode: (packCode: string) => request('GET', `${inventory}/pack-log/${encodeURIComponent(packCode)}`),
      summary: () => request('GET', `${inventory}/pack-log/summary`),
    },
    products: {
      ...crud(request, `${inventory}/skus`),
      bySku: (sku: string) => request('GET', `${inventory}/skus/${encodeURIComponent(sku)}`),
      byBarcode: (barcode: string) => request('GET', `${inventory}/skus/barcode/${encodeURIComponent(barcode)}`),
    },
    sessions: {
      ...crud(request, `${wms}/packing-sessions`),
      start: (input: SessionStartInput) => request('POST', `${wms}/packing-sessions`, input),
      sealSession: (id: string) => request('POST', `${wms}/packing-sessions/${id}/seal`),
      active: () => request('GET', `${wms}/packing-sessions/active`),
      scans: (filter?: (log: any) => boolean) => request('GET', `${wms}/packing-sessions/scans`),
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
      detectAnomaly: () => request('GET', `${inventory}/pack-log/anomalies`),
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
