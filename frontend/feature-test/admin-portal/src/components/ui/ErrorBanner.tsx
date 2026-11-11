'use client';

interface ErrorBannerProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div role="alert" className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm flex items-center justify-between gap-4">
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
