'use client';

import { memo } from 'react';

export interface StatCardProps {
  title: string;
  value: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  icon: React.ReactNode;
}

export const StatCard = memo(function StatCard({ title, value, trend, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-card transition-shadow duration-200 hover:shadow-cardHover">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
        <div className="shrink-0 rounded-lg bg-slate-50 p-2 text-primary">
          {icon}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="min-w-0 text-3xl font-bold leading-tight text-ink">{value}</div>
        {trend && (
          <div className={`flex min-w-0 items-center gap-1 text-sm font-medium leading-tight ${trend.isPositive ? 'text-success' : 'text-danger'}`}>
            <svg
              className={`h-4 w-4 shrink-0 ${trend.isPositive ? '' : 'rotate-180'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l9 9M13 7l-9 9m9-9v14" />
            </svg>
            <span>{trend.value}</span>
          </div>
        )}
      </div>
    </div>
  );
});
