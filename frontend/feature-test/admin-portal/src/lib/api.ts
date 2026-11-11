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
    'x-smartlogi-portal': 'admin',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('smartlogi_admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['x-smartlogi-portal'] = 'admin';
    const sandboxKey = localStorage.getItem('smartlogi_sandbox_key');
    if (sandboxKey) {
      config.headers['x-smartlogi-sandbox'] = sandboxKey;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (
      response.data &&
      typeof response.data === 'object' &&
      'data' in response.data &&
      Array.isArray(response.data.data)
    ) {
      const meta = response.data.meta || response.data.pagination;
      response.data = meta ? { data: response.data.data, meta } : response.data.data;
    }
    return response;
  },
  async (error) => {
    if (error?.response?.status === 401) {
      const reqUrl = String(error.config?.url || '');
      const isAuthOrDemoRequest = reqUrl.includes('/auth/') || reqUrl.includes('/demo/');
      const onPublicRoute =
        typeof window !== 'undefined' &&
        (window.location.pathname.includes('/login') ||
          window.location.pathname.includes('/demo-handoff') ||
          window.location.pathname.includes('/build-info'));
      if (!isAuthOrDemoRequest && !onPublicRoute && typeof window !== 'undefined') {
        localStorage.removeItem('smartlogi_admin_token');
        localStorage.removeItem('smartlogi_admin_user');
        window.location.href = '/admin/login';
      }
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
