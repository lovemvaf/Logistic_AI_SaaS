import React from 'react';

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

export function AppButton({ title, onPress, variant = 'primary', disabled, loading }: AppButtonProps) {
  const bgColor = variant === 'primary' ? '#2563EB' : variant === 'danger' ? '#DC2626' : '#6B7280';
  
  return (
    <button
      onClick={onPress}
      disabled={disabled || loading}
      style={{
        backgroundColor: disabled ? '#9CA3AF' : bgColor,
        color: '#FFFFFF',
        padding: '12px 24px',
        borderRadius: '8px',
        border: 'none',
        fontWeight: 'bold',
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: '100%',
      }}
    >
      {loading ? 'Loading...' : title}
    </button>
  );
}
