'use client';

import type { ReactNode } from 'react';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function EditorialPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-editorial text-[40px] font-semibold leading-[0.95] tracking-[-0.02em] text-ink sm:text-[46px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[62ch] text-[13px] leading-6 text-ink-soft">{description}</p>
        ) : null}
      </div>

      {meta || actions ? (
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {meta ? (
            <div className="text-[11px] leading-5 text-ink-faint sm:text-right">{meta}</div>
          ) : null}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export type EditorialMetric = {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
};

const METRIC_TONES: Record<NonNullable<EditorialMetric['tone']>, string> = {
  default: 'text-ink',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
};

export function MetricBand({ metrics }: { metrics: EditorialMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="bg-canvas px-3 py-3 sm:px-4">
          <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.14em] text-ink-faint">
            {metric.label}
          </p>
          <p
            className={cx(
              'mt-1 text-[26px] font-semibold leading-none tracking-tight tabular-nums sm:text-[30px]',
              METRIC_TONES[metric.tone ?? 'default'],
            )}
          >
            {metric.value}
          </p>
          {metric.meta ? (
            <p className="mt-1.5 truncate text-[11px] leading-4 text-ink-soft">{metric.meta}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function EditorialSection({
  title,
  eyebrow,
  action,
  children,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-0.5 text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0 text-[12px]">{action}</div> : null}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_DOTS: Record<StatusTone, string> = {
  neutral: 'bg-ink-faint',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

export function StatusLabel({
  tone = 'neutral',
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium leading-4 text-ink-soft">
      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOTS[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-line-strong py-1 pl-3 text-[12px] leading-5 text-ink-faint">
      {children}
    </p>
  );
}
