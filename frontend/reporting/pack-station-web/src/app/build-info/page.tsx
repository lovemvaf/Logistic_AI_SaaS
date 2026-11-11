'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DemoControlCenter } from 'ui-kit';

export default function BuildInfoPage() {
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/demo/health', {
      credentials: 'include',
      headers: { 'x-smartlogi-portal': 'pack' },
    })
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => setError(String(err?.message || 'Health request failed')));
  }, []);

  return (
    <div className="min-h-screen bg-canvas p-6 text-ink">
      <div className="mx-auto max-w-3xl space-y-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div>
            <h1 className="text-lg font-semibold">SmartLogi Pack Station — Build &amp; Cloud Health</h1>
            <p className="text-xs text-ink-soft">Trạm đóng gói quét mã, Camera CV mô phỏng &amp; cân điện tử</p>
          </div>
          <Link
            href="/pack"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white"
          >
            Vào Bàn Đóng Gói
          </Link>
        </div>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>
        ) : !health ? (
          <p className="text-xs text-ink-soft">Đang kiểm tra kết nối Cloud Database...</p>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-line bg-surface-alt p-3">
                <p className="text-[11px] uppercase text-ink-faint">Commit SHA</p>
                <p className="mt-1 break-all font-mono font-semibold">{health.commitSha}</p>
              </div>
              <div className="rounded border border-line bg-surface-alt p-3">
                <p className="text-[11px] uppercase text-ink-faint">API Mode / Status</p>
                <p className="mt-1 font-mono font-semibold">
                  {health.status} · {health.mode}
                </p>
              </div>
              <div className="rounded border border-line bg-surface-alt p-3">
                <p className="text-[11px] uppercase text-ink-faint">Database PostgreSQL</p>
                <p className="mt-1 font-mono">
                  {health.database?.ok ? 'CONNECTED' : 'ERROR'} · PostGIS:{' '}
                  {health.database?.postgisVersion || 'N/A'}
                </p>
              </div>
              <div className="rounded border border-line bg-surface-alt p-3">
                <p className="text-[11px] uppercase text-ink-faint">Sandbox &amp; Portal</p>
                <p className="mt-1 font-mono">
                  {health.portal} · {health.sandboxKey}
                </p>
              </div>
            </div>

            {Array.isArray(health.simulatedSystems) ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-3">
                <p className="font-semibold text-amber-900">
                  Các phân hệ mô phỏng tích hợp trong bản Demo Cloud
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-900">
                  {health.simulatedSystems.map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <DemoControlCenter variant="floating" portalOverride="pack" />
    </div>
  );
}
