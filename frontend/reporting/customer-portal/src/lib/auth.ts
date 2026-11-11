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

export const getTenantSlug = (): string => {
  if (typeof window === 'undefined') return '';
  const token = getToken();
  if (token) {
    const payload = decodeJwt(token);
    if (payload?.schema_name) return payload.schema_name;
    if (payload?.tenant_slug) return payload.tenant_slug;
  }
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('tenant') || window.localStorage.getItem('smartlogi_tenant_slug') || '';
};

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('smartlogi_customer_token');
};

export const setUserRecord = (user: Record<string, any>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('smartlogi_customer_user', JSON.stringify(user));
  if (user.tenantSlug || user.slug) {
    window.localStorage.setItem('smartlogi_tenant_slug', user.tenantSlug || user.slug);
  }
};

export const setToken = (token: string, overrideUser?: Record<string, any>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('smartlogi_customer_token', token);
  const payload = decodeJwt(token) || {};
  const user = {
    id: overrideUser?.id || payload.sub || '',
    email: overrideUser?.email || payload.email || '',
    fullName: overrideUser?.fullName || payload.fullName || payload.name || undefined,
    role: overrideUser?.role || payload.role || 'CUSTOMER_CLIENT',
    slug: overrideUser?.tenantSlug ?? overrideUser?.slug ?? payload.tenant_slug ?? '',
    tenantId: overrideUser?.tenantId ?? payload.tenantId ?? payload.tenant_id,
    readOnlyGuest: Boolean(overrideUser?.readOnlyGuest ?? payload.readOnlyGuest),
  };
  window.localStorage.setItem('smartlogi_customer_user', JSON.stringify(user));
  if (user.slug) {
    window.localStorage.setItem('smartlogi_tenant_slug', user.slug);
  }
};

export const clearToken = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('smartlogi_customer_token');
  window.localStorage.removeItem('smartlogi_customer_user');
};

export const getUser = (): any | null => {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = window.localStorage.getItem('smartlogi_customer_user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

export const clearAuth = () => {
  clearToken();
};
