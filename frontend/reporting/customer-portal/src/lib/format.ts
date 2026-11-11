/**
 * Format a VND amount for display. Prisma Decimal values arrive as strings,
 * so callers should be able to pass unknown safely.
 */
export function formatVnd(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}
