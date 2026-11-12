'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

type ExchangeResult = { ok: boolean; status: number; data: any };
const inflightExchanges = new Map<string, Promise<ExchangeResult>>();

async function exchangeTokenOnce(token: string): Promise<ExchangeResult> {
  let promise = inflightExchanges.get(token);
  if (!promise) {
    const controller = new AbortController();
    const timeoutId = typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 12000) : null;
    promise = fetch('/api/v1/demo/handoff/exchange', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-smartlogi-portal': 'pack',
      },
      body: JSON.stringify({ token, portal: 'pack' }),
    })
      .then(async (res) => ({
        ok: res.ok,
        status: res.status,
        data: await res.json().catch(() => ({})),
      }))
      .catch((err: any) => {
        inflightExchanges.delete(token);
        return {
          ok: false,
          status: 0,
          data: {
            message:
              err?.name === 'AbortError'
                ? 'Hết thời gian kết nối máy chủ chuyển cổng (12 giây). Vui lòng thử lại.'
                : 'Không thể kết nối máy chủ chuyển cổng.',
          },
        };
      })
      .finally(() => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      });
    inflightExchanges.set(token, promise);
  }
  return promise;
}

function HandoffInner() {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const loginRef = useRef(login);
  loginRef.current = login;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const token = searchParams.get('token')?.trim() || '';
  const nextPath = searchParams.get('next')?.trim() || '/pack';
  const safeNext = nextPath.startsWith('/') ? nextPath : '/pack';

  const retry = useCallback(() => {
    if (token) inflightExchanges.delete(token);
    setAttempt((n) => n + 1);
  }, [token]);

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
        inflightExchanges.delete(token);
        setError(data?.message || 'Liên kết chuyển cổng không hợp lệ hoặc đã hết hạn.');
        return;
      }
      if (typeof window !== 'undefined') {
        if (data.sandboxKey) window.localStorage.setItem('smartlogi_sandbox_key', data.sandboxKey);
        if (data.user?.tenantSlug && data.user.tenantSlug !== 'platform') {
          window.localStorage.setItem('smartlogi_tenant_slug', data.user.tenantSlug);
        }
      }
      loginRef.current(data.token, {
        ...(data.user || {}),
        staffId: data.user?.id || '',
        stationId: data.user?.tenantSlug === 'demo-fdi-bh' ? 'PACK-FDI-01' : 'PACK-DN-01',
      });
      if (typeof window !== 'undefined') {
        window.location.replace(safeNext);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, safeNext, attempt]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          SmartLogi Pack Station Handoff
        </p>
        {error ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm font-medium text-danger">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={retry}
                className="inline-block rounded-md border border-line bg-canvas px-4 py-2 text-xs font-semibold text-ink hover:border-accent hover:text-accent"
              >
                Thử lại
              </button>
              <Link
                href="/login"
                className="inline-block rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white"
              >
                Về trang đăng nhập Trạm Đóng Gói
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            Đang đồng bộ phiên làm việc sang Trạm Đóng Gói (Pack Station)...
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
