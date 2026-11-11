import axios from 'axios';

const showToast = (message: string, type: 'error' | 'warning' | 'info' = 'error') => {
  if (typeof window === 'undefined') return;
  
  const event = new CustomEvent('show-toast', {
    detail: { message, type },
  });
  window.dispatchEvent(event);
};

const api = axios.create({
  baseURL:
    typeof window === 'undefined'
      ? process.env.API_INTERNAL_URL || 'http://api-gateway:3000/api/v1'
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('smartlogi_tenant_token');
    const userStr = localStorage.getItem('smartlogi_tenant_user');
    const slugStr = localStorage.getItem('smartlogi_tenant_slug');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user?.tenantId) {
          config.headers['X-Tenant-ID'] = user.tenantId;
        }
      } catch (e) {
        console.error('Failed to parse tenant_user from localStorage:', e);
      }
    }
    if (slugStr) {
      config.headers['x-tenant-slug'] = slugStr;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {

    if (error?.response?.status === 401) {
      // A failed login is not an expired session: let the login page render
      // the server's error message instead of reloading and losing it.
      const isAuthRequest = String(error.config?.url || '').includes('/auth/');
      if (!isAuthRequest && typeof window !== 'undefined') {
        localStorage.removeItem('smartlogi_tenant_token');
        localStorage.removeItem('smartlogi_tenant_user');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    if (error?.response?.status === 409) {
      showToast('Data has been modified by another user. Please reload.', 'warning');
      return Promise.reject(error);
    }

    // Mọi lỗi (4xx/5xx) đều được báo bằng message của backend, trước đây chỉ
    // lỗi 5xx mới có toast nên lỗi nghiệp vụ (400/403/404) im lặng.
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
  }
);

export default api;
