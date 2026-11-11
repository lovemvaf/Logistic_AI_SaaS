import type { JwtPayload } from '../env';

/** Minimal HS256 JWT verification (zero deps; uses Web Crypto). */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(b64UrlToStr(parts[0])) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signingInput = parts[0] + '.' + parts[1];
    const sig = b64UrlToBuf(parts[2]);
    const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(signingInput));
    if (!ok) return null;

    const payload = JSON.parse(b64UrlToStr(parts[1])) as JwtPayload;

    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** base64url -> UTF-8 string (for JSON.parse). */
function b64UrlToStr(b64: string): string {
  let bin = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = bin.length % 4;
  if (pad) bin += '==='.slice(0, 4 - pad);
  const bytes = Uint8Array.from(atob(bin), (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** base64url -> ArrayBuffer (binary, for signature verification). */
function b64UrlToBuf(b64: string): ArrayBuffer {
  let bin = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = bin.length % 4;
  if (pad) bin += '==='.slice(0, 4 - pad);
  const bytes = Uint8Array.from(atob(bin), (ch) => ch.charCodeAt(0));
  return bytes.buffer;
}
