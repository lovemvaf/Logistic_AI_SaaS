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

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

function mapOrder(row: any) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    service: row.service || 'STANDARD',
    codAmount: toNumber(row.codAmount, 0),
    shippingFee: toNumber(row.shippingFee, 0),
  };
}

function mapInvoice(row: any) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    totalAmount: toNumber(row.totalAmount, 0),
    paidAmount: toNumber(row.paidAmount, 0),
  };
}

function mapReturn(row: any) {
  if (!row || typeof row !== 'object') return row;
  const refundSum = Array.isArray(row.refunds)
    ? row.refunds.reduce((s: number, r: any) => s + toNumber(r.amount, 0), 0)
    : 0;
  return {
    ...row,
    orderTrackingCode: row.orderTrackingCode || row.order?.trackingCode || '—',
    reason: row.reason?.code || (typeof row.reason === 'string' ? row.reason : null) || 'OTHER',
    estimatedRefund: toNumber(row.estimatedRefund, refundSum),
  };
}

function mapWebhook(row: any) {
  if (!row || typeof row !== 'object') return row;
  let parsedEvents: string[] = [];
  if (Array.isArray(row.events)) {
    parsedEvents = row.events;
  } else if (typeof row.events === 'string') {
    try {
      const parsed = JSON.parse(row.events);
      parsedEvents = Array.isArray(parsed) ? parsed : [row.events];
    } catch {
      parsedEvents = [row.events];
    }
  }
  return {
    ...row,
    events: parsedEvents,
    status: row.status || (row.isActive ? 'ACTIVE' : 'PAUSED'),
    successRate: typeof row.successRate === 'number' ? row.successRate : 1,
  };
}

function mapProfile(row: any) {
  if (!row || typeof row !== 'object') return row;
  return {
    id: row.id,
    clientId: row.clientId,
    company: row.company || row.companyName || '',
    contactName: row.contactName || row.fullName || '',
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || '',
    province: row.province || '',
    district: row.district || '',
    taxCode: row.taxCode || '',
    role: row.role || 'CLIENT',
    status: row.status || 'ACTIVE',
  };
}

function crud(request: RequestFn, path: string, mapper: (row: any) => any = (row) => row) {
  return {
    list: async (filterOrParams?: ((row: any) => boolean) | Record<string, unknown>) => {
      const params = typeof filterOrParams === 'function' ? undefined : filterOrParams;
      const rows = pageOf(await request('GET', path, params)).map(mapper);
      return typeof filterOrParams === 'function' ? rows.filter(filterOrParams) : rows;
    },
    get: async (id: string) => mapper(await request('GET', `${path}/${id}`)),
    create: async (input: unknown) => mapper(await request('POST', path, input)),
    update: async (id: string, patch: unknown) => mapper(await request('PATCH', `${path}/${id}`, patch)),
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
  const orderCrud = crud(request, `${client}/orders`, mapOrder);
  const webhookCrud = crud(request, `${client}/webhooks`, mapWebhook);
  const repo = {
    orders: {
      ...orderCrud,
      createOrder: async (input: NewOrderInput) =>
        mapOrder(
          await request('POST', `${client}/orders`, {
            clientOrderRef: input.clientOrderRef || undefined,
            recipientName: input.recipientName,
            recipientPhone: input.recipientPhone,
            recipientAddress: input.recipientAddress,
            codAmount: toNumber(input.codAmount, 0),
            shippingFee: toNumber(input.shippingFee, 0),
          }),
        ),
      cancelOrder: (id: string) => request('POST', `${client}/orders/${id}/cancel`),
      byTrackingCode: (code: string) => request('GET', `/track/${encodeURIComponent(code)}`),
      live: (trackingCode: string) => request('GET', `/track/${encodeURIComponent(trackingCode)}/live`),
      sla: (trackingCode: string) => request('GET', `/track/${encodeURIComponent(trackingCode)}/sla`),
      summary: () => request('GET', `${client}/dashboard`),
    },
    invoices: {
      ...crud(request, `${client}/invoices`, mapInvoice),
      recordPayment: (id: string, amount: number) =>
        request('POST', `${client}/invoices/${id}/payments`, {
          method: 'BANK_TRANSFER',
          amount: toNumber(amount, 0),
        }),
    },
    returns: {
      ...crud(request, `${client}/returns`, mapReturn),
      requestReturn: async (input: NewReturnInput) =>
        mapReturn(
          await request('POST', `${client}/returns`, {
            orderTrackingCode: input.orderTrackingCode,
            reason: input.reason,
            reasonNote: input.note,
          }),
        ),
    },
    webhooks: {
      ...webhookCrud,
      create: async (input: { url: string; events: string[] }) =>
        mapWebhook(
          await request('POST', `${client}/webhooks`, {
            url: input.url,
            events: Array.isArray(input.events) ? input.events : ['ALL_EVENTS'],
          }),
        ),
      toggleWebhook: (id: string) => request('PATCH', `${client}/webhooks/${id}/status`),
    },
    stock: crud(request, `${client}/stock`),
    profiles: {
      ...crud(request, `${client}/profile`, mapProfile),
      list: async () => {
        const payload = await request('GET', `${client}/profile`);
        if (Array.isArray(payload)) return payload.map(mapProfile);
        return payload ? [mapProfile(payload)] : [];
      },
      saveProfile: async (input: Partial<any>) => {
        const dto: Record<string, string> = {};
        if (input.company || input.companyName) dto.companyName = String(input.company || input.companyName);
        if (input.contactName || input.fullName) dto.fullName = String(input.contactName || input.fullName);
        if (input.phone) dto.phone = String(input.phone);
        return mapProfile(await request('PATCH', `${client}/profile`, dto));
      },
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
