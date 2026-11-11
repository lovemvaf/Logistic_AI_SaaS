'use client';

import { useState } from 'react';
import api from '@/lib/api';

interface AIOptimizeButtonProps {
  orderId: string;
  onSuccess?: () => void;
}

export function AIOptimizeButton({ orderId, onSuccess }: AIOptimizeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOptimize = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/logistics/routing/optimize-async', { orderIds: [orderId] });
      if (res.data?.success !== false) {
        onSuccess?.();
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Optimization failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        onClick={handleOptimize}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:text-ink hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            </svg>
            Optimizing...
          </>
        ) : (
          <>
            <svg className="mr-2 h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 15.5V5m0 0L8 9m4-4l4 4" />
            </svg>
            AI Optimize
          </>
        )}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
