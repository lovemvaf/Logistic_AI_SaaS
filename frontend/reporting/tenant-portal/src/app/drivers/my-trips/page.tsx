'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import type { EditorialMetric } from 'ui-kit';
import { Button, DataState, TableState } from 'ui-components';
import type { Driver, Trip } from '@/lib/mock';
import {
  driverStatusLabel,
  driverStatusTone,
  formatCurrency,
  formatDateTimeVN,
  formatNumber,
  tripStatusLabel,
  tripStatusTone,
} from '@/lib/labels';

const PERIOD = new Date().toISOString().slice(0, 7);

export default function MyTripsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const driver = useMemo(
    () =>
      drivers.find((d) => d.name === user?.fullName) ??
      drivers.find((d) => d.id === user?.id),
    [drivers, user?.fullName, user?.id],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [driversRes, tripsRes] = await Promise.all([data.drivers.list(), data.trips.list()]);
      setDrivers(driversRes);
      setTrips(tripsRes);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được chuyến của bạn.';
      setError(msg);
      setDrivers([]);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const myTrips = useMemo(
    () =>
      trips
        .filter((t) => t.driverId === driver?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [trips, driver?.id],
  );

  const completed = myTrips.filter((t) => t.status === 'COMPLETED');
  const active = myTrips.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'DISPATCHED');

  const metrics: EditorialMetric[] = [
    { label: 'Chuyến hôm nay', value: myTrips.filter((t) => t.createdAt.startsWith(PERIOD)).length, meta: 'chưa vận chuyển' },
    { label: 'Đã hoàn thành', value: completed.length, meta: 'tháng này' },
    { label: 'Chưa hoàn thành', value: active.length, meta: 'cần kết thúc' },
    { label: 'Giao hàng', value: formatNumber(myTrips.reduce((total, t) => total + t.stops.length, 0)), meta: 'tổng điểm giao' },
  ];

  const confirmComplete = async (id: string) => {
    if (confirmId !== id) return;
    try {
      await data.trips.complete(id);
    } catch (err: any) {
      setError(err?.message || 'Không thể kết thúc chuyến.');
      return;
    }
    setConfirmId(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Chuyến của tôi"
        title="Tài xế"
        description="Chuyến thuộc về tài xế của bạn, trạng thái, điểm giao chưa hoàn thành và COD."
        meta={
          driver ? (
            <StatusLabel tone={driverStatusTone(driver.status)}>
              {driverStatusLabel(driver.status)}
            </StatusLabel>
          ) : undefined
        }
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      {!driver ? (
        <EditorialSection title="Chưa liên kết tài xế">
          <EmptyNote>
            Tài khoản này chưa liên kết với tài xế. Vui lòng liên hệ quản lý để gán.
          </EmptyNote>
        </EditorialSection>
      ) : (
        <>
          <MetricBand metrics={metrics} />

          <EditorialSection title="Chuyến gần đây">
            <DataState loading={loading} empty={!loading && myTrips.length === 0}>
              <table className="min-w-full divide-y divide-line text-[13px]">
                <thead className="bg-surface-alt">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Mã chuyến
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Khởi hành
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Trạng thái
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      Điểm giao
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      Thu COD
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <TableState
                    loading={loading}
                    empty={!loading && myTrips.length === 0}
                    onRetry={load}
                    colSpan={5}
                    emptyContent={
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-ink-faint">
                          Tài xế {driver?.name ?? ''} chưa có chuyến nào.
                        </td>
                      </tr>
                    }
                    error={error ? new Error(error) : undefined}
                  >
                    {myTrips.map((trip) => (
                      <tr
                        key={trip.id}
                        className="hover:bg-surface-alt cursor-pointer"
                        onClick={() => router.push(`/logistics/trips/${trip.id}/pod`)}
                      >
                        <td className="px-3 py-2">
                          <p className="text-[13px] font-medium text-ink">{trip.code}</p>
                          <p className="text-[11px] text-ink-faint">
                            <span className="font-mono">{trip.driverName}</span>
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-[13px] font-medium text-ink">
                            {new Date(trip.createdAt).toLocaleDateString('vi-VN')}
                          </p>
                          <p className="text-[11px] text-ink-faint">
                            {formatDateTimeVN(trip.startedAt ?? trip.createdAt)}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <StatusLabel tone={tripStatusTone(trip.status)}>
                            {tripStatusLabel(trip.status)}
                          </StatusLabel>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span className="text-[13px] font-medium text-ink">
                            {trip.stops.length}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-faint">
                          {formatCurrency(trip.codCollected)}
                        </td>
                      </tr>
                    ))}
                  </TableState>
                </tbody>
              </table>
            </DataState>
          </EditorialSection>

          {active.length > 0 && (
            <EditorialSection title="Chuyến đang hoạt động">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {active.map((trip) => (
                  <div
                    key={trip.id}
                    className="border border-line bg-surface p-3 hover:bg-surface-alt transition-colors"
                    onClick={() => router.push(`/logistics/trips/${trip.id}/pod`)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[13px] font-medium text-ink">{trip.code}</p>
                        <p className="text-[11px] text-ink-faint">
                          {trip.stops.length} điểm giao · {Math.round(trip.actualDistanceKm)} km
                        </p>
                      </div>
                      <StatusLabel tone={tripStatusTone(trip.status)}>
                        {tripStatusLabel(trip.status)}
                      </StatusLabel>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {trip.status === 'IN_PROGRESS' && confirmId !== trip.id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmId(trip.id);
                          }}
                        >
                          Kết thúc chuyến
                        </Button>
                      ) : null}
                      {trip.status === 'IN_PROGRESS' && confirmId === trip.id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            className="text-[11px] font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmComplete(trip.id);
                            }}
                          >
                            Xác nhận
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px] font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmId(null);
                            }}
                          >
                            Hủy
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </EditorialSection>
          )}
        </>
      )}
    </div>
  );
}
