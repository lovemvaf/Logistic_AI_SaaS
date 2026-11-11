'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
  type StatusTone,
} from 'ui-kit';

import { TableState } from 'ui-components';
import { formatCurrency, formatDateTimeVN, orderStatusTone } from '@/lib/labels';

/**
 * Bảng điều khiển khách hàng.
 *
 * Module AI chạy hoàn toàn trên dữ liệu mock (offline):
 * `data.aiFeature.predictETA`, `deliverySuggestions`, `anomalyForecast`,
 * `profileInsights` là những hàm AI riêng biệt với mạng. Khi `NEXT_PUBLIC_DATA_SOURCE=api`,
 * các hàm này được thay bằng adapter REST (xem `repository.ts`).
 */

export default function ClientDashboard() {
  const { user } = useAuth();
  const [recentOrders, setRecentOrders] = useState([]);
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRow, orderRows, invoiceRows, stockRows] = await Promise.all([
        data.orders.summary(),
        data.orders.list((row) => row.status !== 'CANCELLED'),
        data.invoices.list(),
        data.stock.list(),
      ]);
      setSummary(summaryRow);
      setRecentOrders(
        (summaryRow?.recentOrders?.length ? summaryRow.recentOrders : orderRows.slice(0, 6)) ?? [],
      );
      setOverdueInvoices(invoiceRows?.filter((row) => row.status === 'OVERDUE') ?? []);
      setLowStock(
        stockRows?.filter((row) => row.available <= row.reorderPoint && row.quantity > 0) ?? [],
      );
      setLastUpdated(formatDateTimeVN(new Date().toISOString()));
    } catch (err) {
      setError(err?.message ?? 'Không tải được dữ liệu bảng điều khiển.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const inTransit = summary?.inTransit ?? 0;
  const onTimeRate = summary?.onTimeRate ?? 0;
  const outstanding = summary?.outstandingAmount ?? 0;

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Bảng điều khiển</span>
          </>
        }
        title="Bảng điều khiển"
        description="Toàn cảnh vận chuyển, công nợ và tồn kho của tài khoản doanh nghiệp lúc này."
        meta={
          <p className="mt-1">Cập nhật lúc {lastUpdated || '—'}</p>
        }
        actions={
          <button
            type="button"
            onClick={fetchDashboard}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Đang tải…' : 'Làm mới'}
          </button>
        }
      />

      <MetricBand
        metrics={[
          {
            label: 'Đơn hàng hôm nay',
            value: loading ? '—' : new Intl.NumberFormat('vi-VN').format(summary?.ordersToday ?? 0),
            meta: 'Đơn mới tạo',
          },
          {
            label: 'Đang giao',
            value: loading ? '—' : new Intl.NumberFormat('vi-VN').format(inTransit),
            meta: 'Đang đi',
            tone: inTransit > 0 ? 'success' : 'default',
          },
          {
            label: 'Giao đúng hẹn',
            value: loading ? '—' : `${onTimeRate}%`,
            meta: 'Tỷ lệ %',
            tone: onTimeRate < 95 ? 'danger' : 'success',
          },
          {
            label: 'Công nợ',
            value: loading ? '—' : formatCurrency(outstanding),
            meta: 'Chưa thanh toán',
            tone: outstanding > 0 ? 'danger' : 'default',
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <EditorialSection eyebrow="Đơn hàng" title="Gần đây nhất">
            <TableState
              loading={loading}
              empty={!recentOrders.length && !error}
              error={error || undefined}
              colSpan={4}
              emptyTitle="Chưa có đơn hàng"
              emptyDescription="Dữ liệu sẽ hiển thị sau khi đăng nhập."
              retryLabel="Thử lại"
              onRetry={fetchDashboard}
            >
              {recentOrders.map((row) => (
                <tr key={row.id} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                  <td className="pr-3 font-mono text-[12px] font-medium text-ink">
                    <Link href={`/track/${row.trackingCode}`}>{row.trackingCode}</Link>
                  </td>
                  <td className="px-3 text-[12px] text-ink-soft">{row.recipientName}</td>
                  <td className="px-3 text-[12px] text-ink-soft">{formatCurrency(row.shippingFee)}</td>
                  <td className="pl-3">
                    <StatusLabel tone={orderStatusTone(row.status as StatusTone)}>
                      {row.status}
                    </StatusLabel>
                  </td>
                </tr>
              ))}
            </TableState>
          </EditorialSection>

          {overdueInvoices.length > 0 ? (
            <EditorialSection eyebrow="Chứng từ" title="Hóa đơn quá hạn">
              <TableState
                loading={loading}
                empty={false}
                error={error || undefined}
                colSpan={3}
                retryLabel="Thử lại"
                onRetry={fetchDashboard}
              >
                {overdueInvoices.map((row) => (
                  <tr key={row.id} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                    <td className="pr-3 font-mono text-[12px] font-medium text-ink">
                      {row.invoiceNumber}
                    </td>
                    <td className="px-3 text-right text-[12px] font-medium tabular-nums text-ink">
                      {formatCurrency(row.totalAmount)}
                    </td>
                    <td className="pl-3 text-right">
                      <StatusLabel tone="danger">Quá hạn</StatusLabel>
                    </td>
                  </tr>
                ))}
              </TableState>
            </EditorialSection>
          ) : null}
        </div>

        <aside className="space-y-4 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          {lowStock.length > 0 ? (
            <>
              <h2 className="text-[12px] font-semibold text-ink-soft">Cảnh báo</h2>
              <p className="text-[11px] text-ink-faint">
                Tồn sắp hết dưới mức đặt lại.
              </p>
              <div className="space-y-2 border-t border-line pt-3">
                {lowStock.slice(0, 4).map((row) => (
                  <div key={row.id} className="flex items-center justify-between text-[12px]">
                    <div>
                      <p className="font-medium text-ink">{row.name}</p>
                      <p className="text-ink-faint">{row.sku}</p>
                    </div>
                    <StatusLabel tone="danger">
                      {row.available} / {row.available + row.reserved}
                    </StatusLabel>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyNote>
              Không có hàng sắp hết trong tồn kho.
            </EmptyNote>
          )}

          <div className="border-t border-line pt-4">
            <h2 className="text-[12px] font-semibold text-ink-soft">Hoạt động</h2>
            <div className="mt-1 space-y-2">
              {user?.email ? (
                <p className="text-[12px] text-ink-soft">
                  Đang đăng nhập: {user.email}
                </p>
              ) : null}
              <Link
                href="/client/orders"
                className="block text-[12px] text-accent hover:underline"
              >
                Tất cả đơn hàng
              </Link>
              <Link
                href="/client/invoices"
                className="block text-[12px] text-accent hover:underline"
              >
                Hóa đơn
              </Link>
              <Link
                href="/client/inventory"
                className="block text-[12px] text-accent hover:underline"
              >
                Tồn kho
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
