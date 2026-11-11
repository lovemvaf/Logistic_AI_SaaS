// Centralised date formatting that is safe against null/undefined timestamps.
//
// Every page in the tenant portal renders server-provided dates through
// `new Date(...).toLocaleString()` / `toLocaleDateString()` etc. When a field
// is nullable (e.g. `checkedOutAt`, `licenseExpiry`, `trainedAt`) — or when the
// backend returns a transient `null` while a record is being processed — the
// `new Date(null/undefined)` call produces `Invalid Date` and the subsequent
// `.toLocaleString()` call throws `RangeError`, crashing the whole page.
//
// Routing every call site through these helpers guarantees a graceful fallback
// instead of a render crash.
export const DATE_FALLBACK = '-';

/** Format a date value, returning `fallback` when the value is null/undefined/empty. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  fallback: string = DATE_FALLBACK,
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString();
}

export function formatDate(
  value: string | number | Date | null | undefined,
  fallback: string = DATE_FALLBACK,
  locale?: string,
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(locale);
}

export function formatTime(
  value: string | number | Date | null | undefined,
  fallback: string = DATE_FALLBACK,
  locale?: string,
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString(locale);
}
