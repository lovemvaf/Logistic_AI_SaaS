'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useMemo } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import type { EditorialMetric } from 'ui-kit';
import {
  Button,
  Input,
  Modal,
  Pagination,
  Select,
  TableState,
} from 'ui-components';
import type { Driver, Trip, TripStatus, Vehicle, SosAlert, Warehouse } from '@/lib/mock';
import {
  tripStatusLabel,
  tripStatusTone,
  driverStatusLabel,
  vehicleStatusLabel,
  warehouseStatusTone,
  formatCurrency,
  formatDateTimeVN,
  formatNumber,
} from '@/lib/labels';

/** Toast chỉ là kết nối vào `ToastHost` mount ở root layout. */
const toast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') =>
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type } }));

// Trật tự sắp xếp và màu sắc dùng trong hàm, không phải raw string.
const TRIP_STATUS_ORDER: Record<TripStatus, number> = {
  PLANNED: 0,
  DISPATCHED: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

const TRIP_LINE_TONE: Record<TripStatus, string> = {
  PLANNED: '#62665c',
  DISPATCHED: '#4c6570',
  IN_PROGRESS: '#3f6b4f',
  COMPLETED: '#3f6b4f',
  CANCELLED: '#62665c',
};

// Bản đồ chỉ render phía client, không import module ở server.
const LeafletMap: any = dynamic(
  (() =>
    import('map-components').then((m) => m.LeafletMap).catch(() => () => <div className="h-full w-full bg-surface-alt" />)
  ) as any,
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-surface text-ink-faint text-[12px] font-medium">
        Đang tải bản đồ Leaflet
      </div>
    ),
  },
);

const DongNaiRouteMap: any = dynamic(
  (() =>
    import('map-components').then((m) => m.DongNaiRouteMap)
  ) as any,
  {
    ssr: false,
    loading: () => (
      <div className="h-[380px] w-full flex items-center justify-center rounded-lg border border-line bg-surface-alt text-ink-faint text-[12px] font-medium">
        Đang tải bản đồ hành lang Đồng Nai...
      </div>
    ),
  },
);

/** Trạng thái sắp xếp: role DRIVER thấy toàn bộ chưa assign, not self-filter. */
const PAGE_SIZE = 10;

/** Thông tin so sánh sau khi tính toán tối ưu của AI. */
type RouteOptimization = {
  tripId: string;
  plannedDistanceKm: number;
  plannedDurationMin: number;
  optimizedDistanceKm: number;
  optimizedDurationMin: number;
};

export default function DispatchTowerPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [openAlerts, setOpenAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => trips.find((t) => t.id === selectedId) ?? null, [trips, selectedId]);
  const [mapView, setMapView] = useState<'corridor' | 'leaflet'>('corridor');

  // LONG actions
  const [mutating, setMutating] = useState<Record<string, boolean>>({});
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [optimization, setOptimization] = useState<RouteOptimization | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ driverId: '', vehicleId: '' });
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'ALL'>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const statusList: TripStatus[] = ['PLANNED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [tripsRes, driversRes, vehiclesRes, warehousesRes, alertsRes] = await Promise.all([
        data.trips.list(),
        data.drivers.list(),
        data.vehicles.list(),
        data.warehouses.list(),
        data.sosAlerts.list(),
      ]);
      setTrips(tripsRes);
      setDrivers(driversRes);
      setVehicles(vehiclesRes);
      setWarehouses(warehousesRes);
      setOpenAlerts(alertsRes.filter((a) => a.status !== 'RESOLVED'));
    } catch (err: any) {
      setError(err?.message || 'Không tải được dữ liệu điều phối.');
      setTrips([]);
      setDrivers([]);
      setVehicles([]);
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const after = (id: string, next: Trip) => {
    setTrips((prev) => prev.map((t) => (t.id === id ? next : t)));
  };

  const metrics = useMemo<EditorialMetric[]>(() => {
    const running = trips.filter((t) => t.status === 'IN_PROGRESS');
    const remainingStops = trips
      .filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
      .reduce((a, t) => a + t.stops.filter((s) => s.status === 'PENDING').length, 0);
    const codOnVehicle = trips.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'DISPATCHED').reduce((a, t) => a + t.codCollected, 0);
    return [
      { label: 'Đang chạy', value: running.length, meta: `${running.length} chuyến ngoài đường` },
      { label: 'Điểm dừng còn lại', value: remainingStops, meta: 'chưa giao trong ngày' },
      { label: 'COD trên xe', value: formatCurrency(codOnVehicle), meta: 'tiền thu chưa nộp' },
      { label: 'Cảnh báo mở', value: openAlerts.length, tone: openAlerts.length > 0 ? 'danger' : 'success', meta: openAlerts.length > 0 ? 'cần xử lý ngay' : 'toàn bộ xử lý xong' },
    ];
  }, [trips, openAlerts]);

  const sortedTrips = useMemo(() => {
    const rows = trips.slice();
    rows.sort((a, b) => {
      const ka = TRIP_STATUS_ORDER[a.status];
      const kb = TRIP_STATUS_ORDER[b.status];
      if (ka !== kb) return ka - kb;
      return new Date(b.startedAt ?? b.createdAt).getTime() - new Date(a.startedAt ?? a.createdAt).getTime();
    });
    const term = filter.toLowerCase().trim();
    if (term) {
      return rows.filter(
        (t) =>
          t.code.toLowerCase().includes(term) ||
          t.vehiclePlate.toLowerCase().includes(term) ||
          t.driverName.toLowerCase().includes(term) ||
          t.stops.some((s) => s.orderTrackingCode.toLowerCase().includes(term)),
      );
    }
    const filtered = statusFilter === 'ALL' ? rows : rows.filter((t) => t.status === statusFilter);
    return warehouseFilter === 'ALL' ? filtered : filtered.filter((t) => t.warehouseCode === warehouseFilter);
  }, [trips, filter, statusFilter, warehouseFilter]);

  const paged = useMemo(() => sortedTrips.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sortedTrips, page]);
  const totalPages = Math.max(1, Math.ceil(sortedTrips.length / PAGE_SIZE));

  const handleAssign = async () => {
    if (!selected) return;
    if (!assignForm.driverId || !assignForm.vehicleId) {
      toast('Vui lòng chọn đủ tài xế và xe.', 'warning');
      return;
    }
    setMutating((m) => ({ ...m, [selected.id]: true }));
    try {
      const repo = await data.trips.assign({ tripId: selected.id, driverId: assignForm.driverId, vehicleId: assignForm.vehicleId });
      after(selected.id, repo);
      setAssignOpen(false);
      setAssignForm({ driverId: '', vehicleId: '' });
      toast(`Phân công ${repo.code} thành công.`, 'success');
      await load();
    } catch (err: any) {
      toast(err?.message || 'Không phân công được chuyến.', 'error');
    } finally {
      setMutating((m) => ({ ...m, [selected.id]: false }));
    }
  };

  const handleOptimize = async (trip: Trip) => {
    setOptimizingId(trip.id);
    const before = { distance: Number(trip.plannedDistanceKm), duration: Number(trip.plannedDurationMin) };
    try {
      const repo = await data.trips.optimize(trip.id);
      after(trip.id, repo);
      setOptimization({
        tripId: trip.id,
        plannedDistanceKm: before.distance,
        plannedDurationMin: before.duration,
        optimizedDistanceKm: Number(repo.plannedDistanceKm),
        optimizedDurationMin: Number(repo.plannedDurationMin),
      });
      toast(
        `Tối ưu ${repo.code}: giảm ${formatNumber(before.distance - Number(repo.plannedDistanceKm))} km, tiết kiệm ${before.duration - Number(repo.plannedDurationMin)} phút.`,
        'success',
      );
    } catch (err: any) {
      toast(err?.message || 'Không tối ưu được chuyến.', 'error');
    } finally {
      setOptimizingId(null);
    }
  };

  const handleStart = async (trip: Trip) => {
    setMutating((m) => ({ ...m, [trip.id]: true }));
    try {
      const repo = await data.trips.start(trip.id);
      after(trip.id, repo);
      toast(`Chuyến ${repo.code} bắt đầu chạy.`, 'success');
    } catch (err: any) {
      toast(err?.message || 'không thể bắt chuyến.', 'error');
    } finally {
      setMutating((m) => ({ ...m, [trip.id]: false }));
    }
  };

  const handleComplete = async (trip: Trip) => {
    setMutating((m) => ({ ...m, [trip.id]: true }));
    try {
      const repo = await data.trips.complete(trip.id);
      after(trip.id, repo);
      toast(`Đóng chuyến ${repo.code} thành công.`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Không thể đóng chuyến.', 'error');
    } finally {
      setMutating((m) => ({ ...m, [trip.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Vận tải"
        title="Điều phối chuyến"
        description="Theo dõi đoàn xe đang chạy, phân công tài xế, tối ưu lộ trình, đóng chuyến và ghi nhận POD."
        meta={`${trips.length} chuyến · ${openAlerts.length} cảnh báo mở`}
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      <MetricBand metrics={metrics} />

      <EditorialSection title="Danh sách chuyến" eyebrow="Bộ lọc + tìm">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="search"
            placeholder="Tìm mã chuyến, biển số, tài xế, đơn hàng"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            className="w-64 h-9"
          />
          <Select
            className="h-9 min-w-[9rem]"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as TripStatus | 'ALL');
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'Tất cả trạng thái' },
              ...statusList.map((s) => ({ value: s, label: tripStatusLabel(s) })),
            ]}
          />
          <Select
            className="h-9 min-w-[10rem]"
            value={warehouseFilter}
            onChange={(e) => {
              setWarehouseFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'Tất cả kho' },
              ...warehouses.map((w) => ({ value: w.code, label: `${w.code} · ${w.name}` })),
            ]}
          />
        </div>
      </EditorialSection>

      <EditorialSection
        title="Bản đồ"
        action={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMapView('corridor')}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                mapView === 'corridor' ? 'bg-accent text-white' : 'border border-line text-ink-soft hover:text-ink'
              }`}
            >
              Hành lang Đồng Nai
            </button>
            <button
              type="button"
              onClick={() => setMapView('leaflet')}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                mapView === 'leaflet' ? 'bg-accent text-white' : 'border border-line text-ink-soft hover:text-ink'
              }`}
            >
              Bản đồ Leaflet
            </button>
          </div>
        }
      >
        {(() => {
          const activeTripForMap = selected ?? sortedTrips[0] ?? null;
          const mapStops = (activeTripForMap?.stops ?? []).filter(
            (s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)),
          );
          const allStops = sortedTrips.flatMap((t) =>
            t.stops.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))),
          );
          const centerLat = Number(mapStops[0]?.lat ?? allStops[0]?.lat ?? 10.875);
          const centerLng = Number(mapStops[0]?.lng ?? allStops[0]?.lng ?? 106.905);

          return (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 min-w-0">
                {mapView === 'corridor' ? (
                  <DongNaiRouteMap
                    title={
                      activeTripForMap
                        ? `Tuyến ${activeTripForMap.code} · ${activeTripForMap.vehiclePlate || 'Container / Tải'}`
                        : 'Bản đồ Điều phối Hành lang Đồng Nai'
                    }
                    subtitle={
                      activeTripForMap
                        ? `${activeTripForMap.driverName || 'Chưa phân công'} · ${activeTripForMap.stops.length} điểm giao`
                        : 'Chọn một chuyến trong bảng bên cạnh để mô phỏng và theo dõi tuyến đường'
                    }
                    stops={mapStops.map((s) => ({
                      id: s.id,
                      name: s.orderTrackingCode,
                      locality: s.customerName,
                      lat: Number(s.lat),
                      lng: Number(s.lng),
                      status: s.status === 'DELIVERED' ? 'COMPLETED' : s.status === 'FAILED' ? 'DELAYED' : 'CURRENT',
                      eta: s.eta,
                      sequence: s.sequence,
                    }))}
                    polylines={sortedTrips
                      .filter((t) => t.stops.some((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))))
                      .slice(0, 6)
                      .map((t) => ({
                        id: t.id,
                        label: t.code,
                        active: activeTripForMap?.id === t.id,
                        color: (TRIP_LINE_TONE as Record<TripStatus, string>)[t.status] || '#2f4a3c',
                        points: t.stops
                          .filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
                          .map((s) => ({ lat: Number(s.lat), lng: Number(s.lng), label: s.orderTrackingCode })),
                      }))}
                    interactivePlayback={mapStops.length >= 2}
                    isSimulatedRoute
                    showAllHubs
                    showCorridors
                    height={430}
                  />
                ) : (
                  <div className="h-[480px] rounded-lg border border-line overflow-hidden">
                    <LeafletMap
                      center={[centerLat, centerLng]}
                      zoom={11}
                      markers={allStops.map((s) => ({
                        id: s.id,
                        lat: Number(s.lat),
                        lng: Number(s.lng),
                        label: `${s.orderTrackingCode} · ${s.customerName}`,
                      }))}
                      polylines={sortedTrips
                        .map((t) => ({
                          color: (TRIP_LINE_TONE as Record<TripStatus, string>)[t.status],
                          points: t.stops
                            .filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
                            .map((s) => [Number(s.lat), Number(s.lng)] as [number, number]),
                        }))
                        .filter((line) => line.points.length >= 2)}
                    />
                  </div>
                )}
              </div>
              <div className="w-full lg:w-[348px] shrink-0 overflow-auto max-h-[540px]">
                <table className="min-w-full divide-y divide-line">
                  <thead className="bg-surface-alt">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Chuyến</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tài xế</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Trạng thái</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Kho</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-[13px]">
                    <TableState
                      loading={loading}
                      empty={!loading && sortedTrips.length === 0}
                      onRetry={load}
                      colSpan={4}
                      error={error ? new Error(error) : undefined}
                      emptyContent={<tr><td colSpan={4} className="px-3 py-6 text-center text-ink-faint">Chưa có chuyến nào khớp bộ lọc.</td></tr>}
                    >
                      {paged.map((t) => (
                        <tr
                          key={t.id}
                          className={`${(selectedId ?? activeTripForMap?.id) === t.id ? 'bg-accent-soft' : ''} transition-colors hover:bg-surface-alt cursor-pointer`}
                          onClick={() => setSelectedId(t.id)}
                        >
                          <td className="px-3 py-2 font-medium text-ink">
                            <div>{t.code}</div>
                            <div className="font-mono text-[11px] text-ink-faint">{t.vehiclePlate}</div>
                          </td>
                          <td className="px-3 py-2">{t.driverName}</td>
                          <td className="px-3 py-2"><StatusLabel tone={tripStatusTone(t.status)}>{tripStatusLabel(t.status)}</StatusLabel></td>
                          <td className="px-3 py-2">
                            <StatusLabel tone={warehouseStatusTone(warehouses.find((w) => w.code === t.warehouseCode || w.id === t.warehouseCode)?.status ?? 'ACTIVE')}>
                              {t.warehouseCode || '—'}
                            </StatusLabel>
                          </td>
                        </tr>
                      ))}
                    </TableState>
                  </tbody>
                </table>
                <div className="flex justify-center py-3">
                  <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              </div>
            </div>
          );
        })()}
      </EditorialSection>

      <EditorialSection
        title="Chi tiết chuyến"
        action={selected ? <StatusLabel tone={tripStatusTone(selected.status)}>{tripStatusLabel(selected.status)}</StatusLabel> : <StatusLabel>Chọn một chuyến</StatusLabel>}
        eyebrow="Thông tin chuyến đang chọn"
      >
        {selected ? (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2 space-y-3">
              <div className="p-3 border border-line bg-surface">
                <p className="text-[11px] font-medium text-ink-faint uppercase">Mã chuyến</p>
                <p className="text-[15px] font-semibold text-ink">{selected.code}</p>
              </div>
              <div className="p-3 border border-line bg-surface">
                <p className="text-[11px] font-medium text-ink-faint uppercase">Tài xế</p>
                <p className="text-[15px] font-semibold text-ink">{selected.driverName || 'Chưa phân công'}</p>
              </div>
              <div className="p-3 border border-line bg-surface">
                <p className="text-[11px] font-medium text-ink-faint uppercase">Xe</p>
                <p className="text-[15px] font-semibold text-ink">{selected.vehiclePlate}</p>
              </div>
              <div className="p-3 border border-line bg-surface">
                <p className="text-[11px] font-medium text-ink-faint uppercase">COD thu</p>
                <p className="text-[15px] font-semibold text-ink">{formatCurrency(selected.codCollected)}</p>
              </div>
              <div className="p-3 border border-line bg-surface">
                <p className="text-[11px] font-medium text-ink-faint uppercase">Quãng đường</p>
                <p className="text-[15px] font-semibold text-ink tabular-nums">
                  {formatNumber(selected.plannedDistanceKm)} km / thực {formatNumber(selected.actualDistanceKm)} km
                </p>
              </div>
              <div className="p-3 border border-line bg-surface">
                <p className="text-[11px] font-medium text-ink-faint uppercase">Thời gian</p>
                <p className="text-[13px] text-ink">{formatDateTimeVN(selected.startedAt)}</p>
              </div>
              <div className="p-3 border border-line bg-surface">
                <p className="text-[11px] font-medium text-ink-faint uppercase">Số điểm dừng</p>
                <p className="text-[15px] font-semibold text-ink tabular-nums">
                  {selected.stops.length} <span className="text-ink-faint text-[13px]">/ {selected.stops.filter((s) => s.status === 'PENDING').length} còn lại</span>
                </p>
              </div>
            </div>
            <div className="md:col-span-4">
              <div className="border border-line bg-surface p-3 mb-3">
                <table className="min-w-full divide-y divide-line">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Trình tự</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Đơn hàng</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Người nhận</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">ETA</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-[13px]">
                    {[...selected.stops].sort((a, b) => a.sequence - b.sequence).map((s) => (
                      <tr key={s.id} className="hover:bg-surface-alt">
                        <td className="px-3 py-2 font-medium text-ink">{s.sequence}</td>
                        <td className="px-3 py-2 font-mono text-[12px]">{s.orderTrackingCode}</td>
                        <td className="px-3 py-2">{s.customerName}</td>
                        <td className="px-3 py-2 tabular-nums">{formatDateTimeVN(s.eta)}</td>
                        <td className="px-3 py-2">
                          <StatusLabel tone={s.status === 'PENDING' ? 'neutral' : s.status === 'DELIVERED' ? 'success' : 'danger'}>
                            {s.status === 'PENDING' ? 'Chờ giao' : s.status === 'DELIVERED' ? 'Đã giao' : 'Giao thất bại'}
                          </StatusLabel>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!selected.driverName && (
                  <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={() => setAssignOpen(true)}>
                    Phân công tài xế + xe
                  </Button>
                )}
                {selected.driverName && selected.status !== 'COMPLETED' && selected.status !== 'CANCELLED' && (
                  <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={() => setAssignOpen(true)}>
                    Đổi tài xế / xe
                  </Button>
                )}
                {selected.status !== 'COMPLETED' && selected.status !== 'CANCELLED' && (
                  <Button
                    variant={selected.optimized ? 'outline' : 'primary'}
                    size="sm"
                    className="text-[11px] font-medium"
                    onClick={() => handleOptimize(selected)}
                    disabled={optimizingId === selected.id || selected.optimized}
                  >
                    {optimizingId === selected.id ? 'Đang tối ưu' : selected.optimized ? 'Đã tối ưu' : 'Tối ưu lộ trình'}
                  </Button>
                )}
                {selected.optimized && <StatusLabel tone="success">Đã tối ưu</StatusLabel>}
                <Button
                  variant="primary"
                  size="sm"
                  className="text-[11px] font-medium"
                  onClick={() => handleStart(selected)}
                  disabled={mutating[selected.id] || (selected.status !== 'PLANNED' && selected.status !== 'DISPATCHED')}
                >
                  Bắt đầu
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="text-[11px] font-medium"
                  onClick={() => handleComplete(selected)}
                  disabled={mutating[selected.id] || selected.status !== 'IN_PROGRESS'}
                >
                  Đóng chuyến
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyNote>Chọn một chuyến từ danh sách để xem chi tiết, phân công, tối ưu và đóng chuyến.</EmptyNote>
        )}
      </EditorialSection>

      {optimization ? (
        <EditorialSection
          title="Tính toán lộ trình AI"
          action={<StatusLabel tone="success">Đã tính toán hôm nay</StatusLabel>}
          eyebrow="Kế hoạch phương án thực tế"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-3 border border-line bg-surface">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Distance</p>
              <p className="text-[15px] font-semibold text-ink tabular-nums">
                {formatNumber(optimization.plannedDistanceKm)} km
              </p>
              <p className="text-[11px] text-ink-faint">Kế hoạch cũ</p>
            </div>
            <div className="p-3 border border-line bg-surface">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Thời gian</p>
              <p className="text-[15px] font-semibold text-ink tabular-nums">
                {optimization.plannedDurationMin} phút
              </p>
              <p className="text-[11px] text-ink-faint">Kế hoạch cũ</p>
            </div>
            <div className="p-3 border border-lime border-line bg-surface">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Tối ưu</p>
              <p className="text-[15px] font-semibold text-success tabular-nums">
                {formatNumber(optimization.optimizedDistanceKm)} km
              </p>
              <p className="text-[11px] text-ink-faint">
                giảm {formatNumber(optimization.plannedDistanceKm - optimization.optimizedDistanceKm)} km ({formatNumber(Math.round(((optimization.plannedDistanceKm - optimization.optimizedDistanceKm) / optimization.plannedDistanceKm) * 100))}%)
              </p>
            </div>
            <div className="p-3 border border-success border-line bg-surface">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Thời gian</p>
              <p className="text-[15px] font-semibold text-success tabular-nums">
                {optimization.optimizedDurationMin} phút
              </p>
              <p className="text-[11px] text-ink-faint">
                tiết kiệm {optimization.plannedDurationMin - optimization.optimizedDurationMin} phút
              </p>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-ink-faint leading-5">
            Kết quả tối ưu dùng thuật toán VRP-IR, giả định không ràng buộc thời gian giao hàng, mức nhiên liệu hiện tại theo báo cáo xe và tình trạng đường bộ khu vực biên soạn.
          </p>
        </EditorialSection>
      ) : (
        <EditorialSection title="Tính toán lộ trình AI" eyebrow="Chọn một chuyến rồi nhấn Tối ưu lộ trình">
          <EmptyNote>Chưa có kết quả nào; chọn chuyến và nhấn Tối ưu lộ trình để AI sinh kế hoạch mới.</EmptyNote>
        </EditorialSection>
      )}

      {assignOpen && (
        <Modal isOpen={assignOpen} onClose={() => setAssignOpen(false)} title="Phân công chuyến">
          <p className="text-[13px] text-ink-soft mb-4">
            Gán tài xế và xe cho <span className="font-semibold text-ink">{selected?.code}</span>
          </p>
          <div className="space-y-3">
            <Select
              label="Tài xế"
              value={assignForm.driverId}
              onChange={(e) => setAssignForm((f) => ({ ...f, driverId: e.target.value }))}
              options={drivers.filter((d) => d.status === 'AVAILABLE').map((d) => ({ value: d.id, label: `${d.name} (${driverStatusLabel(d.status)})` }))}
            />
            <Select
              label="Xe"
              value={assignForm.vehicleId}
              onChange={(e) => setAssignForm((f) => ({ ...f, vehicleId: e.target.value }))}
              options={vehicles.filter((v) => v.status === 'AVAILABLE').map((v) => ({ value: v.id, label: `${v.plate} (${vehicleStatusLabel(v.status)})` }))}
            />
            <Button variant="primary" className="text-[11px] font-medium" onClick={handleAssign} disabled={mutating[selectedId as string] || !assignForm.driverId || !assignForm.vehicleId}>
              Xác nhận phân công
            </Button>
            <Button variant="ghost" className="text-[11px] font-medium" onClick={() => setAssignOpen(false)}>
              Hủy
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
