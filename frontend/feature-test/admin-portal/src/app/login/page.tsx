'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from 'ui-components';
import { DemoControlCenter, EditorialPageHeader, EmptyNote } from 'ui-kit';
import { useAuth } from '@/lib/auth-context';
import { DEMO_CREDENTIALS, DEMO_TOKEN, createDemoToken } from '@/lib/auth';
import { isMockDataSource } from '@/lib/local-store';
import { AdminRole, ROLE_LABELS } from '@/lib/rbac';
import api from '@/lib/api';
import { GoogleLoginButton } from '@/components/ui/GoogleLoginButton';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  const { login } = useAuth();
  const [selectedDemoRole, setSelectedDemoRole] = useState<AdminRole>('SUPER_ADMIN');
  const [personas, setPersonas] = useState<any[]>([]);

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const showGoogle =
    !isMockDataSource &&
    typeof window !== 'undefined' &&
    !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!isDemoMode || isMockDataSource) return;
    api
      .get('/demo/personas')
      .then((res) => {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];
        setPersonas(
          list.filter((p: any) => p.portal === 'admin' || p.allowedPortals?.includes('admin')),
        );
      })
      .catch(() => undefined);
  }, [isDemoMode]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (isMockDataSource) {
      if (email === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password) {
        login(DEMO_TOKEN);
        router.push('/admin/dashboard');
      } else {
        setError('Invalid demo credentials. Use the demo button.');
      }
      setLoading(false);
      return;
    }

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
          'Unable to sign in. Verify your email, password, and API connection.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCloudDemoLogin = async (personaKey = 'super-admin') => {
    setLoading(true);
    setError(null);
    try {
      const sandboxKey =
        (typeof window !== 'undefined' && window.localStorage.getItem('smartlogi_sandbox_key')) ||
        'shared-demo';
      const res = await api.post('/demo/login', { personaKey, portal: 'admin', sandboxKey });
      const token = res.data?.token || res.data?.accessToken;
      if (!token) {
        setError('Không khởi tạo được phiên demo.');
        return;
      }
      login(token, res.data?.user);
      router.push('/admin/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không thể đăng nhập demo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credential: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/admin/auth/google', { credential });
      if (res.data.accessToken) {
        login(res.data.accessToken, res.data.user);
        router.push('/admin/dashboard');
      } else {
        setError(
          res.data?.message || 'This Google account is not allowed to access the Admin Portal.',
        );
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message || 'Google authentication failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    if (!isMockDataSource) return;
    login(createDemoToken(selectedDemoRole));
    router.push('/admin/dashboard');
  };

  return (
    <div className="min-h-screen bg-canvas p-6">
      <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
        <div className="self-center space-y-6">
          <EditorialPageHeader
            title="Admin portal"
            description="Quản trị hệ sinh thái SmartLogi SaaS, 4 doanh nghiệp demo và danh mục 95 phường/xã Đồng Nai 2026."
          />
          <EmptyNote>
            {isMockDataSource
              ? 'Demo data only. The "Try the demo account" session is local and does not modify any backend data.'
              : isDemoMode
                ? 'Cloud Demo Mode active. Sử dụng nút đăng nhập vai trò mẫu bên phải để vào bảng điều hành trực tiếp.'
                : 'Live API mode active. Sign in with your platform administrator account.'}
          </EmptyNote>
          {!isMockDataSource && isDemoMode && personas.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                1-Click Demo Personas
              </p>
              {personas.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={loading}
                  onClick={() => handleCloudDemoLogin(p.key)}
                  className="flex w-full items-center justify-between rounded border border-line bg-surface-alt px-3 py-2 text-left text-[12px] hover:border-accent"
                >
                  <span className="font-medium text-ink">{p.title}</span>
                  <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                    Vào ngay
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="self-center">
          <form onSubmit={handlePasswordLogin} className="space-y-5 rounded-lg border border-line bg-surface p-6">
            {error && (
              <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
                {error}
              </div>
            )}

            <label className="block">
              <span className="text-[11px] font-medium text-ink-soft">Email</span>
              <input
                id="email"
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
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <Button type="submit" variant="primary" className="h-11 w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>

            {isMockDataSource ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full"
                onClick={handleDemoLogin}
              >
                Try the demo account
              </Button>
            ) : isDemoMode ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full"
                disabled={loading}
                onClick={() => handleCloudDemoLogin('super-admin')}
              >
                Vào nhanh Super Admin Demo
              </Button>
            ) : null}

            <div className="flex justify-between text-[12px]">
              <Link href="/build-info" className="text-ink-soft hover:text-accent">
                /build-info
              </Link>
              <Link href="/admin/forgot-password" className="text-accent hover:underline">
                Forgot password?
              </Link>
            </div>

            {showGoogle && (
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-line" />
                  </div>
                  <div className="relative flex justify-center text-[11px] text-ink-faint">
                    <span className="bg-canvas px-2">Or continue with Google</span>
                  </div>
                </div>

                <div className="mt-4">
                  <GoogleLoginButton
                    onSuccess={handleGoogleSuccess}
                    onError={(msg) => setError(msg)}
                    loading={loading}
                  />
                </div>
              </div>
            )}

            {isMockDataSource && (
              <div className="mt-6">
                <span className="text-[11px] font-medium text-ink-faint">Demo role</span>
                <select
                  value={selectedDemoRole}
                  onChange={(e) => setSelectedDemoRole(e.target.value as AdminRole)}
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                >
                  {(Object.keys(ROLE_LABELS) as AdminRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form>
        </div>
      </div>
      {isDemoMode ? <DemoControlCenter variant="floating" portalOverride="admin" /> : null}
    </div>
  );
}
