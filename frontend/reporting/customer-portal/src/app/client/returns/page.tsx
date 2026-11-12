'use client';

import { useCallback, useEffect, useState } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  StatusLabel,
} from 'ui-kit';
import { TableState, Select, Input, Modal, Button } from 'ui-components';
import {
  formatCurrency,
  formatDateVN,
  formatDateTimeVN,
  returnStatusLabel,
  returnStatusTone,
  returnReasonLabel,
  listSummary,
} from '@/lib/labels';
import type { ReturnReason } from '@/lib/mock';

/** Yêu cầu trả hàng của khách: danh sách, theo dõi trạng thái, tạo yêu cầu từ đơn đã giao. */

const RETURN_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'REQUESTED', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'IN_TRANSIT', label: 'Đang về kho' },
  { value: 'INSPECTING', label: 'Đang kiểm định' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'CLOSED', label: 'Đã đóng' },
];

export default function ClientReturns() {
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formResult, setFormResult] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [note, setNote] = useState('');

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await data.returns.list();
      setReturns(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReturns();
  }, [fetchReturns]);

  const filtered = returns
    .filter((row) => !statusFilter || row.status === statusFilter)
    .filter((row) => !searchQuery || `${row.returnCode} ${row.orderTrackingCode}`.toLowerCase().includes(searchQuery.toLowerCase()));

  const openForm = () => {
    setFormOpen(true);
    setFormError('');
    setFormResult('');
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormError('');
    setFormResult('');
    setOrderCode('');
    setReason('');
    setNote('');
  };

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFormResult('');

    if (!orderCode.trim()) {
      setFormError('Vui lòng nhập mã vận đơn.');
      return;
    }
    if (!reason) {
      setFormError('Vui lòng chọn lý do trả hàng.');
      return;
    }

    setFormLoading(true);
    try {
      await data.returns.requestReturn({ orderTrackingCode: orderCode, reason, note: note || undefined });
      setFormResult('Đã gửi yêu cầu trả hàng.');
      setOrderCode('');
      setReason('');
      setNote('');
      await fetchReturns();
      setTimeout(closeForm, 800);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }, [orderCode, reason, note, fetchReturns]);

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Trả hàng</span>
          </>
        }
        title="Trả hàng"
        description="Theo dõi yêu cầu trả hàng và hoàn tiền. Tạo yêu cầu từ đơn hàng đã giao."
      />

      <EditorialSection eyebrow="Lọc" title="Bộ lọc">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Trạng thái"
            options={RETURN_STATUS_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-w-[160px]"
          />
          <Input
            type="text"
            label="Tìm yêu cầu"
            placeholder="RET-xxxx"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-w-[200px]"
          />
          <Button type="button" variant="primary" onClick={openForm} className="h-10 rounded-lg text-[12px] font-medium">
            Yêu cầu trả hàng
          </Button>
          <button
            type="button"
            onClick={fetchReturns}
            className="h-10 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            Làm mới
          </button>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Danh sách" title={listSummary(filtered.length, 'yêu cầu trả hàng')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">Bảng yêu cầu trả hàng của công ty</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Mã trả hàng
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Đơn hàng
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Lý do
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Trạng thái
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Hoàn tiền dự kiến
                </th>
                <th scope="col" className="h-9 pl-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Ngày tạo
                </th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={loading}
                empty={!filtered.length}
                error={error || undefined}
                colSpan={6}
                emptyTitle="Chưa có yêu cầu"
                emptyDescription="Yêu cầu trả hàng từ các đơn đã giao sẽ hiển thị ở đây."
                onRetry={fetchReturns}
              >
                {filtered.map((row) => (
                  <tr key={row.id} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                    <td className="pr-3 font-mono text-[12px] font-medium text-ink">{row.returnCode}</td>
                    <td className="px-3 font-mono text-[12px] text-ink-soft">{row.orderTrackingCode}</td>
                    <td className="px-3 text-[12px] text-ink-soft">{returnReasonLabel(row.reason)}</td>
                    <td className="px-3">
                      <StatusLabel tone={returnStatusTone(row.status)}>{returnStatusLabel(row.status)}</StatusLabel>
                    </td>
                    <td className="px-3 text-right text-[12px] font-medium tabular-nums text-ink">
                      {formatCurrency(row.estimatedRefund)}
                    </td>
                    <td className="px-3 text-[12px] text-ink-soft">{formatDateVN(row.createdAt)}</td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
        </div>
      </EditorialSection>

      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title="Yêu cầu trả hàng"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? (
            <p className="text-[12px] text-danger">{formError}</p>
          ) : null}
          {formResult ? (
            <p className="text-[12px] text-success">{formResult}</p>
          ) : null}
          <Input
            type="text"
            label="Mã vận đơn"
            placeholder="SLG-20261101-AB12CD"
            value={orderCode}
            onChange={(event) => setOrderCode(event.target.value)}
            required
            disabled={formLoading}
          />
          <Select
            label="Lý do"
            options={[
              { value: '', label: 'Chọn lý do' },
              { value: 'DAMAGED', label: 'Hàng hỏng' },
              { value: 'WRONG_ITEM', label: 'Sai mặt hàng' },
              { value: 'REFUSED', label: 'Từ chối' },
              { value: 'NOT_DELIVERED', label: 'Chưa giao' },
              { value: 'OTHER', label: 'Khác' },
            ]}
            value={reason}
            onChange={(event) => setReason(event.target.value as ReturnReason)}
            required
            disabled={formLoading}
          />
          <Input
            type="text"
            label="Ghi chú"
            placeholder="Chi tiết trả hàng (nếu có)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={formLoading}
          />
          <div className="flex items-center justify-end gap-2 rounded-md border-t border-line pt-3">
            <Button type="button" variant="secondary" onClick={closeForm} className="h-10 rounded-lg text-[12px] font-medium">
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={formLoading} className="h-10 rounded-lg text-[12px] font-medium">
              {formLoading ? 'Đang gửi…' : 'Gửi yêu cầu'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
