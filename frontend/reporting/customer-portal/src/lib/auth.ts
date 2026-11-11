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

export const getTenantSlug = (): string => {
  if (typeof window === 'undefined') return '';
  const token = getToken();
  if (token) {
    const payload = decodeJwt(token);
    if (payload?.schema_name) return payload.schema_name;
  }
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('tenant') || '';
};

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('smartlogi_customer_token');
};

export const setToken = (token: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('smartlogi_customer_token', token);
  const payload = decodeJwt(token);
  if (payload) {
    const user = {
      id: payload.sub || '',
      email: payload.email || '',
      role: payload.role || 'CUSTOMER_CLIENT',
      slug: payload.tenant_slug || '',
    };
    window.localStorage.setItem('smartlogi_customer_user', JSON.stringify(user));
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
