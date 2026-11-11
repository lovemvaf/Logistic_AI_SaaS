"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

export default function PackStationForgotPassword() {
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/tenant/auth/forgot-password', { email }, {
        headers: { 'x-tenant-slug': slug },
      });
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to process request.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center p-4 bg-surface relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-50 blur-[100px] rounded-full pointer-events-none z-0"></div>
        <div className="w-full max-w-md p-8 rounded-2xl relative z-10 bg-surface border border-border shadow-2xl text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">Check Your Email</h1>
          <p className="text-ink-soft mb-6">
            If an account with <strong className="text-ink">{email}</strong> exists, we've sent a reset link.
          </p>
          <Link href="/login" className="inline-flex items-center gap-2 text-primary hover:text-primary-hover transition-colors font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen flex items-center justify-center p-4 bg-surface relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-hover/20 blur-[100px] rounded-full pointer-events-none z-0"></div>
      <div className="w-full max-w-md p-8 rounded-2xl relative z-10 bg-surface border border-border shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-hover/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-8v4h8v-4zm-4-8h4m-4 4h4m6-4v1m-4-1v1m-4-1v1m-4-1v1m2-4h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink">Reset Password</h1>
          <p className="text-ink-soft mt-2">Enter your workspace slug and email.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm text-center font-medium">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">Workspace Slug</label>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-surface-alt border border-border rounded-xl py-3 px-4 text-ink focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="e.g. demo-tenant" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">Staff Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface-alt border border-border rounded-xl py-3 px-4 text-ink focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="staff@company.com" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50 mt-2">
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-2 text-ink-soft hover:text-ink text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
