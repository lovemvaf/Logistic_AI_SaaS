'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState } from 'ui-components';
import { data } from '@/lib/data';
import type { ReportSummary, ReportOnTime, ReportCosts, ReportFleet, ReportParams } from '@/lib/mock';
import { formatCurrency, formatNumber } from '@/lib/labels';

const FULL_MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

function yearRange() {
  return [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear()];
}

function monthItems(year: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: `${FULL_MONTHS[i]} ${year}`,
  }));
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [onTime, setOnTime] = useState<ReportOnTime | null>(null);
  const [costs, setCosts] = useState<ReportCosts | null>(null);
  const [fleet, setFleet] = useState<ReportFleet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');

  useEffect(() => {
    const now = new Date();
    setSelectedMonth(String(now.getMonth() + 1));
    setSelectedYear(String(now.getFullYear()));
  }, []);

  const load = async () => {
    if (!selectedMonth || !selectedYear) return;
    setLoading(true);
    setError('');
    try {
      const period = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
      const params: ReportParams = { period };
      const [summary_, onTime_, costs_, fleet_] = await Promise.all([
        data.reports.summary(params),
        data.reports.onTime(params),
        data.reports.costs(params),
        data.reports.fleet(params),
      ]);
      setSummary(summary_);
      setOnTime(onTime_);
      setCosts(costs_);
      setFleet(fleet_);
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được báo cáo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMonth && selectedYear) load();
  }, [selectedMonth, selectedYear]);

  const sortedYears = yearRange().sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Báo cáo doanh nghiệp"
        title="Vận hành tháng"
        description="Tổng quan đơn hàng, giao đúng hạn, chi phí và đội xe cho kỳ tuyển chọn."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
        <select
          aria-label="Tháng"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-8 border border-line px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
        >
          {monthItems(new Date().getFullYear()).map((item) => (
            <option key={item.month} value={String(item.month)}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Năm"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="h-8 border border-line px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
        >
          {sortedYears.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>

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
            label: 'Đơn hàng tháng',
            value: formatNumber(summary?.orders.total ?? 0),
            meta: `${summary?.orders.delivered ?? 0} giao thành công`,
          },
          {
            label: 'Tỷ lệ giao đúng SLA',
            value: summary?.onTimeRate ? `${summary?.onTimeRate}%` : '—',
            meta: summary ? `${summary.orders.late} giao trễ` : undefined,
            tone: (summary?.onTimeRate ?? 0) >= 95 ? 'success' : (summary?.onTimeRate ?? 0) >= 85 ? 'warning' : 'danger',
          },
          {
            label: 'COD chưa đối',
            value: summary ? formatCurrency(summary.codPending) : '—',
            meta: 'Phiếu chưa đối soát',
            tone: (summary?.codPending ?? 0) > 0 ? 'warning' : 'success',
          },
          {
            label: 'Lợi nhuận',
            value: summary ? formatCurrency(summary.profit) : '—',
            meta: summary ? formatCurrency(summary.revenue) + ' doanh thu' : undefined,
            tone: (summary?.profit ?? 0) >= 0 ? 'success' : 'danger',
          },
        ]}
      />

      {summary && onTime ? (
        <EditorialSection
          title="Giao đúng hạn theo kho"
          eyebrow="SLA giao hàng theo điểm nhận"
          action={
            <span className="text-[11px] text-ink-faint">
              {summary.orders.delivered} đơn giao trong tháng
            </span>
          }
        >
          <div className="rounded-xl border border-line bg-canvas">
            <div className="overflow-x-auto">
              <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Kho
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      Số đơn
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      đúng hạn
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      trễ
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      tỷ lệ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    loading={loading}
                    empty={!loading && (onTime?.groups.length === 0)}
                    error={error ? new Error(error) : undefined}
                    onRetry={load}
                    colSpan={5}
                    emptyTitle="Chưa có dữ liệu giao hàng"
                    emptyDescription="Không có đơn giao hàng đủ SLA trong kỳ được chọn."
                  >
                    {onTime?.groups.map((group) => {
                      const barWidth = group.total === 0 ? 0 : Math.max(0, Number(group.rate));
                      return (
                        <tr key={group.id} className="border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                          <td className="px-4 py-2">
                            <span className="text-[12px] font-medium text-ink">{group.name}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="tabular-nums text-[12px] text-ink">{formatNumber(group.total)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="tabular-nums text-[12px] text-success">{formatNumber(group.onTime)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="tabular-nums text-[12px] text-danger">{formatNumber(group.late)}</span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-between gap-2 text-[11px]">
                              <div className="h-2 w-full rounded-full bg-line">
                                <div
                                  className="h-2 rounded-full bg-accent"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <span className={group.rate >= 95 ? 'text-success' : group.rate >= 85 ? 'text-warning' : 'text-danger'}>
                                {group.rate}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </TableState>
                </tbody>
              </table>
            </div>
          </div>
        </EditorialSection>
      ) : null}

      {summary && costs ? (
        <EditorialSection
          title="Chi phí theo hạng mục"
          eyebrow="Chi phí hoạt động trong tháng"
          action={
            <span className="text-[11px] text-ink-faint">
              Tổng: {formatCurrency(costs.total)}
            </span>
          }
        >
          <div className="rounded-xl border border-line bg-canvas">
            <div className="overflow-x-auto">
              <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Hạng mục
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      Số tiền
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      tỷ trọng
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    loading={loading}
                    empty={!loading && (costs?.byCategory.length === 0)}
                    error={error ? new Error(error) : undefined}
                    onRetry={load}
                    colSpan={3}
                    emptyTitle="Chưa có chi phí"
                    emptyDescription="Không có chi phí nào được ghi nhận trong kỳ."
                  >
                    {costs?.byCategory.map((item) => {
                      const share = costs.total === 0 ? 0 : (item.amount / costs.total) * 100;
                      return (
                        <tr key={item.category} className="border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                          <td className="px-4 py-2">
                            <span className="text-[12px] font-medium text-ink">{item.category}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="tabular-nums text-[12px] font-medium text-ink">{formatCurrency(item.amount)}</span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2 text-[11px]">
                              <div className="h-2 w-24 rounded-full bg-line">
                                <div
                                  className="h-2 rounded-full bg-accent"
                                  style={{ width: `${share}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-ink-faint">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </TableState>
                </tbody>
              </table>
            </div>
          </div>
        </EditorialSection>
      ) : null}

      {summary && fleet ? (
        <EditorialSection
          title="Đội xe — hiệu suất"
          eyebrow="Xu hướng xe chạy tháng qua"
          action={
            <span className="text-[11px] text-ink-faint">
              {summary.fleetUtilization}% sử dụng
            </span>
          }
        >
          <div className="rounded-xl border border-line bg-canvas">
            <div className="overflow-x-auto">
              <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Biển số
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      chuyến
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      km
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      xăng
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      bảo trì
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      hiệu suất
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    loading={loading}
                    empty={!loading && (fleet?.byVehicle.length === 0)}
                    error={error ? new Error(error) : undefined}
                    onRetry={load}
                    colSpan={6}
                    emptyTitle="Chưa có dữ liệu xe"
                    emptyDescription="Không có xe chạy trong kỳ được chọn."
                  >
                    {fleet?.byVehicle.map((vehicle) => (
                      <tr key={vehicle.id} className="border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                        <td className="px-4 py-2">
                          <div>
                            <div className="text-[12px] font-medium text-ink">{vehicle.plate}</div>
                            <div className="text-[10px] text-ink-faint">{vehicle.type}</div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] text-ink">{formatNumber(vehicle.trips)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] text-ink">{formatNumber(vehicle.distanceKm)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] text-ink">{formatCurrency(vehicle.fuelCost)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] text-ink">{formatCurrency(vehicle.maintenanceCost)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-between gap-2 text-[11px]">
                            <div className="h-2 w-24 rounded-full bg-line">
                              <div
                                className="h-2 rounded-full bg-accent"
                                style={{ width: `${vehicle.rate}%` }}
                              />
                            </div>
                            <span className={vehicle.rate >= 80 ? 'text-success' : 'text-warning'}>
                              {vehicle.rate}%
                            </span>
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
      ) : null}

      <EditorialSection title="Tóm tắt hiệu suất tháng" eyebrow="Chỉ số chính">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Doanh thu', value: summary ? formatCurrency(summary.revenue) : '—' },
            { label: 'Chi phí', value: summary ? formatCurrency(summary.cost) : '—' },
            { label: 'Lợi nhuận', value: summary ? formatCurrency(summary.profit) : '—' },
            { label: 'COD nộp thấp kỳ', value: summary ? formatCurrency(summary.codPending) : '—' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">{item.label}</p>
              <p className="mt-1 text-[20px] font-semibold tabular-nums text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </EditorialSection>
    </div>
  );
}
