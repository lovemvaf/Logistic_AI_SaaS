const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Utf8(base64: string): string {
  const clean = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? BASE64_CHARS.indexOf(clean[i + 2]) : -1;
    const c3 = i + 3 < clean.length ? BASE64_CHARS.indexOf(clean[i + 3]) : -1;
    if (c0 < 0 || c1 < 0) break;
    const n = (c0 << 18) | (c1 << 12) | ((c2 >= 0 ? c2 : 0) << 6) | (c3 >= 0 ? c3 : 0);
    bytes.push((n >> 16) & 0xff);
    if (c2 >= 0) bytes.push((n >> 8) & 0xff);
    if (c3 >= 0) bytes.push(n & 0xff);
  }
  const percentEncoded = bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join('');
  return decodeURIComponent(percentEncoded);
}

export const decodeJwt = (token: string): any => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = decodeBase64Utf8(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};
