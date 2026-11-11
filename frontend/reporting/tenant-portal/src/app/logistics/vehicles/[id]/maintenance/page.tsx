'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import { Button, DataState, Input, Select } from 'ui-components';
import type { MaintenanceType, ReportFleetVehicle, Vehicle } from '@/lib/mock';
import {
  formatCurrency,
  formatDateVN,
  formatDateTimeVN,
  formatNumber,
  maintenanceTypeLabel,
  vehicleStatusLabel,
  vehicleStatusTone,
} from '@/lib/labels';

const CURRENT = new Date().toISOString().slice(0, 7);
const PREVIOUS = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
})();

const MAINTENANCE_TYPES: MaintenanceType[] = [
  'OIL',
  'TIRE',
  'ENGINE',
  'BRAKE',
  'REGULAR',
  'RANDOM',
];

const PROVIDERS = [
  'Đại lý Đức Anh',
  'Dịch vụ So Faro',
  'Hãng Xăng Xe Trung Tâm',
  'JX Kia Parse',
  'Tự thực hiện',
];

/** Bảo trì trung bình một tháng của đội xe, <=0 khi không đủ dữ liệu. */
const avgMaintenanceCost = (fleet: ReportFleetVehicle[]) => {
  const total = fleet.reduce((sum, v) => sum + v.maintenanceCost, 0);
  return fleet.length === 0 ? 0 : Math.round(total / fleet.length);
};

export default function VehicleMaintenancePage() {
  const { id } = useParams();
  const vehicleId = Array.isArray(id) ? id[0] : id;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fleet, setFleet] = useState<ReportFleetVehicle[]>([]);
  const [previousFleet, setPreviousFleet] = useState<ReportFleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: '' as MaintenanceType | '',
    scheduledAt: new Date().toISOString().slice(0, 10),
    doneAt: new Date().toISOString().slice(0, 10),
    provider: '',
    cost: '',
    note: '',
  });

  const load = async () => {
    if (!vehicleId) return;
    setLoading(true);
    setError('');
    try {
      const [vehicleRes, current, previous] = await Promise.all([
        data.vehicles.get(vehicleId),
        data.reports.fleet({ period: CURRENT }),
        data.reports.fleet({ period: PREVIOUS }),
      ]);
      if (!vehicleRes) throw new Error('Không tìm thấy xe.');
      setVehicle(vehicleRes);
      setFleet(current.byVehicle);
      setPreviousFleet(previous.byVehicle);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được lịch bảo trì xe.';
      setError(msg);
      setVehicle(null);
      setFleet([]);
      setPreviousFleet([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [vehicleId]);

  const own = useMemo(() => fleet.find((row) => row.id === vehicleId), [fleet, vehicleId]);
  const previousOwn = useMemo(
    () => previousFleet.find((row) => row.id === vehicleId),
    [previousFleet, vehicleId],
  );

  const fleetAvgMaintenance = useMemo(() => avgMaintenanceCost(fleet), [fleet]);

  const handleSubmit = async () => {
    if (!vehicleId || !form.type || !form.cost) {
      setError('Vui lòng nhập loại bảo trì và chi phí.');
      return;
    }
    setSubmitting(true);
    try {
      await data.vehicles.maintenanceLog({
        vehicleId,
        type: form.type,
        scheduledAt: `${form.scheduledAt}T08:00:00`,
        cost: Number(form.cost),
        provider: form.provider,
        note: form.note,
        doneAt: new Date(form.doneAt).toISOString(),
      });
      setForm({
        type: '',
        scheduledAt: new Date().toISOString().slice(0, 10),
        doneAt: new Date().toISOString().slice(0, 10),
        provider: '',
        cost: '',
        note: '',
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Không ghi nhận được bảo trì.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Phương tiện"
        title={vehicle ? `${vehicle.plate}` : 'Chi tiết xe'}
        description="Ghi nhận bảo trì, so sánh chi phí thọ xe với trung bình đội qua tháng."
        meta={vehicle ? vehicleStatusLabel(vehicle.status) : ''}
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      {!vehicle ? (
        <EmptyNote>Không tìm thấy xe. Mở `/logistics/vehicles/{'['}id{']'}/maintenance`.</EmptyNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:gap-4 sm:grid-cols-4">
            <div className="rounded border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Biển số</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{vehicle.plate}</p>
            </div>
            <div className="rounded border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Loại xe</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{vehicle.type}</p>
            </div>
            <div className="rounded border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Bảo trì lần cuối</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{formatDateTimeVN(vehicle.lastServiceAt)}</p>
            </div>
            <div className="rounded border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Bảo hiểm</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{formatDateVN(vehicle.insuranceExpiry)}</p>
            </div>
          </div>

          <MetricBand
            metrics={[
              {
                label: 'Bảo trì tháng này',
                value: formatCurrency(own?.maintenanceCost),
                meta: 'chi phí theo xe',
              },
              {
                label: 'Trung bình đội',
                value: formatCurrency(fleetAvgMaintenance),
                meta: own ? formatCurrency(previousOwn?.maintenanceCost) : 'chưa có dữ liệu',
                tone: own && previousOwn && own.maintenanceCost > previousOwn.maintenanceCost ? 'warning' : 'success',
              },
              {
                label: 'Chờ bảo trì',
                value: own ? `${own.downtimeDays} ngày` : '—',
                meta: 'thời gian ngừng xe',
                tone: own && own.downtimeDays > 0 ? 'warning' : 'success',
              },
              {
                label: 'Chi phí trên km',
                value: own ? formatNumber(Math.round(own.maintenanceCost / Math.max(1, own.distanceKm))) : '—',
                meta: 'chỉ số hao mòn',
              },
            ]}
          />

          <EditorialSection title="Ghi nhận bảo trì">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <Select
                className="h-9"
                value={form.type}
                placeholder="Chọn loại"
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MaintenanceType }))}
                options={[
                  { value: '', label: '' },
                  ...MAINTENANCE_TYPES.map((type) => ({
                    value: type,
                    label: maintenanceTypeLabel(type),
                  })),
                ]}
              />
              <Input
                type="date"
                className="h-9"
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
              <Input
                type="date"
                className="h-9"
                value={form.doneAt}
                onChange={(e) => setForm((f) => ({ ...f, doneAt: e.target.value }))}
              />
              <Select
                className="h-9"
                value={form.provider}
                placeholder="Chọn nơi thực hiện"
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                options={[
                  { value: '', label: '' },
                  ...PROVIDERS.map((provider) => ({ value: provider, label: provider })),
                ]}
              />
              <Input
                type="number"
                className="h-9"
                placeholder="Chi phí (₫)"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
              <Button variant="primary" className="h-9" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Đang ghi nhận' : 'Ghi nhận'}
              </Button>
            </div>
          </EditorialSection>

          <EditorialSection title="Phân tích chi phí">
            <DataState loading={loading} empty={!loading && !own}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded border border-line bg-surface p-3">
                  <p className="text-[11px] font-medium text-ink-faint uppercase">Ghi nhận</p>
                  <p className="mt-1 text-[14px] text-ink">
                    {own ? `Bảo trì tháng ${CURRENT}: ${formatCurrency(own.maintenanceCost)}, ${formatNumber(own.distanceKm)} km, ${own.trips} chuyến.` : 'Chưa có dữ liệu bảo trì cho tháng này.'}
                  </p>
                </div>
                <div className="rounded border border-line bg-surface p-3">
                  <p className="text-[11px] font-medium text-ink-faint uppercase">Yếu tố phân tích</p>
                  <p className="mt-1 text-[14px] text-ink">
                    {own && own.fuelCost > own.maintenanceCost
                      ? 'Nhiên liệu là khoản chi lớn nhất: tối ưu lộ trình để giảm hao mòn.'
                      : 'Bảo trì chiếm ưu thế: kiểm tra hệ thống lốp và dầu xe định kỳ.'}
                  </p>
                </div>
              </div>
            </DataState>
          </EditorialSection>
        </>
      )}
    </div>
  );
}
