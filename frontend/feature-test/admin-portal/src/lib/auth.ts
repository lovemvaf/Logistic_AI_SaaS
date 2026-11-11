import { isMockDataSource } from "./local-store";

const TOKEN_KEY = "smartlogi_admin_token";
const USER_KEY = "smartlogi_admin_user";

const isBrowser = () => typeof window !== "undefined";

export const decodeJwt = (token: string): any => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

export const getToken = (): string | null => {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
};

export const getUser = () => {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const setToken = (token: string, overrideUser?: Record<string, any>) => {
  if (!isBrowser()) return;
  const payload = decodeJwt(token) || {};
  const user = {
    id: overrideUser?.id || payload.sub || payload.userId || "",
    email: overrideUser?.email || payload.email || "",
    fullName: overrideUser?.fullName || payload.fullName || payload.name || undefined,
    role: overrideUser?.role || payload.role || "SUPER_ADMIN",
    tenantId: overrideUser?.tenantId ?? payload.tenant_id ?? payload.tenantId ?? null,
    tenantSlug: overrideUser?.tenantSlug ?? payload.tenant_slug ?? "platform",
    readOnlyGuest: Boolean(overrideUser?.readOnlyGuest ?? payload.readOnlyGuest),
  };
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const setUserRecord = (user: Record<string, any>) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearToken = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
};

export const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(JSON.stringify({ sub: '1', email: 'admin@smartlogi.com', role: 'SUPER_ADMIN', fullName: 'Admin User' })) +
  '.demo-signature';

export const DEMO_CREDENTIALS = { email: 'admin@smartlogi.com', password: 'admin123' };

export const createDemoToken = (role: string) => {
  return (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    btoa(JSON.stringify({ sub: '1', email: 'user@smartlogi.com', role, fullName: 'Demo User' })) +
    '.demo-signature'
  );
};

export const demoLogin = () => {
  if (!isMockDataSource) return;
  const payload = decodeJwt(DEMO_TOKEN) || {};
  const user = {
    id: payload.sub || '',
    email: payload.email || '',
    role: payload.role || 'SUPER_ADMIN',
    fullName: payload.fullName || '',
  };
  if (isBrowser()) {
    window.localStorage.setItem(TOKEN_KEY, DEMO_TOKEN);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
};
