'use client';

import React from 'react';

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'circular' | 'rectangular';
}

export function Skeleton({
  className = '',
  width,
  height,
  variant = 'text',
}: SkeletonProps) {
  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      className={`animate-pulse bg-surface-alt dark:bg-gray-700 ${variantStyles[variant]} ${className}`}
      style={{ width, height }}
    />
  );
}

export interface SkeletonCardProps {
  lines?: number;
  className?: string;
}

export function SkeletonCard({ lines = 3, className = '' }: SkeletonCardProps) {
  return (
    <div className={`p-6 border border-line dark:border-gray-700 rounded-lg ${className}`}>
      <Skeleton width="40%" height="1.5rem" className="mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height="1rem"
          className="mb-2"
        />
      ))}
    </div>
  );
}

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, columns = 4, className = '' }: SkeletonTableProps) {
  return (
    <div className={`border border-line dark:border-gray-700 rounded-lg overflow-hidden ${className}`}>
      <div className="bg-surface-alt/60 dark:bg-gray-800 p-4 border-b border-line dark:border-gray-700">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} width="100%" height="1rem" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="p-4 border-b border-line dark:border-gray-700 last:border-0">
          <div className="flex gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={colIndex} width="100%" height="1rem" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
