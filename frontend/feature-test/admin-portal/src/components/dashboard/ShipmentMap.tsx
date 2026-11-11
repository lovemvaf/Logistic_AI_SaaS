'use client';

import { useEffect, useState } from 'react';
import {
  EditorialSection,
  EmptyNote,
  StatusLabel,
} from 'ui-kit';
import { initStore, fetchPaginatedFromStoreOrAPI } from '@/lib/local-store';

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
  from: string;
  to: string;
  status: 'in_transit' | 'delayed' | 'delivered';
  progress: number;
};

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
            from: shipment.origin || shipment.pickupLocation || '—',
            to: shipment.destination || shipment.dropoffLocation || '—',
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

  const summary = [
    `${logistics?.activeShipments ?? 0} active`,
    `${logistics?.inTransit ?? 0} in transit`,
    `${logistics?.delayedShipments ?? 0} delayed`,
  ].join(' · ');

  return (
    <EditorialSection eyebrow="Network" title="Active shipments" action={<span className="text-ink-faint">{summary}</span>}>
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
                    <td className="pr-3 font-mono text-[11px] font-medium text-ink">{shipment.id}</td>
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
