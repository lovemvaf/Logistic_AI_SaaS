'use client';

import { useState } from 'react';

interface MagneticButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
  loading?: boolean;
}

export function MagneticButton({ children, onClick, variant = 'primary', className = '', loading }: MagneticButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  const baseClass = 'inline-flex items-center justify-center rounded-xl font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50';

  const variantClass = {
    primary: 'bg-primary text-white hover:bg-primary-hover focus:ring-primary/30 border border-primary',
    secondary: 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 focus:ring-slate-400',
    outline: 'border border-primary text-primary hover:bg-primary/5 focus:ring-primary/30',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`${baseClass} ${variantClass[variant]} px-4 py-2 ${className} ${isPressed ? 'scale-95' : ''}`}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
    >
      {loading ? <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span> : null}
      {children}
    </button>
  );
}
