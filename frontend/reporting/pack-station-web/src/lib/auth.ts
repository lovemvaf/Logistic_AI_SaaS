const TOKEN_KEY = "smartlogi_pack_token";
const USER_KEY = "smartlogi_pack_user";

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

export const setToken = (token: string) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
};

export const getUser = (): any | null => {
  if (!isBrowser()) return null;
  try {
    const userStr = window.localStorage.getItem(USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

export const setUser = (user: any) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  const resolvedSlug = user?.slug || user?.tenantSlug;
  if (resolvedSlug && resolvedSlug !== "platform") {
    window.localStorage.setItem("smartlogi_tenant_slug", resolvedSlug);
  }
};

export const clearUser = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(USER_KEY);
};

export const clearAuth = () => {
  clearToken();
  clearUser();
};
