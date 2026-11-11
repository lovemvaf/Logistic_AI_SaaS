'use client';

import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  color = 'border-blue-600',
  className = '',
  label,
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`} role="status">
      <div
        className={`animate-spin rounded-full ${sizeClasses[size]} border-line ${color}`}
      />
      {label && <span className="text-sm text-ink-faint">{label}</span>}
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export const FullPageSpinner: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px]">
    <Spinner size="lg" />
    <p className="mt-4 text-sm text-ink-faint">{message}</p>
  </div>
);
