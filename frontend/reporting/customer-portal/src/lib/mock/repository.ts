import type { MockRepository, NewOrderInput, NewReturnInput } from './store';
import type { CustomerReturn, ReturnReason } from './types';

/**
 * REST adapter có cùng bề mặt phương thức với `createMockRepository()`.
 *
 * Mọi lệnh gọi ánh xạ tới `/api/v1/client/*`, hợp đồng chia sẻ với core-api
 * ngày hôm nay và `backend/rust-api` sau này. Page không bao giờ biết liệu
 * thực thể đang hoạt động là mock hay real.
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

/** AI hết khả dụng khi backend REST đã sẵn sàng; response được mặc định. */

const aiFeatures = {
  predictETA: () => null,
  deliverySuggestions: () => [],
  anomalyForecast: () => [],
  profileInsights: () => [],
  chatReply: () => [],
  feedback: () => null,
};

export function createRestRepository(request: RequestFn): MockRepository {
  const client = '/client';
  const repo = {
    orders: {
      ...crud(request, `${client}/orders`),
      createOrder: (input: NewOrderInput) => request('POST', `${client}/orders`, input),
      cancelOrder: (id: string) => request('POST', `${client}/orders/${id}/cancel`),
      byTrackingCode: (code: string) => request('GET', `/track/${encodeURIComponent(code)}`),
      live: (trackingCode: string) => request('GET', `/track/${encodeURIComponent(trackingCode)}/live`),
      sla: (trackingCode: string) => request('GET', `/track/${encodeURIComponent(trackingCode)}/sla`),
      summary: () => request('GET', `${client}/dashboard`),
    },
    invoices: {
      ...crud(request, `${client}/invoices`),
      recordPayment: (id: string, amount: number) =>
        request('POST', `${client}/invoices/${id}/payments`, { amount }),
    },
    returns: {
      ...crud(request, `${client}/returns`),
      requestReturn: (input: NewReturnInput) => request('POST', `${client}/returns`, input),
    },
    webhooks: {
      ...crud(request, `${client}/webhooks`),
      toggleWebhook: (id: string) => request('PATCH', `${client}/webhooks/${id}/status`),
    },
    stock: crud(request, `${client}/stock`),
    profiles: {
      ...crud(request, `${client}/profile`),
      saveProfile: (input: Partial<any>) => request('PATCH', `${client}/profile`, input),
    },
    aiFeature: aiFeatures,
    controls: async (input) => ({
      latencyMs: [0, 0] as [number, number],
      failureRate: 0,
      ...(input.latency ? { latencyMs: input.latency } : {}),
      ...(input.failureRate !== undefined ? { failureRate: input.failureRate } : {}),
      ...(input.reset ? await request('POST', `${client}/debug/reset`) : {}),
    }),
    reset: async () => {
      throw new Error('reset() chỉ khả dụng ở chế độ mock.');
    },
  };

  return repo as unknown as MockRepository;
}
