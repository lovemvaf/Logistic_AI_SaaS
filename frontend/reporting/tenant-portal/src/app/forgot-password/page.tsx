'use client';
import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

export default function ForgotPasswordPage() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !tenantSlug) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      await api.post(
        '/tenant/auth/forgot-password',
        { email },
        { headers: { 'x-tenant-slug': tenantSlug } }
      );
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to process request.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-background relative flex items-center justify-center p-6 overflow-hidden">
        <div className="absolute inset-0  pointer-events-none"></div>
        <Card className="p-8 md:p-10 w-full max-w-md  bg-white  border-slate-200 shadow-2xl text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-600">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">Check Your Email</h1>
          <p className="text-inkSoft mb-6">
            If an account with <strong>{email}</strong> exists, we've sent a password reset link.
          </p>
          <Link href="/login" className="text-primary hover:text-primary-600 font-semibold text-sm transition-colors">
            Back to Login
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0  pointer-events-none"></div>

      <Card className="p-8 md:p-10 w-full max-w-md  bg-white  border-slate-200 shadow-2xl">
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-2">Password Reset</p>
          <h2 className="text-2xl font-bold text-ink">Forgot Password?</h2>
          <p className="text-sm text-inkSoft mt-1.5 font-medium">Enter your workspace slug and email to receive a reset link.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Workspace Slug"
            type="text"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="e.g. acme-corp"
            required
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>}
          />

          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@company.com"
            required
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>}
          />

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 font-medium  flex items-start gap-2">
              <svg className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-2 font-bold tracking-wide"
            isLoading={loading}
          >
            Send Reset Link
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-xs text-inkSoft hover:text-primary font-semibold transition-colors">
            Back to Login
          </Link>
        </div>
      </Card>
    </div>
  );
}
