export type TenantSession = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName?: string;
    role?: string;
    tenantId?: string;
    slug?: string;
    readOnlyGuest?: boolean;
  };
};

const TOKEN_KEY = "smartlogi_tenant_token";
const USER_KEY = "smartlogi_tenant_user";

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

export const setUserRecord = (user: Record<string, any>) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  const resolvedSlug = user.tenantSlug || user.slug;
  if (resolvedSlug && resolvedSlug !== "platform") {
    window.localStorage.setItem("smartlogi_tenant_slug", resolvedSlug);
  }
};

export const setSession = (token: string, overrideUser?: Record<string, any>) => {
  if (!isBrowser()) return;
  const payload = decodeJwt(token) || {};
  const user = {
    id: overrideUser?.id || payload.sub || payload.userId || "",
    email: overrideUser?.email || payload.email || "",
    fullName: overrideUser?.fullName || payload.fullName || payload.name || undefined,
    role: overrideUser?.role || payload.role || "TENANT_USER",
    tenantId: overrideUser?.tenantId ?? payload.tenant_id ?? payload.tenantId,
    slug: overrideUser?.tenantSlug ?? overrideUser?.slug ?? payload.tenant_slug ?? "",
    readOnlyGuest: Boolean(overrideUser?.readOnlyGuest ?? payload.readOnlyGuest),
  };
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (user.slug && user.slug !== "platform") {
    window.localStorage.setItem("smartlogi_tenant_slug", user.slug);
  } else if (user.slug === "platform") {
    window.localStorage.removeItem("smartlogi_tenant_slug");
  }
};

export const clearSession = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
};
