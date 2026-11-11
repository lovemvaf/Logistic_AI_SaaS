'use client';

import { useEffect, useState, useMemo } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import {
  Button,
  Input,
  Modal,
  Pagination,
  Select,
  TableState,
} from 'ui-components';
import type { ReturnRequest } from '@/lib/mock';
import {
  returnStatusLabel,
  returnStatusTone,
  formatCurrency,
  formatDateTimeVN,
  formatDateVN,
} from '@/lib/labels';

/** Bảng dịch gắn nhãn quốc kỳ kiểm định / lý do trả hàng — gói nhãn nghiệp vụ. */
const INSPECTION_LABELS: Record<ReturnRequest['inspection'], string> = {
  PENDING: 'Chưa kiểm định',
  SELLABLE: 'Hàng bán lại được',
  DAMAGED: 'Hư hỏng',
  SCRAP: 'Hủy bỏ loại',
};
const INSPECTION_TONES: Record<ReturnRequest['inspection'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'neutral',
  SELLABLE: 'success',
  DAMAGED: 'warning',
  SCRAP: 'danger',
};
const REASON_LABELS: Record<ReturnRequest['reason'], string> = {
  REFUSED: 'Khách từ chối',
  DAMAGED: 'Hàng hỏng',
  WRONG_ITEM: 'Sai hàng',
  NOT_DELIVERED: 'Chưa giao',
  OTHER: 'Khác',
};

/** Lọc lỗi report để dính trạng thái từ bảng trả hàng. */
const STATUS_LIST: ReturnRequest['status'][] = [
  'REQUESTED',
  'APPROVED',
  'IN_TRANSIT',
  'INSPECTING',
  'REFUNDED',
  'REJECTED',
];

/** Toast chỉ là kết nối vào `ToastHost` mount ở root layout. */
const toast = (message: string, type: 'success' | 'error' | 'info' = 'info') =>
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type } }));

const PAGE_SIZE = 10;

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mutating, setMutating] = useState<string>('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReturnRequest['status'] | 'ALL'>('ALL');
  const [reasonFilter, setReasonFilter] = useState<ReturnRequest['reason'] | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const [confirmForm, setConfirmForm] = useState<{ id: string; title: string; note: string } | null>(null);
  const [confirmNote, setConfirmNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await data.returns.list();
      setReturns(list);
    } catch (err: any) {
      setError(err?.message || 'Không tải được dữ liệu trả hàng.');
      setReturns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => {
    const ready = returns.filter((r) => r.status === 'REQUESTED');
    const approved = returns.filter((r) => r.status === 'APPROVED');
    const inTransit = returns.filter((r) => r.status === 'IN_TRANSIT');
    const inspecting = returns.filter((r) => r.status === 'INSPECTING');
    const refunding = returns.filter((r) => r.status === 'REFUNDED' || r.status === 'REJECTED');
    return [
      { label: 'Chờ duyệt', value: ready.length, meta: `${ready.length} yêu cầu chưa xử lý` },
      { label: 'Đã duyệt', value: approved.length, meta: 'tiếp nhận hoặc hoàn tiền được' },
      { label: 'Đang về kho', value: inTransit.length, meta: 'hàng đang vận chuyển ngược' },
      { label: 'Đang kiểm định', value: inspecting.length, meta: 'chọn kết quả kiểm định' },
      { label: 'Kết thúc', value: refunding.length, meta: 'đã hoàn tiền hoặc từ chối' },
    ];
  }, [returns]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const matches = (r: ReturnRequest) =>
      (statusFilter === 'ALL' || statusFilter === r.status) &&
      (reasonFilter === 'ALL' || reasonFilter === r.reason);
    const list = returns.filter((r) => {
      if (!term) return matches(r);
      return (
        matches(r) &&
        (r.code.toLowerCase().includes(term) ||
          r.orderTrackingCode.toLowerCase().includes(term) ||
          r.clientName.toLowerCase().includes(term) ||
          (r.note ? r.note.toLowerCase().includes(term) : false))
      );
    });
    return list.sort((a, b) => a.createdAt > b.createdAt ? -1 : 1);
  }, [returns, search, statusFilter, reasonFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const selected = useMemo(() => returns.find((r) => r.id === selectedId) ?? null, [returns, selectedId]);

  const openConfirm = (id: string, title: string, note?: string) => {
    setConfirmForm({ id, title, note: note ?? '' });
    setConfirmNote(note ?? '');
  };
  const closeConfirm = () => {
    setConfirmForm(null);
    setConfirmNote('');
  };

  const handleInspect = async (id: string, status: ReturnRequest['status'], inspection: ReturnRequest['inspection'], note?: string) => {
    setMutating(id);
    try {
      const r = await data.returns.inspect(id, { inspection, status, note });
      setReturns((prev) => prev.map((row) => (row.id === id ? r : row)));
      setSelectedId(null);
      toast(`Cập nhật ${r.code} -> ${returnStatusLabel(status)}`, 'success');
    } catch (err: any) {
      toast(err?.message || `Không thể chuyển trạng thái ${status}.`, 'error');
    } finally {
      setMutating('');
    }
  };

  const handleRefund = async () => {
    if (!confirmForm) return;
    setMutating(confirmForm.id);
    try {
      const r = await data.returns.refund(confirmForm.id, confirmNote ?? 'Hoàn tiền theo xác nhận');
      setReturns((prev) => prev.map((row) => (row.id === confirmForm.id ? r : row)));
      cancelAction();
      toast(`Hoàn tiền ${r.code} thành công.`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Không thể hoàn tiền phiếu trả hàng.', 'error');
    } finally {
      setMutating('');
    }
  };

  const cancelAction = () => {
    setSelectedId(null);
    setConfirmForm(null);
    setConfirmNote('');
  };

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Vận tải"
        title="Phiếu trả hàng"
        description="Duyệt yêu cầu, theo dõi hàng về kho, kiểm định và hoàn tiền / từ chối. Hàng bán lại được hoàn tiền, hàng hủy không."
        meta={`${returns.length} phiếu`}
      />

      <MetricBand metrics={metrics} />

      <EditorialSection title="Danh sách trả hàng" eyebrow="Lọc + tìm">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="search"
            placeholder="Tìm mã phiếu, đơn hàng, khách hàng"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-64 h-9"
          />
          <Select
            className="h-9 min-w-[9rem]"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ReturnRequest['status'] | 'ALL');
              setPage(1);
            }}
            options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, ...STATUS_LIST.map((s) => ({ value: s, label: returnStatusLabel(s) }))]}
          />
          <Select
            className="h-9 min-w-[10rem]"
            value={reasonFilter}
            onChange={(e) => {
              setReasonFilter(e.target.value as ReturnRequest['reason'] | 'ALL');
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'Tất cả lý do' },
              ...(Object.keys(REASON_LABELS) as ReturnRequest['reason'][]).map((k) => ({ value: k, label: REASON_LABELS[k] })),
            ]}
          />
        </div>
      </EditorialSection>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <EditorialSection title="Bảng phiếu trả hàng">
            <table className="min-w-full divide-y divide-line text-[13px]">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Mã</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Đơn hàng</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Khách hàng</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Lý do</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Trạng thái</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Kiểm định</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tiền hoàn</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <TableState
                  loading={loading}
                  empty={!loading && filtered.length === 0}
                  error={error || undefined}
                  onRetry={load}
                  colSpan={8}
                  emptyContent={<tr><td colSpan={8} className="px-3 py-6 text-center text-ink-faint">Chưa có phiếu trả hàng nào khớp bộ lọc.</td></tr>}
                >
                  {paged.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={`cursor-pointer transition-colors hover:bg-surface-alt ${selectedId === r.id ? 'bg-accent-soft' : ''} ${r.status === 'REFUNDED' || r.status === 'REJECTED' ? 'text-ink-faint' : ''}`}
                    >
                      <td className="pr-3 py-2 font-medium text-ink">{r.code}</td>
                      <td className="pr-3 py-2 font-mono text-[12px]">{r.orderTrackingCode}</td>
                      <td className="pr-3 py-2">{r.clientName}</td>
                      <td className="pr-3 py-2">{REASON_LABELS[r.reason]}</td>
                      <td className="pr-3 py-2">
                        <StatusLabel tone={returnStatusTone(r.status)}>{returnStatusLabel(r.status)}</StatusLabel>
                      </td>
                      <td className="pr-3 py-2">
                        <StatusLabel tone={INSPECTION_TONES[r.inspection]}>{INSPECTION_LABELS[r.inspection]}</StatusLabel>
                      </td>
                      <td className="pr-3 py-2 text-right tabular-nums">{formatCurrency(r.refundAmount)}</td>
                      <td className="pr-3 py-2">{formatDateVN(r.createdAt)}</td>
                    </tr>
                  ))}
                </TableState>
              </tbody>
            </table>
            <div className="flex justify-center py-3">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </EditorialSection>
        </div>

        <div className="lg:col-span-2">
          <EditorialSection title={selected ? `Chi tiết ${selected.code}` : 'Chọn một phiếu trả hàng'}>
            {selected ? (
              <div className="space-y-2">
                <div className="p-3 border border-line bg-surface">
                  <div className="text-[11px] font-medium text-ink-faint uppercase">Mã phiếu</div>
                  <div className="text-[15px] font-semibold text-ink">{selected.code}</div>
                </div>
                <div className="p-3 border border-line bg-surface">
                  <div className="text-[11px] font-medium text-ink-faint uppercase">Đơn hàng</div>
                  <div className="text-[13px] text-ink">{selected.orderTrackingCode}</div>
                </div>
                <div className="p-3 border border-line bg-surface">
                  <div className="text-[11px] font-medium text-ink-faint uppercase">Khách hàng</div>
                  <div className="text-[13px] text-ink">{selected.clientName}</div>
                </div>
                <div className="p-3 border border-line bg-surface">
                  <div className="text-[11px] font-medium text-ink-faint uppercase">Lý do</div>
                  <div className="text-[13px] text-ink">{REASON_LABELS[selected.reason]}</div>
                </div>
                <div className="p-3 border border-line bg-surface">
                  <div className="text-[11px] font-medium text-ink-faint uppercase">Trạng thái</div>
                  <div className="text-[13px] text-ink">
                    <StatusLabel tone={returnStatusTone(selected.status)}>{returnStatusLabel(selected.status)}</StatusLabel>
                  </div>
                </div>
                <div className="p-3 border border-line bg-surface">
                  <div className="text-[11px] font-medium text-ink-faint uppercase">Kiểm định</div>
                  <div className="text-[13px] text-ink">
                    <StatusLabel tone={INSPECTION_TONES[selected.inspection]}>{INSPECTION_LABELS[selected.inspection]}</StatusLabel>
                  </div>
                </div>
                <div className="p-3 border border-line bg-surface">
                  <div className="text-[11px] font-medium text-ink-faint uppercase">Tiền hoàn</div>
                  <div className="text-[15px] font-semibold text-ink tabular-nums">{formatCurrency(selected.refundAmount)}</div>
                </div>
                {selected.resolvedAt ? (
                  <div className="p-3 border border-line bg-surface">
                    <div className="text-[11px] font-medium text-ink-faint uppercase">Ngày đóng</div>
                    <div className="text-[13px] text-ink">{formatDateVN(selected.resolvedAt)}</div>
                  </div>
                ) : null}
                {selected.note ? (
                  <div className="p-3 border border-line bg-surface">
                    <div className="text-[11px] font-medium text-ink-faint uppercase">Ghi chú</div>
                    <div className="text-[13px] text-ink">{selected.note}</div>
                  </div>
                ) : null}

                <div className="pt-4 border-t border-line space-y-2">
                  {selected.status === 'REQUESTED' && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="text-[11px] font-medium w-full bg-accent hover:bg-accent-hover"
                      disabled={mutating === selected.id}
                      onClick={() => handleInspect(selected.id, 'APPROVED', 'PENDING', 'Duyệt bởi admin')}
                    >
                      Duyệt yêu cầu
                    </Button>
                  )}
                  {selected.status === 'APPROVED' && (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        className="text-[11px] font-medium w-full bg-accent hover:bg-accent-hover"
                        disabled={mutating === selected.id}
                        onClick={() => openConfirm(selected.id, 'Hoàn tiền', 'Hoàn tiền vì hàng hư hỏng, không bán lại được.')}
                      >
                        Hoàn tiền
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[11px] font-medium w-full border-line-strong text-ink"
                        disabled={mutating === selected.id}
                        onClick={() => handleInspect(selected.id, 'IN_TRANSIT', 'SELLABLE', 'Đưa hàng về kho')}
                      >
                        Đưa hàng về kho
                      </Button>
                    </>
                  )}
                  {selected.status === 'IN_TRANSIT' && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="text-[11px] font-medium w-full bg-accent hover:bg-accent-hover"
                      disabled={mutating === selected.id}
                      onClick={() => handleInspect(selected.id, 'INSPECTING', 'SELLABLE', 'Kiểm định hàng về')}
                    >
                      Bắt đầu kiểm định
                    </Button>
                  )}
                  {selected.status === 'INSPECTING' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="text-[11px] font-medium bg-accent hover:bg-accent-hover"
                        onClick={() => handleInspect(selected.id, 'REFUNDED', 'SELLABLE', 'Hàng bán lại được')}
                      >
                        Hàng bán lại được
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        className="text-[11px] font-medium bg-accent hover:bg-accent-hover"
                        onClick={() => handleInspect(selected.id, 'REFUNDED', 'DAMAGED', 'Hàng hư hỏng')}
                      >
                        Hàng hư hỏng
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        className="text-[11px] font-medium bg-accent hover:bg-accent-hover"
                        onClick={() => handleInspect(selected.id, 'REJECTED', 'SCRAP', 'Hủy bỏ hàng')}
                      >
                        Hủy bỏ
                      </Button>
                    </div>
                  )}
                  {['REFUNDED', 'REJECTED'].includes(selected.status) && (
                    <EmptyNote>
                      Phiếu đã đóng. Số tiền hoàn gồm {formatCurrency(selected.refundAmount)} đã ghi nhận.
                    </EmptyNote>
                  )}
                </div>
              </div>
            ) : (
              <EmptyNote>Chọn một phiếu trả hàng từ bảng để xem chi tiết, duyệt hoặc hoàn tiền.</EmptyNote>
            )}
          </EditorialSection>
        </div>
      </div>

      <Modal
        isOpen={!!confirmForm}
        onClose={cancelAction}
        title={confirmForm?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button size="sm" variant="outline" className="text-[11px] font-medium" onClick={cancelAction}>
              Hủy
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="text-[11px] font-medium bg-accent hover:bg-accent-hover"
              onClick={handleRefund}
              disabled={mutating === confirmForm?.id}
            >
              Xác nhận hoàn tiền
            </Button>
          </>
        }
      >
        {confirmForm ? (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-soft">
              SEO xác nhận hoàn tiền yêu cầu <b className="text-ink">{confirmForm.title}</b>. Ghi chú thêm (tùy chọn).
            </p>
            <label htmlFor="returns-note" className="text-[12px] font-medium text-ink-soft">Ghi chú</label>
            <textarea
              id="returns-note"
              rows={3}
              className="w-full resize-none rounded-lg border border-line bg-surface text-[13px] p-3 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              value={confirmNote}
              onChange={(e) => setConfirmNote(e.target.value)}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
