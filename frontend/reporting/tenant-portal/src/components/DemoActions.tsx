'use client';

import { useState } from 'react';
import { resetDemoData } from '@/lib/data';

export default function DemoActions() {
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      await resetDemoData();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint lg:inline">
        Dữ liệu mẫu
      </span>
      <button
        type="button"
        onClick={reset}
        disabled={busy}
        className="h-8 rounded-md border border-line px-2.5 text-[11px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
      >
        {busy ? 'Đang đặt lại…' : 'Đặt lại'}
      </button>
    </div>
  );
}
