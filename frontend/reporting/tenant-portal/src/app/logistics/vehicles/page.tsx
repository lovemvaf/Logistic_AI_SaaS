'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import { Button, DataState, Input, Pagination, Select, TableState } from 'ui-components';
import type { ReportFleetVehicle, Vehicle } from '@/lib/mock';
import {
  formatCurrency,
  formatDateVN,
  formatNumber,
  vehicleStatusLabel,
  vehicleStatusTone,
} from '@/lib/labels';

const PAGE_SIZE = 12;

const PERIOD = new Date().toISOString().slice(0, 7);

function costPerKm(vehicle?: ReportFleetVehicle) {
  return vehicle && vehicle.distanceKm > 0
    ? Math.round(vehicle.fuelCost / vehicle.distanceKm)
    : 0;
}

/** Xe ghi nhận chi phí/km cao hơn trung bình đội 125% thì đánh dấu nhiệt. */
function thermalOf(fleet: ReportFleetVehicle[], vehicle: ReportFleetVehicle) {
  if (!vehicle || vehicle.fuelCost <= 0) return null;
  const avg = fleet.length === 0 ? 0 : Math.round(fleet.reduce((s, v) => s + costPerKm(v), 0) / Math.max(1, fleet.length));
  return costPerKm(vehicle) > avg * 1.25 ? 'Trên định mức' : 'Đưới định mức';
}

export default function VehiclesPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleet, setFleet] = useState<ReportFleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Vehicle['status'] | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [vehiclesRes, fleetRes] = await Promise.all([
        data.vehicles.list(),
        data.reports.fleet({ period: PERIOD }),
      ]);
      setVehicles(vehiclesRes);
      setFleet(fleetRes.byVehicle);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được dữ liệu đội xe.';
      setError(msg);
      setVehicles([]);
      setFleet([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sortedVehicles = useMemo(() => {
    const rows = vehicles.slice();
    const term = filter.toLowerCase().trim();
    const filtered = statusFilter === 'ALL' ? rows : rows.filter((v) => v.status === statusFilter);
    if (term) {
      return filtered.filter((v) => v.plate.toLowerCase().includes(term));
    }
    return filtered;
  }, [vehicles, filter, statusFilter]);

  const paged = useMemo(
    () => sortedVehicles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedVehicles, page],
  );
  const totalPages = Math.max(1, Math.ceil(sortedVehicles.length / PAGE_SIZE));

  const metrics = [
    { label: 'Đang vận hành', value: vehicles.filter((v) => v.status === 'IN_USE').length, meta: 'xe trên đường' },
    { label: 'Sẵn sàng', value: vehicles.filter((v) => v.status === 'AVAILABLE').length, meta: 'chờ chuyến' },
    { label: 'Bảo trì', value: vehicles.filter((v) => v.status === 'MAINTENANCE').length, meta: 'ngừng xe', tone: undefined },
    { label: 'Vượt hạn bảo hiểm', value: formatNumber(vehicles.filter((v) => new Date(v.insuranceExpiry).getTime() < new Date().getTime()).length), meta: 'so với hôm nay' },
  ];

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Vận tải"
        title="Phương tiện"
        description="Theo dõi đội xe, ghi nhận bảo trì, lưu lượng nhiên liệu và chi phí vận hành trên mỗi chuyến."
        meta={`${vehicles.length} phương tiện`}
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      <MetricBand metrics={metrics} />

      <EditorialSection
        title="Phân tích chi phí theo xe"
        eyebrow={`Tháng ${PERIOD}`}
        action={
          <Button variant="ghost" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      >
        <DataState loading={loading} empty={!loading && fleet.length === 0}>
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Biển số
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Loại
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Chuyến
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Quãng đường
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Nhiên liệu
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Bảo trì
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Định mức
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <TableState
                loading={loading}
                empty={!loading && fleet.length === 0}
                onRetry={load}
                colSpan={7}
                emptyContent={
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-ink-faint">
                      Chưa có dữ liệu phân tích nào cho tháng {PERIOD}.
                    </td>
                  </tr>
                }
                error={error ? new Error(error) : undefined}
              >
                {fleet.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    className="hover:bg-surface-alt cursor-pointer"
                    onClick={() => router.push(`/logistics/vehicles/${vehicle.id}/fuel`)}
                  >
                    <td className="px-3 py-2 font-medium text-ink">{vehicle.plate}</td>
                    <td className="px-3 py-2 text-ink-soft">{vehicle.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(vehicle.trips)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(vehicle.distanceKm)} km</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(vehicle.fuelCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(vehicle.maintenanceCost)}</td>
                    <td className="px-3 py-2">
                      {thermalOf(fleet, vehicle) ? (
                        <StatusLabel tone={thermalOf(fleet, vehicle) === 'Trên định mức' ? 'warning' : 'success'}>
                          {thermalOf(fleet, vehicle)}
                        </StatusLabel>
                      ) : (
                        <StatusLabel tone="neutral">Chưa ghi nhận</StatusLabel>
                      )}
                    </td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
        </DataState>
      </EditorialSection>

      <EditorialSection title="Danh sách xe">
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <Input
            type="search"
            placeholder="Tìm biển số xe"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            className="w-64 h-9"
          />
          <Select
            className="h-9 min-w-[11rem]"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as Vehicle['status'] | 'ALL');
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'Tất cả trạng thái' },
              { value: 'AVAILABLE', label: vehicleStatusLabel('AVAILABLE') },
              { value: 'IN_USE', label: vehicleStatusLabel('IN_USE') },
              { value: 'MAINTENANCE', label: vehicleStatusLabel('MAINTENANCE') },
            ]}
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
        <DataState loading={loading} empty={!loading && sortedVehicles.length === 0}>
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Biển số
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Loại xe
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Dung tích
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Tình trạng
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Km đồng hồ
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Hạn bảo hiểm
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <TableState
                loading={loading}
                empty={!loading && paged.length === 0}
                onRetry={load}
                colSpan={6}
                emptyContent={
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-ink-faint">
                      Không tìm thấy xe.
                    </td>
                  </tr>
                }
                error={error ? new Error(error) : undefined}
              >
                {paged.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-surface-alt cursor-pointer"
                    onClick={() => router.push(`/logistics/vehicles/${v.id}/fuel`)}
                  >
                    <td className="px-3 py-2 font-medium text-ink">{v.plate}</td>
                    <td className="px-3 py-2 text-ink-soft">{v.type}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {formatNumber(v.capacityKg)} kg · {formatNumber(v.capacityCbm)} m³
                    </td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={vehicleStatusTone(v.status)}>{vehicleStatusLabel(v.status)}</StatusLabel>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(v.odometerKm)} km</td>
                    <td className="px-3 py-2">{formatDateVN(v.insuranceExpiry)}</td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
          <div className="flex justify-center py-3">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </DataState>
      </EditorialSection>
    </div>
  );
}
