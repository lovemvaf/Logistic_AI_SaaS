'use client';

import { useState, useEffect } from 'react';
import { TableState } from 'ui-components';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Shipment, fetchFromStoreOrAPI, initStore, isMockDataSource } from '@/lib/local-store';

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  IN_TRANSIT: 'info',
  DELAYED: 'warning',
  DELIVERED: 'success',
  PENDING: 'neutral',
  OUT_FOR_DELIVERY: 'success',
};

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      initStore();
      const data = await fetchFromStoreOrAPI<Shipment[]>('shipments', '/logistics/shipments?limit=20');
      setShipments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load shipments');
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchShipments();
  }, []);

  const inTransit = shipments.filter((s) => s.status === 'IN_TRANSIT' || s.status === 'OUT_FOR_DELIVERY').length;
  const delayed = shipments.filter((s) => s.status === 'DELAYED').length;
  const delivered = shipments.filter((s) => s.status === 'DELIVERED').length;

  return (
    <div>
      <EditorialPageHeader
        eyebrow="Dashboard"
        title="Shipments"
        description="Real-time tracking of all active and completed shipments."
        meta={
          <div className="text-[11px] leading-5">
            <StatusLabel tone={error ? 'danger' : 'success'}>{error ? 'Error loading data' : 'All systems'}</StatusLabel>
          </div>
        }
        actions={
          <button
            type="button"
            onClick={fetchShipments}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            Refresh
          </button>
        }
      />

      <MetricBand
        metrics={[
          { label: 'Total shipments', value: shipments.length, meta: isMockDataSource ? 'Demo seed fixture' : 'Live API query' },
          { label: 'In transit', value: inTransit, meta: 'En route to destination' },
          { label: 'Delayed', value: delayed, meta: delayed > 0 ? 'Needs attention' : 'All on time', tone: delayed > 0 ? 'warning' : 'default' },
          { label: 'Delivered', value: delivered, meta: 'Completed today' },
        ]}
      />

      <EditorialSection eyebrow="Tracking" title="Active shipments">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">All active and completed shipments</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Tracking #</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Driver</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Vehicle</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Route</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Status</th>
                <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">ETA</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={loading}
                empty={!loading && shipments.length === 0}
                error={error ? new Error(error) : undefined}
                onRetry={() => void fetchShipments()}
                colSpan={6}
                emptyTitle="No shipments found"
                emptyDescription="Shipments synced from the backend will appear here."
              >
                {shipments.map((shipment) => {
                  const statusKey = shipment.status || 'IN_TRANSIT';
                  const etaDate = shipment.eta ? new Date(shipment.eta) : null;
                  const etaLabel =
                    etaDate && !Number.isNaN(etaDate.getTime())
                      ? etaDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
                      : '—';
                  return (
                  <tr key={shipment.id} className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60">
                    <td className="pr-3 text-[12px] font-medium text-ink">{shipment.trackingNumber || shipment.id}</td>
                    <td className="px-3 text-[12px] text-ink">{shipment.driver || '—'}</td>
                    <td className="px-3 text-[12px] text-ink-soft">{shipment.vehicle || '—'}</td>
                    <td className="px-3 text-[12px] text-ink-soft">{shipment.origin || '—'} → {shipment.destination || '—'}</td>
                    <td className="px-3 text-[12px]">
                      <StatusLabel tone={STATUS_TONE[statusKey] || 'neutral'}>
                        {statusKey.replace(/_/g, ' ')} · {Number.isFinite(Number(shipment.progress)) ? shipment.progress : 0}%
                      </StatusLabel>
                    </td>
                    <td className="pl-3 text-right text-[12px] tabular-nums text-ink-soft">
                      {etaLabel}
                    </td>
                  </tr>
                  );
                })}
              </TableState>
            </tbody>
          </table>
        </div>
      </EditorialSection>
    </div>
  );
}
