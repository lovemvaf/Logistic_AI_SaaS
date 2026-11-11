'use client';

import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-4 text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full bg-white  border border-slate-200 text-ink text-sm rounded-xl 
              focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary 
              transition-all duration-200 placeholder:text-slate-400
              ${icon ? 'pl-11 pr-4 py-3' : 'px-4 py-3'}
              ${error ? 'border-red-300 focus:ring-red-200 focus:border-red-400' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <span className="text-xs text-red-500 font-medium ml-1 ">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
