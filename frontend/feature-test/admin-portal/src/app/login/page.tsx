'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from 'ui-components';
import { EditorialPageHeader, EmptyNote } from 'ui-kit';
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

  // Google Sign-In requires a configured client ID and API mode.
  const showGoogle = !isMockDataSource && typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (isMockDataSource) {
      if (email === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password) {
        login(DEMO_TOKEN);
        router.push('/admin/dashboard');
      } else {
        setError('Invalid demo credentials. Use the demo button or admin@smartlogi.com / admin123.');
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
      login(res.data.accessToken);
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

  const handleGoogleSuccess = async (credential: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/admin/auth/google', { credential });
      if (res.data.accessToken) {
        login(res.data.accessToken);
        router.push('/admin/dashboard');
      } else {
        setError(res.data?.message || 'This Google account is not allowed to access the Admin Portal.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Google authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
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
            description="Manage SmartLogi tenants, orders and billing from a single dashboard."
          />
          <EmptyNote>
            {isMockDataSource
              ? 'Demo data only. The "Try the demo account" session is local and does not modify any backend data.'
              : 'Live API mode active. Sign in with your platform administrator account.'}
          </EmptyNote>
        </div>

        <div className="self-center">
          <form onSubmit={handlePasswordLogin} className="space-y-5">
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
                placeholder="admin@smartlogi.vn"
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

            {isMockDataSource && (
              <Button type="button" variant="secondary" className="h-11 w-full" onClick={handleDemoLogin}>
                Try the demo account
              </Button>
            )}

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
                    onError={handleError}
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
    </div>
  );
}
