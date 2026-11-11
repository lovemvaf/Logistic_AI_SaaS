'use client';

import { useCallback, useEffect, useState } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  StatusLabel,
} from 'ui-kit';
import { TableState, Select, Input, Modal, Button } from 'ui-components';
import { formatDateTimeVN, listSummary } from '@/lib/labels';

/** Webhook client: danh sách, bật/tắt, tạo mới (mã giả). */

const WEBHOOK_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'PAUSED', label: 'Tạm dừng' },
  { value: 'FAILING', label: 'Báo lỗi' },
];

const EVENT_LABEL: Record<string, string> = {
  'ORDER.CREATED': 'Đơn tạo',
  'ORDER.STATUS': 'Trạng thái đơn',
  'INVOICE.PAID': 'Hóa đơn đã trả',
  'INVOICE.OVERDUE': 'Hóa đơn quá hạn',
  'RETURN.REQUESTED': 'Yêu cầu trả hàng',
  'RETURN.STATUS': 'Trạng thái trả hàng',
  ALL_EVENTS: 'Tất cả sự kiện',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Hoạt động',
  PAUSED: 'Tạm dừng',
  FAILING: 'Báo lỗi',
};

export default function ClientWebhooks() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formResult, setFormResult] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['ALL_EVENTS']);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await data.webhooks.list();
      setWebhooks(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  const filtered = webhooks
    .filter((row) => !statusFilter || row.status === statusFilter)
    .filter((row) => !searchQuery || row.url.toLowerCase().includes(searchQuery.toLowerCase()));

  const openForm = () => {
    setFormOpen(true);
    setFormError('');
    setFormResult('');
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormError('');
    setFormResult('');
    setUrl('');
    setEvents(['ALL_EVENTS']);
  };

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFormResult('');

    if (!url.trim() || !/^https:/.test(url)) {
      setFormError('Vui lòng nhập URL bắt đầu bằng https.');
      return;
    }

    setFormLoading(true);
    try {
      await data.webhooks.create({ url, events });
      setFormResult('Đã đăng ký webhook mới.');
      setUrl('');
      setEvents(['ALL_EVENTS']);
      await fetchWebhooks();
      setTimeout(closeForm, 800);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }, [url, events, fetchWebhooks]);

  const handleToggle = useCallback(async (id: string) => {
    try {
      await data.webhooks.toggleWebhook(id);
      await fetchWebhooks();
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchWebhooks]);

  const openDelete = (id: string) => {
    setDeleteId(id);
    setError('');
  };

  const closeDelete = () => {
    setDeleteId(null);
  };

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    setFormLoading(true);
    try {
      await data.webhooks.remove(deleteId);
      setFormResult('Webhook này đã bị xóa.');
      await fetchWebhooks();
      closeDelete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  }, [deleteId, fetchWebhooks]);

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Webhook</span>
          </>
        }
        title="Webhook"
        description="Gửi thông báo sự kiện đến URL của bạn. Bật, tạm dừng hoặc xóa từng webhook."
      />

      <EditorialSection eyebrow="Lọc" title="Bộ lọc">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Trạng thái"
            options={WEBHOOK_STATUS_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-w-[160px]"
          />
          <Input
            type="text"
            label="Tìm URL"
            placeholder="https://api.anphat.vn/webhook"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-w-[200px]"
          />
          <Button type="button" variant="primary" onClick={openForm} className="h-10 rounded-lg text-[12px] font-medium">
            Đăng ký mới
          </Button>
          <button
            type="button"
            onClick={fetchWebhooks}
            className="h-10 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            Làm mới
          </button>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Danh sách" title={listSummary(filtered.length, 'webhook')}>
        <TableState
          loading={loading}
          empty={!filtered.length}
          error={error || undefined}
          colSpan={5}
          emptyTitle="Chưa có webhook"
          emptyDescription="URL nhận thông báo sẽ hiển thị dưới đây."
          retryLabel="Thử lại"
          onRetry={fetchWebhooks}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">Bảng webhook công ty</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    URL
                  </th>
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Sự kiện
                  </th>
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Trạng thái
                  </th>
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Tỷ lệ thành công
                  </th>
                  <th scope="col" className="h-9 pl-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                    <td className="pr-3 font-mono text-[12px] text-ink-soft">{row.url}</td>
                    <td className="px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.events.map((event: string) => (
                          <span key={event} className="px-2 py-0.5 bg-surface text-[10px] font-medium leading-none text-ink-soft">
                            {EVENT_LABEL[event] ?? event}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3">
                      <StatusLabel tone={row.status === 'ACTIVE' ? 'success' : row.status === 'PAUSED' ? 'warning' : 'danger'}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </StatusLabel>
                    </td>
                    <td className="px-3 text-right text-[12px] tabular-nums text-ink-soft">
                      {`${Math.round(row.successRate * 100)}%`}
                    </td>
                    <td className="px-3 pl-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggle(row.id)}
                          className="text-[12px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                        >
                          {row.status === 'ACTIVE' ? 'Tạm dừng' : 'Kích hoạt'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(row.id)}
                          className="text-[12px] font-medium text-danger underline decoration-danger/30 underline-offset-2 hover:decoration-danger"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableState>
      </EditorialSection>

      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title="Đăng ký webhook mới"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? (
            <p className="text-[12px] text-danger">{formError}</p>
          ) : null}
          {formResult ? (
            <p className="text-[12px] text-success">{formResult}</p>
          ) : null}
          <Input
            type="url"
            label="URL nhận"
            placeholder="https://api.anphat.vn/webhook"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            disabled={formLoading}
          />
          <div className="flex items-end gap-2">
            {events.map((event) => (
              <span key={event} className="px-2 py-1 bg-surface text-[10px] font-medium leading-none text-ink-soft">
                {EVENT_LABEL[event] ?? event}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 rounded-md border-t border-line pt-3">
            <Button type="button" variant="secondary" onClick={closeForm} className="h-10 rounded-lg text-[12px] font-medium">
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={formLoading} className="h-10 rounded-lg text-[12px] font-medium">
              {formLoading ? 'Đang đăng ký…' : 'Đăng ký'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deleteId !== null}
        onClose={closeDelete}
        title="Xác nhận xóa webhook"
      >
        <div className="space-y-4">
          <p className="text-[12px] text-ink-soft">
            Bạn sẽ xóa webhook này vĩnh viễn. Dữ liệu nhận được từ URL sẽ không còn.
          </p>
          {formResult ? (
            <p className="text-[12px] text-success">{formResult}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2 rounded-md border-t border-line pt-3">
            <Button type="button" variant="secondary" onClick={closeDelete} className="h-10 rounded-lg text-[12px] font-medium">
              Hủy
            </Button>
            <Button type="button" variant="danger" disabled={formLoading} onClick={handleDelete} className="h-10 rounded-lg text-[12px] font-medium">
              {formLoading ? 'Đang xóa…' : 'Xác nhận xóa'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
