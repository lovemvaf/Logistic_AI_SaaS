'use client';

import React from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

export const Radio: React.FC<RadioProps> = ({
  label,
  error,
  className = '',
  id,
  ...props
}) => {
  const radioId = id || `radio-${label?.replace(/\s/g, '-').toLowerCase()}`;

  return (
    <div className="flex items-start gap-2">
      <input
        type="radio"
        id={radioId}
        className={`mt-0.5 h-4 w-4 border-line-strong text-primary focus:ring-primary ${
          error ? 'border-red-500' : ''
        } ${className}`}
        {...props}
      />
      {label && (
        <label htmlFor={radioId} className="text-sm text-ink cursor-pointer">
          {label}
        </label>
      )}
      {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
    </div>
  );
};

export interface RadioGroupProps {
  name: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  options,
  value,
  onChange,
  error,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`} role="radiogroup">
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          value={option.value}
          label={option.label}
          checked={value === option.value}
          onChange={() => onChange?.(option.value)}
          error={error}
        />
      ))}
    </div>
  );
};
