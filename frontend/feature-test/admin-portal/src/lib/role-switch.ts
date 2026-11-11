/**
 * Local role-switch utility for the admin portal.
 * Active ONLY when `NEXT_PUBLIC_DATA_SOURCE !== 'api'` (mock mode).
 */
import { isMockDataSource } from './local-store';

const USER_KEY = 'smartlogi_admin_user';
const TOKEN_KEY = 'smartlogi_admin_token';

/**
 * Decode a JWT token's payload without verifying the signature (browser-only).
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Re-encode a JWT payload into a base64url string (header.payload.signature).
 * Demo/mock-mode only.
 */
function reEncodeToken(token: string, role: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = decodeJwtPayload(token);
    if (!payload) return null;
    payload.role = role;
    const newPayload = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `${parts[0]}.${newPayload}.${parts[2] || ''}`;
  } catch {
    return null;
  }
}

/**
 * Switch the current user's role in mock mode only.
 * Returns `false` in `api` mode so client state cannot forge backend RBAC.
 */
export async function switchRole(newRole: string): Promise<boolean> {
  if (typeof window === 'undefined' || !isMockDataSource) return false;

  const userRaw = window.localStorage.getItem(USER_KEY);
  const token = window.localStorage.getItem(TOKEN_KEY);

  if (!userRaw) return false;

  try {
    const user = JSON.parse(userRaw);
    user.role = newRole;
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));

    if (token) {
      const newToken = reEncodeToken(token, newRole);
      if (newToken) {
        window.localStorage.setItem(TOKEN_KEY, newToken);
      }
    }

    window.dispatchEvent(new StorageEvent('storage', {
      key: USER_KEY,
      newValue: JSON.stringify(user),
    }));

    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current role from localStorage (client-only).
 */
export function getCurrentRole(): string | null {
  if (typeof window === 'undefined') return null;
  const userRaw = window.localStorage.getItem(USER_KEY);
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw);
    return user.role || null;
  } catch {
    return null;
  }
}
