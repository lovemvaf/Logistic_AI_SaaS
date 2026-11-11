'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastDetail {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastItem extends Omit<ToastDetail, 'type'> {
  id: number;
  type: ToastType;
}

const ACCENT: Record<ToastType, string> = {
  success: 'var(--success, #2f7d4f)',
  error: 'var(--danger, #b3261e)',
  warning: 'var(--warning, #b26a00)',
  info: 'var(--primary, #2f4a3c)',
};

/**
 * Toast listener toàn cục.
 *
 * `src/lib/api.ts` (mọi portal) bắt lỗi API rồi bắn event `show-toast` lên
 * `window`. Trước đây không ai lắng nghe event này nên mọi thông báo lỗi đều
 * biến mất im lặng. Mount component này đúng một lần ở root layout là toàn bộ
 * trang trong portal hiện được thông báo lỗi ngay.
 */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;

      const id = ++counter.current;
      const type: ToastType = detail.type || 'info';
      const duration = detail.duration ?? (type === 'error' ? 7000 : 4000);

      setToasts((prev) => [...prev.slice(-4), { id, message: detail.message, type }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    };

    window.addEventListener('show-toast', onToast);
    return () => {
      window.removeEventListener('show-toast', onToast);
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg"
          style={{
            background: 'var(--surface, #fff)',
            borderColor: 'var(--border, #e2e2e2)',
            color: 'var(--ink, #1f2937)',
            borderLeft: `3px solid ${ACCENT[toast.type]}`,
          }}
        >
          <span aria-hidden className="mt-0.5 font-semibold" style={{ color: ACCENT[toast.type] }}>
            {toast.type === 'error' ? '!' : toast.type === 'success' ? '✓' : toast.type === 'warning' ? '!' : 'i'}
          </span>
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Đóng thông báo"
            className="shrink-0 rounded px-1 text-xs opacity-60 transition-opacity hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastHost;
