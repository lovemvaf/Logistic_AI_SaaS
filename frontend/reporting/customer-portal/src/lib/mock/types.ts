/**
 * Domain types for the customer portal.
 *
 * Các kiểu này bám theo hợp đồng `/api/v1/client/*` của core-api; khi backend
 * hoạt động, adapter REST (`repository`) trả về cùng hình dạng. Page không tự
 * khai báo lại shape_bên trong.
 */

export type Id = string;
export type IsoDate = string;

export type OrderStatus =
  | 'NEW'
  | 'UNASSIGNED'
  | 'PENDING_PICKUP'
  | 'PICKING'
  | 'PACKED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'CANCELLED';

export type ServiceLevel = 'STANDARD' | 'EXPRESS' | 'SAME_DAY';

export type CustomerOrder = {
  id: Id;
  trackingCode: string;
  status: OrderStatus;
  service: ServiceLevel;
  /** Mã đơn tham chiếu của khách, từ CSV hoặc form tạo đơn. */
  clientOrderRef: string;
  itemCount: number;
  weightKg: number;
  codAmount: number;
  shippingFee: number;
  /** Người nhận — luôn che 3 số cuối SĐT ở màn công khai. */
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  /** Tên người gửi chỉ xuất hiện trong trang khách hàng (!phạm vi trang track). */
  senderName?: string;
  scheduledDeliverAt?: IsoDate;
  estimatedAt?: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  timeline: Array<{ at: IsoDate; label: string; actor: string }>;
};

export type CustomerInvoice = {
  id: Id;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'VOID';
  issuedAt: IsoDate;
  dueAt: IsoDate;
  note?: string;
};

export type ReturnReason = 'DAMAGED' | 'WRONG_ITEM' | 'REFUSED' | 'NOT_DELIVERED' | 'OTHER';

export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'INSPECTING' | 'REFUNDED' | 'REJECTED' | 'CLOSED';

/** Yêu cầu trả hàng (RMA) do khách tạo. */
export type CustomerReturn = {
  id: Id;
  returnCode: string;
  orderTrackingCode: string;
  reason: ReturnReason;
  status: ReturnStatus;
  estimatedRefund: number;
  createdAt: IsoDate;
  resolvedAt: IsoDate | null;
  note?: string;
  inspection?: 'PENDING' | 'SELLABLE' | 'DAMAGED' | 'SCRAP';
};

export type WebhookEndpoint = {
  id: Id;
  url: string;
  events: string[];
  status: 'ACTIVE' | 'PAUSED' | 'FAILING';
  secretPrefix: string;
  successRate: number;
  lastDeliveryAt: IsoDate | null;
};

/** Tồn ký gửi của khách hàng theo SKU, kho, hạn sử dụng. */
export type StockItem = {
  id: Id;
  sku: string;
  name: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  reserved: number;
  available: number;
  expiryDate: IsoDate | null;
  reorderPoint: number;
  priceVnd: number;
  updatedAt: IsoDate;
};

export type TrackingEvent = {
  status: string;
  label: string;
  at: IsoDate;
  location?: string;
  description?: string;
  actor?: string;
};

export type LiveTracking = {
  trackingCode: string;
  status: OrderStatus;
  driverName?: string;
  from: { name: string; address: string };
  to: { name: string; address: string; };
  current: { name: string; address: string };
  nextStop?: { name: string; address: string; eta: IsoDate };
  eta?: IsoDate;
};

export type TrackingSummary = {
  trackingCode: string;
  status: OrderStatus;
  promisedAt: IsoDate;
  actualAt: IsoDate | null;
  overtime: boolean;
  reason?: string;
};

export type CustomerProfile = {
  id: Id;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  province: string;
  district: string;
  taxCode: string;
  role: 'CLIENT';
};

export type CustomerDashboardSummary = {
  ordersToday: number;
  inTransit: number;
  onTimeRate: number;
  outstandingAmount: number;
  deliveredToday: number;
  openReturns: number;
  lowStockCount: number;
  recentOrders: CustomerOrder[];
};

/**
 * Kết quả dự báo ETA do AI của hệ thống tính toán từ dữ liệu mock.
 *
 * Chỉ hoạt động khi `NEXT_PUBLIC_DATA_SOURCE=mock`; khi Chatt bảo,
 * `repository.ts` trả ra các giá trị null/empty.
 */

export type AiETAStep = {
  at: IsoDate;
  label: string;
  done: boolean;
};

export type AiETAPrediction = {
  trackingCode: string;
  status: OrderStatus;
  predictedAt: IsoDate;
  earliestAt: IsoDate;
  latestAt: IsoDate;
  normalAt: IsoDate;
  confidence: number;
  delayRisk: 'none' | 'low' | 'medium' | 'high';
  onTime: boolean;
  sla: 'delivered' | 'late' | 'at-risk' | 'planned';
  steps: AiETAStep[];
};

export type AiDeliverySuggestion = {
  kind: 'window' | 'call' | 'schedule';
  label: string;
  description: string;
  at?: IsoDate;
};

export type AiAnomalyType = 'overdue' | 'spike' | 'cycle' | 'unusual';

export type AiAnomaly = {
  id: Id;
  type: AiAnomalyType;
  invoiceId?: Id;
  invoiceNumber?: string;
  amount?: number;
  message: string;
  recommendation: string;
  severity: 'low' | 'medium' | 'high';
};

export type AiProfileInsight = {
  id: Id;
  kind: 'delivery' | 'payment' | 'account' | 'general';
  message: string;
};

export type AiChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiFeedbackRating = 'poor' | 'average' | 'good' | 'excellent';

export type AiFeedback = {
  id: Id;
  message: string;
  rating: AiFeedbackRating;
  createdAt: IsoDate;
};
