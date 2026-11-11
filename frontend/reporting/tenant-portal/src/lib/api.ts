import axios from 'axios';

const showToast = (message: string, type: 'error' | 'warning' | 'info' = 'error') => {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent('show-toast', {
    detail: { message, type },
  });
  window.dispatchEvent(event);
};

const rawInternalUrl = (process.env.API_INTERNAL_URL || 'http://api-gateway:3000')
  .replace(/\/api\/v1\/?$/, '')
  .replace(/\/+$/, '');

const api = axios.create({
  baseURL:
    typeof window === 'undefined'
      ? `${rawInternalUrl}/api/v1`
      : process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'x-smartlogi-portal': 'tenant',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('smartlogi_tenant_token');
    const userStr = localStorage.getItem('smartlogi_tenant_user');
    const slugStr = localStorage.getItem('smartlogi_tenant_slug');
    const sandboxKey = localStorage.getItem('smartlogi_sandbox_key');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['x-smartlogi-portal'] = 'tenant';
    if (sandboxKey) {
      config.headers['x-smartlogi-sandbox'] = sandboxKey;
    }
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user?.tenantId) {
          config.headers['X-Tenant-ID'] = user.tenantId;
        }
        if (user?.slug && !config.headers['x-tenant-slug']) {
          config.headers['x-tenant-slug'] = user.slug;
        }
      } catch {
        // Ignore malformed user cache
      }
    }
    if (slugStr && !config.headers['x-tenant-slug']) {
      config.headers['x-tenant-slug'] = slugStr;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const reqUrl = String(error.config?.url || '');
      const isAuthOrDemoRequest = reqUrl.includes('/auth/') || reqUrl.includes('/demo/');
      const onPublicRoute =
        typeof window !== 'undefined' &&
        (window.location.pathname.includes('/login') ||
          window.location.pathname.includes('/demo-handoff') ||
          window.location.pathname.includes('/build-info'));
      if (!isAuthOrDemoRequest && !onPublicRoute && typeof window !== 'undefined') {
        localStorage.removeItem('smartlogi_tenant_token');
        localStorage.removeItem('smartlogi_tenant_user');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    if (error?.response?.status === 409) {
      showToast(
        error?.response?.data?.message || 'Dữ liệu đã thay đổi bởi thao tác khác (409 Conflict). Vui lòng tải lại.',
        'warning',
      );
      return Promise.reject(error);
    }

    const status = error?.response?.status ?? 0;
    const serverMessage = error?.response?.data?.message;
    if (status >= 500) {
      showToast(
        serverMessage ? `Lỗi máy chủ: ${serverMessage}` : 'Lỗi máy chủ. Vui lòng thử lại sau.',
        'error',
      );
    } else if (serverMessage) {
      showToast(String(serverMessage), 'error');
    }

    return Promise.reject(error);
  },
);

export default api;
