'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import { Button, DataState, Input, Select } from 'ui-components';
import type { Trip, TripStop, TripStatus, PODRecord, Vehicle } from '@/lib/mock';
import { tripStatusLabel, tripStatusTone, formatDateTimeVN, formatCurrency, driverStatusLabel } from '@/lib/labels';

const POD_PHOTO_ITEM = `https://pod.smartlogi.vn/TRP-4101.jpg`;
const POD_SIGNATURE_ITEM = `https://pod.smartlogi.vn/TRP-4101.png`;

export default function TripPodPage() {
  const { id } = useParams();
  const tripId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [pods, setPods] = useState<PODRecord[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    photo: POD_PHOTO_ITEM,
    signature: POD_PHOTO_ITEM,
    deliveredAt: new Date().toISOString().slice(0, 10),
    recipient: '',
    note: '',
  });

  const load = async () => {
    if (!tripId) return;
    setLoading(true);
    setError('');
    try {
      const [tripRes, podsRes] = await Promise.all([data.trips.get(tripId), data.trips.pod(tripId)]);
      if (!tripRes) throw new Error('Không tìm thấy chuyến.');
      setTrip(tripRes);
      setPods(podsRes);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được POD của chuyến.';
      setError(msg);
      setTrip(null);
      setPods([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tripId]);

  const handleSubmit = async () => {
    if (!tripId || !form.recipient.trim() || !form.photo.trim()) {
      setError('Vui lòng nhập hình ảnh và người nhận.');
      return;
    }
    setSubmitting(true);
    try {
      await data.trips.submitPOD({
        tripId,
        photo: form.photo,
        signature: form.signature,
        deliveredAt: `${form.deliveredAt}T18:00:00`,
        recipient: form.recipient,
        note: form.note,
      });
      setForm({
        photo: POD_PHOTO_ITEM,
        signature: POD_PHOTO_ITEM,
        deliveredAt: new Date().toISOString().slice(0, 10),
        recipient: '',
        note: '',
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Không ghi nhận POD.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!tripId) {
    return (
      <EditorialSection title="Chọn chuyến">
        <EmptyNote>Chuyến chưa được chọn. Mở `/logistics/trips/[id]/pod`.</EmptyNote>
      </EditorialSection>
    );
  }

  const lastStop = useMemo(
    () => trip?.stops[trip.stops.length - 1] ?? null,
    [trip],
  );

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Vận tải"
        title={`POD chuyến ${trip?.code ?? ''}`}
        description="Ghi nhận bằng chứng giao hàng (ảnh, chữ ký, người nhận) cho chuyến này."
        meta={trip ? tripStatusLabel(trip.status) : ''}
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load}>
            Làm mới
          </Button>
        }
      />

      {error ? (
        <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p>
      ) : null}

      {!trip ? (
        <EmptyNote>Chưa có dữ liệu chuyến. Mở `/logistics/trips/{'['}id{']'}/pod`.</EmptyNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:gap-4 sm:grid-cols-4">
            <div className="border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Chuyến</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{trip.code}</p>
            </div>
            <div className="border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Tài xế</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{trip.driverName}</p>
            </div>
            <div className="border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Xe</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{trip.vehiclePlate}</p>
            </div>
            <div className="border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Trạng thái</p>
              <p className="mt-1">
                <StatusLabel tone={tripStatusTone(trip.status)}>
                  {tripStatusLabel(trip.status)}
                </StatusLabel>
              </p>
            </div>
          </div>

          <EditorialSection title="Bằng chứng giao hàng cuối">
            <DataState loading={loading} empty={!loading && pods.length === 0}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded border border-line bg-surface p-3">
                  <p className="text-[11px] font-medium text-ink-faint uppercase">Đơn hàng</p>
                  <p className="mt-1 text-[15px] font-semibold text-ink">{lastStop?.orderTrackingCode}</p>
                </div>
                <div className="rounded border border-line bg-surface p-3">
                  <p className="text-[11px] font-medium text-ink-faint uppercase">Tổng giao</p>
                  <p className="mt-1 text-[15px] font-semibold text-ink tabular-nums">{trip.stops.length} điểm</p>
                </div>
                <div className="rounded border border-line bg-surface p-3">
                  <p className="text-[11px] font-medium text-ink-faint uppercase">COD thu</p>
                  <p className="mt-1 text-[15px] font-semibold text-ink">{formatCurrency(trip.codCollected)}</p>
                </div>
              </div>
            </DataState>
          </EditorialSection>

          <EditorialSection title="Ghi nhận POD">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <Input
                label=""
                type="url"
                className="h-9"
                placeholder="Url ảnh giao hàng"
                value={form.photo}
                onChange={(e) => setForm((f) => ({ ...f, photo: e.target.value }))}
              />
              <Input
                type="url"
                className="h-9"
                placeholder="Url chữ ký"
                value={form.signature}
                onChange={(e) => setForm((f) => ({ ...f, signature: e.target.value }))}
              />
              <Input
                type="date"
                className="h-9"
                value={form.deliveredAt}
                onChange={(e) => setForm((f) => ({ ...f, deliveredAt: e.target.value }))}
              />
              <Input
                type="text"
                className="h-9"
                placeholder="Người nhận"
                value={form.recipient}
                onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
              />
              <textarea
                className="h-9 w-full resize-none rounded-lg border border-line px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Ghi chú"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
              <Button variant="primary" className="h-9" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Đang ghi nhận' : 'Ghi nhận POD'}
              </Button>
            </div>
          </EditorialSection>

          <EditorialSection title="POD lịch sử">
            <DataState loading={loading} empty={!loading && pods.length === 0}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {pods.map((pod) => (
                  <div key={pod.id} className="rounded border border-line bg-surface p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-[11px] font-medium text-ink-faint uppercase">Người nhận</p>
                        <p className="mt-0.5 text-[14px] font-semibold text-ink">{pod.recipient}</p>
                        <p className="mt-1 text-[12px] text-ink-soft">{pod.contactPhone}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] font-medium text-ink-faint uppercase">Giao lúc</p>
                        <p className="mt-0.5 text-[14px] tabular-nums text-ink">{formatDateTimeVN(pod.deliveredAt)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-[11px] font-medium text-ink-faint uppercase mb-1.5">Ảnh giao hàng</p>
                      <div className="flex gap-3">
                        <img
                          alt="Ảnh giao hàng"
                          className="h-20 w-28 rounded object-cover"
                          src={pod.photo}
                          loading="lazy"
                        />
                      </div>
                    </div>
                    {pod.note ? (
                      <p className="mt-2 text-[12px] text-ink-soft">{pod.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </DataState>
          </EditorialSection>
        </>
      )}
    </div>
  );
}
