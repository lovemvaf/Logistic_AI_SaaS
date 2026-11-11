"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DemoControlCenter } from 'ui-kit';
import { GoogleLoginButton } from '@/components/ui/GoogleLoginButton';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { isMockDataSource } from '@/lib/data';
import { DEMO_ACCOUNTS, mockLogin } from '@/lib/mock-auth';

const ROLE_REDIRECT: Record<string, string> = {
  TENANT_ADMIN: '/dashboard',
  TENANT_USER: '/dashboard',
  WAREHOUSE_MANAGER: '/dashboard',
  WAREHOUSE_STAFF: '/dashboard',
  LOGISTICS_MANAGER: '/logistics/dispatch',
  DRIVER: '/driver-sim',
};

const DEMO_TENANT = 'demo-3pl-dn';

type DemoPersona = {
  key: string;
  portal: string;
  tenantSlug: string;
  role: string;
  email: string;
  title: string;
  description: string;
  isNegativeTest?: boolean;
  defaultPath: string;
};

export default function TenantLoginPage() {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const [tenantSlug, setTenantSlug] = useState(
    isMockDataSource || isDemoMode ? DEMO_TENANT : '',
  );
  const [email, setEmail] = useState(isMockDataSource ? DEMO_ACCOUNTS[0].email : '');
  const [password, setPassword] = useState(isMockDataSource ? DEMO_ACCOUNTS[0].password : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<DemoPersona[]>([]);
  const [readOnlyGuest, setReadOnlyGuest] = useState(false);
  const router = useRouter();
  const { setAuthToken } = useAuth();

  useEffect(() => {
    if (isMockDataSource || !isDemoMode) return;
    api
      .get('/demo/personas')
      .then((res) => {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];
        setPersonas(list.filter((p: DemoPersona) => p.portal === 'tenant'));
      })
      .catch(() => undefined);
  }, [isDemoMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tenantSlug.trim()) {
      setError('Vui lòng nhập mã tenant.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }

    setLoading(true);
    try {
      if (isMockDataSource) {
        await new Promise((resolve) => setTimeout(resolve, 420));
        const result = mockLogin({ email, password, tenantSlug });
        localStorage.setItem('smartlogi_tenant_slug', tenantSlug.trim());
        setAuthToken(result.accessToken);
        router.replace(ROLE_REDIRECT[result.role] || '/dashboard');
        return;
      }

      localStorage.setItem('smartlogi_tenant_slug', tenantSlug.trim());
      const res = await api.post(
        '/tenant/auth/login',
        { email: email.trim(), password },
        {
          headers: {
            'x-tenant-slug': tenantSlug.trim(),
            'x-smartlogi-portal': 'tenant',
          },
        },
      );

      if (!res.data?.accessToken) {
        setError(res.data?.message || 'Đăng nhập thất bại.');
        return;
      }

      setAuthToken(res.data.accessToken, res.data.user);
      const role = res.data.user?.role || res.data.role || 'TENANT_USER';
      router.replace(ROLE_REDIRECT[role] || '/dashboard');
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Không kết nối được dịch vụ đăng nhập. Thử lại sau.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCloudPersonaLogin = async (p: DemoPersona) => {
    setError(null);
    setLoading(true);
    try {
      const sandboxKey =
        (typeof window !== 'undefined' && window.localStorage.getItem('smartlogi_sandbox_key')) ||
        'shared-demo';
      const res = await api.post('/demo/login', {
        personaKey: p.key,
        portal: 'tenant',
        sandboxKey,
        readOnlyGuest,
      });
      const token = res.data?.token || res.data?.accessToken;
      if (!token) {
        setError(res.data?.message || 'Không khởi tạo được phiên demo.');
        return;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('smartlogi_tenant_slug', p.tenantSlug);
      }
      setAuthToken(token, res.data?.user);
      router.replace(p.defaultPath || '/dashboard');
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      const msg = err?.response?.data?.message || err?.message || 'Đăng nhập thất bại.';
      setError(status ? `HTTP ${status} (${code || 'ERROR'}): ${msg}` : msg);
    } finally {
      setLoading(false);
    }
  };

  const useAccount = (accountEmail: string) => {
    const account = DEMO_ACCOUNTS.find((row) => row.email === accountEmail);
    if (!account) return;
    setEmail(account.email);
    setPassword(account.password);
    setTenantSlug(DEMO_TENANT);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16 lg:px-10">
        <section className="border-b border-line pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            SmartLogi · Tenant portal
          </p>
          <h1 className="mt-4 font-editorial text-[48px] font-semibold leading-[0.95] tracking-[-0.03em] text-ink sm:text-[58px]">
            Bàn giao ca
          </h1>
          <p className="mt-4 max-w-[52ch] text-[13px] leading-6 text-ink-soft">
            Điều hành WMS, Container FCL/LCL, Bãi ICD, Xuất nhập khẩu Hải quan, Tài chính COD và
            khuyến nghị AI trên cùng Cloud PostgreSQL + PostGIS (RLS đa doanh nghiệp).
          </p>

          {!isMockDataSource && isDemoMode && personas.length > 0 ? (
            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  Tài khoản Demo Cloud 1 chạm (PostgreSQL Live)
                </p>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={readOnlyGuest}
                    onChange={(e) => setReadOnlyGuest(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-line-strong"
                  />
                  <span>Read-Only Guest (403 Test)</span>
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {personas.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={loading}
                    onClick={() => handleCloudPersonaLogin(p)}
                    className={`flex flex-col justify-between rounded-md border p-2.5 text-left transition-colors ${
                      p.isNegativeTest
                        ? 'border-red-200 bg-red-50/50 hover:border-red-400'
                        : 'border-line bg-surface hover:border-accent'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-mono text-[10px] font-semibold text-ink-soft">
                        {p.tenantSlug}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold ${
                          p.isNegativeTest
                            ? 'bg-red-100 text-red-800'
                            : 'bg-surface-alt text-accent'
                        }`}
                      >
                        {p.isNegativeTest ? '403 TEST' : p.role}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] font-semibold text-ink">{p.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-soft">
                      {p.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : isMockDataSource ? (
            <div className="mt-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Tài khoản dùng thử (Local Mock)
              </p>
              <div className="mt-2 divide-y divide-line border-y border-line">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => useAccount(account.email)}
                    className="flex w-full items-baseline justify-between gap-4 py-2 text-left transition-colors hover:text-accent"
                  >
                    <span className="text-[12px] font-medium text-ink">{account.label}</span>
                    <span className="text-[11px] text-ink-faint">{account.note}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="w-full max-w-sm lg:justify-self-end">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Đăng nhập bằng mật khẩu
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-ink-soft">
            Dùng mã tenant (vd <code className="font-mono">demo-3pl-dn</code>) và tài khoản nhân sự được cấp.
          </p>

          {error ? (
            <div
              role="alert"
              className="mt-4 border-l-2 border-danger bg-red-50 px-3 py-2 text-[12px] leading-5 text-danger"
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="tenantSlug"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint"
              >
                Mã tenant
              </label>
              <input
                id="tenantSlug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="demo-3pl-dn"
                autoComplete="organization"
                className="w-full border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ops.admin@3pl-dn.demo"
                autoComplete="email"
                className="w-full border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint"
              >
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-surface transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Đang kiểm tra…' : 'Vào bảng điều hành'}
            </button>
          </form>

          {!isMockDataSource && Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                  hoặc
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className={tenantSlug.trim() ? '' : 'pointer-events-none opacity-50'}>
                <GoogleLoginButton tenantSlug={tenantSlug.trim()} />
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-between text-[11px] text-ink-faint">
            <Link href="/build-info" className="hover:text-accent">
              Kiểm tra /build-info
            </Link>
            <span>Neon PostgreSQL + PostGIS</span>
          </div>
        </section>
      </div>
      {isDemoMode ? <DemoControlCenter variant="floating" portalOverride="tenant" /> : null}
    </div>
  );
}
