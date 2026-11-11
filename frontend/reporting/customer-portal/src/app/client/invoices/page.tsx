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
  formatDateTimeVN,
  invoiceStatusLabel,
  invoiceStatusTone,
} from '@/lib/labels';

/** Nhắc lại thành ngữ ngắn, tránh lặp lại chuỗi theo nhiều cách trong trang. */
const PAYMENT_SUCCESS_MESSAGE = 'Đã ghi nhận thanh toán.';

const INVOICE_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'SENT', label: 'Đã gửi' },
  { value: 'PAID', label: 'Đã trả' },
  { value: 'OVERDUE', label: 'Quá hạn' },
  { value: 'VOID', label: 'Hủy bỏ' },
];

export default function ClientInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [payId, setPayId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payResult, setPayResult] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [anomalies, setAnomalies] = useState<any[]>([]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await data.invoices.list();
      setInvoices(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnomalies = useCallback(async () => {
    try {
      const rows = await data.aiFeature.anomalyForecast();
      setAnomalies(Array.isArray(rows) ? rows : []);
    } catch {
      setAnomalies([]);
    }
  }, []);

  useEffect(() => {
    void fetchInvoices();
    void fetchAnomalies();
  }, [fetchInvoices, fetchAnomalies]);

  const filtered = invoices
    .filter((row) => !statusFilter || row.status === statusFilter)
    .filter((row) => !searchQuery || `${row.invoiceNumber} ${row.note}`.toLowerCase().includes(searchQuery.toLowerCase()));

  const paidTotal = invoices.reduce((sum, row) => sum + row.paidAmount, 0);
  const overdueTotal = invoices
    .filter((row) => row.status === 'OVERDUE')
    .reduce((sum, row) => sum + row.totalAmount, 0);

  const openPay = (invoice: any) => {
    setPayId(invoice.id);
    setPayAmount(String(invoice.totalAmount - invoice.paidAmount));
    setPayResult(null);
  };

  const closePay = () => {
    setPayId(null);
    setPayAmount('');
    setPayResult(null);
  };

  const handlePay = useCallback(async () => {
    if (!payId) return;
    setPayLoading(true);
    setPayResult(null);
    try {
      await data.invoices.recordPayment(payId, Number(payAmount) || 0);
      setPayResult(PAYMENT_SUCCESS_MESSAGE);
      await fetchInvoices();
      await fetchAnomalies();
      closePay();
    } catch (err: any) {
      setPayResult(err.message);
    } finally {
      setPayLoading(false);
    }
  }, [payId, payAmount, fetchInvoices, fetchAnomalies]);

  const current = invoices.find((row) => row.id === payId);
  const balance = current ? current.totalAmount - current.paidAmount : 0;

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Hóa đơn</span>
          </>
        }
        title="Hóa đơn"
        description="Danh sách hóa đơn và công nợ, ghi nhận thanh toán từng phần hoặc đầy đủ."
      />

      <EditorialSection eyebrow="Tổng quan" title="Chỉ số công nợ">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Tổng công nợ</p>
            <p className="mt-1 text-[13px] font-medium text-ink">{formatCurrency(overdueTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Đã thanh toán</p>
            <p className="mt-1 text-[13px] font-medium text-ink">{formatCurrency(paidTotal)}</p>
          </div>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Lọc" title="Bộ lọc">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Trạng thái"
            options={INVOICE_STATUS_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-w-[160px]"
          />
          <Input
            type="text"
            label="Tìm hóa đơn"
            placeholder="INV-20261001-0001"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-w-[200px]"
          />
          <button
            type="button"
            onClick={fetchInvoices}
            className="h-10 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            Làm mới
          </button>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Danh sách" title="Hóa đơn của bạn">
        <TableState
          loading={loading}
          empty={!filtered.length}
          error={error || undefined}
          colSpan={6}
          emptyTitle="Chưa có hóa đơn"
          emptyDescription="Dữ liệu sẽ hiển thị sau khi đăng nhập."
          retryLabel="Thử lại"
          onRetry={fetchInvoices}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Bảng hóa đơn của công ty</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Mã hóa đơn
                  </th>
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Tổng tiền
                  </th>
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Đã thanh toán
                  </th>
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Hạn thanh toán
                  </th>
                  <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Trạng thái
                  </th>
                  <th scope="col" className="h-9 pl-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Thanh toán
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                    <td className="pr-3 font-mono text-[12px] font-medium text-ink">{row.invoiceNumber}</td>
                    <td className="px-3 text-right text-[12px] font-medium tabular-nums text-ink">
                      {formatCurrency(row.totalAmount)}
                    </td>
                    <td className="px-3 text-right text-[12px] tabular-nums text-ink-soft">
                      {formatCurrency(row.paidAmount)}
                    </td>
                    <td className="px-3 text-[12px] text-ink-soft">{formatDateTimeVN(row.dueAt)}</td>
                    <td className="px-3">
                      <StatusLabel tone={invoiceStatusTone(row.status)}>{invoiceStatusLabel(row.status)}</StatusLabel>
                    </td>
                    <td className="pr-3">
                      {row.status !== 'PAID' && row.status !== 'VOID' && row.status !== 'DRAFT' ? (
                        <button
                          type="button"
                          onClick={() => openPay(row)}
                          className="text-[12px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                        >
                          Thanh toán
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableState>
      </EditorialSection>

      {anomalies.length > 0 ? (
        <EditorialSection eyebrow="Dự báo" title="Bất thường công nợ">
          <div className="space-y-3">
            {anomalies.map((anomaly) => (
              <div key={anomaly.id} className="border-l-2 border-line-strong pl-3">
                <p className="text-[12px] font-medium text-ink">{anomaly.message}</p>
                <p className="text-[11px] text-ink-soft">{anomaly.recommendation}</p>
              </div>
            ))}
          </div>
        </EditorialSection>
      ) : null}

      <Modal
        isOpen={payId !== null}
        onClose={closePay}
        title="Thanh toán hóa đơn"
      >
        {current ? (
          <div className="space-y-4">
            <div className="rounded-md bg-surface p-3">
              <p className="text-[12px] text-ink-soft">{current.invoiceNumber}</p>
              <p className="text-[12px] text-ink-soft">{formatCurrency(balance)} còn lại</p>
            </div>
            <Input
              type="number"
              label="Số tiền thanh toán"
              value={payAmount}
              onChange={(event) => setPayAmount(event.target.value)}
              required
              min={0}
              max={balance}
            />
            {payResult ? (
              <div className="text-[12px] text-ink-soft">{payResult}</div>
            ) : null}
            <div className="flex items-center justify-end gap-2 rounded-md border-t border-line pt-3">
              <Button type="button" variant="secondary" onClick={closePay} className="h-10 rounded-lg text-[12px] font-medium">
                Hủy
              </Button>
              <Button type="button" variant="primary" disabled={payLoading} onClick={handlePay} className="h-10 rounded-lg text-[12px] font-medium">
                {payLoading ? 'Đang thanh toán…' : 'Xác nhận thanh toán'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
