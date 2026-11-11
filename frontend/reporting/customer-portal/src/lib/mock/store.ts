/**
 * Mock repository của customer portal.
 *
 * Hình dạng của object này là hợp đồng mà các trang khách hàng viết với.
 * Khi `NEXT_PUBLIC_DATA_SOURCE=api`, adapter REST trong `repository.ts`
 * đảm bảo cùng surface, nên trang không bao giờ phân nhánh.
 */

import {
  invoices,
  orders,
  profiles,
  returns,
  stock,
  webhooks,
} from './seed';
import type {
  AiAnomaly,
  AiChatMessage,
  AiDeliverySuggestion,
  AiETAStep,
  AiETAPrediction,
  AiFeedback,
  AiProfileInsight,
  CustomerDashboardSummary,
  CustomerInvoice,
  CustomerOrder,
  CustomerProfile,
  CustomerReturn,
  Id,
  IsoDate,
  LiveTracking,
  OrderStatus,
  ReturnReason,
  StockItem,
  TrackingSummary,
  WebhookEndpoint,
} from './types';

export const DB_VERSION = 4;
const STORAGE_KEY = 'smartlogi.customer.mock.db';

export class MockApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'MockApiError';
    this.status = status;
  }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type CustomerDatabase = {
  version: number;
  orders: CustomerOrder[];
  invoices: CustomerInvoice[];
  returns: CustomerReturn[];
  webhooks: WebhookEndpoint[];
  stock: StockItem[];
  profiles: CustomerProfile[];
  aiFeedback: AiFeedback[];
};

export function createSeedDatabase(): CustomerDatabase {
  return {
    version: DB_VERSION,
    orders: clone(orders),
    invoices: clone(invoices),
    returns: clone(returns),
    webhooks: clone(webhooks),
    stock: clone(stock),
    profiles: clone(profiles),
    aiFeedback: [],
  };
}

let memory: CustomerDatabase | null = null;
let latencyMs: [number, number] = [80, 220];
let failureRate = 0;

function getDb(): CustomerDatabase {
  if (memory) return memory;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CustomerDatabase;
        if (parsed.version === DB_VERSION) {
          memory = parsed;
          return memory;
        }
      }
    } catch {
      // Lưu trữ hỏng: xuống lại seed.
    }
  }

  memory = createSeedDatabase();
  return memory;
}

function save() {
  if (typeof window === 'undefined' || !memory) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Hết bộ nhớ: giữ bản in-memory, quá trình demo vẫn hoạt động.
  }
}

function delay() {
  const [min, max] = latencyMs;
  const wait = min + Math.random() * Math.max(0, max - min);
  return new Promise<void>((resolve) => {
    setTimeout(resolve, wait);
  });
}

async function settle() {
  await delay();
  if (failureRate > 0 && Math.random() < failureRate) {
    throw new MockApiError('Máy chủ demo tạm thời không phản hồi. Thử lại sau ít phút.', 503);
  }
}

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;

const trackingCode = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const body = Math.random().toString(32).slice(2, 8).toUpperCase().padEnd(6, '0');
  return `SLG-${date}-${body}`;
};

const shortCode = (prefix: string, digits = 4) =>
  `${prefix}-${String(Math.floor(1000 + Math.random() * 9000)).slice(0, digits)}`;

const findOrder = (trackingCode: string) => {
  const order = getDb().orders.find((row) => row.trackingCode === trackingCode);
  return order ? clone(order) : null;
};

const daysUntil = (iso: IsoDate) => {
  const date = new Date(iso);
  const now = new Date();
  return Math.round((date.getTime() - now.getTime()) / 86400000);
};

const hoursUntil = (iso: IsoDate) => {
  const date = new Date(iso);
  const now = new Date();
  return Math.round((date.getTime() - now.getTime()) / 3600000);
};

const datePlus = (iso: IsoDate, hours: number) =>
  new Date(new Date(iso).getTime() + hours * 3600000).toISOString();

type Collection<T extends { id: string }> = {
  list: (filter?: (row: T) => boolean) => Promise<T[]>;
  get: (id: string) => Promise<T | null>;
  create: (input: Omit<T, 'id'> & { id?: string }) => Promise<T>;
  update: (id: string, patch: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
};

function collection<T extends { id: string }>(key: keyof CustomerDatabase): Collection<T> {
  const rows = () => getDb()[key] as unknown as T[];

  return {
    list: async (filter) => {
      await settle();
      const all = [...rows()];
      return (filter ? all.filter(filter) : all).map(clone);
    },
    get: async (id) => {
      await settle();
      const found = rows().find((row) => row.id === id);
      return found ? clone(found) : null;
    },
    create: async (input) => {
      await settle();
      const entity = { ...input, id: input.id ?? makeId(String(key).slice(0, 3)) } as T;
      rows().unshift(entity);
      save();
      return clone(entity);
    },
    update: async (id, patch) => {
      await settle();
      const list = rows();
      const index = list.findIndex((row) => row.id === id);
      if (index < 0) throw new MockApiError('Không tìm thấy dữ liệu.', 404);
      list[index] = { ...list[index], ...patch };
      save();
      return clone(list[index]);
    },
    remove: async (id) => {
      await settle();
      const list = rows();
      const index = list.findIndex((row) => row.id === id);
      if (index < 0) throw new MockApiError('Không tìm thấy dữ liệu.', 404);
      list.splice(index, 1);
      save();
    },
  };
}

/** Dự báo ETA AI dựa trên dữ liệu mock — chạy offline. */

function etaSteps(order: CustomerOrder): AiETAStep[] {
  const steps: AiETAStep[] = order.timeline.map((ev) => ({
    at: ev.at,
    label: ev.label,
    done: true,
  }));

  return [
    ...steps,
    { at: order.scheduledDeliverAt ?? order.updatedAt, label: 'ETA dự báo', done: false },
    { at: order.estimatedAt ?? order.updatedAt, label: 'Dự kiến giao', done: false },
  ];
}

function etaDeliveryCourse(order: CustomerOrder) {
  const deliveryAt = order.updatedAt;
  const scheduled = new Date(order.scheduledDeliverAt);
  const estimated = new Date(order.estimatedAt ?? order.scheduledDeliverAt);

  // Đơn đã giao: ETA là thời điểm thực tế.
  if (order.status === 'DELIVERED') {
    const deliveredAt = new Date(order.updatedAt);
    return {
      predictedAt: order.updatedAt,
      earliestAt: order.estimatedAt ?? order.updatedAt,
      latestAt: order.scheduledDeliverAt,
      normalAt: order.estimatedAt ?? order.updatedAt,
      confidence: 100,
      delayRisk: deliveredAt > scheduled ? 'high' : 'none',
      onTime: deliveredAt <= scheduled,
      sla: 'delivered',
    };
  }

  // Đơn hủy/thất bại: ETA là cập nhật gần nhất.
  if (order.status === 'CANCELLED' || order.status === 'FAILED') {
    return {
      predictedAt: order.updatedAt,
      earliestAt: order.updatedAt,
      latestAt: order.updatedAt,
      normalAt: order.updatedAt,
      confidence: order.status === 'CANCELLED' ? 30 : 20,
      delayRisk: 'none',
      onTime: false,
      sla: order.status === 'FAILED' ? 'late' : 'planned',
    };
  }

  // Đơn đang chạy: cửa sổ dựa trên dịch vụ + khoảng thời gian còn lại.
  const hoursLeft = hoursUntil(order.estimatedAt ?? order.scheduledDeliverAt);
  const hoursFromNow = hoursUntil(order.scheduledDeliverAt);
  const onTime = hoursLeft >= -2;

  let confidence = 95;
  let delayRisk: 'none' | 'low' | 'medium' | 'high' = 'none';

  if (hoursFromNow > 24) {
    confidence = 70;
    delayRisk = 'medium';
  } else if (hoursFromNow > 12) {
    confidence = 80;
    delayRisk = 'low';
  } else if (hoursFromNow > 0) {
    confidence = 90;
    delayRisk = 'low';
  } else {
    confidence = 60;
    delayRisk = 'medium';
  }

  if (order.service === 'SAME_DAY' && hoursLeft <= 6) {
    confidence += 10;
    delayRisk = 'none';
  } else if (order.service === 'EXPRESS') {
    confidence += 5;
  }
  if (!onTime) delayRisk = 'high';

  return {
    predictedAt: order.estimatedAt ?? order.scheduledDeliverAt,
    earliestAt: datePlus(order.scheduledDeliverAt, -hoursFromNow),
    latestAt: datePlus(order.scheduledDeliverAt, +hoursFromNow + 8),
    confidence,
    delayRisk,
    onTime,
    sla: onTime && hoursLeft > -4 ? 'planned' : 'at-risk',
  };
}

const predictETA = async (trackingCode: string): Promise<AiETAPrediction> => {
  await settle();
  const order = findOrder(trackingCode);
  if (!order) throw new MockApiError('Không tìm thấy mã đơn hàng.', 404);

  const course = etaDeliveryCourse(order);

  return {
    trackingCode,
    status: order.status,
    ...course,
    steps: etaSteps(order),
  };
};

const deliverySuggestions = async (orderId: string): Promise<AiDeliverySuggestion[]> => {
  await settle();
  const ordersRepo = collection<CustomerOrder>('orders');
  const order = await ordersRepo.get(orderId);
  if (!order) throw new MockApiError('Không tìm thấy mã đơn hàng.', 404);

  const suggestions: AiDeliverySuggestion[] = [];
  const now = new Date();

  if (order.status === 'NEW' || order.status === 'UNASSIGNED') {
    suggestions.push({
      kind: 'window',
      label: 'Giao sớm nhất cho khách',
      description: 'Đơn này chưa gán xe, có thể thương lượng giao nhanh hơn ngày hẹn.',
      at: datePlus(order.estimatedAt ?? order.scheduledDeliverAt, -2),
    });
    suggestions.push({ kind: 'call', label: 'Gọi lại cho khách', description: 'Liên hệ xác nhận lịch trình.' });
    return suggestions;
  }

  const hoursLeft = hoursUntil(order.estimatedAt ?? order.scheduledDeliverAt);
  if (hoursLeft <= 12 && hoursLeft > 0) {
    suggestions.push({
      kind: 'window',
      label: 'Giao đúng ca mong muốn',
      description: `Dự kiến trong ${hoursLeft} giờ. Đề xuất khách ở nhà trong khoảng giao hàng.`,
      at: datePlus(order.scheduledDeliverAt, -2),
    });
  }

  if (hoursLeft <= 0 || hoursLeft > 24) {
    suggestions.push({
      kind: 'schedule',
      label: 'Hẹn lại lịch giao',
      description: 'Lịch giao chậm hơn hoặc hôm sau, đặt lại lịch giao cho khách.',
      at: datePlus(order.scheduledDeliverAt, 24),
    });
  }

  suggestions.push({
    kind: 'call',
    label: 'Gửi tin nhắn cập nhật',
    description: 'Tin nhắn lịch giao hàng mới',
  });
  return suggestions;
};

const anomalyForecast = async (): Promise<AiAnomaly[]> => {
  await settle();
  const db = getDb();
  const now = new Date();
  const anomalies: AiAnomaly[] = [];

  for (const invoice of db.invoices) {
    const daysPastDue = daysUntil(invoice.dueAt);
    if (invoice.status === 'OVERDUE') {
      anomalies.push({
        id: `anom-${invoice.id}`,
        type: 'overdue',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.totalAmount,
        message: `Hóa đơn ${invoice.invoiceNumber} quá hạn${
          daysPastDue < -1 ? ` ${Math.abs(daysPastDue)} ngày` : ''
        }.`,
        recommendation: 'Liên hệ khách hàng yêu cầu thanh toán trước hạn.',
        severity: daysPastDue < -21 ? 'high' : 'medium',
      });
    }
  }

  const outstanding = db.invoices
    .filter((invoice) => invoice.status === 'OVERDUE')
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

  if (db.invoices.length > 0) {
    const avg = db.invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0) / db.invoices.length;
    const big = db.invoices.find((invoice) => invoice.totalAmount > avg * 2);
    if (big) {
      anomalies.push({
        id: 'anom-spike-1',
        type: 'spike',
        invoiceId: big.id,
        invoiceNumber: big.invoiceNumber,
        amount: big.totalAmount,
        message: `Hóa đơn ${big.invoiceNumber} cao gấp ${Math.round(big.totalAmount / avg).toFixed(1)}x trung bình.`,
        recommendation: 'Kiểm tra đơn đi kèm hoặc xác nhận với khách hàng.',
        severity: 'medium',
      });
    }
  }

  if (outstanding > 0) {
    anomalies.push({
      id: 'anom-cycle-1',
      type: 'cycle',
      amount: outstanding,
      message: `Tại đơn hàng ${db.orders.length}, tổng công nợ ${db.invoices.length} hóa đơn phải theo dõi.`,
      recommendation: 'Đề xuất khách thanh toán theo chu kỳ hàng tháng.',
      severity: 'low',
    });
  }

  return anomalies;
};

const profileInsights = async (): Promise<AiProfileInsight[]> => {
  await settle();
  const db = getDb();
  const insights: AiProfileInsight[] = [];

  const delivered = db.orders.filter((order) => order.status === 'DELIVERED');
  const onTime = delivered.filter(
    (order) => new Date(order.updatedAt) <= new Date(order.scheduledDeliverAt),
  );
  const inTransit = db.orders.filter(
    (order) => ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PENDING_PICKUP'].includes(order.status),
  );
  const deliveredCount = delivered.length;
  const onTimeRate = deliveredCount > 0 ? Math.round((onTime.length / deliveredCount) * 100) : 0;
  const overDue = db.invoices.filter((invoice) => invoice.status === 'OVERDUE');

  insights.push({
    id: 'insight-1',
    kind: 'delivery',
    message: `Đơn đã giao ${deliveredCount}/${db.orders.length} đơn, tỷ lệ giao đúng ${onTimeRate}%.`,
  });

  if (inTransit.length > 3) {
    insights.push({
      id: 'insight-2',
      kind: 'delivery',
      message: `Có ${inTransit.length} đơn đang vận chuyển, cần theo dõi chúng tập trung hơn.`,
    });
  } else if (inTransit.length > 0) {
    insights.push({
      id: 'insight-3',
      kind: 'delivery',
      message: `Có ${inTransit.length} đơn đang vận chuyển theo tuyến.`,
    });
  }

  if (overDue.length > 0) {
    insights.push({
      id: 'insight-4',
      kind: 'payment',
      message: `${overDue.length} hóa đơn quá hạn, cần liên hệ sớm để tránh ảnh hưởng.`,
    });
  }

  insights.push({
    id: 'insight-5',
    kind: 'general',
    message: 'Dành ít nhất một ngày kiểm tra mã đơn hàng trước hạn.',
  });

  return insights;
};

const chatReply = async (messages: AiChatMessage[]): Promise<AiChatMessage[]> => {
  await settle();
  const talk = (messages[messages.length - 1]?.content ?? '').toLowerCase();
  const responses: AiChatMessage[] = [];

  const answers: Record<string, string> = {
    'đơn hàng': 'Bạn có thể kiểm tra tình trạng đơn hàng tại /client/orders hoặc /track/[code].',
    'theo dõi': 'Tra Theo dõi tại /track/[code] là nhận biết ngay.',
    'giao hàng': 'Chọn "Gợi ý giao hàng" trong trang đơn hàng.',
    'thanh toán': 'Xem hóa đơn tại /client/invoices và thanh toán trực tuyến.',
    'hóa đơn': 'Quản lý hóa đơn tại /client/invoices.',
    'trả hàng': 'Yêu cầu trả hàng tại /client/returns.',
    'cẩm': 'Hãy click Trợ giúp trong canvas.',
  };

  const keys = Object.keys(answers);
  let best = '';
  for (const key of keys) {
    if (talk.includes(key)) best = key;
  }

  if (best) {
    responses.push({ role: 'assistant', content: answers[best] });
  } else {
    responses.push({ role: 'assistant', content: 'Tôi chưa hiểu ý bạn. Vui lòng chọn một chủ đề.' });
  }

  return responses;
};

const feedback = async (input: Omit<AiFeedback, 'id' | 'createdAt'>): Promise<AiFeedback> => {
  await settle();
  const row = {
    id: makeId('fbk'),
    message: input.message,
    rating: input.rating,
    createdAt: new Date().toISOString(),
  } as AiFeedback;

  const aiFeedbackRepo = collection<AiFeedback>('aiFeedback');
  await aiFeedbackRepo.create(row);
  return row;
};

export type NewOrderInput = {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  clientOrderRef?: string;
  itemCount?: number;
  weightKg?: number;
  codAmount?: number;
  shippingFee?: number;
  service?: CustomerOrder['service'];
  scheduledDeliverAt?: IsoDate;
};

export type NewReturnInput = {
  orderTrackingCode: string;
  reason: ReturnReason;
  note?: string;
};

export type MockRepository = {
  orders: Collection<CustomerOrder> & {
    createOrder: (input: NewOrderInput) => Promise<CustomerOrder>;
    cancelOrder: (id: string) => Promise<void>;
    byTrackingCode: (trackingCode: string) => Promise<CustomerOrder | null>;
    live: (trackingCode: string) => Promise<LiveTracking | null>;
    sla: (trackingCode: string) => Promise<TrackingSummary | null>;
    summary: () => Promise<CustomerDashboardSummary>;
  };
  invoices: Collection<CustomerInvoice> & {
    recordPayment: (id: string, amount?: number) => Promise<CustomerInvoice>;
  };
  returns: Collection<CustomerReturn> & { requestReturn: (input: NewReturnInput) => Promise<CustomerReturn> };
  webhooks: Collection<WebhookEndpoint> & { toggleWebhook: (id: string) => Promise<WebhookEndpoint> };
  stock: Collection<StockItem>;
  profiles: Collection<CustomerProfile> & { saveProfile: (input: Partial<CustomerProfile>) => Promise<CustomerProfile> };
  aiFeature: {
    predictETA: (trackingCode: string) => Promise<AiETAPrediction>;
    deliverySuggestions: (orderId: string) => Promise<AiDeliverySuggestion[]>;
    anomalyForecast: () => Promise<AiAnomaly[]>;
    profileInsights: () => Promise<AiProfileInsight[]>;
    chatReply: (messages: AiChatMessage[]) => Promise<AiChatMessage[]>;
    feedback: (input: Omit<AiFeedback, 'id' | 'createdAt'>) => Promise<AiFeedback>;
  };
  controls: (input: { latency?: [number, number]; failureRate?: number; reset?: boolean }) => Promise<{
    latencyMs: [number, number];
    failureRate: number;
  }>;
  reset: () => Promise<CustomerDatabase>;
};

export function createMockRepository(): MockRepository {
  const ordersRepo = collection<CustomerOrder>('orders');
  const invoicesRepo = collection<CustomerInvoice>('invoices');
  const returnsRepo = collection<CustomerReturn>('returns');
  const webhooksRepo = collection<WebhookEndpoint>('webhooks');
  const stockRepo = collection<StockItem>('stock');
  const profilesRepo = collection<CustomerProfile>('profiles');
  const aiFeedbackRepo = collection<AiFeedback>('aiFeedback');

  const orders = {
    ...ordersRepo,
    async createOrder(input: NewOrderInput) {
      await settle();
      const phone = String(input.recipientPhone).replace(/\s+/g, '');
      if (!/^0\d{8,10}$/.test(phone)) {
        throw new MockApiError('Số điện thoại người nhận không hợp lệ.', 422);
      }
      if (!input.recipientName.trim() || !input.recipientAddress.trim()) {
        throw new MockApiError('Vui lòng nhập đầy đủ thông tin giao hàng.', 422);
      }
      if ((input.weightKg ?? 0) <= 0) {
        throw new MockApiError('Khối lượng hàng phải lớn hơn 0.', 422);
      }

      const order = {
        id: makeId('ord'),
        trackingCode: trackingCode(),
        status: 'NEW' as OrderStatus,
        service: input.service ?? 'STANDARD',
        clientOrderRef: input.clientOrderRef ?? shortCode('AP'),
        itemCount: input.itemCount ?? 1,
        weightKg: input.weightKg ?? 1,
        codAmount: input.codAmount ?? 0,
        shippingFee: input.shippingFee ?? 15000,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        recipientAddress: input.recipientAddress,
        scheduledDeliverAt: input.scheduledDeliverAt ?? datePlus(new Date().toISOString(), 24),
        estimatedAt: input.scheduledDeliverAt ?? datePlus(new Date().toISOString(), 36),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [{ at: new Date().toISOString(), label: 'Đã tạo đơn', actor: input.recipientName }],
      } as CustomerOrder;

      await ordersRepo.create(order);
      return order;
    },
    async cancelOrder(id: string) {
      await settle();
      const order = await ordersRepo.get(id);
      if (!order) throw new MockApiError('Không tìm thấy đơn hàng.', 404);
      if (!['NEW', 'UNASSIGNED'].includes(order.status)) {
        throw new MockApiError('Chỉ được hủy đơn hàng chưa giao.', 409);
      }
      await ordersRepo.update(id, { status: 'CANCELLED', updatedAt: new Date().toISOString() });
    },
    async byTrackingCode(trackingCode: string) {
      await settle();
      return findOrder(trackingCode) ?? null;
    },
    async live(trackingCode: string) {
      await settle();
      const order = findOrder(trackingCode);
      if (!order) throw new MockApiError('Không tìm thấy mã đơn hàng.', 404);

      const drivers: Array<{ name: string }> = [
        { name: 'Nguyễn Văn Tài' },
        { name: 'Hoàng Thiện Huy' },
        { name: 'Đặng Nam Phong' },
      ];

      return {
        trackingCode,
        status: order.status,
        driverName: drivers[order.itemCount % drivers.length].name,
        from: { name: 'Kho Sài Gòn', address: '1 Nguyễn Huệ, Quận 1' },
        to: { name: order.recipientName, address: order.recipientAddress },
        current: { name: 'Kho Sài Gòn', address: order.recipientAddress },
        nextStop: {
          name: order.recipientName,
          address: order.recipientAddress,
          eta: order.estimatedAt ?? order.scheduledDeliverAt,
        },
        eta: order.estimatedAt ?? order.scheduledDeliverAt,
      } as LiveTracking;
    },
    async sla(trackingCode: string) {
      await settle();
      const order = findOrder(trackingCode);
      if (!order) throw new MockApiError('Không tìm thấy mã đơn hàng.', 404);
      const delivered = order.status === 'DELIVERED';
      return {
        trackingCode,
        status: order.status,
        promisedAt: order.scheduledDeliverAt,
        actualAt: delivered ? order.updatedAt : null,
        overtime: !delivered ? false : new Date(order.updatedAt) > new Date(order.scheduledDeliverAt),
        reason: delivered ? null : order.status === 'FAILED' ? 'Biển số người liên lạc' : null,
      } as TrackingSummary;
    },
    async summary() {
      await settle();
      const db = getDb();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const deliveredToday = db.orders.filter(
        (order) => order.status === 'DELIVERED' && new Date(order.updatedAt).getTime() >= today.getTime(),
      );
      const delivered = db.orders.filter((order) => order.status === 'DELIVERED');
      const onTime = delivered.filter(
        (order) => new Date(order.updatedAt) <= new Date(order.scheduledDeliverAt),
      );
      const deliveredCount = delivered.length;
      const onTimeRate = deliveredCount > 0 ? Math.round((onTime.length / deliveredCount) * 100) : 0;
      const outstandingAmount = db.invoices
        .filter((invoice) => invoice.status === 'OVERDUE' || invoice.status === 'SENT')
        .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
      const inTransit = db.orders.filter(
        (order) => ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PENDING_PICKUP'].includes(order.status),
      ).length;

      return {
        ordersToday: db.orders.filter((order) => new Date(order.createdAt).getTime() >= today.getTime()).length,
        inTransit,
        onTimeRate,
        outstandingAmount,
        deliveredToday: deliveredToday.length,
        openReturns: db.returns.filter(
          (record) => !['REFUNDED', 'REJECTED', 'CLOSED'].includes(record.status),
        ).length,
        lowStockCount: db.stock.filter((row) => row.available <= row.reorderPoint).length,
        recentOrders: [...db.orders].filter((order) => order.status === 'DELIVERED').slice(0, 6),
      } as CustomerDashboardSummary;
    },
  };

  return {
    orders,
    invoices: {
      ...invoicesRepo,
      async recordPayment(id: string, amount?: number) {
        await settle();
        const invoice = await invoicesRepo.get(id);
        if (!invoice) throw new MockApiError('Không tìm thấy hóa đơn.', 404);
        if (invoice.status === 'PAID' || invoice.status === 'VOID') {
          throw new MockApiError('Hóa đơn đã thanh toán.', 409);
        }
        const remaining = Math.max(0, invoice.totalAmount - (invoice.paidAmount ?? 0));
        const payment = amount !== undefined ? Math.round(amount) : remaining;
        if (!Number.isFinite(payment) || payment <= 0) {
          throw new MockApiError('Số tiền thanh toán phải lớn hơn 0.', 400);
        }
        if (payment > remaining) {
          throw new MockApiError('Số tiền vượt quá phần còn lại của hóa đơn.', 400);
        }
        const nextPaid = (invoice.paidAmount ?? 0) + payment;
        const nextStatus = nextPaid >= invoice.totalAmount ? 'PAID' : 'PARTIAL';
        await invoicesRepo.update(id, { status: nextStatus, paidAmount: nextPaid });
        return (await invoicesRepo.get(id)) as CustomerInvoice;
      },
    },
    returns: {
      ...returnsRepo,
      async requestReturn(input: NewReturnInput) {
        await settle();
        const order = findOrder(input.orderTrackingCode);
        if (!order) throw new MockApiError('Không tìm thấy mã đơn hàng.', 404);
        if (!['DELIVERED'].includes(order.status)) {
          throw new MockApiError('Chỉ được yêu cầu trả hàng đã giao.', 409);
        }

        const ret = {
          id: makeId('ret'),
          returnCode: shortCode('RET'),
          orderTrackingCode: input.orderTrackingCode,
          reason: input.reason,
          status: 'REQUESTED' as ReturnStatus,
          estimatedRefund: Math.round(order.codAmount * 0.5),
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          note: input.note,
        } as CustomerReturn;

        await returnsRepo.create(ret);
        return ret;
      },
    },
    webhooks: {
      ...webhooksRepo,
      async toggleWebhook(id: string) {
        await settle();
        const row = await webhooksRepo.get(id);
        if (!row) throw new MockApiError('Không tìm thấy webhook.', 404);
        const next = row.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        return webhooksRepo.update(id, { status: next });
      },
    },
    stock: stockRepo,
    profiles: {
      ...profilesRepo,
      async saveProfile(input: Partial<CustomerProfile>) {
        await settle();
        const row = (await profilesRepo.list())[0];
        if (!row) throw new MockApiError('Không tìm thấy hồ sơ.', 404);
        return profilesRepo.update(row.id, input as Partial<CustomerProfile>);
      },
    },
    aiFeature: {
      predictETA,
      deliverySuggestions,
      anomalyForecast,
      profileInsights,
      chatReply,
      feedback,
    },
    controls: async (input) => {
      if (input.latency) latencyMs = input.latency;
      if (typeof input.failureRate === 'number') failureRate = input.failureRate;
      if (input.reset) {
        memory = createSeedDatabase();
        save();
      }
      return { latencyMs, failureRate };
    },
    async reset() {
      memory = createSeedDatabase();
      save();
      return clone(memory);
    },
  };
}
