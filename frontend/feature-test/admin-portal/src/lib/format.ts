/**
 * Định dạng số liệu dùng chung của admin portal.
 *
 * Tiền tệ theo mẫu `1.234.567 ₫`, ngày ISO 8601 có thể hiển thị
 * `dd/MM/yyyy` / `dd/MM/yyyy HH:mm`, số thuần hiển thị dạng compact.
 * Mọi hàm đều an toàn với `undefined`, `null` và giá trị `NaN`.
 */

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Số nguyên không gợiзре, ví dụ: `1,234` / `1.28M`.
 */
export function formatNumber(value: number | null | undefined, digits?: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (digits === undefined) return new Intl.NumberFormat('en-US').format(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
}

/**
 * Tiền tệ VND: `1.234.567 ₫`.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('vi-VN')} ₫`;
}

/**
 * Ngày ISO 8601 → `dd/MM/yyyy`.
 */
export function formatDate(date?: string | number | null): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return String(date);
  return parsed.toLocaleDateString('vi-VN');
}

/**
 * Ngày giờ ISO 8601 → `dd/MM/yyyy HH:mm`.
 */
export function formatDateTime(date?: string | number | null): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return String(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

/**
 * Chuỗi đơn tiền kiểu `$2,490.00` → số nguyên USD (không định dạng tiền tệ).
 * Dùng khi dữ liệu seed lưu amount dưới dạng chuỗi.
 */
export function parseMoney(value: string | number | null | undefined): number {
  if (value == null) return NaN;
  if (typeof value === 'number') return value;
  const raw = String(value).replace(/[\$ ,]/g, '');
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? NaN : parsed;
}

/**
 * Thái của một mã trạng thái nghiệp vụ tiêu chuẩn trên Admin portal.
 */
export function statusTone(status: string | null | undefined): 'default' | 'warning' | 'danger' | 'success' | 'info' {
  if (!status) return 'default';
  switch (status.toUpperCase().replace(/_/g, ' ')) {
    case 'DELIVERED':
    case 'PAID':
    case 'ACTIVE':
      return 'success';
    case 'PENDING':
    case 'UNASSIGNED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'info';
    case 'FAILED':
    case 'CANCELLED':
    case 'RETURNED':
    case 'RETURN_REQUESTED':
    case 'SUSPENDED':
    case 'OVERDUE':
      return 'danger';
    case 'DELAYED':
    case 'ERROR':
      return 'warning';
    default:
      return 'default';
  }
}
