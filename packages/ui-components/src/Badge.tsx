'use client';

import React, { memo } from 'react';

export type BadgeVariant = 'neutral' | 'default' | 'success' | 'warning' | 'error' | 'danger' | 'info';

export interface BadgeProps {
  children: React.ReactNode;
  /** `neutral`/`default` và `error`/`danger` là hai tên cho cùng một trạng thái. */
  variant?: BadgeVariant;
  className?: string;
}

export const Badge = memo(({ children, variant = 'neutral', className = '' }: BadgeProps) => {
  const variants: Record<BadgeVariant, string> = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    default: 'bg-slate-100 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    error: 'bg-red-50 text-red-700 border-red-100',
    danger: 'bg-red-50 text-red-700 border-red-100',
    info: 'bg-blue-50 text-blue-700 border-blue-100',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
});
