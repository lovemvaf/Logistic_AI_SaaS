'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from 'ui-components';
import { EditorialPageHeader, EmptyNote } from 'ui-kit';
import { useAuth } from '@/lib/auth-context';
import { createDemoToken } from '@/lib/auth';
import { isMockDataSource } from '@/lib/local-store';
import { AdminRole, ROLE_LABELS } from '@/lib/rbac';
import api from '@/lib/api';
import { GoogleLoginButton } from '@/components/ui/GoogleLoginButton';

export default function AdminLogin() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showGoogle = !isMockDataSource && !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

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
      login(res.data.accessToken);
      router.push('/admin/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to sign in. Verify your credentials and backend connection.');
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
        login(res.data.accessToken);
        router.push('/admin/dashboard');
      } else {
        setError(res.data?.message || 'This Google account is not allowed to access the Admin Portal.');
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
      <div className="mx-auto flex min-h-screen max-w-[45rem] flex-col items-center justify-center gap-8">
        <div className="space-y-4 text-center">
          <EditorialPageHeader
            title="Admin portal"
            description="Manage SmartLogi tenants, orders and billing from a single dashboard."
          />
          <EmptyNote>
            {isMockDataSource
              ? 'Demo mode active (`NEXT_PUBLIC_DATA_SOURCE=mock`). Sessions are local and do not modify backend data.'
              : 'Live API mode active. Authenticate with your platform administrator account.'}
          </EmptyNote>
        </div>

        <form onSubmit={handlePasswordLogin} className="w-full max-w-md space-y-4 rounded-lg border border-line bg-surface p-6">
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
              placeholder="admin@smartlogi.vn"
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

          <div className="flex justify-end">
            <Link href="/admin/forgot-password" className="text-[12px] text-accent hover:underline">
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
    </div>
  );
}
