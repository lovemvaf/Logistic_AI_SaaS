'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import { TableState } from 'ui-components';
import { DongNaiRouteMap } from 'map-components';
import { formatCurrency, formatDateTimeVN, orderStatusLabel, orderStatusTone } from '@/lib/labels';

export default function ClientDashboard() {
  const { user } = useAuth();
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<any>(null);
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
      setOverdueInvoices(invoiceRows?.filter((row: any) => row.status === 'OVERDUE') ?? []);
      setLowStock(
        stockRows?.filter((row: any) => row.available <= row.reorderPoint && row.quantity > 0) ?? [],
      );
      setLastUpdated(formatDateTimeVN(new Date().toISOString()));
    } catch (err: any) {
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

  const mapStops = useMemo(() => {
    const baseStops = recentOrders
      .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
      .slice(0, 5)
      .map((r, i) => ({
        id: r.id || `ord-${i}`,
        name: r.trackingCode || `Đơn #${i + 1}`,
        locality: r.recipientAddress || 'TP Đồng Nai',
        lat: Number(r.lat),
        lng: Number(r.lng),
        status: r.status === 'DELIVERED' ? 'COMPLETED' : r.status === 'IN_TRANSIT' ? 'CURRENT' : 'PENDING',
      }));
    if (baseStops.length >= 2) return baseStops;
    return [
      { id: 'lb', name: 'ICD Tân Cảng Long Bình', locality: 'Phường Long Bình', lat: 10.9415, lng: 106.8908, status: 'COMPLETED' },
      { id: 'am', name: 'Amata Precision Plant', locality: 'KCN Amata', lat: 10.9478, lng: 106.8722, status: 'CURRENT' },
      { id: 'lt', name: 'KCN Long Thành', locality: 'Phường Long Thành', lat: 10.7782, lng: 106.9531, status: 'PENDING' },
    ];
  }, [recentOrders]);

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
        meta={<p className="mt-1">Cập nhật lúc {lastUpdated || '—'}</p>}
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
            meta: `${summary?.totalOrders ?? 0} tổng đơn`,
          },
          {
            label: 'Đang giao',
            value: loading ? '—' : new Intl.NumberFormat('vi-VN').format(inTransit),
            meta: `${summary?.delivered ?? 0} đã hoàn tất`,
            tone: inTransit > 0 ? 'success' : 'default',
          },
          {
            label: 'Giao đúng hẹn',
            value: loading ? '—' : `${onTimeRate}%`,
            meta: 'Tỷ lệ SLA',
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

      <DongNaiRouteMap
        title="Mạng lưới Giao nhận Đồng Nai của bạn"
        subtitle="Bấm vào điểm dừng hoặc dùng Play/Reset để xem hành trình mô phỏng giữa kho ICD Long Bình và các KCN Đồng Nai"
        stops={mapStops}
        waypoints={mapStops.map((s) => ({ lat: s.lat!, lng: s.lng!, label: s.name }))}
        interactivePlayback
        isSimulatedRoute
        precisionLabel="B2B VIEW"
        height={260}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <EditorialSection eyebrow="Đơn hàng" title="Gần đây nhất">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="h-9 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Mã vận đơn
                    </th>
                    <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Người nhận
                    </th>
                    <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Cước phí
                    </th>
                    <th className="h-9 pl-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    loading={loading}
                    empty={!recentOrders.length && !error}
                    error={error || undefined}
                    colSpan={4}
                    emptyTitle="Chưa có đơn hàng"
                    emptyDescription="Dữ liệu sẽ hiển thị sau khi đăng nhập."
                    onRetry={fetchDashboard}
                  >
                    {recentOrders.map((row: any) => (
                      <tr key={row.id} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                        <td className="pr-3 font-mono text-[12px] font-medium text-ink">
                          <Link href={`/track/${row.trackingCode}`} className="text-accent hover:underline">
                            {row.trackingCode}
                          </Link>
                        </td>
                        <td className="px-3 text-[12px] text-ink-soft">{row.recipientName}</td>
                        <td className="px-3 text-[12px] tabular-nums text-ink-soft">
                          {formatCurrency(row.shippingFee)}
                        </td>
                        <td className="pl-3">
                          <StatusLabel tone={orderStatusTone(row.status)}>
                            {orderStatusLabel(row.status)}
                          </StatusLabel>
                        </td>
                      </tr>
                    ))}
                  </TableState>
                </tbody>
              </table>
            </div>
          </EditorialSection>

          {overdueInvoices.length > 0 ? (
            <EditorialSection eyebrow="Chứng từ" title="Hóa đơn quá hạn">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="h-9 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                        Mã hóa đơn
                      </th>
                      <th className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                        Số tiền
                      </th>
                      <th className="h-9 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                        Trạng thái
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      loading={loading}
                      empty={false}
                      error={error || undefined}
                      colSpan={3}
                      onRetry={fetchDashboard}
                    >
                      {overdueInvoices.map((row: any) => (
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
                  </tbody>
                </table>
              </div>
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
                {lowStock.slice(0, 4).map((row: any) => (
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
                href="/client/freight"
                className="block text-[12px] text-accent hover:underline"
              >
                Freight B2B &amp; Chia sẻ Tracking
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
