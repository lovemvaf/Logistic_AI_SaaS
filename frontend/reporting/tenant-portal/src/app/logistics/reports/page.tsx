'use client';

import { useEffect, useState, useMemo } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import {
  Button,
  DataState,
  Input,
  TableState,
} from 'ui-components';
import type { ReportParams, ReportSummary, ReportOnTime, ReportCosts, ReportFleet } from '@/lib/mock';
import {
  formatCurrency,
  formatNumber,
  formatDateVN,
} from '@/lib/labels';

const PERIODS: { label: string; value: string }[] = [
  { label: '7 ngày', value: '7d' },
  { label: '30 ngày', value: '30d' },
  { label: '90 ngày', value: '90d' },
  { label: 'Tháng này', value: 'month' },
];

/** Form một khoảng tháng hiện tại cho các dữ liệu tính sẵn. */
const toPeriod = (range: string) => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return range === 'month' ? month : month;
};

/** Toast chỉ là kết nối vào `ToastHost` mount ở root layout. */
const toast = (message: string, type: 'success' | 'error' | 'info' = 'info') =>
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type } }));

export default function LogisticsReportsPage() {
  const [range, setRange] = useState('month');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [onTime, setOnTime] = useState<ReportOnTime | null>(null);
  const [costs, setCosts] = useState<ReportCosts | null>(null);
  const [fleet, setFleet] = useState<ReportFleet | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = (range: string): ReportParams => {
    const period = toPeriod(range);
    return { period, from: period + '-01', to: period + '-31' };
  };

  const total = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, onTimeRes, costsRes, fleetRes] = await Promise.all([
        data.reports.summary(params(range)),
        data.reports.onTime(params(range)),
        data.reports.costs(params(range)),
        data.reports.fleet(params(range)),
      ]);
      setSummary(summaryRes);
      setOnTime(onTimeRes);
      setCosts(costsRes);
      setFleet(fleetRes);
    } catch (err: any) {
      setError(err?.message || 'Không tải được báo cáo.');
      setSummary(null);
      setOnTime(null);
      setCosts(null);
      setFleet(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    total();
  }, [range]);

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Vận tải"
        title="Báo cáo vận hành"
        description="Tóm tắt đơn hàng, giao hàng đúng hạn, chi phí và hiệu suất đội xe theo khoảng thời gian."
      />

      {error ? (
        <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p>
      ) : null}

      <div className="flex items-end justify-between gap-3">
        <div className="flex gap-1.5">
          {PERIODS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-colors rounded-lg ${
                range === value ? 'bg-accent text-surface' : 'text-ink-soft hover:bg-surface-alt'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={total}>
          Làm mới
        </Button>
      </div>

      <MetricBand
        metrics={[
          { label: 'Đơn hàng', value: summary ? formatNumber(summary.orders.total) : '—' },
          { label: 'Đã giao', value: summary ? formatNumber(summary.orders.delivered) : '—' },
          { label: 'Trễ', value: summary ? formatNumber(summary.orders.late) : '—', tone: 'danger' },
          { label: 'Tỷ lệ đúng hạn', value: summary ? `${summary.onTimeRate}%` : '—', tone: summary ? (summary.onTimeRate >= 90 ? 'success' : 'warning') : 'default' },
          { label: 'Doanh thu', value: summary ? formatCurrency(summary.revenue) : '—' },
          { label: 'Chi phí', value: summary ? formatCurrency(summary.cost) : '—' },
          { label: 'COD đang chờ', value: summary ? formatCurrency(summary.codPending) : '—' },
          { label: 'Tỉ lệ vòng', value: summary ? `${summary.fleetUtilization}%` : '—' },
        ]}
      />

      <EditorialSection title="Giao hàng đúng hạn">
        <DataState loading={loading} empty={!loading && (!onTime || onTime.groups.length === 0)}>
          <TableState
            loading={loading}
            empty={!loading && (!onTime || onTime.groups.length === 0)}
            error={error || undefined}
            onRetry={total}
            colSpan={4}
            emptyContent={
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-ink-faint">
                  Chưa có dữ liệu vận hành đúng hạn.
                </td>
              </tr>
            }
          >
            {onTime &&
              onTime.groups.map((g) => (
                <tr key={g.id} className="hover:bg-surface-alt">
                  <td className="px-3 py-2 font-medium text-ink">{g.name}</td>
                  <td className="pr-3 py-2 tabular-nums">{g.onTime} / {g.total}</td>
                  <td className="pr-3 py-2">
                    <div className="w-full h-[6px] bg-surface border border-line overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full bg-success"
                        style={{ width: `${g.total === 0 ? 0 : (g.onTime / g.total) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="pr-3 py-2 tabular-nums">{g.rate}%</td>
                </tr>
              ))}
          </TableState>
        </DataState>
      </EditorialSection>

      <EditorialSection title="Chi phí">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Loại</th>
                <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Số tiền</th>
                <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tỉ trọng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <TableState
                loading={loading}
                empty={!loading && (!costs || costs.byCategory.length === 0)}
                error={error || undefined}
                onRetry={total}
                colSpan={3}
                emptyContent={
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-ink-faint">
                      Chưa có dữ liệu chi phí.
                    </td>
                  </tr>
                }
              >
                {costs &&
                  costs.byCategory.map((c) => (
                    <tr key={c.category} className="hover:bg-surface-alt">
                      <td className="pr-3 py-2 font-medium text-ink">{c.category}</td>
                      <td className="pr-3 py-2 text-right tabular-nums">{formatCurrency(c.amount)}</td>
                      <td className="pr-3 py-2 w-[40%]">
                        <div className="w-full h-[6px] bg-surface border border-line rounded-full">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${c.amount === 0 || costs.total === 0 ? 0 : (c.amount / costs.total) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
              </TableState>
            </tbody>
            {costs ? (
              <tfoot>
                <tr className="border-t border-line bg-surface">
                  <td className="px-3 py-2 font-medium text-ink">Tổng chi phí</td>
                  <td className="pr-3 py-2 text-right tabular-nums font-semibold text-ink">{formatCurrency(costs.total)}</td>
                  <td className="pr-3 py-2"></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </EditorialSection>

      <EditorialSection title="Xe đội">
        <DataState loading={loading} empty={!loading && (!fleet || fleet.byVehicle.length === 0)}>
          <TableState
            loading={loading}
            empty={!loading && (!fleet || fleet.byVehicle.length === 0)}
            error={error || undefined}
            onRetry={total}
            colSpan={9}
            emptyContent={
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-ink-faint">
                  Chưa có dữ liệu đội xe.
                </td>
              </tr>
            }
          >
            {fleet &&
              fleet.byVehicle.map((v) => (
                <tr key={v.id} className="hover:bg-surface-alt">
                  <td className="pr-3 py-2 font-medium text-ink">{v.plate}</td>
                  <td className="pr-3 py-2">{v.type}</td>
                  <td className="pr-3 py-2 text-right tabular-nums">{v.trips}</td>
                  <td className="pr-3 py-2 text-right tabular-nums">{formatNumber(v.distanceKm)} km</td>
                  <td className="pr-3 py-2 text-right tabular-nums">{formatCurrency(v.fuelCost)}</td>
                  <td className="pr-3 py-2 text-right tabular-nums">{formatCurrency(v.maintenanceCost)}</td>
                  <td className="pr-3 py-2 text-right tabular-nums">{formatCurrency(v.revenue)}</td>
                  <td className="pr-3 py-2">
                    <div className="w-[60px] h-[6px] bg-surface border border-line rounded-full ml-auto">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${v.utilizableDays === 0 ? 0 : (v.utilizableDays / Math.max(1, v.utilizableDays + v.downtimeDays)) * 100}%`,
                          backgroundColor: (v.utilizableDays / Math.max(1, v.utilizableDays + v.downtimeDays)) >= 0.8 ? '#3F6B4F' : '#8A5D28',
                        }}
                      />
                    </div>
                  </td>
                  <td className="pr-3 py-2 text-right tabular-nums">{v.rate}</td>
                </tr>
              ))}
          </TableState>
        </DataState>
      </EditorialSection>
    </div>
  );
}
