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
import type { FuelLog, ReportFleetVehicle, Vehicle } from '@/lib/mock';
import {
  formatCurrency,
  formatDateVN,
  formatNumber,
  vehicleStatusLabel,
  vehicleStatusTone,
} from '@/lib/labels';

/** Tháng tham chiếu phân tích chi phí nhiên liệu của xe này so với đội xe. */
const CURRENT = new Date().toISOString().slice(0, 7);
const PREVIOUS = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
})();

function costPerKm(vehicle?: ReportFleetVehicle) {
  return vehicle && vehicle.distanceKm > 0
    ? Math.round(vehicle.fuelCost / vehicle.distanceKm)
    : 0;
}

/** Đối sánh: chi phí/km của xe cao hơn trung bình đội 125% → cảnh báo. */
function flagOf(fleet: ReportFleetVehicle[], vehicle?: ReportFleetVehicle) {
  if (!vehicle || vehicle.fuelCost <= 0) return { label: 'Chưa ghi nhận', tone: 'default' as const };
  const avg = fleet.length === 0 ? 0 : Math.round(fleet.reduce((s, v) => s + costPerKm(v), 0) / Math.max(1, fleet.length));
  return costPerKm(vehicle) > avg * 1.25
    ? { label: 'Trên định mức', tone: 'warning' as const }
    : { label: 'Đưới định mức', tone: 'success' as const };
}

export default function VehicleFuelPage() {
  const { id } = useParams();
  const vehicleId = Array.isArray(id) ? id[0] : id;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fleet, setFleet] = useState<ReportFleetVehicle[]>([]);
  const [previousFleet, setPreviousFleet] = useState<ReportFleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    at: new Date().toISOString().slice(0, 10),
    liters: '',
    cost: '',
    km: '',
    station: '',
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
      const msg = err?.message || 'Không tải được dữ liệu nhiên liệu xe.';
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
  const previousOwn = useMemo(() => previousFleet.find((row) => row.id === vehicleId), [previousFleet, vehicleId]);

  const fleetCostPerKm = useMemo(() => {
    const avg = fleet.length === 0 ? 0 : fleet.reduce((sum, v) => sum + costPerKm(v), 0) / Math.max(1, fleet.length);
    return Math.round(avg);
  }, [fleet]);

  const handleSubmit = async () => {
    if (!vehicleId || !form.liters || !form.cost || !form.km || !form.station) {
      setError('Vui lòng nhập đủ số lít, chi phí, km và cây xăng.');
      return;
    }
    setSubmitting(true);
    try {
      await data.vehicles.fuelLog({
        vehicleId,
        at: `${form.at}T08:00:00`,
        liters: Number(form.liters),
        cost: Number(form.cost),
        km: Number(form.km),
        station: form.station,
        note: form.note,
      });
      setForm({
        at: new Date().toISOString().slice(0, 10),
        liters: '',
        cost: '',
        km: '',
        station: '',
        note: '',
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Không ghi nhận được nhiên liệu.');
    } finally {
      setSubmitting(false);
    }
  };

  const flag = flagOf(fleet, own);

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Phương tiện"
        title={vehicle ? `${vehicle.plate}` : 'Chi tiết xe'}
        description="Ghi nhận nhiên liệu theo cây xăng, tính chi phí/km và đối sánh so với trung bình đội qua tháng."
        meta={vehicle ? vehicleStatusLabel(vehicle.status) : ''}
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      {!vehicle ? (
        <EmptyNote>Không tìm thấy xe. Mở `/logistics/vehicles/{'['}id{']'}/fuel`.</EmptyNote>
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
              <p className="text-[11px] font-medium text-ink-faint uppercase">Địa chỉ km</p>
              <p className="mt-1 text-[15px] font-semibold text-ink tabular-nums">
                {formatNumber(vehicle.odometerKm)} km
              </p>
            </div>
            <div className="rounded border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Bảo hiểm</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{formatDateVN(vehicle.insuranceExpiry)}</p>
            </div>
          </div>

          <MetricBand
            metrics={[
              {
                label: 'Nhiên liệu tháng này',
                value: formatCurrency(own?.fuelCost),
                meta: 'chi phí theo xe',
              },
              {
                label: 'Chi phí/km',
                value: `${formatNumber(costPerKm(own))}`,
                meta: `trung bình đội ${formatNumber(fleetCostPerKm)}`,
                tone: flag.tone,
              },
              {
                label: 'So với tháng trước',
                value: own && previousOwn ? formatCurrency(own.fuelCost) : '—',
                meta: own && previousOwn ? formatCurrency(previousOwn.fuelCost) : 'chưa có dữ liệu',
                tone: own && previousOwn && own.fuelCost > previousOwn.fuelCost ? 'warning' : 'success',
              },
              {
                label: 'Tiêu thụ/km đội',
                value: `${formatNumber(fleetCostPerKm)}`,
                meta: 'trung bình',
              },
            ]}
          />

          <EditorialSection title="Ghi nhận nhiên liệu">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <Input
                type="date"
                className="h-9"
                value={form.at}
                onChange={(e) => setForm((f) => ({ ...f, at: e.target.value }))}
              />
              <Input
                type="number"
                className="h-9"
                placeholder="Lít"
                value={form.liters}
                onChange={(e) => setForm((f) => ({ ...f, liters: e.target.value }))}
              />
              <Input
                type="number"
                className="h-9"
                placeholder="Chi phí (₫)"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
              <Input
                type="number"
                className="h-9"
                placeholder="Km lần đổ"
                value={form.km}
                onChange={(e) => setForm((f) => ({ ...f, km: e.target.value }))}
              />
              <Select
                className="h-9"
                value={form.station}
                placeholder="Chọn cây xăng"
                onChange={(e) => setForm((f) => ({ ...f, station: e.target.value }))}
                options={[{ value: '', label: '' },
                  ...['XP Eni Bến Thành', 'Lào Cai Shell 321', 'Xăng dầu Sài Gòn Q3', 'Petrolimex Việt Trì', 'AMIP Kiên Giang', 'ABC nhiên liệu', 'B Xu', 'G Tùng'].map(
                    (station) => ({ value: station, label: station }),
                  ),
                ]}
              />
              <Button variant="primary" className="h-9" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Đang ghi nhận' : 'Ghi nhận'}
              </Button>
            </div>
          </EditorialSection>

          <EditorialSection title="Chú thích">
            <DataState loading={loading} empty={!loading && !own}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded border border-line bg-surface p-3">
                  <p className="text-[11px] font-medium text-ink-faint uppercase">Ghi nhận</p>
                  <p className="mt-1 text-[14px] text-ink">
                    {own ? `Nhiên liệu tháng ${CURRENT}: ${formatCurrency(own.fuelCost)}, ${formatNumber(own.distanceKm)} km, ${own.trips} chuyến.` : 'Chưa có dữ liệu nhiên liệu cho tháng này.'}
                  </p>
                </div>
                <div className="rounded border border-line bg-surface p-3">
                  <p className="text-[11px] font-medium text-ink-faint uppercase">Phân tích</p>
                  <p className="mt-1 text-[14px] text-ink">
                    {flag.label}
                    {own && own.fuelCost > (previousOwn?.fuelCost ?? 0)
                      ? ' Chi phí cao hơn tháng trước: kiểm tra lịch sử đổ xe của xe này.'
                      : ' Chi phí ổn định: duy trì lịch đổ nhiên liệu cố định, theo dõi km/lít để trừ hao biến động.'}
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
