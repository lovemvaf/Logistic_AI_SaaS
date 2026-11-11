'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from 'ui-components';
import { EditorialPageHeader, EmptyNote } from 'ui-kit';
import api from '@/lib/api';

export default function AdminForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/admin/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to process request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas p-6">
      <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
        <div className="self-center space-y-6">
          <EditorialPageHeader
            title="Reset password"
            description="Enter the email of your SmartLogi administrator account and we'll send a reset link."
          />
          <EmptyNote>
            If the account exists, the reset link expires after 30 minutes.
          </EmptyNote>
        </div>

        <div className="self-center">
          {sent ? (
            <CardSent email={email} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
                  {error}
                </div>
              )}

              <label className="block">
                <span className="text-[11px] font-medium text-ink-soft">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@smartlogi.vn"
                  required
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <Button type="submit" variant="primary" className="h-11 w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send reset link'}
              </Button>

              <div className="mt-2">
                <Link href="/admin/login" className="text-[13px] font-medium text-accent hover:underline">
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function CardSent({ email }: { email: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Check your email</h2>
        <p className="mt-1 text-[13px] text-ink-soft">
          If an account with <strong className="text-ink">{email}</strong> exists, we've sent a
          password reset link.
        </p>
      </div>

      <div className="mt-6">
        <Link href="/admin/login" className="text-[13px] font-medium text-accent hover:underline">
          Back to login
        </Link>
      </div>
    </div>
  );
}
