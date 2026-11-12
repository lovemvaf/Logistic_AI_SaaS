'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import {
  EditorialSection,
  EmptyNote,
  StatusLabel,
} from 'ui-kit';
import { initStore, fetchPaginatedFromStoreOrAPI } from '@/lib/local-store';

const DongNaiRouteMap = dynamic(
  () => import('map-components').then((m) => m.DongNaiRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[240px] items-center justify-center rounded-lg border border-line bg-surface-alt text-[12px] text-ink-faint">
        Loading Dong Nai corridor map...
      </div>
    ),
  },
);

type LogisticsData = {
  activeShipments: number;
  inTransit: number;
  delayedShipments: number;
  activeVehicles: number;
  activeDrivers: number;
  inventoryAlerts: number;
};

type Shipment = {
  id: string;
  trackingNumber: string;
  from: string;
  to: string;
  status: 'in_transit' | 'delayed' | 'delivered';
  progress: number;
};

const DONG_NAI_ANCHOR_STOPS = [
  { name: 'KCN Amata Biên Hòa', lat: 10.9478, lng: 106.8722 },
  { name: 'ICD Tân Cảng Long Bình', lat: 10.9415, lng: 106.8908 },
  { name: 'Long Khánh Gateway', lat: 10.9355, lng: 107.2435 },
  { name: 'Sân bay Long Thành', lat: 10.7795, lng: 107.0182 },
  { name: 'Cảng Phước An', lat: 10.6789, lng: 106.9245 },
];

function inferCoords(text: string, idx: number): { lat: number; lng: number } {
  const norm = text.toLowerCase();
  if (norm.includes('amata') || norm.includes('biên hòa')) return { lat: 10.9478, lng: 106.8722 };
  if (norm.includes('long bình')) return { lat: 10.9415, lng: 106.8908 };
  if (norm.includes('long khánh')) return { lat: 10.9355, lng: 107.2435 };
  if (norm.includes('long thành')) return { lat: 10.7795, lng: 107.0182 };
  if (norm.includes('nhơn trạch')) return { lat: 10.7421, lng: 106.9068 };
  if (norm.includes('phước an')) return { lat: 10.6789, lng: 106.9245 };
  if (norm.includes('cát lái')) return { lat: 10.7689, lng: 106.7944 };
  if (norm.includes('đồng xoài')) return { lat: 11.5356, lng: 106.8935 };
  if (norm.includes('chơn thành')) return { lat: 11.4302, lng: 106.6204 };
  const anchor = DONG_NAI_ANCHOR_STOPS[idx % DONG_NAI_ANCHOR_STOPS.length];
  return { lat: anchor.lat, lng: anchor.lng };
}

function toStatus(value: unknown): Shipment['status'] {
  if (value === 'DELIVERED') return 'delivered';
  if (value === 'DELAYED' || value === 'FAILED') return 'delayed';
  return 'in_transit';
}

export function ShipmentMap({ logistics }: { logistics: LogisticsData | null }) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchShipments = async () => {
      setLoading(true);
      setLoadError(null);
      initStore();
      try {
        const res = await fetchPaginatedFromStoreOrAPI<any>('shipments', '/logistics/shipments?status=ACTIVE&limit=10');
        if (!active) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        setShipments(
          rows.map((shipment: any) => ({
            id: shipment.id || shipment.shipmentId || '—',
            trackingNumber: shipment.trackingNumber || shipment.trackingCode || shipment.id || '—',
            from: shipment.origin || shipment.pickupLocation || 'ICD Tân Cảng Long Bình',
            to: shipment.destination || shipment.dropoffLocation || 'KCN Amata Biên Hòa',
            status: toStatus(shipment.status),
            progress:
              typeof shipment.progress === 'number' && Number.isFinite(shipment.progress)
                ? Math.min(100, Math.max(0, shipment.progress))
                : 0,
          })),
        );
      } catch (error: any) {
        if (!active) return;
        setShipments([]);
        setLoadError(error.response?.data?.message || error.message || 'Could not load shipments.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchShipments();
    return () => {
      active = false;
    };
  }, []);

  const mapStops = useMemo(() => {
    if (shipments.length === 0) {
      return DONG_NAI_ANCHOR_STOPS.map((stop, idx) => ({
        id: `dn-anchor-${idx}`,
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        status: idx === 0 ? 'COMPLETED' : idx === 1 ? 'CURRENT' : 'PENDING',
        sequence: idx + 1,
      }));
    }
    return shipments.slice(0, 6).map((s, idx) => {
      const coords = inferCoords(`${s.from} ${s.to}`, idx);
      return {
        id: s.id,
        name: `${s.trackingNumber} -> ${s.to}`,
        locality: s.to,
        lat: coords.lat,
        lng: coords.lng,
        status:
          s.status === 'delivered'
            ? 'COMPLETED'
            : s.status === 'delayed'
              ? 'DELAYED'
              : 'CURRENT',
        sequence: idx + 1,
      };
    });
  }, [shipments]);

  const summary = [
    `${logistics?.activeShipments ?? 0} active`,
    `${logistics?.inTransit ?? 0} in transit`,
    `${logistics?.delayedShipments ?? 0} delayed`,
  ].join(' · ');

  return (
    <EditorialSection eyebrow="Network" title="Active shipments" action={<span className="text-ink-faint">{summary}</span>}>
      <div className="mb-4">
        <DongNaiRouteMap
          title="Dong Nai Corridor Network Overview"
          subtitle="Live container & parcel corridors across Bien Hoa, Long Binh ICD, Long Thanh & Phuoc An"
          stops={mapStops}
          showAllHubs
          showCorridors
          interactivePlayback
          progressPercent={shipments[0]?.progress || 58}
          height={230}
        />
      </div>

      {loading ? (
        <p className="text-[12px] text-ink-faint">Loading shipments…</p>
      ) : loadError ? (
        <div className="border-l-2 border-danger bg-surface px-3 py-2 text-[12px] leading-5 text-ink-soft">
          {loadError}
        </div>
      ) : shipments.length === 0 ? (
        <EmptyNote>No active shipments found.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <caption className="sr-only">Active shipments and their progress</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Shipment
                </th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Route
                </th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Progress
                </th>
                <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((shipment) => {
                const tone =
                  shipment.status === 'delayed'
                    ? 'danger'
                    : shipment.status === 'delivered'
                      ? 'success'
                      : 'info';
                const label =
                  shipment.status === 'delayed'
                    ? 'Delayed'
                    : shipment.status === 'delivered'
                      ? 'Delivered'
                      : 'In transit';
                const bar =
                  shipment.status === 'delayed'
                    ? 'bg-danger'
                    : shipment.status === 'delivered'
                      ? 'bg-success'
                      : 'bg-accent';

                return (
                  <tr
                    key={shipment.id}
                    className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60"
                  >
                    <td className="pr-3 font-mono text-[11px] font-medium text-ink">{shipment.trackingNumber}</td>
                    <td className="px-3 text-[12px] text-ink-soft">
                      <span className="block max-w-[260px] truncate">
                        {shipment.from} → {shipment.to}
                      </span>
                    </td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-alt">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${shipment.progress}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-ink-faint">{shipment.progress}%</span>
                      </div>
                    </td>
                    <td className="pl-3 text-right">
                      <StatusLabel tone={tone}>{label}</StatusLabel>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </EditorialSection>
  );
}
