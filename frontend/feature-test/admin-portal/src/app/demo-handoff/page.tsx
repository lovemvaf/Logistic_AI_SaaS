'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const inflightExchanges = new Map<string, Promise<{ ok: boolean; status: number; data: any }>>();

async function exchangeTokenOnce(token: string) {
  let promise = inflightExchanges.get(token);
  if (!promise) {
    promise = (async () => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
      try {
        const res = await fetch('/api/v1/demo/handoff/exchange', {
          method: 'POST',
          credentials: 'include',
          signal: controller?.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-smartlogi-portal': 'admin',
          },
          body: JSON.stringify({ token, portal: 'admin' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          inflightExchanges.delete(token);
        }
        return { ok: res.ok, status: res.status, data };
      } catch (err: any) {
        inflightExchanges.delete(token);
        return {
          ok: false,
          status: 0,
          data: {
            message:
              err?.name === 'AbortError'
                ? 'Hết thời gian đồng bộ phiên chuyển cổng (12s). Vui lòng thử lại.'
                : err?.message || 'Lỗi mạng khi xác thực token chuyển cổng.',
          },
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
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
  const nextPath = searchParams.get('next')?.trim() || '/admin/dashboard';
  const safeNext = nextPath.startsWith('/') ? nextPath : '/admin/dashboard';

  useEffect(() => {
    if (!token) {
      setError('Thiếu mã chuyển cổng (token).');
      return;
    }

    setError(null);
    let cancelled = false;
    void exchangeTokenOnce(token)
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data?.token) {
          setError(data?.message || 'Liên kết chuyển cổng không hợp lệ hoặc đã hết hạn.');
          return;
        }
        if (typeof window !== 'undefined') {
          if (data.sandboxKey) {
            window.localStorage.setItem('smartlogi_sandbox_key', data.sandboxKey);
          }
          if (data.user?.tenantSlug && data.user.tenantSlug !== 'platform') {
            window.localStorage.setItem('smartlogi_tenant_slug', data.user.tenantSlug);
          }
        }
        loginRef.current(data.token, data.user);
        if (typeof window !== 'undefined') {
          window.location.replace(safeNext);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || 'Không thể đồng bộ phiên chuyển cổng.');
      });

    return () => {
      cancelled = true;
    };
  }, [token, safeNext, attempt]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          SmartLogi Admin Handoff
        </p>
        {error ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm font-medium text-danger">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {token ? (
                <button
                  type="button"
                  onClick={() => {
                    inflightExchanges.delete(token);
                    setAttempt((n) => n + 1);
                  }}
                  className="inline-block rounded-md border border-line px-4 py-2 text-xs font-semibold text-ink hover:border-accent"
                >
                  Thử lại
                </button>
              ) : null}
              <Link
                href="/admin/login"
                className="inline-block rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white"
              >
                Về trang đăng nhập Admin
              </Link>
            </div>
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
