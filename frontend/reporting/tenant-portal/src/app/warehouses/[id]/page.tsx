'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import type { EditorialMetric } from 'ui-kit';
import { Button, DataState, Select, TableState } from 'ui-components';
import type { Bin, Warehouse } from '@/lib/mock';
import {
  formatNumber,
  warehouseStatusLabel,
  warehouseStatusTone,
} from '@/lib/labels';

const ZONE_OPTIONS = [
  { value: 'ALL', label: 'Tất cả khu vực' },
  { value: 'A', label: 'Khu A' },
  { value: 'B', label: 'Khu B' },
  { value: 'C', label: 'Khu C' },
  { value: 'D', label: 'Khu D' },
];

export default function WarehouseDetailPage() {
  const { id } = useParams();
  const warehouseId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [bins, setBins] = useState<Bin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoneFilter, setZoneFilter] = useState<Bin['zone'] | 'ALL'>('ALL');

  const load = async () => {
    if (!warehouseId) return;
    setLoading(true);
    setError('');
    try {
      const [warehouseRes, binsRes] = await Promise.all([
        data.warehouses.get(warehouseId),
        data.bins.list(),
      ]);
      if (!warehouseRes) throw new Error('Không tìm thấy kho.');
      setWarehouse(warehouseRes);
      setBins(binsRes);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được thông tin kho.';
      setError(msg);
      setWarehouse(null);
      setBins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [warehouseId]);

  const zoneBins = useMemo(() => {
    const rows = bins.filter((b) => b.warehouseId === warehouseId);
    return zoneFilter === 'ALL' ? rows : rows.filter((b) => b.zone === zoneFilter);
  }, [bins, warehouseId, zoneFilter]);

  const usedBins = zoneBins.filter(
    (b) => b.usedVolumeCbm >= b.maxVolumeCbm * 0.9,
  );

  const utilization = (bin: Bin) => {
    const pct = bin.maxVolumeCbm > 0 ? bin.usedVolumeCbm / bin.maxVolumeCbm : 0;
    return Math.round(pct * 100);
  };

  const weights = (bin: Bin) => {
    const pct = bin.maxWeightKg > 0 ? bin.usedWeightKg / bin.maxWeightKg : 0;
    return Math.round(pct * 100);
  };

  const weightRemaining = (bin: Bin) => {
    const maxWeightKg = bin.maxWeightKg > 0 ? bin.maxWeightKg : 0;
    const usedWeightKg = bin.usedWeightKg > 0 ? bin.usedWeightKg : 0;
    return Math.max(0, maxWeightKg - usedWeightKg);
  };

  const metrics: EditorialMetric[] = [
    { label: 'Khối lượng', value: warehouse ? `${Math.round(warehouse.usedCbm / Math.max(1, warehouse.capacityCbm) * 100)}%` : '—', meta: warehouse ? `${formatNumber(warehouse.usedCbm)}/${formatNumber(warehouse.capacityCbm)} m³` : '' },
    { label: 'Ngăn xếp', value: warehouse ? formatNumber(warehouse.binCount) : '—', meta: 'điểm nhận hàng' },
    { label: 'Ngăn đầy', value: formatNumber(usedBins.length), meta: 'trên 90% khối lượng' },
  ];

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Kho bãi"
        title={warehouse ? `${warehouse.name} (${warehouse.code})` : 'Kho hàng'}
        description={warehouse ? warehouse.address : ''}
        meta={
          warehouse && (
            <StatusLabel tone={warehouseStatusTone(warehouse.status)}>
              {warehouseStatusLabel(warehouse.status)}
            </StatusLabel>
          )
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={() => router.back()}>
              Trở về
            </Button>
            <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
              Làm mới
            </Button>
          </div>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      {warehouse ? (
        <MetricBand metrics={metrics} />
      ) : (
        <EditorialSection title="Chưa chọn kho">
          <EmptyNote>Không có kho nào được chọn. Mở `/warehouses/[id]`.</EmptyNote>
        </EditorialSection>
      )}

      <EditorialSection
        title="Ngăn xếp"
        eyebrow="Theo khu vực"
        action={
          <Select
            className="h-9 min-w-[9rem]"
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value as Bin['zone'] | 'ALL')}
            options={ZONE_OPTIONS}
          />
        }
      >
        <DataState loading={loading} empty={!loading && zoneBins.length === 0}>
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Mã
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Khu vực
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Khối lượng
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Tải trọng
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Thể tích
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <TableState
                loading={loading}
                empty={!loading && zoneBins.length === 0}
                onRetry={load}
                colSpan={5}
                emptyContent={
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-ink-faint">
                      Kho này chưa có ngăn xếp nào.
                    </td>
                  </tr>
                }
                error={error ? new Error(error) : undefined}
              >
                {zoneBins.map((bin) => (
                  <tr key={bin.id} className="hover:bg-surface-alt">
                    <td className="px-3 py-2">
                      <p className="text-[13px] font-medium text-ink">{bin.code}</p>
                      <p className="text-[11px] text-ink-faint">{bin.id}</p>
                    </td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={zoneFilter === bin.zone ? 'info' : 'neutral'}>
                        {bin.zone}
                      </StatusLabel>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <p className="text-[13px] font-medium text-ink tabular-nums">
                        {bin.usedWeightKg} / {bin.maxWeightKg} kg
                      </p>
                      <p className="text-[11px] text-ink-faint tabular-nums">
                        {weights(bin)}%
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <p className="text-[13px] font-medium text-ink tabular-nums">
                        {formatNumber(weightRemaining(bin))}
                      </p>
                      <p className="text-[11px] text-ink-faint tabular-nums">
                        kg tải trọng còn lại
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <p className="text-[13px] font-medium text-ink tabular-nums">
                        {Math.round(bin.usedVolumeCbm * 100) / 100} / {bin.maxVolumeCbm} m³
                      </p>
                      <p className="text-[11px] text-ink-faint tabular-nums">
                        {utilization(bin)}%
                      </p>
                    </td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
        </DataState>
      </EditorialSection>
    </div>
  );
}
