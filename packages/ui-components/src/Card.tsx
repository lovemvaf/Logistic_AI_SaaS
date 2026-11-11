'use client';

import React, { memo } from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
  style?: React.CSSProperties;
}

export const Card = memo(({ children, className = '', glass = true, style }: CardProps) => {
  return (
    <div className={`
      ${glass ? 'bg-white  border-slate-200' : 'bg-white border-slate-200'}
      rounded-3xl border shadow-glass overflow-hidden
      ${className}
    `} style={style}>
      {children}
    </div>
  );
});
