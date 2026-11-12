'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const inflightExchanges = new Map<string, Promise<{ ok: boolean; status: number; data: any }>>();

async function exchangeTokenOnce(token: string) {
  let promise = inflightExchanges.get(token);
  if (!promise) {
    promise = fetch('/api/v1/demo/handoff/exchange', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-smartlogi-portal': 'customer',
      },
      body: JSON.stringify({ token, portal: 'customer' }),
    }).then(async (res) => ({
      ok: res.ok,
      status: res.status,
      data: await res.json().catch(() => ({})),
    }));
    inflightExchanges.set(token, promise);
  }
  return promise;
}

function HandoffInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const loginRef = useRef(login);
  loginRef.current = login;
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token')?.trim() || '';
  const nextPath = searchParams.get('next')?.trim() || '/client/dashboard';
  const safeNext = nextPath.startsWith('/') ? nextPath : '/client/dashboard';

  useEffect(() => {
    if (!token) {
      setError('Thiếu token chuyển cổng.');
      return;
    }

    setError(null);
    let cancelled = false;
    void exchangeTokenOnce(token).then(({ ok, data }) => {
      if (cancelled) return;
      if (!ok || !data?.token) {
        setError(data?.message || 'Liên kết chuyển cổng không hợp lệ hoặc đã hết hạn.');
        return;
      }
      if (typeof window !== 'undefined') {
        if (data.sandboxKey) window.localStorage.setItem('smartlogi_sandbox_key', data.sandboxKey);
        if (data.user?.tenantSlug && data.user.tenantSlug !== 'platform') {
          window.localStorage.setItem('smartlogi_tenant_slug', data.user.tenantSlug);
        }
      }
      loginRef.current(data.token, data.user);
      router.replace(safeNext);
    });

    return () => {
      cancelled = true;
    };
  }, [token, safeNext, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          SmartLogi Customer Portal Handoff
        </p>
        {error ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm font-medium text-danger">{error}</p>
            <Link
              href="/client/login"
              className="inline-block rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white"
            >
              Về trang đăng nhập Khách hàng B2B
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            Đang đồng bộ phiên làm việc sang Cổng Khách hàng B2B...
          </p>
        )}
      </div>
    </div>
  );
}

export default function DemoHandoffPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-sm text-ink-soft">
          Đang chuyển cổng...
        </div>
      }
    >
      <HandoffInner />
    </Suspense>
  );
}
