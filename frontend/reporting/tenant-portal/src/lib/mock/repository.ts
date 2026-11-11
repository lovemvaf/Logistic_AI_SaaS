import type { MockRepository } from './store';
import type { OrderStatus, ReportParams } from './types';

/**
 * REST adapter with the same method surface as `createMockRepository()`.
 *
 * Every call maps to `/api/v1/*`, the contract shared by core-api today and by
 * `backend/rust-api` later. Pages never know which implementation is active.
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
  const repo = {
    orders: {
      ...crud(request, '/orders'),
      createOrder: (input: unknown) => request('POST', '/orders', input),
      advanceStatus: (id: string, status: OrderStatus, label: string) =>
        request('POST', `/orders/${id}/status`, { status, label }),
      assignTrip: (orderIds: string[], tripId: string) =>
        request('POST', '/orders/assign-trip', { orderIds, tripId }),
      byTrackingCode: (code: string) => request('GET', `/orders/track/${encodeURIComponent(code)}`),
      partialShipment: (orderId: string, note: string) =>
        request('POST', `/orders/${orderId}/partial`, { note }),
      reschedule: (orderId: string, promisedAt: string, reason: string) =>
        request('PATCH', `/orders/${orderId}/reschedule`, { promisedAt, reason }),
      live: (trackingCode: string) => request('GET', `/orders/${trackingCode}/live`),
      sla: (trackingCode: string) => request('GET', `/orders/${trackingCode}/sla`),
    },
    products: crud(request, '/wms/products'),
    warehouses: crud(request, '/warehouses'),
    bins: crud(request, '/warehouses/bins'),
    inventory: {
      ...crud(request, '/inventory'),
      adjust: (input: unknown) => request('POST', '/inventory/adjust', input),
      receive: (input: unknown) => request('POST', '/inventory/receive', input),
      putawaySuggestion: (sku: string, quantity: number) =>
        request('POST', '/inventory/putaway-suggestion', { sku, quantity }),
    },
    movements: crud(request, '/inventory/ledger'),
    waves: {
      ...crud(request, '/wms/waves'),
      allocate: (input: unknown) => request('POST', '/wms/waves/allocate', input),
    },
    pickTasks: {
      ...crud(request, '/wms/tasks'),
      confirm: (id: string, pickedQuantity: number) =>
        request('POST', `/wms/tasks/${id}/confirm`, { pickedQuantity }),
    },
    cycleCounts: {
      ...crud(request, '/inventory/cycle-counts'),
      submit: (id: string, countedLines: number, varianceUnits: number) =>
        request('POST', `/inventory/cycle-counts/${id}/submit`, { countedLines, varianceUnits }),
      approve: (id: string) => request('POST', `/inventory/cycle-counts/${id}/approve`),
    },
    equipment: crud(request, '/wms/equipment'),
    packSessions: {
      ...crud(request, '/wms/packing-sessions'),
      seal: (id: string, scannedSku: string) =>
        request('POST', `/wms/packing-sessions/${id}/seal`, { scannedSku }),
    },
    trips: {
      ...crud(request, '/logistics/trips'),
      assign: (input: unknown) => request('POST', '/logistics/trips/assign', input),
      optimize: (tripId: string) => request('POST', `/logistics/trips/${tripId}/optimize`),
      start: (tripId: string) => request('POST', `/logistics/trips/${tripId}/start`),
      complete: (tripId: string) => request('POST', `/logistics/trips/${tripId}/complete`),
      submitPOD: (input: unknown) => request('POST', '/logistics/trips/pod', input),
      pod: (tripId: string) => request('GET', `/logistics/trips/${tripId}/pod`),
    },
    drivers: {
      ...crud(request, '/logistics/drivers'),
      ranking: (input?: { period?: string }) => request('GET', '/logistics/drivers/ranking', input),
      tripLog: (input: { driverId: string }) =>
        request('GET', `/logistics/drivers/${input.driverId}/trip-log`, input),
    },
    vehicles: {
      ...crud(request, '/logistics/vehicles'),
      fuelLog: (input: unknown) => request('POST', '/logistics/vehicles/fuel', input),
      maintenanceLog: (input: unknown) => request('POST', '/logistics/vehicles/maintenance', input),
    },
    geofences: crud(request, '/logistics/geofences'),
    sosAlerts: {
      ...crud(request, '/logistics/sos'),
      acknowledge: (id: string) => request('POST', `/logistics/sos/${id}/acknowledge`),
      resolve: (id: string, note: string) => request('POST', `/logistics/sos/${id}/resolve`, { note }),
    },
    returns: {
      ...crud(request, '/logistics/returns'),
      inspect: (id: string, input: unknown) => request('POST', `/logistics/returns/${id}/inspect`, input),
      refund: (id: string, reason: string) => request('POST', `/logistics/returns/${id}/refund`, { reason }),
    },
    remittances: {
      ...crud(request, '/finance/cod-remittances'),
      submit: (id: string, submittedAmount: number) =>
        request('POST', `/finance/cod-remittances/${id}/submit`, { submittedAmount }),
      reconcile: (id: string, bankTransactionId: string) =>
        request('POST', `/finance/cod-remittances/${id}/reconcile`, { bankTransactionId }),
    },
    bankTransactions: crud(request, '/finance/bank-transactions'),
    expenses: {
      ...crud(request, '/finance/expenses'),
      decide: (id: string, decision: string, note?: string) =>
        request('POST', `/finance/expenses/${id}/decision`, { decision, note }),
    },
    clients: {
      ...crud(request, '/tenant/clients'),
      credit: (id: string, amount: number) =>
        request('PATCH', `/tenant/clients/${id}/credit`, { amount }),
    },
    customers: {
      list: async (filter?: (row: any) => boolean) => {
        const rows = pageOf(await request('GET', '/customers'));
        return filter ? rows.filter(filter) : rows;
      },
      get: async (id: string) => request('GET', `/customers/${id}`),
      stat: async (id: string) => request('GET', `/customers/${id}/stat`),
      reviews: async (id: string) => request('GET', `/customers/${id}/reviews`),
    },
    orderPartials: {
      list: async () => pageOf(await request('GET', '/order-partials')),
      get: async (id: string) => request('GET', `/order-partials/${id}`),
      update: async (id: string, patch: { status: string; note: string }) =>
        request('PATCH', `/order-partials/${id}`, patch),
    },
    reports: {
      summary: async (params: ReportParams) => request('GET', '/reports/summary', params),
      onTime: async (params: ReportParams) => request('GET', '/reports/on-time', params),
      costs: async (params: ReportParams) => request('GET', '/reports/costs', params),
      fleet: async (params: ReportParams) => request('GET', '/reports/fleet', params),
    },
    invoices: {
      ...crud(request, '/finance/invoices'),
      recordPayment: (id: string, amount: number) =>
        request('POST', `/finance/invoices/${id}/payments`, { amount }),
    },
    aiInsights: {
      ...crud(request, '/tenant/ai-insights'),
      decide: (id: string, status: string) => request('POST', `/tenant/ai-insights/${id}/decision`, { status }),
    },
    apiKeys: {
      ...crud(request, '/api-keys'),
      issue: (input: unknown) => request('POST', '/api-keys', input),
      revoke: (id: string) => request('POST', `/api-keys/${id}/revoke`),
    },
    auditLogs: crud(request, '/tenant/audit-logs'),
    users: {
      ...crud(request, '/users'),
      invite: (input: unknown) => request('POST', '/users/invite', input),
      setStatus: (id: string, status: string) => request('PATCH', `/users/${id}/status`, { status }),
    },
    roles: crud(request, '/roles'),
    webhooks: {
      ...crud(request, '/webhooks'),
      setStatus: (id: string, status: string) => request('PATCH', `/webhooks/${id}/status`, { status }),
    },
    notifications: {
      ...crud(request, '/notifications'),
      markAllRead: () => request('POST', '/notifications/read-all'),
      send: (input: unknown) => request('POST', '/notifications/send', input),
      events: async (filter?: (row: any) => boolean) => {
        const rows = pageOf(await request('GET', '/notifications/events'));
        return filter ? rows.filter(filter) : rows;
      },
    },
    settings: {
      get: () => request('GET', '/settings'),
      update: (patch: unknown) => request('PATCH', '/settings', patch),
    },
    dashboard: () => request('GET', '/dashboard/summary'),
    controls: async () => ({ latencyMs: [0, 0] as [number, number], failureRate: 0 }),
    reset: async () => {
      throw new Error('reset() chỉ khả dụng ở chế độ mock.');
    },
  };

  return repo as unknown as MockRepository;
}
