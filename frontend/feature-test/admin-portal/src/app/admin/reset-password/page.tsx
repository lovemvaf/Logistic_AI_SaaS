'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from 'ui-components';
import { EditorialPageHeader, EmptyNote } from 'ui-kit';
import api from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/admin/auth/reset-password', { email, token, password });
      if (res.data?.ok) {
        setSuccess(true);
      } else {
        setError(res.data?.message || 'Failed to reset password.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid or expired reset token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {success ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Password reset</h2>
            <p className="mt-1 text-[13px] text-ink-soft">
              Your password has been reset successfully. You can sign in now.
            </p>
          </div>

          <div className="mt-6">
            <Link href="/admin/login" className="text-[13px] font-medium text-accent hover:underline">
              Back to login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-soft">New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-soft">Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                minLength={8}
                className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="h-11 w-full" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset password'}
          </Button>

          {token && email && (
            <div className="mt-2">
              <Link href="/admin/login" className="text-[13px] font-medium text-accent hover:underline">
                Back to login
              </Link>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

export default function AdminResetPassword() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  if (!token || !email) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
          <div className="self-center space-y-6">
            <EditorialPageHeader
              title="Invalid link"
              description="This password reset link is invalid or has expired. Request a new one."
            />
            <EmptyNote>Reset links expire after 30 minutes.</EmptyNote>
          </div>

          <div className="self-center">
            <div className="space-y-6">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Invalid password reset link</h2>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Ask your administrator to request a new reset link.
                </p>
              </div>

              <div>
                <Link href="/admin/forgot-password" className="text-[13px] font-medium text-accent hover:underline">
                  Request a new reset link
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas p-6">
      <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
        <div className="self-center space-y-6">
          <EditorialPageHeader
            title="Set new password"
            description={`Enter your new password for the SmartLogi account linked to ${email}.`}
          />
          <EmptyNote>Password must be at least 8 characters.</EmptyNote>
        </div>

        <div className="self-center">
          <Suspense fallback={<ResetPasswordSkeleton />}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <div className="h-9 w-full animate-pulse rounded-md bg-line-strong" />
      <div className="h-9 w-full animate-pulse rounded-md bg-line-strong" />
    </div>
  );
}
