import { randomBytes, randomInt } from 'crypto';

/**
 * Mã tracking công khai (capability token): khách chỉ có mã này để tra cứu
 * nên phải **duy nhất toàn cục** và không đoán được.
 *
 * Format: `SLG-YYYYMMDD-XXXXXX`
 * - 6 ký tự base32 (32^6 ≈ 1,07 tỷ) ⇒ xác suất trùng trong một ngày rất nhỏ
 *   (với 100k đơn/ngày: p ≈ 4,7e-4 ⇒ vẫn cần unique constraint bắt lỗi).
 * - Trước đây chỉ 5 chữ số (100k mã/ngày) nên dễ trùng giữa 2 tenant.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (bỏ I, L, O, U)

export function randomCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function generateTrackingCode(prefix = 'SLG'): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${date}-${randomCode(6)}`;
}

/**
 * Mã vận đơn phía khách hàng (client tự tạo): `TRK-<timestamp>-<6 ký tự>`.
 */
export function generateClientTrackingCode(): string {
  return `TRK-${Date.now()}-${randomCode(6)}`;
}

/** Số ngẫu nhiên dùng cho mã nội bộ khác (giữ lại API cũ). */
export function randomSuffix(digits = 5): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}
