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
import type { Expense } from '@/lib/mock';
import {
  expenseTypeLabel,
  expenseTypeTone,
  formatCurrency,
  formatDateVN,
} from '@/lib/labels';

/** Giáo dục công cụ: chỉ những trạng thái chưa xử lý mới được phép xác nhận (DENY). */
const STATUS_LIST: Expense['status'][] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
const SUBMIT_STATUS: Expense['status'][] = ['DRAFT', 'SUBMITTED'];
const STATUS_LABELS: Record<Expense['status'], string> = {
  DRAFT: 'Chưa nộp',
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
};
const STATUS_TONES: Record<Expense['status'], 'neutral' | 'warning' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const TYPE_LIST: Expense['type'][] = ['FUEL', 'TOLL', 'PARKING', 'MAINTENANCE', 'ALLOWANCE', 'OTHER'];

/** Toast chỉ là kết nối vào `ToastHost` mount ở root layout. */
const toast = (message: string, type: 'success' | 'error' | 'info' = 'info') =>
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type } }));

const PAGE_SIZE = 10;

export default function ExpenseApprovalPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mutating, setMutating] = useState<string>('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Expense['status'] | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<Expense['type'] | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const [rejectForm, setRejectForm] = useState<{ id: string; code: string } | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await data.expenses.list();
      setExpenses(list);
    } catch (err: any) {
      setError(err?.message || 'Không tải được dữ liệu phiếu chi.');
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => {
    const draft = expenses.filter((e) => e.status === 'DRAFT');
    const submitted = expenses.filter((e) => e.status === 'SUBMITTED');
    const approved = expenses.filter((e) => e.status === 'APPROVED');
    const rejected = expenses.filter((e) => e.status === 'REJECTED');
    return [
      { label: 'Chưa nộp', value: draft.length, meta: `${draft.length} phiếu chưa gửi` },
      { label: 'Chờ duyệt', value: submitted.length, meta: `${submitted.length} phiếu chờ xử lý` },
      { label: 'Đã duyệt', value: approved.length, meta: `đã hoàn thành` },
      { label: 'Đã từ chối', value: rejected.length, meta: `phải bổ sung dữ liệu` },
    ];
  }, [expenses]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const matches = (e: Expense) =>
      (statusFilter === 'ALL' || statusFilter === e.status) && (typeFilter === 'ALL' || typeFilter === e.type);
    const list = expenses.filter((e) => {
      if (!term) return matches(e);
      return (
        matches(e) &&
        (e.code.toLowerCase().includes(term) ||
          e.tripCode.toLowerCase().includes(term) ||
          e.driverName.toLowerCase().includes(term) ||
          (e.note ? e.note.toLowerCase().includes(term) : false))
      );
    });
    return list.sort((a, b) => a.createdAt > b.createdAt ? -1 : 1);
  }, [expenses, search, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const openRejectModal = (id: string, code: string) => {
    setRejectForm({ id, code });
    setRejectNote('');
  };
  const closeRejectModal = () => {
    setRejectForm(null);
    setRejectNote('');
  };

  const handleDecide = async (id: string, decision: 'APPROVED' | 'REJECTED', note?: string) => {
    setMutating(id);
    try {
      const e = await data.expenses.decide(id, decision, note);
      setExpenses((prev) => prev.map((row) => (row.id === id ? e : row)));
      closeRejectModal();
      toast(`${decision === 'APPROVED' ? 'Duyệt' : 'Từ chối'} ${e.code} thành công.`, 'success');
    } catch (err: any) {
      toast(err?.message || `Không thể ${decision === 'APPROVED' ? 'duyệt' : 'từ chối'} phiếu chi.`, 'error');
    } finally {
      setMutating('');
    }
  };

  const handleReject = () => {
    if (!rejectForm || !rejectNote.trim()) {
      toast('Vui lòng nhập lý do từ chối.', 'info');
      return;
    }
    handleDecide(rejectForm.id, 'REJECTED', rejectNote);
  };

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Vận tải · Tài chính"
        title="Xác nhận chi phí"
        description="Kiểm tra và duyệt / từ chối các phiếu chi của tài xế. Từ chối phải ghi rõ lý do."
        meta={`${expenses.length} phiếu chi`}
      />

      <MetricBand metrics={metrics} />

      <EditorialSection title="Danh sách phiếu chi" eyebrow="Lọc + tìm">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="search"
            placeholder="Tìm mã phiếu, chuyến, tài xế"
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
              setStatusFilter(e.target.value as Expense['status'] | 'ALL');
              setPage(1);
            }}
            options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, ...STATUS_LIST.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
          />
          <Select
            className="h-9 min-w-[10rem]"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as Expense['type'] | 'ALL');
              setPage(1);
            }}
            options={[{ value: 'ALL', label: 'Tất cả loại' }, ...TYPE_LIST.map((t) => ({ value: t, label: expenseTypeLabel(t) }))]}
          />
        </div>
      </EditorialSection>

      <EditorialSection title="Bảng phê duyệt chi phí">
        <table className="min-w-full divide-y divide-line text-[13px]">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Mã</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Chuyến</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tài xế</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Loại</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Số tiền</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Biên lai</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Trạng thái</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Ngày tạo</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <TableState
              loading={loading}
              empty={!loading && filtered.length === 0}
              error={error || undefined}
              onRetry={load}
              colSpan={9}
              emptyContent={<tr><td colSpan={9} className="px-3 py-6 text-center text-ink-faint">Chưa có phiếu chi nào khớp bộ lọc.</td></tr>}
            >
              {paged.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`cursor-pointer transition-colors hover:bg-surface-alt ${selectedId === e.id ? 'bg-accent-soft' : ''}`}
                >
                  <td className="pr-3 py-2 font-medium text-ink">{e.code}</td>
                  <td className="pr-3 py-2 font-mono text-[12px]">{e.tripCode}</td>
                  <td className="pr-3 py-2">{e.driverName}</td>
                  <td className="pr-3 py-2">
                    <StatusLabel tone={expenseTypeTone(e.type)}>{expenseTypeLabel(e.type)}</StatusLabel>
                  </td>
                  <td className="pr-3 py-2 text-right tabular-nums">{formatCurrency(e.amount)}</td>
                  <td className="pr-3 py-2 text-right tabular-nums">{e.receiptCount}</td>
                  <td className="pr-3 py-2">
                    <StatusLabel tone={STATUS_TONES[e.status]}>{STATUS_LABELS[e.status]}</StatusLabel>
                  </td>
                  <td className="pr-3 py-2">{formatDateVN(e.createdAt)}</td>
                  <td className="pr-3 py-2">
                    {SUBMIT_STATUS.includes(e.status) ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          className="text-[11px] font-medium bg-accent hover:bg-accent-hover"
                          disabled={mutating === e.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleDecide(e.id, 'APPROVED');
                          }}
                        >
                          Duyệt
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] font-medium border-line-strong text-ink hover:bg-surface-alt"
                          disabled={mutating === e.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openRejectModal(e.id, e.code);
                          }}
                        >
                          Từ chối
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-faint">{e.status === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </TableState>
          </tbody>
        </table>
      </EditorialSection>
      <div className="flex justify-center py-3">
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <Modal
        isOpen={!!rejectForm}
        onClose={closeRejectModal}
        title="Từ chối phiếu chi"
        size="sm"
        footer={
          <>
            <Button size="sm" variant="outline" className="text-[11px] font-medium" onClick={closeRejectModal}>
              Hủy
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="text-[11px] font-medium bg-accent hover:bg-accent-hover"
              onClick={handleReject}
              disabled={mutating === rejectForm?.id || !rejectNote.trim()}
            >
              Xác nhận từ chối
            </Button>
          </>
        }
      >
        {rejectForm ? (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-soft">
              Xác nhận từ chối <b className="text-ink">{rejectForm.code}</b>. Lý do từ chối được ghi vào lịch sử.
            </p>
            <label htmlFor="reject-note" className="text-[12px] font-medium text-ink-soft">Lý do từ chối</label>
            <textarea
              id="reject-note"
              rows={3}
              className="w-full resize-none rounded-lg border border-line bg-surface text-[13px] p-3 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
            <EmptyNote>
              Lý do từ chối là bắt buộc. Tài xế sẽ được thông báo.
            </EmptyNote>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
