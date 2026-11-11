import { isMockDataSource } from "./local-store";

const TOKEN_KEY = "smartlogi_admin_token";
const USER_KEY = "smartlogi_admin_user";

const isBrowser = () => typeof window !== "undefined";

const decodeJwt = (token: string): any => {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
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
  return raw ? JSON.parse(raw) : null;
};

export const setToken = (token: string) => {
  if (!isBrowser()) return;
  const payload = decodeJwt(token) || {};
  const user = {
    id: payload.sub || payload.userId || "",
    email: payload.email || "",
    role: payload.role || "SUPER_ADMIN",
  };
  window.localStorage.setItem(TOKEN_KEY, token);
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