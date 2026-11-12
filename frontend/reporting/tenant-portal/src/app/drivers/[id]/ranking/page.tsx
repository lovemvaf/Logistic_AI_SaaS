'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import type { EditorialMetric } from 'ui-kit';
import { Button, Select, TableState } from 'ui-components';
import type { Driver, DriverReport } from '@/lib/mock';
import {
  driverStatusLabel,
  driverStatusTone,
  formatCurrency,
  formatNumber,
} from '@/lib/labels';

function buildRecentMonths(count = 8): string[] {
  const now = new Date();
  const list: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return list;
}

const MONTHS = buildRecentMonths(8);

/**
 * Điểm đánh giá tài xế: an toàn, nhiên liệu/đơn, đúng giờ, đánh giá.
 *
 * Công thức định mức là trụ cột chung cho list và-ranking; không nhân bản
 * logic giữa hai trang.
 */
function scoreOf(report: DriverReport) {
  const incidents = report.incidents * 8;
  const complained = report.complained * 6;
  const safety = Math.max(0, 100 - incidents - complained);
  const fuelPerOrder = Math.max(0, 100 - Math.round((report.fuelCost / Math.max(1, report.orders)) * 0.2));
  return Math.round(
    safety * 0.35 + fuelPerOrder * 0.25 + report.onTimeRate * 0.25 + Number(report.rating) * 8 * 0.15,
  );
}

function safetyScoreOf(report: DriverReport) {
  return Math.max(0, 100 - report.incidents * 8 - report.complained * 6);
}

/** Rủi ro cần can thiệp dựa trên lỗi, khiếu nại và điểm an toàn tổng. */
function riskOf(report: DriverReport) {
  const safety = safetyScoreOf(report);
  if (report.incidents >= 3 || report.complained >= 2 || safety < 60) return { label: 'Cao', tone: 'danger' as const };
  if (report.incidents >= 1 || report.complained > 0 || safety < 75) return { label: 'Trung bình', tone: 'warning' as const };
  return { label: 'Thấp', tone: 'success' as const };
}

/** Kế hoạch cải thiện đưa ra cho tài xế, dựa trên điểm an toàn. */
function improvementTip(report: DriverReport) {
  const fuelPerOrder = report.fuelCost / Math.max(1, report.orders);
  if (report.incidents >= 2) {
    return 'Tài xế có lỗi giao dịch nhiều tháng. Phát đào tạo tại điểm khu vực gần kho.';
  }
  if (fuelPerOrder > 120_000) {
    return 'Thủ tục tăng nhiên liệu/đơn. Đề xuất đo tốc độ, hạn chế chờ xe quá 15 phút.';
  }
  if (report.onTimeRate < 90) {
    return 'Tần suất giao đúng giờ thấp, xem lại tuyến đường và lộ trình.';
  }
  return 'Lái đều, không tăng tốc gấp, duy trì 70-80 km/h là định mức tiết kiệm nhiên liệu.';
}

export default function DriverRankingPage() {
  const { id } = useParams();
  const driverId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const [driver, setDriver] = useState<Driver | null>(null);
  const [reports, setReports] = useState<DriverReport[]>([]);
  const [month, setMonth] = useState(MONTHS[MONTHS.length - 1]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!driverId) return;
    setLoading(true);
    setError('');
    try {
      const [driverRes, rankings] = await Promise.all([
        data.drivers.get(driverId),
        data.drivers.ranking({ period: month }),
      ]);
      if (!driverRes) throw new Error('Không tìm thấy tài xế.');
      setDriver(driverRes);
      setReports(rankings);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được bảng xếp hạng.';
      setError(msg);
      setDriver(null);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [driverId, month]);

  const own = useMemo(() => reports.find((r) => r.driverId === driverId), [reports, driverId]);
  const sorted = useMemo(
    () => [...reports].sort((a, b) => scoreOf(b) - scoreOf(a)),
    [reports],
  );

  const metrics: EditorialMetric[] = [
    {
      label: 'Chuyến kỳ',
      value: own ? own.trips : '—',
      meta: `tháng ${own?.month ?? ''}`,
    },
    {
      label: 'Giao đúng giờ',
      value: own ? `${own.onTimeRate}%` : '—',
      meta: own ? (own.onTimeRate < 90 ? 'Cần cải thiện' : 'Trên định mức') : '',
      tone: own ? (own.onTimeRate < 90 ? 'warning' : 'success') : 'default',
    },
    {
      label: 'Điểm an toàn',
      value: own ? formatNumber(safetyScoreOf(own)) : '—',
      meta: own ? `Rủi ro: ${riskOf(own).label}` : '',
      tone: own ? (riskOf(own).tone === 'danger' ? 'danger' : riskOf(own).tone === 'warning' ? 'warning' : 'success') : 'default',
    },
    {
      label: 'Chi phí/đơn',
      value: own ? formatCurrency(Math.round(own.fuelCost / Math.max(1, own.orders))) : '—',
      meta: 'nhiên liệu trung bình',
    },
  ];

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Tài xế"
        title={driver ? `${driver.name} (${driver.code})` : 'Bảng xếp hạng'}
        description="Xếp hạng tháng, điểm an toàn, tiết kiệm nhiên liệu và đánh giá rủi ro tài xế."
        meta={
          driver && (
            <StatusLabel tone={driverStatusTone(driver.status)}>
              {driverStatusLabel(driver.status)}
            </StatusLabel>
          )
        }
        actions={
          <div className="flex gap-2">
            {driver && (
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] font-medium"
                onClick={() => router.push(`/drivers/${driverId}/trip-log`)}
              >
                Lịch hoạt động
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
              Làm mới
            </Button>
          </div>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      {driverId ? (
        <MetricBand metrics={metrics} />
      ) : (
        <EditorialSection title="Không chọn tài xế">
          <EmptyNote>Không có tài xế nào được chọn. Mở `/drivers/[id]/ranking`.</EmptyNote>
        </EditorialSection>
      )}

      <EditorialSection
        title="Bảng xếp hạng AI"
        eyebrow="Xếp hạng theo định mức"
        action={
          <Select
            className="h-9 min-w-[9rem]"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            options={MONTHS.map((m) => ({ value: m, label: m }))}
          />
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="md:col-span-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-line text-[13px]">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    TT
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Tài xế
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Điểm
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Rủi ro
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Nhiên liệu/đơn
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <TableState
                  loading={loading}
                  empty={!loading && reports.length === 0}
                  onRetry={load}
                  colSpan={5}
                  emptyContent={
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-ink-faint">
                        Chưa có dữ liệu xếp hạng cho tháng {month}.
                      </td>
                    </tr>
                  }
                  error={error ? new Error(error) : undefined}
                >
                  {sorted.map((row, index) => (
                    <tr
                      key={row.driverId}
                      className={`${row.driverId === driverId ? 'bg-accent-soft' : ''} hover:bg-surface-alt cursor-pointer`}
                      onClick={() => router.push(`/drivers/${row.driverId}/ranking`)}
                    >
                      <td className="px-3 py-2 font-medium text-ink-faint">{index + 1}</td>
                      <td className="px-3 py-2">
                        <p className="text-[13px] font-medium text-ink">{row.driverName}</p>
                        <p className="text-[11px] text-ink-faint">{row.status} · {row.phone}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">
                        {scoreOf(row)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusLabel tone={riskOf(row).tone}>{riskOf(row).label}</StatusLabel>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-faint">
                        {formatCurrency(Math.round(row.fuelCost / Math.max(1, row.orders)))}
                      </td>
                    </tr>
                  ))}
                </TableState>
              </tbody>
            </table>
          </div>

          <div className="md:col-span-2 space-y-4">
            {own && (
              <div className="border border-line bg-surface p-3">
                <h3 className="text-[13px] font-semibold text-ink">Điểm của tài xế</h3>
                <p className="mt-2 text-[36px] font-semibold leading-none tabular-nums text-ink">
                  {scoreOf(own)}
                </p>
                <p className="mt-1 text-[11px] text-ink-soft">
                  An toàn {safetyScoreOf(own)}, giao đúng giờ {own.onTimeRate}%, {own.trips} chuyến.
                </p>
                <p className="mt-2 text-[12px] text-ink-soft">{improvementTip(own)}</p>
              </div>
            )}
          </div>
        </div>
      </EditorialSection>
    </div>
  );
}
