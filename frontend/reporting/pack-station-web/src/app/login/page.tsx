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
  allowedPortals: string[];
  tenantSlug: string;
  role: string;
  email: string;
  title: string;
  description: string;
  defaultPath: string;
};

function decodePayload(token: string) {
  const segment = token.split('.')[1];
  if (!segment) throw new Error('Token không hợp lệ.');
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + '='.repeat(padding));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

export default function PackStationLogin() {
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
      (!isMockDataSource && isDemoMode ? 'demo-3pl-dn' : '');
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
        setPersonas(
          list.filter(
            (p: DemoPersona) => p.portal === 'pack' || p.allowedPortals?.includes('pack'),
          ),
        );
      })
      .catch(() => undefined);
  }, [isDemoMode]);

  const performMockLogin = useCallback(
    async (credentialEmail: string, credentialPassword: string) => {
      const { accessToken } = mockLogin({
        email: credentialEmail,
        password: credentialPassword,
      });
      const payload = decodePayload(accessToken);
      login(accessToken, {
        fullName: payload.fullName as string,
        email: payload.email as string,
        role: payload.role as string,
        staffId: payload.staffId as string,
        stationId: payload.stationId as string,
      });
      router.push('/pack');
    },
    [login, router],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!email.trim() || !password.trim()) {
        setError('Vui lòng nhập email và mật khẩu.');
        return;
      }
      setError('');

      if (isMockDataSource) {
        const mockMail = 'pack@smartlogi.vn';
        if (email.trim().toLowerCase() !== mockMail) {
          setError('Email không thuộc tài khoản demo nhân viên trạm.');
          return;
        }
        setLoading(true);
        try {
          await performMockLogin(mockMail, password);
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
          '/tenant/auth/login',
          { email: email.trim(), password },
          {
            headers: {
              'x-tenant-slug': slug,
              'x-smartlogi-portal': 'pack',
              'x-portal': 'pack-station',
            },
          },
        );
        const accessToken: string = res.data.accessToken;
        const payload = decodePayload(accessToken);
        localStorage.setItem('smartlogi_tenant_slug', slug);
        login(accessToken, {
          fullName:
            res.data?.user?.fullName ||
            (payload.fullName as string) ||
            (payload.email as string) ||
            email.trim(),
          email: (payload.email as string) || email.trim(),
          role:
            res.data?.user?.role ||
            (res.data.role as string) ||
            (payload.role as string) ||
            'WAREHOUSE_STAFF',
          staffId: (payload.sub as string) || (payload.staffId as string) || '',
          stationId: (payload.stationId as string) || '',
          slug,
        });
        router.push('/pack');
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Đăng nhập thất bại.';
        setError(String(message));
      } finally {
        setLoading(false);
      }
    },
    [email, password, tenantSlug, performMockLogin, login, router],
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
          portal: 'pack',
          sandboxKey,
        });
        const token = res.data?.token || res.data?.accessToken;
        if (!token) {
          setError(res.data?.message || 'Không khởi tạo được phiên demo.');
          return;
        }
        if (typeof window !== 'undefined' && p.tenantSlug !== 'platform') {
          window.localStorage.setItem('smartlogi_tenant_slug', p.tenantSlug);
        }
        login(token, {
          ...(res.data?.user || {}),
          slug: p.tenantSlug,
          staffId: res.data?.user?.id || '',
          stationId: p.tenantSlug === 'demo-fdi-bh' ? 'PACK-FDI-01' : 'PACK-DN-01',
        });
        router.push('/pack');
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
    void performMockLogin('pack@smartlogi.vn', 'demo1234');
  }, [performMockLogin]);

  return (
    <div className="min-h-screen bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
        <div className="self-center space-y-6">
          <EditorialPageHeader
            title="Đăng nhập trạm đóng gói"
            description="Vận hành bàn đóng gói với quét mã vạch, Camera CV mô phỏng, cân điện tử và niêm phong đồng bộ tồn kho Postgres RLS."
          />
          {isMockDataSource ? (
            <EmptyNote>
              Tài khoản demo offline: email `pack@smartlogi.vn`, mật khẩu bất kỳ.
            </EmptyNote>
          ) : isDemoMode ? (
            <EmptyNote>
              Cloud Demo Mode active. Chọn nhanh nhân sự đóng gói tại Kho ICD Long Bình
              (`demo-3pl-dn`) hoặc Kho ngoại quan FDI Biên Hòa (`demo-fdi-bh`).
            </EmptyNote>
          ) : (
            <EmptyNote>
              Kết nối trực tiếp WMS backend. Chỉ vai trò `WAREHOUSE_STAFF`, `WAREHOUSE_MANAGER` hoặc
              `TENANT_ADMIN` được phép truy cập.
            </EmptyNote>
          )}

          {!isMockDataSource && isDemoMode && personas.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Nhân sự Trạm đóng gói Demo 1 chạm
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
                        {p.tenantSlug} · {p.role}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">
                      Vào trạm
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
                id="pack-tenant-slug"
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
              id="pack-email"
              type="email"
              label="Email nhân viên"
              placeholder={isMockDataSource ? 'pack@smartlogi.vn' : 'pack.staff@3pl-dn.demo'}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
            />
            <Input
              id="pack-password"
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

            <div className="flex justify-end text-[12px] text-ink-soft">
              <Link href="/build-info" className="hover:text-accent">
                /build-info
              </Link>
            </div>
          </form>
        </div>
      </div>
      {isDemoMode ? <DemoControlCenter variant="floating" portalOverride="pack" /> : null}
    </div>
  );
}
