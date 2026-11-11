export type TenantSession = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName?: string;
    role?: string;
    tenantId?: string;
  };
};

const TOKEN_KEY = "smartlogi_tenant_token";
const USER_KEY = "smartlogi_tenant_user";

const isBrowser = () => typeof window !== "undefined";

export const decodeJwt = (token: string): any => {
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
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const setSession = (token: string) => {
  if (!isBrowser()) return;
  const payload = decodeJwt(token) || {};
  const user = {
    id: payload.sub || payload.userId || "",
    email: payload.email || "",
    fullName: payload.fullName || payload.name || undefined,
    role: payload.role || "TENANT_USER",
    tenantId: payload.tenant_id || payload.tenantId,
    slug: payload.tenant_slug || "",
  };
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
};
