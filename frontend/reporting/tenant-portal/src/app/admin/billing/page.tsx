'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState, Modal, Button, Input } from 'ui-components';
import { data } from '@/lib/data';
import type { Invoice } from '@/lib/mock';
import {
  formatCurrency,
  formatDateTimeVN,
  formatDateVN,
  invoiceStatusLabel,
  invoiceStatusTone,
} from '@/lib/labels';

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const all = await data.invoices.list();
      setInvoices(all.sort((a, b) => b.dueAt.localeCompare(a.dueAt)));
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được danh sách hoá đơn.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = invoices.filter((row) => {
    if (filter && row.status !== filter) return false;
    if (search) {
      const term = search.toLowerCase();
      return row.code.toLowerCase().includes(term) || row.clientName.toLowerCase().includes(term);
    }
    return true;
  });

  const payable = invoices.filter((row) => !['PAID', 'VOID'].includes(row.status));
  const overdue = invoices.filter((row) => row.status === 'OVERDUE');
  const outstanding = invoices.filter((row) => !['PAID', 'VOID'].includes(row.status)).reduce(
    (sum, row) => sum + (row.amount - row.paidAmount),
    0,
  );

  const openInvoices = payable.length;
  const metricTone = (value: number) => (value > 0 ? 'warning' : 'success');

  const handleOpenPayment = (row: Invoice) => {
    setPaymentId(row.id);
    setPaymentAmount(String(row.amount - row.paidAmount));
    setActionError('');
  };

  const handlePayment = async () => {
    if (!paymentId) return;
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setActionError('Số tiền thanh toán phải lớn hơn 0.');
      return;
    }
    const remaining = invoices.find((row) => row.id === paymentId)?.amount ?? 0;
    if (amount > remaining) {
      setActionError(`Số tiền vượt quá công nợ còn lại (${formatCurrency(remaining)}).`);
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      await data.invoices.recordPayment(paymentId, amount);
      setPaymentId(null);
      setPaymentAmount('');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Không ghi nhận thanh toán được.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Quản trị"
        title="Hoá đơn"
        description="Theo dõi cuối và ghi nhận thanh toán của khách hàng B2B."
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
            label: 'Hóa đơn mở',
            value: String(openInvoices),
            meta: 'Chưa thanh toán đủ',
            tone: metricTone(openInvoices),
          },
          {
            label: 'Quá hạn',
            value: String(overdue.length),
            meta: overdue.length > 0 ? 'Cần nhắc nợ ngay' : undefined,
            tone: overdue.length > 0 ? 'danger' : 'success',
          },
          {
            label: 'Phải thu',
            value: formatCurrency(outstanding),
            meta: 'Số tiền còn nợ từ hóa đơn',
            tone: metricTone(outstanding),
          },
          {
            label: 'Đã thu',
            value: formatCurrency(invoices.reduce((sum, row) => sum + row.paidAmount, 0)),
            meta: 'Đã ghi nhận thanh toán',
          },
        ]}
      />

      <EditorialSection title="Danh sách hoá đơn" eyebrow="Cuối tháng" action={
        <div className="flex items-center gap-2">
          <select
            aria-label="Lọc trạng thái"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
          >
            <option value="">Tất cả</option>
            <option value="SENT">Chờ thanh toán</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="OVERDUE">Quá hạn</option>
            <option value="VOID">Đã huỷ</option>
            <option value="DRAFT">Bản nháp</option>
          </select>
          <input
            type="search"
            placeholder="Tìm mã khách..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong focus:border-accent"
          />
        </div>
      }>
        <div className="rounded-xl border border-line bg-canvas">
          <div className="overflow-x-auto">
            <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Mã
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Khách
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Kỳ
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Tổng
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Đã trả
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Còn lại
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Trạng thái
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  loading={loading}
                  empty={!loading && visible.length === 0}
                  error={error ? new Error(error) : undefined}
                  onRetry={load}
                  colSpan={8}
                  emptyTitle="Chưa có hóa đơn nào"
                  emptyDescription="Hóa đơn sẽ hiển thị nơi đây khi được tạo."
                >
                  {visible.map((row) => (
                    <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                      <td className="px-4 py-2">
                        <span className="font-mono text-[11px] text-ink-faint">{row.code}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[12px] font-medium text-ink">{row.clientName}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-ink-soft">{row.period}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] font-medium text-ink">{formatCurrency(row.amount)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] text-success">{formatCurrency(row.paidAmount)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] font-medium text-ink">{formatCurrency(row.amount - row.paidAmount)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <StatusLabel tone={invoiceStatusTone(row.status)}>
                          {invoiceStatusLabel(row.status)}
                        </StatusLabel>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!['PAID', 'VOID'].includes(row.status) ? (
                          <button
                            type="button"
                            onClick={() => handleOpenPayment(row)}
                            className="text-[11px] font-medium text-accent hover:underline"
                          >
                            Ghi nhận thanh toán
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </TableState>
              </tbody>
            </table>
          </div>
        </div>
      </EditorialSection>

      <Modal
        isOpen={paymentId !== null}
        onClose={() => setPaymentId(null)}
        title="Ghi nhận thanh toán"
        size="sm"
      >
        {paymentId ? (
          <form onSubmit={(e) => { e.preventDefault(); handlePayment(); }}>
            <div className="mb-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tổng thanh toán</div>
                  <div className="text-[16px] font-semibold tabular-nums text-ink">
                    {formatCurrency(invoices.find((row) => row.id === paymentId)?.amount ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Số tiền cần trả</div>
                  <Input
                    required
                    type="number"
                    min={0}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-32"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            {actionError ? (
              <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPaymentId(null)}>
                Bỏ qua
              </Button>
              <Button type="submit" isLoading={saving} disabled={saving}>
                Ghi nhận
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
