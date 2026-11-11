/**
 * Định dạng hiển thị chung cho pack station.
 */

import type {
  AnomalyKind,
  BoxType,
  CorrectionStatus,
  IsoDate,
  MatchResult,
  PackOrderStatus,
  PackStationStatus,
  PackSessionStatus,
  ServicePriority,
} from './mock/types';

export function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatDateVN(date?: IsoDate | string | null) {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function formatDateTimeVN(date?: IsoDate | string | null) {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatDuration(seconds?: number | null) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const secondsRemainder = seconds % 60;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? ` ${minutes % 60}m` : ''}`;
}

/** Mã trạng thái đơn hàng đóng gói. */
export const orderStatusLabel: Record<PackOrderStatus, string> = {
  PENDING: 'Chờ đóng',
  IN_QUEUE: 'Đã lấy',
  IN_PROGRESS: 'Đang đóng',
  CORRECTING: 'Chờ đính chính',
  PACKED: 'Đã đóng',
  CLOSED: 'Đóng',
  CANCELLED: 'Đã hủy',
};

export const orderStatusTone: Record<PackOrderStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  PENDING: 'neutral',
  IN_QUEUE: 'info',
  IN_PROGRESS: 'info',
  CORRECTING: 'warning',
  PACKED: 'success',
  CLOSED: 'success',
  CANCELLED: 'danger',
};

/** Mã trạng thái phiên. */
export const sessionStatusLabel: Record<PackSessionStatus, string> = {
  ACTIVE: 'Đang mở',
  SEALING: 'Sắp đóng',
  CLOSED: 'Đã đóng',
};

export const sessionStatusTone: Record<PackSessionStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  ACTIVE: 'success',
  SEALING: 'warning',
  CLOSED: 'neutral',
};

/** Mã trạng thái trạm. */
export const stationStatusLabel: Record<PackStationStatus, string> = {
  AVAILABLE: 'Sẵn sàng',
  BUSY: 'Đang bận',
  OFFLINE: 'Năng sự',
};

export const stationStatusTone: Record<PackStationStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  AVAILABLE: 'success',
  BUSY: 'warning',
  OFFLINE: 'danger',
};

/** Mã thay đổi mã SKU. */
export const matchStatusLabel: Record<MatchResult, string> = {
  MATCH: 'Khớp chính xác',
  MISMATCH: 'Khác biệt',
  OVERRIDE: 'Đã thay thế',
};

export const matchStatusTone: Record<MatchResult, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  MATCH: 'success',
  MISMATCH: 'danger',
  OVERRIDE: 'warning',
};

export const correctionStatusLabel: Record<CorrectionStatus, string> = {
  PENDING: 'Chờ xử lý',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

export const correctionStatusTone: Record<CorrectionStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export function boxTypeLabel(type: BoxType) {
  return { LARGE: 'Hộp lớn', MEDIUM: 'Hộp vừa', SMALL: 'Hộp nhỏ', FILM: 'Phim cuộn' }[type] ?? type;
}

export function priorityLabel(priority: ServicePriority) {
  return { NORMAL: 'Thường', HIGH: 'Cao', URGENT: 'Khẩn' }[priority] ?? priority;
}

/** Mã kiểu bất thường nhận định của AI. */
export const anomalyKindLabel: Record<AnomalyKind, string> = {
  SKU_MISMATCH: 'Chênh lệch SKU',
  VOLUMETRIC: 'Chênh lệch thể tích/trọng lượng',
  CAPACITY_RISK: 'Rủi ro hộp bao',
  SCALE_ALT: 'Chờ đính chính',
};

/** Mức độ của bất thường nhận định của AI. */
export const anomalySeverityLabel: Record<'high' | 'medium' | 'low', string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
};

export const anomalySeverityTone: Record<'high' | 'medium' | 'low', 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};

export const sessionSummary = (sessions: Array<any>) => {
  const list = Array.isArray(sessions) ? sessions : [];
  const products = list.length;
  const totalPacked = list.reduce((sum, session) => sum + session.totalPacked, 0);
  const totalMatched = list.reduce((sum, session) => sum + session.totalMatched, 0);
  const totalMismatched = list.reduce((sum, session) => sum + session.totalMismatched, 0);
  return { products, totalPacked, totalMatched, totalMismatched };
};
