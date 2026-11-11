/**
 * Nhãn tiếng Việt + định dạng ngày/thời gian của customer portal.
 *
 * Bản độc lập (không import từ tenant portal): một label + tone cho mỗi
 * trạng thái, thể hiện trạng thái bằng chữ chứ không chỉ màu.
 */

import type {
  CustomerOrder,
  CustomerInvoice,
  CustomerReturn,
  OrderStatus,
  ServiceLevel,
  ReturnReason,
} from './mock/types';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const ORDER_LABELS: Record<OrderStatus, string> = {
  NEW: 'Nháp',
  UNASSIGNED: 'Chờ gán',
  PENDING_PICKUP: 'Chờ lấy hàng',
  PICKING: 'Đang soạn',
  PACKED: 'Đã đóng gói',
  IN_TRANSIT: 'Đang vận chuyển',
  OUT_FOR_DELIVERY: 'Đang phát',
  DELIVERED: 'Đã giao',
  FAILED: 'Giao thất bại',
  RETURN_REQUESTED: 'Yêu cầu trả',
  RETURNED: 'Đã trả',
  CANCELLED: 'Đã huỷ',
};

const ORDER_TONES: Record<OrderStatus, Tone> = {
  NEW: 'info',
  UNASSIGNED: 'warning',
  PENDING_PICKUP: 'warning',
  PICKING: 'info',
  PACKED: 'info',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  FAILED: 'danger',
  RETURN_REQUESTED: 'warning',
  RETURNED: 'neutral',
  CANCELLED: 'neutral',
};

const INVOICE_LABELS: Record<CustomerInvoice['status'], string> = {
  DRAFT: 'Bản nháp',
  SENT: 'Đã gửi',
  PAID: 'Đã trả',
  OVERDUE: 'Quá hạn',
  VOID: 'Hủy bỏ',
};

const INVOICE_TONES: Record<CustomerInvoice['status'], Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  PAID: 'success',
  OVERDUE: 'danger',
  VOID: 'danger',
};

const RETURN_LABELS: Record<CustomerReturn['status'], string> = {
  REQUESTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  IN_TRANSIT: 'Đang về kho',
  INSPECTING: 'Đang kiểm định',
  REFUNDED: 'Đã hoàn tiền',
  REJECTED: 'Từ chối',
  CLOSED: 'Đã đóng',
};

const RETURN_TONES: Record<CustomerReturn['status'], Tone> = {
  REQUESTED: 'warning',
  APPROVED: 'info',
  IN_TRANSIT: 'info',
  INSPECTING: 'warning',
  REFUNDED: 'success',
  REJECTED: 'danger',
  CLOSED: 'neutral',
};

const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  DAMAGED: 'Hàng hỏng',
  WRONG_ITEM: 'Sai mặt hàng',
  REFUSED: 'Từ chối',
  NOT_DELIVERED: 'Chưa giao',
  OTHER: 'Khác',
};

const SERVICE_LABELS: Record<ServiceLevel, string> = {
  STANDARD: 'Tiêu chuẩn',
  EXPRESS: 'Nhanh',
  SAME_DAY: 'Hàng ngày',
};

const SERVICE_TONES: Record<ServiceLevel, Tone> = {
  STANDARD: 'info',
  EXPRESS: 'info',
  SAME_DAY: 'success',
};

export const orderStatusLabel = (status: OrderStatus) => ORDER_LABELS[status] ?? status;
export const orderStatusTone = (status: OrderStatus): Tone => ORDER_TONES[status] ?? 'neutral';
export const invoiceStatusLabel = (status: CustomerInvoice['status']) =>
  INVOICE_LABELS[status] ?? status;
export const invoiceStatusTone = (status: CustomerInvoice['status']): Tone =>
  INVOICE_TONES[status] ?? 'neutral';
export const returnStatusLabel = (status: CustomerReturn['status']) =>
  RETURN_LABELS[status] ?? status;
export const returnStatusTone = (status: CustomerReturn['status']): Tone =>
  RETURN_TONES[status] ?? 'neutral';
export const returnReasonLabel = (reason: ReturnReason) => RETURN_REASON_LABELS[reason] ?? reason;
export const serviceLabel = (service: ServiceLevel) => SERVICE_LABELS[service] ?? service;
export const serviceTone = (service: ServiceLevel): Tone => SERVICE_TONES[service] ?? 'neutral';
export const clientRoleLabel = (role: string) => role.replace(/_/g, ' ').toLowerCase();

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat('vi-VN');

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnly = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const formatCurrency = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? currency.format(value) : '—';

export const formatNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? number.format(value) : '—';

export const formatDateTimeVN = (value: string | number | Date | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed);
};

export const formatDateVN = (value: string | number | Date | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateOnly.format(parsed);
};

/** Tóm tắt số lượng, dùng cho tiêu đề phụ của một bảng. */
export const listSummary = (count: number, title: string) => `${count} ${title}`;

/** Mã đơn dùng làm tiêu đề cho người dùng đọc. */
export const trackingCode = (value: CustomerOrder | undefined | null) =>
  value?.trackingCode ?? '—';
