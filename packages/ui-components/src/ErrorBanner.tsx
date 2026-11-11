'use client';

import { Card } from './Card';
import { Button } from './Button';

export interface ErrorBannerProps {
  message: string;
  /** nhãn nút thử lại */
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Banner cảnh báo dùng chung (token-based nên tự theo theme của portal).
 */
export const ErrorBanner = ({
  message,
  retryLabel = 'Thử lại',
  onRetry,
  className = '',
}: ErrorBannerProps) => {
  return (
    <Card className={`p-4 border-warning/40 bg-warning/10 ${className}`} glass={false}>
      <div className="flex items-center gap-3 text-sm text-ink">
        <svg
          className="w-5 h-5 flex-shrink-0 text-warning"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="flex-1">{message}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </Card>
  );
};
