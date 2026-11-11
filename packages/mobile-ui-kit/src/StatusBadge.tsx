import React from 'react';

export interface StatusBadgeProps {
  status: string;
  variant?: 'success' | 'warning' | 'danger' | 'info';
}

const variantColors: Record<string, { bg: string; text: string }> = {
  success: { bg: '#D1FAE5', text: '#065F46' },
  warning: { bg: '#FEF3C7', text: '#92400E' },
  danger: { bg: '#FEE2E2', text: '#991B1B' },
  info: { bg: '#DBEAFE', text: '#1E40AF' },
};

export function StatusBadge({ status, variant = 'info' }: StatusBadgeProps) {
  const colors = variantColors[variant] || variantColors.info;
  
  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        padding: '4px 12px',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  );
}
