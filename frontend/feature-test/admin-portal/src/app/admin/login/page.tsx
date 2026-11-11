'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from 'ui-components';
import { DemoControlCenter, EditorialPageHeader, EmptyNote } from 'ui-kit';
import { useAuth } from '@/lib/auth-context';
import { createDemoToken } from '@/lib/auth';
import { isMockDataSource } from '@/lib/local-store';
import { AdminRole, ROLE_LABELS } from '@/lib/rbac';
import api from '@/lib/api';
import { GoogleLoginButton } from '@/components/ui/GoogleLoginButton';

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

export default function AdminLogin() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<DemoPersona[]>([]);

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const showGoogle = !isMockDataSource && !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!isDemoMode || isMockDataSource) return;
    api
      .get('/demo/personas')
      .then((res) => {
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        setPersonas(
          list.filter(
            (p: DemoPersona) => p.portal === 'admin' || p.allowedPortals?.includes('admin'),
          ),
        );
      })
      .catch(() => undefined);
  }, [isDemoMode]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/admin/auth/login', { email, password });
      if (!res.data?.accessToken) {
        setError(res.data?.message || 'Invalid credentials.');
        return;
      }
      login(res.data.accessToken, res.data.user);
      router.push('/admin/dashboard');
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          'Unable to sign in. Verify your credentials and backend connection.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCloudPersonaLogin = async (personaKey: string) => {
    setLoading(true);
    setError(null);
    try {
      const sandboxKey =
        (typeof window !== 'undefined' && window.localStorage.getItem('smartlogi_sandbox_key')) ||
        'shared-demo';
      const res = await api.post('/demo/login', {
        personaKey,
        portal: 'admin',
        sandboxKey,
      });
      const token = res.data?.token || res.data?.accessToken;
      if (!token) {
        setError(res.data?.message || 'Không khởi tạo được phiên demo.');
        return;
      }
      login(token, res.data?.user);
      router.push('/admin/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Đăng nhập demo thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credential: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/admin/auth/google', { credential });
      if (res.data?.accessToken) {
        login(res.data.accessToken, res.data.user);
        router.push('/admin/dashboard');
      } else {
        setError(
          res.data?.message || 'This Google account is not allowed to access the Admin Portal.',
        );
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (role: AdminRole) => {
    if (!isMockDataSource) return;
    login(createDemoToken(role));
    router.push('/admin/dashboard');
  };

  return (
    <div className="min-h-screen bg-canvas p-6">
      <div className="mx-auto flex min-h-screen max-w-[48rem] flex-col items-center justify-center gap-6">
        <div className="space-y-4 text-center">
          <EditorialPageHeader
            title="Admin portal"
            description="Quản trị nền tảng SaaS SmartLogi, 4 doanh nghiệp mẫu, Outbox DLQ và danh mục 95 phường/xã Đồng Nai 2026."
          />
          <EmptyNote>
            {isMockDataSource
              ? 'Demo mode active (`NEXT_PUBLIC_DATA_SOURCE=mock`). Sessions are local and do not modify backend data.'
              : isDemoMode
                ? 'Cloud Demo Mode (PostgreSQL + RLS). Chọn vai trò dùng thử 1 chạm bên dưới hoặc đăng nhập bằng tài khoản quản trị.'
                : 'Live API mode active. Authenticate with your platform administrator account.'}
          </EmptyNote>
        </div>

        <form
          onSubmit={handlePasswordLogin}
          className="w-full max-w-md space-y-4 rounded-lg border border-line bg-surface p-6"
        >
          {error && (
            <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="superadmin@smartlogi.demo"
              required
              className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>

          <Button type="submit" variant="primary" className="h-10 w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>

          <div className="flex items-center justify-between text-[12px]">
            <Link href="/build-info" className="text-ink-soft hover:text-accent">
              Trạng thái hệ thống (/build-info)
            </Link>
            <Link href="/admin/forgot-password" className="text-accent hover:underline">
              Forgot password?
            </Link>
          </div>

          {showGoogle && (
            <div className="pt-2">
              <GoogleLoginButton
                onSuccess={handleGoogleSuccess}
                onError={(msg) => setError(msg)}
                loading={loading}
              />
            </div>
          )}
        </form>

        {!isMockDataSource && isDemoMode && personas.length > 0 ? (
          <div className="w-full max-w-md space-y-2 rounded-lg border border-line bg-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Đăng nhập nhanh Demo Cloud (PostgreSQL Live)
            </p>
            <div className="grid gap-2">
              {personas.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={loading}
                  onClick={() => handleCloudPersonaLogin(p.key)}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-alt px-3 py-2 text-left transition-colors hover:border-accent disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-ink">{p.title}</p>
                    <p className="truncate font-mono text-[11px] text-ink-soft">
                      {p.email} · {p.role}
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

        {isMockDataSource && (
          <div className="grid w-full gap-2 sm:grid-cols-2 md:grid-cols-3">
            {(Object.keys(ROLE_LABELS) as AdminRole[]).map((role) => (
              <Button
                key={role}
                variant="outline"
                onClick={() => handleDemoLogin(role)}
                className="h-10 w-full items-center justify-center rounded-md border border-line bg-surface px-4 text-[13px] font-medium text-ink hover:bg-surface-alt focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                Login as {ROLE_LABELS[role]}
              </Button>
            ))}
          </div>
        )}
      </div>
      {isDemoMode ? <DemoControlCenter variant="floating" portalOverride="admin" /> : null}
    </div>
  );
}
