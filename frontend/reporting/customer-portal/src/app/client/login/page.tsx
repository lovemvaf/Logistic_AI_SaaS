'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import { isMockDataSource } from '@/lib/data';
import { mockLogin } from '@/lib/mock';
import {
  DemoControlCenter,
  EditorialPageHeader,
  EmptyNote,
  StatusLabel,
} from 'ui-kit';
import { Input, Button } from 'ui-components';

type DemoPersona = {
  key: string;
  portal: string;
  tenantSlug: string;
  role: string;
  email: string;
  title: string;
  description: string;
  defaultPath: string;
};

export default function ClientLogin() {
  const { login } = useAuth();
  const router = useRouter();
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  const [tenantSlug, setTenantSlug] = useState(
    !isMockDataSource && isDemoMode ? 'demo-3pl-dn' : '',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [personas, setPersonas] = useState<DemoPersona[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const paramSlug =
      params.get('tenant') ||
      localStorage.getItem('smartlogi_tenant_slug') ||
      (isDemoMode && !isMockDataSource ? 'demo-3pl-dn' : '');
    if (paramSlug) {
      setTenantSlug((prev) => prev || paramSlug);
    }
  }, [isDemoMode]);

  useEffect(() => {
    if (isMockDataSource || !isDemoMode) return;
    api
      .get('/demo/personas')
      .then((res) => {
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        setPersonas(list.filter((p: DemoPersona) => p.portal === 'customer'));
      })
      .catch(() => undefined);
  }, [isDemoMode]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!email.trim() || !password.trim()) {
        setError('Vui lòng nhập email và mật khẩu.');
        return;
      }
      setError('');

      if (isMockDataSource) {
        const mockMail = 'buyer@anphat.vn';
        if (email.trim().toLowerCase() !== mockMail) {
          setError('Email không thuộc tài khoản demo khách hàng.');
          return;
        }
        setLoading(true);
        try {
          const { accessToken } = mockLogin({ email: mockMail, password });
          login(accessToken);
          router.push('/client/dashboard');
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
        return;
      }

      const slug = tenantSlug.trim();
      if (!slug) {
        setError('Vui lòng nhập mã doanh nghiệp (Tenant Slug).');
        return;
      }

      setLoading(true);
      try {
        const res = await api.post(
          '/client/auth/login',
          { email: email.trim(), password },
          { headers: { 'x-tenant-slug': slug, 'x-smartlogi-portal': 'customer' } },
        );
        localStorage.setItem('smartlogi_tenant_slug', slug);
        login(res.data.accessToken, res.data.user);
        router.push('/client/dashboard');
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Đăng nhập thất bại.';
        setError(String(message));
      } finally {
        setLoading(false);
      }
    },
    [email, password, tenantSlug, login, router],
  );

  const handleCloudPersonaLogin = useCallback(
    async (p: DemoPersona) => {
      setError('');
      setLoading(true);
      try {
        const sandboxKey =
          (typeof window !== 'undefined' &&
            window.localStorage.getItem('smartlogi_sandbox_key')) ||
          'shared-demo';
        const res = await api.post('/demo/login', {
          personaKey: p.key,
          portal: 'customer',
          sandboxKey,
        });
        const token = res.data?.token || res.data?.accessToken;
        if (!token) {
          setError(res.data?.message || 'Không khởi tạo được phiên demo.');
          return;
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('smartlogi_tenant_slug', p.tenantSlug);
        }
        login(token, res.data?.user);
        router.push(p.defaultPath || '/client/dashboard');
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Đăng nhập demo thất bại.');
      } finally {
        setLoading(false);
      }
    },
    [login, router],
  );

  const handleDemoLogin = useCallback(() => {
    if (!isMockDataSource) return;
    const { accessToken } = mockLogin({
      email: 'buyer@anphat.vn',
      password: 'demo1234',
    });
    login(accessToken);
    router.push('/client/dashboard');
  }, [login, router]);

  return (
    <div className="min-h-screen bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
        <div className="self-center space-y-6">
          <EditorialPageHeader
            title="Đăng nhập khách B2B"
            description="Theo dõi đơn hàng, tạo RFQ container, duyệt báo giá, tải chứng từ XNK và chia sẻ liên kết Tracking phân cấp quyền riêng tư."
          />
          {isMockDataSource ? (
            <EmptyNote>
              Tài khoản demo offline: email `buyer@anphat.vn`, mật khẩu bất kỳ.
            </EmptyNote>
          ) : isDemoMode ? (
            <EmptyNote>
              Cloud Demo Mode active (PostgreSQL RLS). Chọn nhanh một Chủ hàng B2B bên dưới để kiểm
              chứng cô lập dữ liệu giữa `demo-3pl-dn`, `demo-fdi-bh` và `demo-lm-lk`.
            </EmptyNote>
          ) : (
            <EmptyNote>
              Kết nối backend trực tiếp. Nhập mã doanh nghiệp (Tenant Slug), email và mật khẩu được
              cấp để đăng nhập cổng khách hàng.
            </EmptyNote>
          )}

          {!isMockDataSource && isDemoMode && personas.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Chủ hàng B2B Demo 1 chạm
              </p>
              <div className="grid gap-2">
                {personas.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={loading}
                    onClick={() => handleCloudPersonaLogin(p)}
                    className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-alt px-3 py-2 text-left transition-colors hover:border-accent disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-ink">{p.title}</p>
                      <p className="truncate font-mono text-[11px] text-ink-soft">
                        {p.tenantSlug} · {p.email}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">
                      Vào ngay
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="self-center">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-line bg-surface p-6">
            {!isMockDataSource ? (
              <Input
                id="client-tenant-slug"
                type="text"
                label="Mã doanh nghiệp (Tenant Slug)"
                placeholder="demo-3pl-dn"
                required
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
                disabled={loading}
              />
            ) : null}
            <Input
              id="client-email"
              type="email"
              label="Email công ty"
              placeholder={isMockDataSource ? 'buyer@anphat.vn' : 'buyer.amata@3pl-dn.demo'}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
            />
            <Input
              id="client-password"
              type="password"
              label="Mật khẩu"
              placeholder="Nhập mật khẩu…"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
            />

            {error ? (
              <div className="flex items-center gap-2 rounded-md border-l-2 border-danger bg-surface px-3 py-2">
                <StatusLabel tone="danger">{error}</StatusLabel>
              </div>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              className="h-11 w-full rounded-lg text-[13px] font-semibold"
              disabled={loading}
            >
              {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>

            {isMockDataSource ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full rounded-lg text-[13px] font-semibold"
                onClick={handleDemoLogin}
              >
                Vào bằng tài khoản thử nghiệm
              </Button>
            ) : null}

            <div className="flex items-center justify-between pt-2 text-[12px] text-ink-soft">
              <Link href="/" className="hover:text-accent">
                Tra cứu vận đơn công khai
              </Link>
              <Link href="/build-info" className="hover:text-accent">
                /build-info
              </Link>
            </div>
          </form>
        </div>
      </div>
      {isDemoMode ? <DemoControlCenter variant="floating" portalOverride="customer" /> : null}
    </div>
  );
}
