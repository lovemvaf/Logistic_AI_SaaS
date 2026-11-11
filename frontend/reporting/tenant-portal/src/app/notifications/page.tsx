'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, EmptyNote, StatusLabel } from 'ui-kit';
import { data } from '@/lib/data';
import { emitNotificationsChanged } from '@/lib/notifications-bus';
import type { Notification } from '@/lib/mock';

const TONE: Record<Notification['severity'], 'neutral' | 'warning' | 'danger'> = {
  INFO: 'neutral',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

const LABEL: Record<Notification['severity'], string> = {
  INFO: 'Thông tin',
  WARNING: 'Cần chú ý',
  CRITICAL: 'Khẩn',
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await data.notifications.list());
    } catch (err: any) {
      setError(err?.message || 'Không tải được thông báo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markAll = async () => {
    const next = await data.notifications.markAllRead();
    setItems(next);
    emitNotificationsChanged();
  };

  const visible = unreadOnly ? items.filter((item) => !item.read) : items;
  const unread = items.filter((item) => !item.read).length;

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Trung tâm điều hành"
        title="Thông báo"
        description="Cảnh báo vận hành, tài chính và tồn kho được gom về một dòng thời gian."
        meta={`${unread} chưa đọc · ${items.length} tổng cộng`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setUnreadOnly((value) => !value)}
              className="h-8 border border-line px-3 text-[11px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              {unreadOnly ? 'Xem tất cả' : 'Chỉ chưa đọc'}
            </button>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0}
              className="h-8 bg-accent px-3 text-[11px] font-semibold text-surface transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Đánh dấu đã đọc
            </button>
          </>
        }
      />

      {error ? (
        <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p>
      ) : null}

      <EditorialSection title="Dòng thời gian" eyebrow="Cập nhật gần nhất">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-12 animate-pulse border-b border-line bg-surface-alt" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyNote>Không có thông báo nào khớp bộ lọc.</EmptyNote>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {visible.map((item) => (
              <li key={item.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusLabel tone={TONE[item.severity]}>{LABEL[item.severity]}</StatusLabel>
                    <span className="text-[13px] font-semibold text-ink">{item.title}</span>
                    {!item.read ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
                  </div>
                  <span className="text-[11px] tabular-nums text-ink-faint">
                    {formatTime(item.at)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-ink-soft">{item.detail}</p>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="mt-1 inline-block text-[11px] font-medium text-accent hover:underline"
                  >
                    Mở phân hệ liên quan
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </EditorialSection>
    </div>
  );
}
