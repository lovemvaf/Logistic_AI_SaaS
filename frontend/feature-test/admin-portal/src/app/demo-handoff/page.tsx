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
        'x-smartlogi-portal': 'admin',
      },
      body: JSON.stringify({ token, portal: 'admin' }),
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
  const nextPath = searchParams.get('next')?.trim() || '/admin/dashboard';
  const safeNext = nextPath.startsWith('/') ? nextPath : '/admin/dashboard';

  useEffect(() => {
    if (!token) {
      setError('Thiếu mã chuyển cổng (token).');
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
      if (data.sandboxKey && typeof window !== 'undefined') {
        window.localStorage.setItem('smartlogi_sandbox_key', data.sandboxKey);
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
          SmartLogi Admin Handoff
        </p>
        {error ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm font-medium text-danger">{error}</p>
            <Link
              href="/admin/login"
              className="inline-block rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white"
            >
              Về trang đăng nhập Admin
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            Đang xác thực phiên chuyển cổng an toàn sang Admin Portal...
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
