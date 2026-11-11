'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState, Modal, Button, Input, Select } from 'ui-components';
import { data } from '@/lib/data';
import type { CodRemittance, BankTransaction } from '@/lib/mock';
import {
  codStatusLabel,
  codStatusTone,
  formatCurrency,
  formatDateVN,
} from '@/lib/labels';

const STATUS_FILTER: { label: string; value: CodRemittance['status'] | '' }[] = [
  { label: 'Tất cả', value: '' },
  { label: 'Chờ nộp', value: 'PENDING' },
  { label: 'Đã nộp', value: 'SUBMITTED' },
  { label: 'Đang lệch', value: 'DISPUTED' },
  { label: 'Đã đối soát', value: 'RECONCILED' },
];

function formatBankRef(value: string | null) {
  if (!value) return '—';
  return <span className="font-mono text-[11px] text-ink-faint">{value}</span>;
}

export default function CodRemittancePage() {
  const [remittances, setRemittances] = useState<CodRemittance[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [query, setQuery] = useState('');
  const [submitId, setSubmitId] = useState<string | null>(null);
  const [submitAmount, setSubmitAmount] = useState<string>('');
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [bankId, setBankId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [remitted, transactions] = await Promise.all([
        data.remittances.list(),
        data.bankTransactions.list(),
      ]);
      setRemittances(remitted);
      setBankTransactions(transactions.sort((a, b) => b.txnDate.localeCompare(a.txnDate)));
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được đối soát COD.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visibleRemittances = remittances.filter((row) => {
    if (statusFilter && row.status !== statusFilter) return false;
    if (query) {
      const term = query.toLowerCase();
      return (
        row.code.toLowerCase().includes(term) ||
        row.driverName.toLowerCase().includes(term) ||
        row.tripCode.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const pending = remittances.filter((row) => row.status === 'PENDING');
  const totalExpected = remittances.reduce((sum, row) => sum + row.expectedAmount, 0);
  const totalSubmitted = remittances.reduce((sum, row) => sum + row.submittedAmount, 0);
  const totalVariance = totalExpected - totalSubmitted;

  const handleOpenSubmit = (row: CodRemittance) => {
    setSubmitId(row.id);
    setSubmitAmount(String(row.expectedAmount));
    setActionError('');
  };

  const handleOpenReconcile = (row: CodRemittance) => {
    setReconcileId(row.id);
    setBankId(null);
    setActionError('');
  };

  const handleSubmit = async () => {
    if (!submitId) return;
    const amount = Number(submitAmount);
    if (isNaN(amount) || amount <= 0) {
      setActionError('Số tiền nộp phải lớn hơn 0.');
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      await data.remittances.submit(submitId, amount);
      setSubmitId(null);
      setSubmitAmount('');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Không nộp được quyết toán.');
    } finally {
      setSaving(false);
    }
  };

  const handleReconcile = async () => {
    if (!reconcileId || !bankId) return;
    setSaving(true);
    setActionError('');
    try {
      await data.remittances.reconcile(reconcileId, bankId);
      setReconcileId(null);
      setBankId(null);
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Không đối soát được.');
    } finally {
      setSaving(false);
    }
  };

  const subtitle = `${pending.length} chờ nộp · ${totalExpected.toLocaleString('vi-VN')} ₫ phải thu`;

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Tài chính"
        title="Đối soát COD"
        description="Theo dõi phiếu quyết toán của tài xế và giao dịch ngân hàng, đối soát hai bên."
        meta={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              className="h-8 border border-line px-3 text-[11px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              Làm mới
            </button>
          </div>
        }
      />

      {error ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
          <StatusLabel tone="danger">Lỗi dữ liệu</StatusLabel>
          <span className="text-[12px] text-ink-soft">{error}</span>
          <button type="button" onClick={load} className="ml-auto text-[11px] font-medium text-accent hover:underline">
            Thử lại
          </button>
        </div>
      ) : null}

      <MetricBand
        metrics={[
          {
            label: 'Phiếu phải thu',
            value: formatCurrency(totalExpected),
            meta: `${remittances.length} phiếu trong kỳ`,
          },
          {
            label: 'Đã nộp',
            value: formatCurrency(totalSubmitted),
            meta: 'Thực nhận từ tài xế',
          },
          {
            label: 'Chênh lệch',
            value: formatCurrency(totalVariance),
            meta: totalVariance > 0 ? 'Số tiền còn thiếu' : undefined,
            tone: totalVariance !== 0 ? 'warning' : 'success',
          },
          {
            label: 'Chờ nộp',
            value: String(pending.length),
            meta: pending.length > 0 ? 'Cần tài xế nộp ngay' : undefined,
            tone: pending.length > 0 ? 'danger' : 'success',
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <EditorialSection
          title="Phiếu quyết toán"
          eyebrow="Tài xế chịu trách nhiệm nộp"
          action={
            <select
              aria-label="Lọc trạng thái"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
            >
              {STATUS_FILTER.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          }
        >
          <div className="rounded-xl border border-line bg-canvas">
            <div className="overflow-x-auto">
              <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Mã phiếu
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Tài xế
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Dự kiến
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Đã nộp
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Trạng thái
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    loading={loading}
                    empty={!loading && visibleRemittances.length === 0}
                    error={error ? new Error(error) : undefined}
                    onRetry={load}
                    colSpan={6}
                    emptyTitle="Chưa có phiếu quyết toán"
                    emptyDescription="Không có phiếu nào khớp bộ lọc trong khoảng thời gian này."
                  >
                    {visibleRemittances.map((row) => (
                      <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                        <td className="px-4 py-2">
                          <span className="font-mono text-[11px] text-ink-faint">{row.code}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div>
                            <div className="text-[12px] font-medium text-ink">{row.driverName}</div>
                            <div className="text-[10px] text-ink-faint">{row.tripCode}</div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] font-medium text-ink">{formatCurrency(row.expectedAmount)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] font-medium text-ink">{formatCurrency(row.submittedAmount)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <StatusLabel tone={codStatusTone(row.status)}>
                            {codStatusLabel(row.status)}
                          </StatusLabel>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            {(row.status === 'PENDING' || row.status === 'SUBMITTED') && (
                              <button
                                type="button"
                                onClick={() => handleOpenSubmit(row)}
                                className="text-[11px] font-medium text-accent hover:underline"
                              >
                                Nộp tiền
                              </button>
                            )}
                            {(row.status === 'PENDING' || row.status === 'SUBMITTED') && (
                              <button
                                type="button"
                                onClick={() => handleOpenReconcile(row)}
                                className="text-[11px] font-medium text-ink-soft hover:underline"
                              >
                                Đối soát
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </TableState>
                </tbody>
              </table>
            </div>
          </div>
        </EditorialSection>

        <EditorialSection
          title="Giao dịch ngân hàng"
          eyebrow="Đầu vào từ ngân hàng đối tác"
          action={
            <input
              type="search"
              placeholder="Tìm giao dịch..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-48 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong focus:border-accent"
            />
          }
        >
          <div className="rounded-xl border border-line bg-canvas">
            <div className="overflow-x-auto">
              <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Ngày
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Mô tả
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Số tiền
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Mã tham chiếu
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Đã khớp
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    loading={loading}
                    empty={!loading && bankTransactions.length === 0}
                    error={error ? new Error(error) : undefined}
                    onRetry={load}
                    colSpan={5}
                    emptyTitle="Chưa có giao dịch ngân hàng"
                    emptyDescription="Giao dịch ngân hàng sẽ tự động hiển thị nơi đây."
                  >
                    {bankTransactions.map((row) => (
                      <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                        <td className="px-4 py-2">
                          <span className="text-[11px] tabular-nums text-ink-soft">{formatDateVN(row.txnDate)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[12px] text-ink">{row.description}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] font-medium text-ink">{formatCurrency(row.amount)}</span>
                        </td>
                        <td className="px-4 py-2">
                          {formatBankRef(row.bankRef)}
                        </td>
                        <td className="px-4 py-2">
                          {row.matchedRemittanceId ? (
                            <StatusLabel tone="info">Đã khớp</StatusLabel>
                          ) : (
                            <StatusLabel tone="neutral">Chưa khớp</StatusLabel>
                          )}
                        </td>
                      </tr>
                    ))}
                  </TableState>
                </tbody>
              </table>
            </div>
          </div>
        </EditorialSection>
      </div>

      {/* Submit payment modal */}
      <Modal
        isOpen={submitId !== null}
        onClose={() => setSubmitId(null)}
        title="Nộp tiền quyết toán"
        size="sm"
      >
        {submitId ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="mb-2">
              <p className="text-[12px] text-ink-soft">
                Phiếu{' '}
                <span className="font-mono text-ink">{remittances.find((row) => row.id === submitId)?.code}</span>
                , tài xế{' '}
                <span className="font-medium text-ink">
                  {remittances.find((row) => row.id === submitId)?.driverName}
                </span>
                .
              </p>
            </div>
            <div className="mb-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Dự kiến</div>
                  <div className="text-[18px] font-semibold tabular-nums text-ink">
                    {formatCurrency(remittances.find((row) => row.id === submitId)?.expectedAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Số tiền thực</div>
                  <Input
                    required
                    type="number"
                    min={0}
                    value={submitAmount}
                    onChange={(e) => setSubmitAmount(e.target.value)}
                    className="w-[140px]"
                    placeholder="0"
                  />
                </div>
              </div>
              {Number(submitAmount) > 0 && Number(submitAmount) !== Number(remittances.find((row) => row.id === submitId)?.expectedAmount) ? (
                <p className="mt-2 text-[11px] font-medium text-warning">
                  Chênh lệch: {Math.abs(Number(submitAmount) - (remittances.find((row) => row.id === submitId)?.expectedAmount ?? 0)).toLocaleString('vi-VN')} ₫
                </p>
              ) : null}
            </div>
            {actionError ? (
              <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSubmitId(null)}>
                Bỏ qua
              </Button>
              <Button type="submit" isLoading={saving} disabled={saving}>
                Nộp tiền
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Reconcile modal */}
      <Modal
        isOpen={reconcileId !== null}
        onClose={() => setReconcileId(null)}
        title="Đối soát COD"
        size="sm"
      >
        {reconcileId ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleReconcile();
            }}
          >
            <div className="mb-2">
              <p className="text-[12px] text-ink-soft">
                Phiếu{' '}
                <span className="font-mono text-ink">{remittances.find((row) => row.id === reconcileId)?.code}</span>{' '}
                với số tiền đã nộp{' '}
                <span className="font-medium text-ink">
                  {formatCurrency(remittances.find((row) => row.id === reconcileId)?.submittedAmount)}
                </span>
                .
              </p>
            </div>
            <div className="mb-4">
              <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="reconcile-bank">
                Chọn giao dịch ngân hàng
              </label>
              <Select
                id="reconcile-bank"
                required
                value={bankId ?? ''}
                onChange={(e) => setBankId(e.target.value)}
                options={bankTransactions
                  .filter((row) => !row.matchedRemittanceId)
                  .map((row) => {
                    return {
                      value: row.id,
                      label: `${formatCurrency(row.amount)} · ${formatDateVN(row.txnDate)} · ${row.description}`,
                    };
                  })}
                placeholder="Chọn một giao dịch chưa khớp"
              />
            </div>
            {actionError ? (
              <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReconcileId(null)}>
                Bỏ qua
              </Button>
              <Button type="submit" isLoading={saving} disabled={!bankId || saving}>
                Đối soát
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
