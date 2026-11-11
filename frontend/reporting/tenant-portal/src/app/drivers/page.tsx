'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import type { EditorialMetric } from 'ui-kit';
import { Button, DataState, Input, Pagination, Select, TableState } from 'ui-components';
import type { Driver, DriverReport } from '@/lib/mock';
import {
  driverStatusLabel,
  driverStatusTone,
  formatCurrency,
  formatDateTimeVN,
} from '@/lib/labels';

const PAGE_SIZE = 12;
const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'AVAILABLE', label: 'Sẵn sàng' },
  { value: 'ON_TRIP', label: 'Đang chuyến' },
  { value: 'OFF_DUTY', label: 'Nghỉ ca' },
  { value: 'SUSPENDED', label: 'Đình chỉ' },
];

/**
 * Điểm đánh giá tài xế: an toàn, nhiên liệu/đơn, đúng giờ, đánh giá.
 *
 * Giá trị định mức -> 0 khi nhỏ hơn điểm yếu được trừ theo trọng số.
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

/** Rủi ro cần can thiệp dựa trên lỗi và khiếu nại. */
function riskOf(report: DriverReport) {
  const safety = scoreOf(report);
  if (report.incidents >= 3 || report.complained >= 2 || safety < 60) return { label: 'Cao', tone: 'danger' as const };
  if (report.incidents >= 1 || report.complained > 0 || safety < 75) return { label: 'Trung bình', tone: 'warning' as const };
  return { label: 'Thấp', tone: 'success' as const };
}

export default function DriversPage() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [reports, setReports] = useState<DriverReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Driver['status'] | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [driversRes, rankings] = await Promise.all([data.drivers.list(), data.drivers.ranking({})]);
      setDrivers(driversRes);
      setReports(rankings);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được danh sách tài xế.';
      setError(msg);
      setDrivers([]);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reportByDriver = useMemo(
    () => Object.fromEntries(reports.map((r) => [r.driverId, r])),
    [reports],
  );

  const sortedDrivers = useMemo(() => {
    const rows = drivers.slice();
    const term = filter.toLowerCase().trim();
    const filtered = statusFilter === 'ALL' ? rows : rows.filter((d) => d.status === statusFilter);
    if (term) {
      return filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(term) ||
          d.code.toLowerCase().includes(term) ||
          d.phone.includes(term),
      );
    }
    return filtered;
  }, [drivers, filter, statusFilter]);

  const paged = useMemo(
    () => sortedDrivers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedDrivers, page],
  );
  const totalPages = Math.max(1, Math.ceil(sortedDrivers.length / PAGE_SIZE));

  const metrics: EditorialMetric[] = [
    { label: 'Đang chuyến', value: drivers.filter((d) => d.status === 'ON_TRIP').length, meta: 'trên đường' },
    { label: 'Sẵn sàng', value: drivers.filter((d) => d.status === 'AVAILABLE').length, meta: 'giao đơn được' },
    { label: 'Nghỉ ca', value: drivers.filter((d) => d.status === 'OFF_DUTY').length, meta: 'không trực' },
    { label: 'Đình chỉ', value: drivers.filter((d) => d.status === 'SUSPENDED').length, meta: 'cần hành chính' },
  ];

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Vận tải"
        title="Tài xế"
        description="Danh sách tài xế, xếp hạng tháng, điểm an toàn và tiết kiệm nhiên liệu."
        meta={`${drivers.length} tài xế`}
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      <MetricBand metrics={metrics} />

      <EditorialSection
        title="Bảng xếp hạng AI"
        eyebrow="An toàn + tiết kiệm nhiên liệu + đúng giờ"
      >
        <DataState loading={loading} empty={!loading && reports.length === 0}>
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  TT
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Tài xế
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Trạng thái
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Điểm
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Rủi ro
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
                      Chưa có dữ liệu xếp hạng tháng này.
                    </td>
                  </tr>
                }
                error={error ? new Error(error) : undefined}
              >
                {[...reports]
                  .sort((a, b) => scoreOf(b) - scoreOf(a))
                  .map((report, index) => (
                    <tr
                      key={report.driverId}
                      className="hover:bg-surface-alt cursor-pointer"
                      onClick={() => router.push(`/drivers/${report.driverId}/ranking`)}
                    >
                      <td className="px-3 py-2 font-medium text-ink-faint">{index + 1}</td>
                      <td className="px-3 py-2">
                        <p className="text-[13px] font-medium text-ink">{report.driverName}</p>
                        <p className="text-[11px] text-ink-faint">
                          {report.trips} chuyến · {report.orders} đơn · {report.distanceKm} km
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <StatusLabel tone={driverStatusTone(report.status)}>
                          {driverStatusLabel(report.status)}
                        </StatusLabel>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">
                        {scoreOf(report)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusLabel tone={riskOf(report).tone}>{riskOf(report).label}</StatusLabel>
                      </td>
                    </tr>
                  ))}
              </TableState>
            </tbody>
          </table>
        </DataState>
      </EditorialSection>

      <EditorialSection
        title="Danh sách tài xế"
        eyebrow="Quyền gán chuyến, xem hồ sơ"
      >
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <Input
            type="search"
            placeholder="Tìm tên, mã, số điện thoại"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            className="w-64 h-9"
          />
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as Driver['status'] | 'ALL');
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            className="h-9 w-48"
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] font-medium"
            onClick={() => {
              setFilter('');
              setStatusFilter('ALL');
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
        <DataState loading={loading} empty={!loading && sortedDrivers.length === 0}>
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Tên
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Điện thoại
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Trạng thái
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Điều kiện
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <TableState
                loading={loading}
                empty={!loading && sortedDrivers.length === 0}
                onRetry={load}
                colSpan={4}
                emptyContent={
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-ink-faint">
                      Không tìm thấy tài xế.
                    </td>
                  </tr>
                }
                error={error ? new Error(error) : undefined}
              >
                {paged.map((d) => (
                  <tr
                    key={d.id}
                    className="hover:bg-surface-alt cursor-pointer"
                    onClick={() => router.push(`/drivers/${d.id}/ranking`)}
                  >
                    <td className="px-3 py-2">
                      <p className="text-[13px] font-medium text-ink">{d.name}</p>
                      <p className="text-[11px] text-ink-faint">
                        {d.code} · Ký sự {d.licenseClass} · {formatDateTimeVN(d.joinedAt)}
                      </p>
                    </td>
                    <td className="px-3 py-2">{d.phone}</td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={driverStatusTone(d.status)}>
                        {driverStatusLabel(d.status)}
                      </StatusLabel>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <p className="text-[13px] font-medium text-ink">{d.tripsThisMonth}</p>
                      <p className="text-[11px] text-ink-faint">{formatCurrency(d.codOnHand)}</p>
                    </td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex justify-center py-3">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </DataState>
      </EditorialSection>
    </div>
  );
}
