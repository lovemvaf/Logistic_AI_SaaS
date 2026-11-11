'use client';

import { DemoControlCenter } from './DemoControlCenter';

declare const process: { env: Record<string, string | undefined> };

export function DemoModeBanner({
  forceShow = false,
  className = '',
}: {
  forceShow?: boolean;
  className?: string;
}) {
  const isDemo =
    forceShow ||
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true');
  if (!isDemo) return null;

  const isApi =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DATA_SOURCE === 'api';

  return (
    <div
      role="status"
      aria-label="Chế độ môi trường demo"
      className={`border-b border-line bg-surface-alt px-4 py-1.5 text-[11px] text-ink-soft sm:px-5 lg:px-6 ${className}`.trim()}
    >
      {isApi ? (
        <DemoControlCenter variant="banner" />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-ink">
            MÔI TRƯỜNG DEMO TÍCH HỢP · Dữ liệu tổng hợp (Synthetic Demo Data)
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            LOCAL DEMO MODE
          </span>
        </div>
      )}
    </div>
  );
}
